import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getJieqiPlayerView,
  JIEQI_SPEC_ID,
  type JieqiColor,
  type JieqiDeal,
  type JieqiGameState,
  type JieqiMove,
  type JieqiPlayerView,
  jieqiTruthView,
  oppositeJieqiColor,
} from '@mistboard/game';
import { currentAccountUser } from './../account-session.js';
import { jieqiEnabled } from './../feature-flags.js';
import { VacuousAnalysisError } from './../game-analysis-sweep.js';
import {
  jieqiChancePlies,
  resolveJieqiAnalysis,
  resolveJieqiDecisions,
} from './../jieqi-analysis.js';
import { jieqiEngineBinaryAvailable } from './../jieqi-engine.js';
import type { JieqiEvent, JieqiProjection } from './../jieqi-runtime.js';
import { jieqiTenant } from './../jieqi-tenant.js';
import { logger } from './../obs.js';
import * as persistence from './../persistence.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from './../variant-tenant/runtime.js';
import {
  type HttpApiContext,
  postgameGameSummary,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

type JieqiPostgameViewKey = JieqiColor | 'truth';

type JieqiPostgameViews = Partial<Record<JieqiPostgameViewKey, JieqiPlayerView>>;
type JieqiPostgameSnapshot = {
  ply: number;
  view: JieqiPlayerView;
};
type JieqiPostgameHistory = Partial<Record<JieqiPostgameViewKey, JieqiPostgameSnapshot[]>>;

type JieqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: JieqiColor;
  move: { from: string; to: string };
  ply: number;
};

type JieqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: JieqiColor; winner: JieqiColor }
  | { type: 'seat-resigned'; at: number; color: JieqiColor; winner: JieqiColor }
  | { type: 'seat-forfeited'; at: number; color: JieqiColor; winner: JieqiColor }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database, mirroring
// the Dark Mini Xiangqi route.
export type JieqiPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<JieqiEvent[] | null>;
};

