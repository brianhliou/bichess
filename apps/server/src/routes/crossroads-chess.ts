import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessMove,
  type CrossroadsChessPlayerView,
  getCrossroadsChessOpenView,
  maybeGameSpecForId,
  oppositeCrossroadsChessColor,
} from '@mistboard/game';
import { crossroadsChessEngineMove } from '../crossroads-chess-engine.js';
import type {
  CrossroadsChessEvent,
  CrossroadsChessProjection,
} from '../crossroads-chess-runtime.js';
import { crossroadsChessTenant } from '../crossroads-chess-tenant.js';
import { crossroadsChessEnabled } from '../feature-flags.js';
import { FinishedGameCache } from '../finished-game-cache.js';
import * as persistence from '../persistence.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from '../variant-tenant/runtime.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

// Strict UCI shape for a 6x8 board (files a-f, ranks 1-8, optional Queen promo).
// Anything else is rejected before it can reach the engine's stdin.
const UCI_MOVE = /^[a-f][1-8][a-f][1-8]q?$/;
const MAX_MOVES = 400;

type CrossroadsChessPostgameViewKey = CrossroadsChessColor | 'truth';
type CrossroadsChessPostgameViews = Partial<
  Record<CrossroadsChessPostgameViewKey, CrossroadsChessPlayerView>
>;
type CrossroadsChessPostgameSnapshot = {
  ply: number;
  view: CrossroadsChessPlayerView;
};
type CrossroadsChessPostgameHistory = Partial<
  Record<CrossroadsChessPostgameViewKey, CrossroadsChessPostgameSnapshot[]>
>;

type CrossroadsChessPostgameMove = {
  type: 'move-played';
  at: number;
  color: CrossroadsChessColor;
  move: CrossroadsChessMove;
  ply: number;
};

type CrossroadsChessPostgameTerminal =
  | { type: 'seat-resigned'; at: number; color: CrossroadsChessColor; winner: CrossroadsChessColor }
  | {
      type: 'seat-forfeited';
      at: number;
      color: CrossroadsChessColor;
      winner: CrossroadsChessColor;
    }
  | { type: 'clock-expired'; at: number; color: CrossroadsChessColor; winner: CrossroadsChessColor }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database.
export type CrossroadsChessPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<CrossroadsChessEvent[] | null>;
};

const defaultPersistence: CrossroadsChessPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<CrossroadsChessEvent>(roomId),
};

// Postgame rebuild is O(plies) × 3 board views per ply, so a Mistboard TV
// variant switch (which fetches one of these per game) pays it every time.
// Finished crossroads games are immutable, so memoize the projection by room
// id. The cache is only consulted on the production path (defaultPersistence);
// unit tests inject their own `deps` and reuse a fixed room id with different
// event logs, so they must bypass it to stay deterministic.
const crossroadsPostgameCache = new FinishedGameCache<
  NonNullable<Awaited<ReturnType<typeof buildCrossroadsChessPostgame>>>
>();

export function clearCrossroadsChessPostgameCache(): void {
  crossroadsPostgameCache.clear();
}

// POST /api/crossroads-chess/engine-move  { moves: string[], movetime?: number }
//   -> { move: string | null }   (Fairy-Stockfish best move for the open mode)
export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const exportMatch = pathname.match(
    /^\/api\/(?:crossroads-chess|dual-chess)\/games\/([^/]+)\/export\.json$/,
  );
  if (exportMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!crossroadsChessEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (!requirePersistence(response)) return true;

    const roomId = decodeURIComponent(exportMatch[1]!);
    const payload = await crossroadsChessPostgameForApi(roomId);
    if (!payload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `inline; filename="mistboard-${roomId}.json"`,
    });
    response.end(JSON.stringify(payload));
    return true;
  }

  const postgameMatch = pathname.match(/^\/api\/(?:crossroads-chess|dual-chess)\/games\/([^/]+)$/);
  if (postgameMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!crossroadsChessEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (!requirePersistence(response)) return true;

    const roomId = decodeURIComponent(postgameMatch[1]!);
    const payload = await crossroadsChessPostgameForApi(roomId);
    if (!payload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, payload);
    return true;
  }

  if (
    pathname !== '/api/crossroads-chess/engine-move' &&
    pathname !== '/api/dual-chess/engine-move'
  )
    return false;
  if (!requireMethod(request, response, 'POST')) return true;

  const body = await readJsonBody(request);
  const rawMoves = Array.isArray(body.moves) ? body.moves : [];
  if (rawMoves.length > MAX_MOVES) {
    writeJson(response, 400, { error: 'too_many_moves' });
    return true;
  }
  const moves: string[] = [];
  for (const move of rawMoves) {
    if (typeof move !== 'string' || !UCI_MOVE.test(move)) {
      writeJson(response, 400, { error: 'invalid_move' });
      return true;
    }
    moves.push(move);
  }
  const movetime =
    typeof body.movetime === 'number' && body.movetime > 0 && body.movetime <= 5000
      ? Math.floor(body.movetime)
      : 500;
  const skill =
    typeof body.skill === 'number' && body.skill >= 0 && body.skill <= 20
      ? Math.floor(body.skill)
      : undefined;

  try {
    const move = await crossroadsChessEngineMove(moves, { movetimeMs: movetime, skill });
    writeJson(response, 200, { move });
  } catch (err) {
    writeJson(response, 503, { error: 'engine_unavailable', detail: (err as Error).message });
  }
  return true;
}

