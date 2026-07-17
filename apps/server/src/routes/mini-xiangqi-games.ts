import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getMiniXiangqiOpenPlayerView,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
  oppositeMiniXiangqiColor,
} from '@mistboard/game';
import { type MiniXiangqiRuntimeRoom, miniXiangqiRooms } from './../mini-xiangqi-registration.js';
import { type MiniXiangqiEvent, miniXiangqiTenant } from './../mini-xiangqi-tenant.js';
import * as persistence from './../persistence.js';
import { buildTenantGameSummary } from './../variant-tenant/events.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from './../variant-tenant/runtime.js';
import { type HttpApiContext, postgamePlayers, requireMethod, writeJson } from './lib.js';

type MiniXiangqiPostgameSnapshot = {
  ply: number;
  view: MiniXiangqiPlayerView;
};

type MiniXiangqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: MiniXiangqiColor;
  move: MiniXiangqiMove;
  ply: number;
};

type MiniXiangqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'seat-resigned'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'seat-forfeited'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'game-aborted'; at: number; reason: string };

export type MiniXiangqiPostgamePersistence = {
  getLiveRoom?(roomId: string): MiniXiangqiRuntimeRoom | null;
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  isPersistenceEnabled?(): boolean;
  loadRoomEvents(roomId: string): Promise<MiniXiangqiEvent[] | null>;
};

const defaultPersistence: MiniXiangqiPostgamePersistence = {
  getLiveRoom: (roomId) => miniXiangqiRooms.get(roomId) ?? null,
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  isPersistenceEnabled: () => persistence.isInitialized(),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<MiniXiangqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/mini-xiangqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await miniXiangqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function miniXiangqiPostgameForApi(
  roomId: string,
  deps: MiniXiangqiPostgamePersistence = defaultPersistence,
) {
  const persistenceEnabled = deps.isPersistenceEnabled?.() ?? true;
  const [game, events] = await Promise.all([
    persistenceEnabled ? deps.getGameSummary(roomId) : null,
    persistenceEnabled ? deps.loadRoomEvents(roomId) : null,
  ]);
  if (game && game.variant !== MINI_XIANGQI_SPEC_ID) return null;
  if (events && !isTenantEventLog(miniXiangqiTenant, events, roomId)) return null;

  let source: {
    game: persistence.RecentEveGameRecord;
    events: readonly MiniXiangqiEvent[];
  } | null = game && events ? { game, events } : null;
  if (!source) {
    const room = deps.getLiveRoom?.(roomId) ?? null;
    await room?.pendingWrites.catch(() => undefined);
    source = miniXiangqiPostgameFromLiveRoom(roomId, room);
  }
  if (!source) return null;

  const projection = replayTenantEvents(miniXiangqiTenant, source.events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: {
      roomId: source.game.roomId,
      variant: source.game.variant,
      mode: source.game.mode,
      redName: postgameSeatDisplayName(source.game, 'red'),
      blackName: postgameSeatDisplayName(source.game, 'black'),
      result: source.game.result,
      termination: source.game.termination,
      plyCount: source.game.plyCount,
      startedAt: source.game.startedAt.toISOString(),
      endedAt: source.game.endedAt.toISOString(),
      rated: source.game.rated,
      visibility: source.game.visibility,
      initialMs: source.game.initialMs,
      incrementMs: source.game.incrementMs,
      players: postgamePlayers(source.game.participants ?? []),
    },
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: miniXiangqiPostgameTimeline(source.events),
    view: getMiniXiangqiOpenPlayerView(projection.state, 'red'),
    views: {
      truth: getMiniXiangqiOpenPlayerView(projection.state, 'red'),
    },
    history: miniXiangqiPostgameHistory(source.events),
  };
}

function miniXiangqiPostgameFromLiveRoom(
  roomId: string,
  room: MiniXiangqiRuntimeRoom | null,
): { game: persistence.RecentEveGameRecord; events: readonly MiniXiangqiEvent[] } | null {
  if (!room || room.id !== roomId) return null;
  if (room.projection.state.status.type !== 'finished') return null;
  if (!isTenantEventLog(miniXiangqiTenant, room.events, roomId)) return null;
  const summary = buildTenantGameSummary(miniXiangqiTenant, room);
  return {
    game: recentGameRecordFromSummary(room.id, summary),
    events: room.events,
  };
}

function recentGameRecordFromSummary(
  roomId: string,
  summary: persistence.GameSummary,
): persistence.RecentEveGameRecord {
  return {
    roomId,
    variant: summary.variant,
    mode: summary.mode ?? (summary.corpusId ? 'imported' : 'pvp'),
    result: summary.result,
    termination: summary.termination,
    plyCount: summary.plyCount,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    whiteName: summary.whiteName,
    blackName: summary.blackName,
    corpusId: summary.corpusId,
    rated: summary.rated ?? false,
    jobId: null,
    gameIndex: null,
    whiteEngineId: null,
    blackEngineId: null,
    timeControl: null,
    initialMs: summary.initialMs ?? null,
    incrementMs: summary.incrementMs ?? null,
    visibility: summary.visibility ?? 'private',
    participants: summary.participants ?? [],
  };
}

function postgameSeatDisplayName(
  game: Awaited<ReturnType<MiniXiangqiPostgamePersistence['getGameSummary']>>,
  color: MiniXiangqiColor,
): string {
  const legacyColor = color === 'red' ? 'white' : 'black';
  const persistedName =
    game?.participants?.find((participant) => participant.color === color)?.displayName ??
    game?.participants?.find((participant) => participant.color === legacyColor)?.displayName ??
    (color === 'red' ? game?.whiteName : game?.blackName);
  if (!persistedName) return 'Guest';
  if (persistedName === (color === 'red' ? 'Red' : 'Black')) return 'Guest';
  return persistedName;
}

function miniXiangqiPostgameHistory(events: readonly MiniXiangqiEvent[]): {
  truth: MiniXiangqiPostgameSnapshot[];
} {
  const created = events[0];
  if (created?.type !== 'room-created') return { truth: [] };
  let projection = replayTenantEvents(miniXiangqiTenant, [created]);
  let ply = 0;
  const truth: MiniXiangqiPostgameSnapshot[] = [
    { ply, view: getMiniXiangqiOpenPlayerView(projection.state, 'red') },
  ];

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(miniXiangqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    truth.push({ ply, view: getMiniXiangqiOpenPlayerView(projection.state, 'red') });
  }
  return { truth };
}

function miniXiangqiPostgameTimeline(
  events: readonly MiniXiangqiEvent[],
): Array<MiniXiangqiPostgameMove | MiniXiangqiPostgameTerminal> {
  const timeline: Array<MiniXiangqiPostgameMove | MiniXiangqiPostgameTerminal> = [];
  let ply = 0;
  for (const event of events) {
    if (event.type === 'move-played') {
      ply += 1;
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        move: event.move,
        ply,
      });
      continue;
    }
    if (event.type === 'clock-expired') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeMiniXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeMiniXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