const defaultPersistence: JieqiPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<JieqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  // Computer analysis: fixed-strength eval of every ply, red-seat POV, cached + coalesced.
  // GET returns only the cached result (204 on a miss, so the client auto-loads on open); POST
  // computes on a miss and is account-gated (the whole-game sweep is expensive). Jieqi hides
  // face-down IDENTITIES, so reconstruction needs the per-game DEAL (events[0].setup) — we
  // replay the raw event log (which retains the server-secret deal), not the client payload.
  const analysisMatch = pathname.match(/^\/api\/jieqi\/games\/([^/]+)\/analysis$/);
  if (analysisMatch) {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!jieqiEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (method === 'POST') {
      const user = await currentAccountUser(request);
      if (!user) {
        writeJson(response, 401, { error: 'not_signed_in' });
        return true;
      }
      // Fail closed, not open: the analysis engine is the PikaJieQi binary ONLY. A missing
      // binary is a broken deploy, so surface it (alertable log + 503) instead of a weaker
      // eval. Gated to the compute path — GET only reads the cache and never needs the engine.
      if (!jieqiEngineBinaryAvailable()) {
        logger.error(
          { kind: 'jieqi_analysis_engine_unavailable' },
          'Jieqi analysis requested but the PikaJieQi binary is not present; failing closed',
        );
        writeJson(response, 503, { error: 'analysis_engine_unavailable' });
        return true;
      }
    }
    if (!requirePersistence(response)) return true;

    const analysisRoomId = decodeURIComponent(analysisMatch[1]!);
    const events = await persistence.loadRoomEvents<JieqiEvent>(analysisRoomId);
    if (!events || !isTenantEventLog(jieqiTenant, events, analysisRoomId)) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    // Only finished games are analysable; replay confirms the terminal state.
    const projection = replayTenantEvents(jieqiTenant, events);
    if (projection.state.status.type !== 'finished') {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    // The deal lives on the room-created event's setup (retained in the persisted log; only the
    // client wire copy strips it). Without it we cannot reconstruct hidden identities.
    const created = events[0];
    const deal =
      created && created.type === 'room-created'
        ? (created.setup as JieqiDeal | undefined)
        : undefined;
    if (!deal) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const moves = events
      .filter(
        (event): event is Extract<JieqiEvent, { type: 'move-played' }> =>
          event.type === 'move-played',
      )
      .map((event) => event.move as JieqiMove);

    let analysis: Awaited<ReturnType<typeof resolveJieqiAnalysis>>;
    try {
      analysis = await resolveJieqiAnalysis(
        analysisRoomId,
        moves,
        deal,
        undefined,
        undefined,
        method === 'POST',
      );
    } catch (err) {
      // A scoreless sweep (engine emitted moves but no evals) fails closed like a missing
      // binary: 503, nothing cached, rather than a bogus flawless-game result.
      if (err instanceof VacuousAnalysisError) {
        logger.error(
          { kind: 'jieqi_analysis_engine_vacuous', room_id: analysisRoomId },
          'Jieqi analysis produced no evals (engine emitted no score); failing closed',
        );
        writeJson(response, 503, { error: 'analysis_engine_unavailable' });
        return true;
      }
      throw err;
    }
    if (!analysis) {
      response.writeHead(204).end();
      return true;
    }
    // Mark the REVEAL (chance) plies so the client leaves them unjudged. Unlike banqi's
    // from===to flip, a jieqi reveal is a normal move of a face-down piece, so we detect it by
    // replaying the deal (jieqiChancePlies), not by move shape.
    const chancePlies = jieqiChancePlies(moves, deal);
    writeJson(response, 200, { ...analysis, chancePlies });
    return true;
  }

  // Decision-vs-luck decomposition (Layer 2): the heavier, opt-in tier on top of the basic eval
  // sweep above. Per reveal ply it returns {best, played, realized} EVs (mover POV) so the client
  // can split the swing into decision quality vs luck. GET reads only the cache (204 on a miss,
  // INCLUDING when the basic analysis it depends on isn't cached yet); POST computes (the basic
  // sweep first, for the free `realized`, then the MultiPV decomposition) and is account-gated.
  const decisionsMatch = pathname.match(/^\/api\/jieqi\/games\/([^/]+)\/decisions$/);
  if (decisionsMatch) {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!jieqiEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (method === 'POST') {
      const user = await currentAccountUser(request);
      if (!user) {
        writeJson(response, 401, { error: 'not_signed_in' });
        return true;
      }
      if (!jieqiEngineBinaryAvailable()) {
        logger.error(
          { kind: 'jieqi_decisions_engine_unavailable' },
          'Jieqi decisions requested but the PikaJieQi binary is not present; failing closed',
        );
        writeJson(response, 503, { error: 'analysis_engine_unavailable' });
        return true;
      }
    }
    if (!requirePersistence(response)) return true;

    const decisionsRoomId = decodeURIComponent(decisionsMatch[1]!);
    const inputs = await loadFinishedJieqiGameInputs(decisionsRoomId);
    if (!inputs) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const compute = method === 'POST';
    try {
      // Compute the basic eval sweep too (the eval graph rides alongside the decomposition), and
      // on GET use its cache as the readiness gate: a basic-analysis miss means analysis hasn't
      // been requested yet, so 204. The decomposition itself is self-contained (it recomputes
      // realized), so it does not consume the sweep — it just shares the "has analysis" lifecycle.
      const analysis = await resolveJieqiAnalysis(
        decisionsRoomId,
        inputs.moves,
        inputs.deal,
        undefined,
        undefined,
        compute,
      );
      if (!analysis) {
        response.writeHead(204).end();
        return true;
      }
      const decisions = await resolveJieqiDecisions(
        decisionsRoomId,
        inputs.moves,
        inputs.deal,
        undefined,
        undefined,
        compute,
      );
      if (!decisions) {
        response.writeHead(204).end();
        return true;
      }
      writeJson(response, 200, decisions);
    } catch (err) {
      if (err instanceof VacuousAnalysisError) {
        logger.error(
          { kind: 'jieqi_decisions_engine_vacuous', room_id: decisionsRoomId },
          'Jieqi decisions produced no evals (engine emitted no score); failing closed',
        );
        writeJson(response, 503, { error: 'analysis_engine_unavailable' });
        return true;
      }
      throw err;
    }
    return true;
  }

  const postgameMatch = pathname.match(/^\/api\/jieqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!jieqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await jieqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

// Shared loader for the analysis tiers: the per-game deal (from the room-created event) + the
// move list, but only for a FINISHED game. Returns null for a missing / non-jieqi / unfinished
// game or a log with no deal. The `/decisions` branch uses it; the `/analysis` branch inlines the
// same steps (kept as-is to avoid churn).
async function loadFinishedJieqiGameInputs(
  roomId: string,
): Promise<{ deal: JieqiDeal; moves: JieqiMove[] } | null> {
  const events = await persistence.loadRoomEvents<JieqiEvent>(roomId);
  if (!events || !isTenantEventLog(jieqiTenant, events, roomId)) return null;
  const projection = replayTenantEvents(jieqiTenant, events);
  if (projection.state.status.type !== 'finished') return null;
  const created = events[0];
  const deal =
    created && created.type === 'room-created'
      ? (created.setup as JieqiDeal | undefined)
      : undefined;
  if (!deal) return null;
  const moves = events
    .filter(
      (event): event is Extract<JieqiEvent, { type: 'move-played' }> =>
        event.type === 'move-played',
    )
    .map((event) => event.move as JieqiMove);
  return { deal, moves };
}

export async function jieqiPostgameForApi(
  roomId: string,
  deps: JieqiPostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== JIEQI_SPEC_ID) return null;
  if (!events || !isTenantEventLog(jieqiTenant, events, roomId)) return null;

  // Replay reconstructs the FULL-TRUTH state: the per-game deal lives in
  // events[0].setup and is applied during createInitialState, so every hidden
  // identity is known to the server here. Redaction happens below per view.
  const projection = replayTenantEvents(jieqiTenant, events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: postgameGameSummary(game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: jieqiPostgameTimeline(events),
    // Truth view: every identity revealed (postgame-only; never on a live wire).
    view: jieqiTruthView(projection.state),
    // Per-color views reuse the EXISTING leak-safe redaction: the opponent's
    // face-down pieces stay faceDown, and captured dark pieces the viewer did
    // not take carry role:null. No hand-rolled masking.
    views: jieqiPostgameViews(projection.state),
    history: jieqiPostgameHistory(events),
  };
}

function jieqiPostgameViews(state: JieqiGameState): JieqiPostgameViews {
  return {
    red: getJieqiPlayerView(state, 'red'),
    truth: jieqiTruthView(state),
    black: getJieqiPlayerView(state, 'black'),
  };
}

function jieqiPostgameHistory(events: readonly JieqiEvent[]): JieqiPostgameHistory {
  const created = events[0];
  if (!created || created.type !== 'room-created') return {};
  let projection = replayTenantEvents(jieqiTenant, [created]);
  let ply = 0;
  const history = postgameHistoryViews(projection, ply);

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(jieqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    appendPostgameHistoryViews(history, projection, ply);
  }
  return history;
}

function postgameHistoryViews(projection: JieqiProjection, ply: number): JieqiPostgameHistory {
  const history: JieqiPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply);
  return history;
}

function appendPostgameHistoryViews(
  history: JieqiPostgameHistory,
  projection: JieqiProjection,
  ply: number,
): void {
  history.truth = [...(history.truth ?? []), { ply, view: jieqiTruthView(projection.state) }];
  for (const color of ['red', 'black'] as const) {
    const view = getJieqiPlayerView(projection.state, color);
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function jieqiPostgameTimeline(
  events: readonly JieqiEvent[],
): Array<JieqiPostgameMove | JieqiPostgameTerminal> {
  const timeline: Array<JieqiPostgameMove | JieqiPostgameTerminal> = [];
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
        winner: oppositeJieqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeJieqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
