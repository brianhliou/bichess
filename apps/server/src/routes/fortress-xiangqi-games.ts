import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiColor,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiPlayerView,
  fortressXiangqiMoveToFsfUci,
  getFortressXiangqiPlayerView,
  oppositeFortressXiangqiColor,
} from '@mistboard/game';
import { currentAccountUser } from './../account-session.js';
import { fortressXiangqiEnabled } from './../feature-flags.js';
import {
  evaluateFortressXiangqiPosition,
  FORTRESS_XIANGQI_ANALYSIS_DEPTH,
  FORTRESS_XIANGQI_ANALYSIS_ENGINE_ID,
} from './../fortress-xiangqi-fsf-engine.js';
import { fortressXiangqiRooms } from './../fortress-xiangqi-registration.js';
import { type FortressXiangqiEvent, fortressXiangqiTenant } from './../fortress-xiangqi-tenant.js';
import { type SweepPlyEval, sweepPlyEvals } from './../game-analysis-sweep.js';
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

type FortressXiangqiPostgameSnapshot = {
  ply: number;
  view: FortressXiangqiPlayerView;
};

type FortressXiangqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: FortressXiangqiColor;
  move: FortressXiangqiMove;
  ply: number;
};

type FortressXiangqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: FortressXiangqiColor; winner: FortressXiangqiColor }
  | { type: 'seat-resigned'; at: number; color: FortressXiangqiColor; winner: FortressXiangqiColor }
  | {
      type: 'seat-forfeited';
      at: number;
      color: FortressXiangqiColor;
      winner: FortressXiangqiColor;
    }
  | { type: 'game-aborted'; at: number; reason: string };

export type FortressXiangqiPostgamePersistence = {
  getLiveRoom?(roomId: string): FortressXiangqiRuntimeRoom | null;
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  isPersistenceEnabled?(): boolean;
  loadRoomEvents(roomId: string): Promise<FortressXiangqiEvent[] | null>;
};

type FortressXiangqiRuntimeRoom = TenantRuntimeRoom<
  'fortress-xiangqi',
  FortressXiangqiColor,
  FortressXiangqiMove,
  FortressXiangqiGameState,
  typeof FORTRESS_XIANGQI_SPEC_ID
>;

const defaultPersistence: FortressXiangqiPostgamePersistence = {
  getLiveRoom: (roomId) => fortressXiangqiRooms.get(roomId) ?? null,
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  isPersistenceEnabled: () => persistence.isInitialized(),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<FortressXiangqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  // Computer analysis: full-strength fixed-depth FSF eval of every ply, cached and
  // coalesced. GET returns only the cached result (204 on a miss, so the client can
  // auto-load on open); POST computes on a miss and is account-gated (the expensive
  // whole-game sweep). Mirrors the xiangqi analysis route; the fortress engine's
  // `best` is already in our coords (board + drops), so there is no rewrite step.
  const analysisMatch = pathname.match(/^\/api\/fortress-xiangqi\/games\/([^/]+)\/analysis$/);
  if (analysisMatch) {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!fortressXiangqiEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (method === 'POST') {
      const user = await currentAccountUser(request);
      if (!user) {
        writeJson(response, 401, { error: 'not_signed_in' });
        return true;
      }
    }
    const analysisRoomId = decodeURIComponent(analysisMatch[1]!);
    const analysisPayload = await fortressXiangqiPostgameForApi(analysisRoomId);
    if (!analysisPayload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const analysis = await resolveFortressXiangqiAnalysis(
      analysisRoomId,
      analysisPayload,
      liveAnalysisCache,
      undefined,
      method === 'POST',
    );
    if (!analysis) {
      response.writeHead(204).end();
      return true;
    }
    writeJson(response, 200, analysis);
    return true;
  }

  const postgameMatch = pathname.match(/^\/api\/fortress-xiangqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!fortressXiangqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await fortressXiangqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export type FortressXiangqiGameAnalysis = {
  engineId: string;
  depth: number;
  plies: SweepPlyEval[];
};

type FortressXiangqiAnalysisPayload = {
  timeline: ReadonlyArray<{ type: string; move?: FortressXiangqiMove }>;
};

/**
 * Build the Red-POV eval series for a finished fortress game from its postgame
 * payload. `analyze` is injectable for tests; it defaults to the real FSF whole-game
 * sweep. Unlike xiangqi/Pikafish there is NO `best`-coordinate rewrite — fortress FSF
 * UCI is already our notation (board moves + `Q@d4` drops).
 */
export async function analyzeFortressXiangqiPostgame(
  payload: FortressXiangqiAnalysisPayload,
  analyze: (movesUci: string[]) => Promise<SweepPlyEval[]> = (movesUci) =>
    sweepPlyEvals(movesUci, evaluateFortressXiangqiPosition, FORTRESS_XIANGQI_ANALYSIS_DEPTH),
): Promise<FortressXiangqiGameAnalysis> {
  const movesUci = payload.timeline
    .filter((entry): entry is { type: 'move-played'; move: FortressXiangqiMove } =>
      Boolean(entry.type === 'move-played' && entry.move),
    )
    .map((entry) => fortressXiangqiMoveToFsfUci(entry.move));
  const plies = await analyze(movesUci);
  return {
    engineId: FORTRESS_XIANGQI_ANALYSIS_ENGINE_ID,
    depth: FORTRESS_XIANGQI_ANALYSIS_DEPTH,
    plies,
  };
}

// Cache read/write, injectable for tests. Live impl reads/writes the variant-agnostic
// game_analysis table (no-ops when persistence is disabled).
export type FortressXiangqiAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<SweepPlyEval[] | null>;
  save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]): Promise<void>;
};

