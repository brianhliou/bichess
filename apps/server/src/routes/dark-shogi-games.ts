import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DARK_SHOGI_SPEC_ID,
  opponentOf,
  type ShogiColor,
  type ShogiGameState,
  type ShogiMove,
  type ShogiSquare,
  shogiSquareOf,
} from '@mistboard/game';
import { darkShogiRooms } from './../dark-shogi-registration.js';
import type {
  DarkShogiEvent,
  DarkShogiProjection,
  DarkShogiRuntimeRoom,
} from './../dark-shogi-runtime.js';
import {
  type DarkShogiWirePlayerView,
  darkShogiTenant,
  getDarkShogiClientView,
} from './../dark-shogi-tenant.js';
import { darkShogiEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import { buildTenantGameSummary } from './../variant-tenant/events.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from './../variant-tenant/runtime.js';
import { type HttpApiContext, postgameGameSummary, requireMethod, writeJson } from './lib.js';

type DarkShogiPostgameViewKey = ShogiColor | 'truth';

type DarkShogiPostgameViews = Partial<Record<DarkShogiPostgameViewKey, DarkShogiWirePlayerView>>;
type DarkShogiPostgameSnapshot = { ply: number; view: DarkShogiWirePlayerView };
type DarkShogiPostgameHistory = Partial<
  Record<DarkShogiPostgameViewKey, DarkShogiPostgameSnapshot[]>
>;

type DarkShogiPostgameMove = {
  type: 'move-played';
  at: number;
  color: ShogiColor;
  move: ShogiMove;
  ply: number;
};

type DarkShogiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: ShogiColor; winner: ShogiColor }
  | { type: 'seat-resigned'; at: number; color: ShogiColor; winner: ShogiColor }
  | { type: 'seat-forfeited'; at: number; color: ShogiColor; winner: ShogiColor }
  | { type: 'game-aborted'; at: number; reason: string };

// The persistence slice the reveal builder needs, injected so the reveal-gate
// and masking are unit-testable without a live database.
export type DarkShogiPostgamePersistence = {
  getLiveRoom?(roomId: string): DarkShogiRuntimeRoom | null;
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  isPersistenceEnabled?(): boolean;
  loadRoomEvents(roomId: string): Promise<DarkShogiEvent[] | null>;
};

const livePersistence: DarkShogiPostgamePersistence = {
  getLiveRoom: (roomId) => darkShogiRooms.get(roomId) ?? null,
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  isPersistenceEnabled: () => persistence.isInitialized(),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DarkShogiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/dark-shogi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!darkShogiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await darkShogiPostgameForApi(roomId, livePersistence);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function darkShogiPostgameForApi(roomId: string, deps: DarkShogiPostgamePersistence) {
  const persistenceEnabled = deps.isPersistenceEnabled?.() ?? true;
  const [game, events] = await Promise.all([
    persistenceEnabled ? deps.getGameSummary(roomId) : null,
    persistenceEnabled ? deps.loadRoomEvents(roomId) : null,
  ]);
  if (game && game.variant !== DARK_SHOGI_SPEC_ID) return null;
  if (events && !isTenantEventLog(darkShogiTenant, events, roomId)) return null;

  let source: { game: persistence.RecentEveGameRecord; events: readonly DarkShogiEvent[] } | null =
    game && events ? { game, events } : null;
  if (!source) {
    const room = deps.getLiveRoom?.(roomId) ?? null;
    await room?.pendingWrites.catch(() => undefined);
    source = darkShogiPostgameFromLiveRoom(roomId, room);
  }
  if (!source) return null;

  const projection = replayTenantEvents(darkShogiTenant, source.events);
  // The reveal gate: only a FINISHED game exposes the truth board and the
  // opponent's hidden history. A live or aborted-mid-play room returns 404.
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestDarkShogiMoveColor(source.events);
  return {
    game: postgameGameSummary(source.game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      clock: projection.clock,
      timeControl: projection.timeControl,
    },
    timeline: darkShogiPostgameTimeline(source.events),
    view: darkShogiTruthView(projection.state),
    views: darkShogiPostgameViews(projection.state, latestMoveColor),
    history: darkShogiPostgameHistory(source.events),
  };
}

function darkShogiPostgameFromLiveRoom(
  roomId: string,
  room: DarkShogiRuntimeRoom | null,
): { game: persistence.RecentEveGameRecord; events: readonly DarkShogiEvent[] } | null {
  if (!room || room.id !== roomId) return null;
  if (room.projection.state.status.type !== 'finished') return null;
  if (!isTenantEventLog(darkShogiTenant, room.events, roomId)) return null;
  const summary = buildTenantGameSummary(darkShogiTenant, room);
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

function darkShogiPostgameViews(
  state: ShogiGameState,
  latestMoveColor?: ShogiColor,
): DarkShogiPostgameViews {
  return {
    black: getDarkShogiClientView(
      state,
      { id: 'postgame-black', seat: 'black', solo: false },
      latestMoveColor,
    ),
    truth: darkShogiTruthView(state),
    white: getDarkShogiClientView(
      state,
      { id: 'postgame-white', seat: 'white', solo: false },
      latestMoveColor,
    ),
  };
}

function darkShogiPostgameHistory(events: readonly DarkShogiEvent[]): DarkShogiPostgameHistory {
  const created = events[0];
  if (created?.type !== 'room-created') return {};
  let projection = replayTenantEvents(darkShogiTenant, [created]);
  let ply = 0;
  let latestMoveColor: ShogiColor | undefined;
  const history = postgameHistoryViews(projection, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(darkShogiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: DarkShogiProjection,
  ply: number,
  latestMoveColor?: ShogiColor,
): DarkShogiPostgameHistory {
  const history: DarkShogiPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: DarkShogiPostgameHistory,
  projection: DarkShogiProjection,
  ply: number,
  latestMoveColor?: ShogiColor,
): void {
  history.truth = [...(history.truth ?? []), { ply, view: darkShogiTruthView(projection.state) }];
  for (const color of ['black', 'white'] as const) {
    const view = getDarkShogiClientView(
      projection.state,
      { id: `postgame-history-${color}-${ply}`, seat: color, solo: false },
      latestMoveColor,
    );
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function darkShogiPostgameTimeline(
  events: readonly DarkShogiEvent[],
): Array<DarkShogiPostgameMove | DarkShogiPostgameTerminal> {
  const timeline: Array<DarkShogiPostgameMove | DarkShogiPostgameTerminal> = [];
  let ply = 0;
  for (const event of events) {
    if (event.type === 'move-played') {
      ply += 1;
      timeline.push({ type: event.type, at: event.at, color: event.color, move: event.move, ply });
      continue;
    }
    if (event.type === 'clock-expired') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: opponentOf(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: opponentOf(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function latestDarkShogiMoveColor(events: readonly DarkShogiEvent[]): ShogiColor | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color;
  }
  return undefined;
}

// The truth board: every piece revealed, every square visible. The reserves are
// carried on the per-color views (each side sees its own hand), so the truth
// view leaves `hand` empty — the postgame page reads both hands from views.black
// / views.white. Only ever built for a finished game (the reveal gate above).
function darkShogiTruthView(state: ShogiGameState): DarkShogiWirePlayerView {
  return {
    id: state.id,
    perspective: 'black',
    board: { ...state.board },
    hand: {},
    visibleSquares: allShogiSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allShogiSquares(): ShogiSquare[] {
  const squares: ShogiSquare[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
      squares.push(shogiSquareOf(file, rankIndex));
    }
  }
  return squares;
}
