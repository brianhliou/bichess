import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getStandardXiangqiPlayerView,
  pikafishUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  XIANGQI_SPEC_ID,
  type XiangqiColor,
  type XiangqiMove,
  xiangqiMoveToPikafishUci,
} from '@mistboard/game';
import { currentAccountUser } from './../account-session.js';
import { xiangqiEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import { buildTenantGameSummary } from './../variant-tenant/events.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from './../variant-tenant/runtime.js';
import { analyzeXiangqiGame, type PlyEval } from './../xiangqi-analysis.js';
import { XIANGQI_DEFAULT_ENGINE_ID as XIANGQI_ANALYSIS_ENGINE_ID } from './../xiangqi-pikafish-engine.js';
import { xiangqiRooms } from './../xiangqi-registration.js';
import type { XiangqiEvent, XiangqiRuntimeRoom } from './../xiangqi-runtime.js';
import { xiangqiTenant } from './../xiangqi-tenant.js';
import { type HttpApiContext, postgameGameSummary, requireMethod, writeJson } from './lib.js';

type XiangqiPostgameSnapshot = {
  ply: number;
  view: StandardXiangqiPlayerView;
};

type XiangqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: XiangqiColor;
  move: XiangqiMove;
  ply: number;
};

type XiangqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: XiangqiColor; winner: XiangqiColor }
  | { type: 'seat-resigned'; at: number; color: XiangqiColor; winner: XiangqiColor }
  | { type: 'seat-forfeited'; at: number; color: XiangqiColor; winner: XiangqiColor }
  | { type: 'game-aborted'; at: number; reason: string };

export type XiangqiPostgamePersistence = {
  getLiveRoom?(roomId: string): XiangqiRuntimeRoom | null;
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  isPersistenceEnabled?(): boolean;
  loadRoomEvents(roomId: string): Promise<XiangqiEvent[] | null>;
};

