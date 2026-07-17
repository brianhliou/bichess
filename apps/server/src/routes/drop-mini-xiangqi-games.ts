import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiPlayerView,
  getDropMiniXiangqiPlayerView,
  type MiniXiangqiColor,
  oppositeMiniXiangqiColor,
} from '@mistboard/game';
import { dropMiniXiangqiRooms } from './../drop-mini-xiangqi-registration.js';
import { type DropMiniXiangqiEvent, dropMiniXiangqiTenant } from './../drop-mini-xiangqi-tenant.js';
import { dropMiniXiangqiEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import { buildTenantGameSummary } from './../variant-tenant/events.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
  tenantPveEngineId,
} from './../variant-tenant/runtime.js';
import type { TenantRuntimeRoom } from './../variant-tenant/tenant.js';
import { type HttpApiContext, postgamePlayers, requireMethod, writeJson } from './lib.js';

type DropMiniXiangqiPostgameSnapshot = {
  ply: number;
  view: DropMiniXiangqiPlayerView;
};

type DropMiniXiangqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: MiniXiangqiColor;
  move: DropMiniXiangqiMove;
  ply: number;
};

type DropMiniXiangqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'seat-resigned'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'seat-forfeited'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'game-aborted'; at: number; reason: string };

export type DropMiniXiangqiPostgamePersistence = {
  getLiveRoom?(roomId: string): DropMiniXiangqiRuntimeRoom | null;
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  isPersistenceEnabled?(): boolean;
  loadRoomEvents(roomId: string): Promise<DropMiniXiangqiEvent[] | null>;
};

type DropMiniXiangqiRuntimeRoom = TenantRuntimeRoom<
  'drop-mini-xiangqi',
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  DropMiniXiangqiGameState,
  typeof DROP_MINI_XIANGQI_SPEC_ID
>;

const defaultPersistence: DropMiniXiangqiPostgamePersistence = {
  getLiveRoom: (roomId) => dropMiniXiangqiRooms.get(roomId) ?? null,
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  isPersistenceEnabled: () => persistence.isInitialized(),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DropMiniXiangqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/drop-mini-xiangqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!dropMiniXiangqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await dropMiniXiangqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function dropMiniXiangqiPostgameForApi(
  roomId: string,
  deps: DropMiniXiangqiPostgamePersistence = defaultPersistence,
) {
  const persistenceEnabled = deps.isPersistenceEnabled?.() ?? true;
  const [game, events] = await Promise.all([
    persistenceEnabled ? deps.getGameSummary(roomId) : null,
    persistenceEnabled ? deps.loadRoomEvents(roomId) : null,
  ]);
  if (game && game.variant !== DROP_MINI_XIANGQI_SPEC_ID) return null;
  if (events && !isTenantEventLog(dropMiniXiangqiTenant, events, roomId)) return null;

  let source: {
    game: persistence.RecentEveGameRecord;
    events: readonly DropMiniXiangqiEvent[];
  } | null = game && events ? { game, events } : null;
  if (!source) {
    const room = deps.getLiveRoom?.(roomId) ?? null;
    await room?.pendingWrites.catch(() => undefined);
    source = dropMiniXiangqiPostgameFromLiveRoom(roomId, room);
  }
  if (!source) return null;

  const projection = replayTenantEvents(dropMiniXiangqiTenant, source.events);
  if (projection.state.status.type !== 'finished') return null;
  const pveEngineId = tenantPveEngineId(dropMiniXiangqiTenant, { projection } as never);

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
      ...(pveEngineId === null ? {} : { pveEngineId }),
      players: postgamePlayers(source.game.participants ?? []),
    },
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: dropMiniXiangqiPostgameTimeline(source.events),
    view: getDropMiniXiangqiPlayerView(projection.state, 'red'),
    views: {
      truth: getDropMiniXiangqiPlayerView(projection.state, 'red'),
    },
    history: dropMiniXiangqiPostgameHistory(source.events),
  };
}

function dropMiniXiangqiPostgameFromLiveRoom(
  roomId: string,
  room: DropMiniXiangqiRuntimeRoom | null,
): { game: persistence.RecentEveGameRecord; events: readonly DropMiniXiangqiEvent[] } | null {
  if (!room || room.id !== roomId) return null;
  if (room.projection.state.status.type !== 'finished') return null;
  if (!isTenantEventLog(dropMiniXiangqiTenant, room.events, roomId)) return null;
  const summary = buildTenantGameSummary(dropMiniXiangqiTenant, room);
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
  game: Awaited<ReturnType<DropMiniXiangqiPostgamePersistence['getGameSummary']>>,
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

function dropMiniXiangqiPostgameHistory(events: readonly DropMiniXiangqiEvent[]): {
  truth: DropMiniXiangqiPostgameSnapshot[];
} {
  const created = events[0];
  if (created?.type !== 'room-created') return { truth: [] };
  let projection = replayTenantEvents(dropMiniXiangqiTenant, [created]);
  let ply = 0;
  const truth: DropMiniXiangqiPostgameSnapshot[] = [
    { ply, view: getDropMiniXiangqiPlayerView(projection.state, 'red') },
  ];

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(dropMiniXiangqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    truth.push({ ply, view: getDropMiniXiangqiPlayerView(projection.state, 'red') });
  }
  return { truth };
}

function dropMiniXiangqiPostgameTimeline(
  events: readonly DropMiniXiangqiEvent[],
): Array<DropMiniXiangqiPostgameMove | DropMiniXiangqiPostgameTerminal> {
  const timeline: Array<DropMiniXiangqiPostgameMove | DropMiniXiangqiPostgameTerminal> = [];
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