export async function crossroadsChessPostgameForApi(
  roomId: string,
  deps: CrossroadsChessPostgamePersistence = defaultPersistence,
) {
  const useCache = deps === defaultPersistence;
  if (useCache) {
    const cached = crossroadsPostgameCache.get(roomId);
    if (cached) return cached;
  }
  const payload = await buildCrossroadsChessPostgame(roomId, deps);
  if (payload && useCache) crossroadsPostgameCache.set(roomId, payload);
  return payload;
}

async function buildCrossroadsChessPostgame(
  roomId: string,
  deps: CrossroadsChessPostgamePersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || maybeGameSpecForId(game.variant)?.id !== CROSSROADS_CHESS_SPEC_ID) return null;
  if (!events || !isTenantEventLog(crossroadsChessTenant, events, roomId)) return null;

  const projection = replayTenantEvents(crossroadsChessTenant, events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: {
      roomId: game.roomId,
      variant: game.variant,
      mode: game.mode,
      whiteName: postgameSeatDisplayName(game, 'white'),
      redName: postgameSeatDisplayName(game, 'red'),
      result: game.result,
      termination: game.termination,
      plyCount: game.plyCount,
      startedAt: game.startedAt.toISOString(),
      endedAt: game.endedAt.toISOString(),
      rated: game.rated,
      visibility: game.visibility,
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      progressClock: projection.state.progressClock,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: crossroadsChessPostgameTimeline(events),
    view: getCrossroadsChessOpenView(projection.state, 'white'),
    views: crossroadsChessPostgameViews(projection.state),
    history: crossroadsChessPostgameHistory(events),
    clocks: crossroadsChessPostgameClocks(events),
  };
}

function postgameSeatDisplayName(
  game: Awaited<ReturnType<CrossroadsChessPostgamePersistence['getGameSummary']>>,
  color: CrossroadsChessColor,
): string {
  const persistedName =
    participantDisplayName(game, color) ?? (color === 'white' ? game?.whiteName : null);
  if (!persistedName) return 'Guest';
  if (persistedName === (color === 'white' ? 'White' : 'Red')) return 'Guest';
  return persistedName;
}

function participantDisplayName(
  game: Awaited<ReturnType<CrossroadsChessPostgamePersistence['getGameSummary']>>,
  color: CrossroadsChessColor,
): string | null {
  return (
    game?.participants?.find((participant) => participant.color === color)?.displayName ?? null
  );
}

function crossroadsChessPostgameViews(
  state: CrossroadsChessGameState,
): CrossroadsChessPostgameViews {
  return {
    white: getCrossroadsChessOpenView(state, 'white'),
    truth: getCrossroadsChessOpenView(state, 'white'),
    red: getCrossroadsChessOpenView(state, 'red'),
  };
}

function crossroadsChessPostgameHistory(
  events: readonly CrossroadsChessEvent[],
): CrossroadsChessPostgameHistory {
  const created = events[0];
  if (created?.type !== 'room-created') return {};
  let projection = replayTenantEvents(crossroadsChessTenant, [created]);
  let ply = 0;
  const history = postgameHistoryViews(projection, ply);

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(crossroadsChessTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    appendPostgameHistoryViews(history, projection, ply);
  }
  return history;
}

function postgameHistoryViews(
  projection: CrossroadsChessProjection,
  ply: number,
): CrossroadsChessPostgameHistory {
  const history: CrossroadsChessPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply);
  return history;
}

function appendPostgameHistoryViews(
  history: CrossroadsChessPostgameHistory,
  projection: CrossroadsChessProjection,
  ply: number,
): void {
  history.white = [
    ...(history.white ?? []),
    { ply, view: getCrossroadsChessOpenView(projection.state, 'white') },
  ];
  history.truth = [
    ...(history.truth ?? []),
    { ply, view: getCrossroadsChessOpenView(projection.state, 'white') },
  ];
  history.red = [
    ...(history.red ?? []),
    { ply, view: getCrossroadsChessOpenView(projection.state, 'red') },
  ];
}

function crossroadsChessPostgameTimeline(
  events: readonly CrossroadsChessEvent[],
): Array<CrossroadsChessPostgameMove | CrossroadsChessPostgameTerminal> {
  const timeline: Array<CrossroadsChessPostgameMove | CrossroadsChessPostgameTerminal> = [];
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
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeCrossroadsChessColor(event.color),
      });
      continue;
    }
    if (event.type === 'clock-expired') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeCrossroadsChessColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function crossroadsChessPostgameClocks(
  events: readonly CrossroadsChessEvent[],
): Array<Record<CrossroadsChessColor, number>> {
  const created = events[0];
  if (created?.type !== 'room-created') return [];
  let projection = replayTenantEvents(crossroadsChessTenant, [created]);
  const clocks: Array<Record<CrossroadsChessColor, number>> = [];
  const capture = (ply: number): void => {
    if (projection.clock) clocks[ply] = { ...projection.clock.remainingMs };
  };
  let ply = 0;
  capture(0);
  for (const event of events.slice(1)) {
    projection = applyTenantEvent(crossroadsChessTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    capture(ply);
  }
  return clocks;
}