const livePersistence: XiangqiPostgamePersistence = {
  getLiveRoom: (roomId) => xiangqiRooms.get(roomId) ?? null,
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  isPersistenceEnabled: () => persistence.isInitialized(),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<XiangqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  // Computer analysis: eval every ply with Pikafish (P3). Reuses the postgame
  // loader (finished-games-only) to get the moves, then runs the whole-game job.
  // GET returns the cached result only (204 on a miss — never triggers a compute,
  // so the client can auto-load on page open); POST computes on a miss.
  const analysisMatch = pathname.match(/^\/api\/xiangqi\/games\/([^/]+)\/analysis$/);
  if (analysisMatch) {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!xiangqiEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    // Requesting a fresh server-side engine pass (POST) is account-gated — it is
    // the expensive path (a whole-game Pikafish sweep). GET stays open so the
    // cached result auto-loads for anyone opening the page.
    if (method === 'POST') {
      const user = await currentAccountUser(request);
      if (!user) {
        writeJson(response, 401, { error: 'not_signed_in' });
        return true;
      }
    }
    const roomId = decodeURIComponent(analysisMatch[1]!);
    const payload = await xiangqiPostgameForApi(roomId, livePersistence);
    if (!payload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const analysis = await resolveXiangqiAnalysis(
      roomId,
      payload,
      liveAnalysisCache,
      undefined,
      method === 'POST',
    );
    if (!analysis) {
      // GET cache miss: not computed yet. 204 = "nothing cached", client shows the button.
      response.writeHead(204).end();
      return true;
    }
    writeJson(response, 200, analysis);
    return true;
  }

  const postgameMatch = pathname.match(/^\/api\/xiangqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!xiangqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await xiangqiPostgameForApi(roomId, livePersistence);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

// Depth for a synchronous request-analysis pass — lower than the deep-study
// XIANGQI_ANALYSIS_DEPTH so ~30 plies return in ~10s over one HTTP call. Prod
// should move to async + poll (and cache) for a deeper pass.
export const XIANGQI_ANALYSIS_REQUEST_DEPTH = 12;

export type XiangqiGameAnalysis = {
  engineId: string;
  depth: number;
  plies: PlyEval[];
};

/**
 * Build the eval series for a finished game from its postgame payload. `analyze`
 * is injectable for tests; it defaults to the real Pikafish whole-game job.
 */
export async function analyzeXiangqiPostgame(
  payload: { timeline: ReadonlyArray<{ type: string; move?: XiangqiMove }> },
  analyze: (movesUci: string[]) => Promise<PlyEval[]> = (movesUci) =>
    analyzeXiangqiGame(movesUci, { depth: XIANGQI_ANALYSIS_REQUEST_DEPTH }),
): Promise<XiangqiGameAnalysis> {
  const movesUci = payload.timeline
    .filter((entry): entry is { type: 'move-played'; move: XiangqiMove } =>
      Boolean(entry.type === 'move-played' && entry.move),
    )
    .map((entry) => xiangqiMoveToPikafishUci(entry.move));
  const plies = await analyze(movesUci);
  return {
    engineId: XIANGQI_ANALYSIS_ENGINE_ID,
    depth: XIANGQI_ANALYSIS_REQUEST_DEPTH,
    // `best` comes back as Pikafish UCI (0-indexed); hand the client our own square
    // notation so it never has to know the engine's rank convention.
    plies: plies.map((p) => ({ ...p, best: pikafishBestToOurUci(p.best) })),
  };
}

function pikafishBestToOurUci(best: string | null): string | null {
  if (!best) return null;
  const squares = pikafishUciToXiangqiSquares(best);
  return squares ? `${squares.from}${squares.to}` : null;
}

type XiangqiAnalysisPayload = { timeline: ReadonlyArray<{ type: string; move?: XiangqiMove }> };

// Cache read/write, injectable for tests. Live impl reads/writes the
// game_analysis table (no-ops when persistence is disabled).
export type XiangqiAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<PlyEval[] | null>;
  save(roomId: string, engineId: string, depth: number, plies: PlyEval[]): Promise<void>;
};

const liveAnalysisCache: XiangqiAnalysisCache = {
  get: (roomId, engineId, depth) => persistence.getGameAnalysis(roomId, engineId, depth),
  save: (roomId, engineId, depth, plies) =>
    persistence.saveGameAnalysis(roomId, engineId, depth, plies),
};

// One in-flight compute per (room, engine, depth) so a double-click or two
// viewers of the same game don't run the whole-game engine pass twice. Cleared
// in `finally`, so a failed compute doesn't wedge the key.
const inflightAnalysis = new Map<string, Promise<XiangqiGameAnalysis>>();

/**
 * Cache-first, coalesced whole-game analysis. A finished game's eval series is
 * immutable given (room, engine, depth): serve a stored result immediately, else
 * compute once (sharing one in-flight promise across concurrent callers), persist
 * it, and return. This keeps the ~10s engine pass off the hot path for every
 * request after the first and prevents duplicate passes. `cache`/`analyze` are
 * injectable for tests.
 */
export async function resolveXiangqiAnalysis(
  roomId: string,
  payload: XiangqiAnalysisPayload,
  cache: XiangqiAnalysisCache = liveAnalysisCache,
  analyze?: (movesUci: string[]) => Promise<PlyEval[]>,
  computeIfMissing = true,
): Promise<XiangqiGameAnalysis | null> {
  const engineId = XIANGQI_ANALYSIS_ENGINE_ID;
  const depth = XIANGQI_ANALYSIS_REQUEST_DEPTH;

  const cached = await cache.get(roomId, engineId, depth);
  if (cached) return { engineId, depth, plies: cached };
  if (!computeIfMissing) return null;

  const key = `${roomId}\0${engineId}\0${depth}`;
  const existing = inflightAnalysis.get(key);
  if (existing) return existing;

  const compute = (async () => {
    const analysis = await analyzeXiangqiPostgame(payload, analyze);
    await cache.save(roomId, engineId, depth, analysis.plies);
    return analysis;
  })();
  inflightAnalysis.set(key, compute);
  try {
    return await compute;
  } finally {
    inflightAnalysis.delete(key);
  }
}

export async function xiangqiPostgameForApi(
  roomId: string,
  deps: XiangqiPostgamePersistence = livePersistence,
) {
  const persistenceEnabled = deps.isPersistenceEnabled?.() ?? true;
  const [game, events] = await Promise.all([
    persistenceEnabled ? deps.getGameSummary(roomId) : null,
    persistenceEnabled ? deps.loadRoomEvents(roomId) : null,
  ]);
  if (game && game.variant !== XIANGQI_SPEC_ID) return null;
  if (events && !isTenantEventLog(xiangqiTenant, events, roomId)) return null;

  let source: {
    game: persistence.RecentEveGameRecord;
    events: readonly XiangqiEvent[];
  } | null = game && events ? { game, events } : null;
  if (!source) {
    const room = deps.getLiveRoom?.(roomId) ?? null;
    await room?.pendingWrites.catch(() => undefined);
    source = xiangqiPostgameFromLiveRoom(roomId, room);
  }
  if (!source) return null;

  const projection = replayTenantEvents(xiangqiTenant, source.events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: postgameGameSummary(source.game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: xiangqiPostgameTimeline(source.events),
    // Open information: every viewer sees the same truth board.
    view: getStandardXiangqiPlayerView(projection.state, 'red'),
    views: {
      truth: getStandardXiangqiPlayerView(projection.state, 'red'),
    },
    history: xiangqiPostgameHistory(source.events),
  };
}

function xiangqiPostgameFromLiveRoom(
  roomId: string,
  room: XiangqiRuntimeRoom | null,
): { game: persistence.RecentEveGameRecord; events: readonly XiangqiEvent[] } | null {
  if (!room || room.id !== roomId) return null;
  if (room.projection.state.status.type !== 'finished') return null;
  if (!isTenantEventLog(xiangqiTenant, room.events, roomId)) return null;
  const summary = buildTenantGameSummary(xiangqiTenant, room);
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

function xiangqiPostgameHistory(events: readonly XiangqiEvent[]): {
  truth: XiangqiPostgameSnapshot[];
} {
  const created = events[0];
  if (!created || created.type !== 'room-created') return { truth: [] };
  let projection = replayTenantEvents(xiangqiTenant, [created]);
  let ply = 0;
  const truth: XiangqiPostgameSnapshot[] = [
    { ply, view: getStandardXiangqiPlayerView(projection.state, 'red') },
  ];

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(xiangqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    truth.push({ ply, view: getStandardXiangqiPlayerView(projection.state, 'red') });
  }
  return { truth };
}

function xiangqiPostgameTimeline(
  events: readonly XiangqiEvent[],
): Array<XiangqiPostgameMove | XiangqiPostgameTerminal> {
  const timeline: Array<XiangqiPostgameMove | XiangqiPostgameTerminal> = [];
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
        winner: oppositeXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function oppositeXiangqiColor(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}