const liveAnalysisCache: FortressXiangqiAnalysisCache = {
  get: (roomId, engineId, depth) => persistence.getGameAnalysis(roomId, engineId, depth),
  save: (roomId, engineId, depth, plies) =>
    persistence.saveGameAnalysis(roomId, engineId, depth, plies),
};

// One in-flight compute per (room, engine, depth) so concurrent viewers don't run the
// whole-game sweep twice; cleared in `finally` so a failed compute never wedges the key.
const inflightAnalysis = new Map<string, Promise<FortressXiangqiGameAnalysis>>();

/**
 * Cache-first, coalesced whole-game analysis. A finished game's eval series is
 * immutable given (room, engine, depth): serve a stored result immediately, else
 * compute once (sharing one in-flight promise), persist it, and return.
 */
export async function resolveFortressXiangqiAnalysis(
  roomId: string,
  payload: FortressXiangqiAnalysisPayload,
  cache: FortressXiangqiAnalysisCache = liveAnalysisCache,
  analyze?: (movesUci: string[]) => Promise<SweepPlyEval[]>,
  computeIfMissing = true,
): Promise<FortressXiangqiGameAnalysis | null> {
  const engineId = FORTRESS_XIANGQI_ANALYSIS_ENGINE_ID;
  const depth = FORTRESS_XIANGQI_ANALYSIS_DEPTH;

  const cached = await cache.get(roomId, engineId, depth);
  if (cached) return { engineId, depth, plies: cached };
  if (!computeIfMissing) return null;

  const key = `${roomId}\0${engineId}\0${depth}`;
  const existing = inflightAnalysis.get(key);
  if (existing) return existing;

  const compute = (async () => {
    const analysis = await analyzeFortressXiangqiPostgame(payload, analyze);
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

export async function fortressXiangqiPostgameForApi(
  roomId: string,
  deps: FortressXiangqiPostgamePersistence = defaultPersistence,
) {
  const persistenceEnabled = deps.isPersistenceEnabled?.() ?? true;
  const [game, events] = await Promise.all([
    persistenceEnabled ? deps.getGameSummary(roomId) : null,
    persistenceEnabled ? deps.loadRoomEvents(roomId) : null,
  ]);
  if (game && game.variant !== FORTRESS_XIANGQI_SPEC_ID) return null;
  if (events && !isTenantEventLog(fortressXiangqiTenant, events, roomId)) return null;

  let source: {
    game: persistence.RecentEveGameRecord;
    events: readonly FortressXiangqiEvent[];
  } | null = game && events ? { game, events } : null;
  if (!source) {
    const room = deps.getLiveRoom?.(roomId) ?? null;
    await room?.pendingWrites.catch(() => undefined);
    source = fortressXiangqiPostgameFromLiveRoom(roomId, room);
  }
  if (!source) return null;

  const projection = replayTenantEvents(fortressXiangqiTenant, source.events);
  if (projection.state.status.type !== 'finished') return null;
  const pveEngineId = tenantPveEngineId(fortressXiangqiTenant, { projection } as never);

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
    timeline: fortressXiangqiPostgameTimeline(source.events),
    view: getFortressXiangqiPlayerView(projection.state, 'red'),
    views: {
      truth: getFortressXiangqiPlayerView(projection.state, 'red'),
    },
    history: fortressXiangqiPostgameHistory(source.events),
  };
}

function fortressXiangqiPostgameFromLiveRoom(
  roomId: string,
  room: FortressXiangqiRuntimeRoom | null,
): { game: persistence.RecentEveGameRecord; events: readonly FortressXiangqiEvent[] } | null {
  if (!room || room.id !== roomId) return null;
  if (room.projection.state.status.type !== 'finished') return null;
  if (!isTenantEventLog(fortressXiangqiTenant, room.events, roomId)) return null;
  const summary = buildTenantGameSummary(fortressXiangqiTenant, room);
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
  game: Awaited<ReturnType<FortressXiangqiPostgamePersistence['getGameSummary']>>,
  color: FortressXiangqiColor,
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

function fortressXiangqiPostgameHistory(events: readonly FortressXiangqiEvent[]): {
  truth: FortressXiangqiPostgameSnapshot[];
} {
  const created = events[0];
  if (created?.type !== 'room-created') return { truth: [] };
  let projection = replayTenantEvents(fortressXiangqiTenant, [created]);
  let ply = 0;
  const truth: FortressXiangqiPostgameSnapshot[] = [
    { ply, view: getFortressXiangqiPlayerView(projection.state, 'red') },
  ];

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(fortressXiangqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    truth.push({ ply, view: getFortressXiangqiPlayerView(projection.state, 'red') });
  }
  return { truth };
}

function fortressXiangqiPostgameTimeline(
  events: readonly FortressXiangqiEvent[],
): Array<FortressXiangqiPostgameMove | FortressXiangqiPostgameTerminal> {
  const timeline: Array<FortressXiangqiPostgameMove | FortressXiangqiPostgameTerminal> = [];
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
        winner: oppositeFortressXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeFortressXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
