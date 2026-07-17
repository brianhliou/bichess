import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  BANQI_SPEC_ID,
  type BanqiDeal,
  type BanqiMove,
  type BanqiPlayerView,
  type BanqiSeat,
  banqiTruthView,
  getBanqiPlayerView,
  oppositeBanqiSeat,
} from '@mistboard/game';
import { currentAccountUser } from './../account-session.js';
import { resolveBanqiAnalysis, resolveBanqiDecisions } from './../banqi-analysis.js';
import { banqiEngineBinaryAvailable } from './../banqi-engine.js';
import type { BanqiEvent } from './../banqi-runtime.js';
import { banqiTenant } from './../banqi-tenant.js';
import { banqiEnabled } from './../feature-flags.js';
import { VacuousAnalysisError } from './../game-analysis-sweep.js';
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

// Banqi postgame review. Banqi is SYMMETRIC-information: a face-down tile is
// hidden from BOTH seats equally, and every capture is of an already-revealed
// (face-up) piece, so neither seat ever holds private knowledge the other lacks.
// That collapses jieqi's per-seat (red/black) split — the two masked views would
// be identical — to a SINGLE truth review surface. The web postgame keys off
// `view` + `history.truth` and renders one board with a working per-ply replay.

type BanqiPostgameSnapshot = {
  ply: number;
  view: BanqiPlayerView;
};

type BanqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: BanqiSeat;
  move: { from: string; to: string };
  ply: number;
};

type BanqiPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: BanqiSeat; winner: BanqiSeat }
  | { type: 'seat-resigned'; at: number; color: BanqiSeat; winner: BanqiSeat }
  | { type: 'seat-forfeited'; at: number; color: BanqiSeat; winner: BanqiSeat }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database, mirroring
// the jieqi route.
export type BanqiPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<BanqiEvent[] | null>;
};

const defaultPersistence: BanqiPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<BanqiEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  // Computer analysis: fixed-strength eval of every ply, red-seat POV, cached + coalesced.
  // GET returns only the cached result (204 on a miss, so the client auto-loads on open);
  // POST computes on a miss and is account-gated (the whole-game sweep is expensive). Banqi
  // is hidden-info, so reconstruction needs the per-game DEAL (events[0].setup) — we replay
  // the raw event log (which retains the server-secret deal) rather than the client payload.
  const analysisMatch = pathname.match(/^\/api\/banqi\/games\/([^/]+)\/analysis$/);
  if (analysisMatch) {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!banqiEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (method === 'POST') {
      const user = await currentAccountUser(request);
      if (!user) {
        writeJson(response, 401, { error: 'not_signed_in' });
        return true;
      }
      // Fail closed, not open: the analysis engine is the MistyBanqi binary ONLY. A missing
      // binary is a broken deploy, so surface it (alertable log + 503) instead of a weaker
      // eval. Gated to the compute path — GET only reads the cache and never needs the engine.
      if (!banqiEngineBinaryAvailable()) {
        logger.error(
          { kind: 'banqi_analysis_engine_unavailable' },
          'Banqi analysis requested but the banqi-engine binary is not present; failing closed',
        );
        writeJson(response, 503, { error: 'analysis_engine_unavailable' });
        return true;
      }
    }
    if (!requirePersistence(response)) return true;

    const analysisRoomId = decodeURIComponent(analysisMatch[1]!);
    const events = await persistence.loadRoomEvents<BanqiEvent>(analysisRoomId);
    if (!events || !isTenantEventLog(banqiTenant, events, analysisRoomId)) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    // Only finished games are analysable; replay confirms the terminal state.
    const projection = replayTenantEvents(banqiTenant, events);
    if (projection.state.status.type !== 'finished') {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    // The deal lives on the room-created event's setup (retained in the persisted log; only
    // the client wire copy strips it). Without it we cannot reconstruct hidden identities.
    const created = events[0];
    const deal =
      created && created.type === 'room-created'
        ? (created.setup as BanqiDeal | undefined)
        : undefined;
    if (!deal) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const moves = events
      .filter(
        (event): event is Extract<BanqiEvent, { type: 'move-played' }> =>
          event.type === 'move-played',
      )
      .map((event) => event.move as BanqiMove);

    let analysis: Awaited<ReturnType<typeof resolveBanqiAnalysis>>;
    try {
      analysis = await resolveBanqiAnalysis(
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
          { kind: 'banqi_analysis_engine_vacuous', room_id: analysisRoomId },
          'Banqi analysis produced no evals (engine emitted no score); failing closed',
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
    // Mark the flip (chance) plies so the client leaves them unjudged: a flip is a move with
    // from === to, and the move at index i lands on ply i+1.
    const chancePlies = moves.reduce<number[]>((acc, move, i) => {
      if (move.from === move.to) acc.push(i + 1);
      return acc;
    }, []);
    writeJson(response, 200, { ...analysis, chancePlies });
    return true;
  }

  // Decision-vs-luck decomposition (Layer 2): the heavier, opt-in tier on top of the basic eval
  // sweep above. Per FLIP ply it returns {best, played, realized} EVs (mover POV) so the client can
  // split the swing into decision quality vs luck. GET reads only the cache (204 on a miss,
  // INCLUDING when the basic analysis it depends on isn't cached yet); POST computes (the basic
  // sweep first, for the readiness gate, then the decomposition) and is account-gated.
  const decisionsMatch = pathname.match(/^\/api\/banqi\/games\/([^/]+)\/decisions$/);
  if (decisionsMatch) {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!banqiEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (method === 'POST') {
      const user = await currentAccountUser(request);
      if (!user) {
        writeJson(response, 401, { error: 'not_signed_in' });
        return true;
      }
      if (!banqiEngineBinaryAvailable()) {
        logger.error(
          { kind: 'banqi_decisions_engine_unavailable' },
          'Banqi decisions requested but the banqi-engine binary is not present; failing closed',
        );
        writeJson(response, 503, { error: 'analysis_engine_unavailable' });
        return true;
      }
    }
    if (!requirePersistence(response)) return true;

    const decisionsRoomId = decodeURIComponent(decisionsMatch[1]!);
    const inputs = await loadFinishedBanqiGameInputs(decisionsRoomId);
    if (!inputs) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const compute = method === 'POST';
    try {
      // Compute the basic eval sweep too, and on GET use its cache as the readiness gate: a basic-
      // analysis miss means analysis hasn't been requested yet, so 204. The decomposition itself is
      // self-contained (it recomputes realized), so it does not consume the sweep — it just shares
      // the "has analysis" lifecycle.
      const analysis = await resolveBanqiAnalysis(
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
      const decisions = await resolveBanqiDecisions(
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
          { kind: 'banqi_decisions_engine_vacuous', room_id: decisionsRoomId },
          'Banqi decisions produced no evals (engine emitted no score); failing closed',
        );
        writeJson(response, 503, { error: 'analysis_engine_unavailable' });
        return true;
      }
      throw err;
    }
    return true;
  }

  const postgameMatch = pathname.match(/^\/api\/banqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!banqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await banqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

// Shared loader for the analysis tiers: the per-game deal (from the room-created event) + the
// move list, but only for a FINISHED game. Returns null for a missing / non-banqi / unfinished
// game or a log with no deal. The `/decisions` branch uses it; the `/analysis` branch inlines the
// same steps (kept as-is to avoid churn).
async function loadFinishedBanqiGameInputs(
  roomId: string,
): Promise<{ deal: BanqiDeal; moves: BanqiMove[] } | null> {
  const events = await persistence.loadRoomEvents<BanqiEvent>(roomId);
  if (!events || !isTenantEventLog(banqiTenant, events, roomId)) return null;
  const projection = replayTenantEvents(banqiTenant, events);
  if (projection.state.status.type !== 'finished') return null;
  const created = events[0];
  const deal =
    created && created.type === 'room-created'
      ? (created.setup as BanqiDeal | undefined)
      : undefined;
  if (!deal) return null;
  const moves = events
    .filter(
      (event): event is Extract<BanqiEvent, { type: 'move-played' }> =>
        event.type === 'move-played',
    )
    .map((event) => event.move as BanqiMove);
  return { deal, moves };
}

export async function banqiPostgameForApi(
  roomId: string,
  deps: BanqiPostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== BANQI_SPEC_ID) return null;
  if (!events || !isTenantEventLog(banqiTenant, events, roomId)) return null;

  // Replay reconstructs the FULL-TRUTH state: the per-game deal lives in
  // events[0].setup and is applied during createInitialState, so every hidden
  // identity is known to the server here. Banqi has no private capture
  // knowledge, so the truth view IS the review surface.
  const projection = replayTenantEvents(banqiTenant, events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: postgameGameSummary(game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: banqiPostgameTimeline(events),
    // Truth view: every identity revealed (postgame-only; never on a live wire).
    // This is the final-position "here is the full deal" surface, used as a
    // fallback only — the replay below steps through the masked per-ply history.
    view: banqiTruthView(projection.state),
    // Two per-ply histories: 'truth' is the AS-PLAYED masked replay (unflipped
    // tiles render face-down, reproducing the game as it actually looked);
    // 'revealed' is the spoiler overlay (every face-down identity shown at every
    // ply) that the review's Reveal toggle swaps in. The watch surface only reads
    // the masked 'truth' history, so it never spoils the deal.
    history: banqiPostgameHistory(events),
  };
}

// Per-ply replay snapshots, built in two parallel tracks:
//
//   truth   — the MASKED player view: a tile not yet flipped at a given ply
//             renders face-down, so the replay reproduces the game as it was
//             actually played (tiles turning over one at a time) instead of
//             revealing the whole deal from move 0. Banqi is symmetric, so
//             either seat's mask yields the identical board; 'red' is arbitrary.
//   revealed — the full-truth view: every face-down identity shown at every ply,
//             the spoiler overlay the review's Reveal toggle swaps in.
//
// The misnomer is historical: 'truth' is the canonical as-played replay surface
// (the watch reads it), 'revealed' is the optional overlay.
function banqiPostgameHistory(events: readonly BanqiEvent[]): {
  truth: BanqiPostgameSnapshot[];
  revealed: BanqiPostgameSnapshot[];
} {
  const created = events[0];
  if (created?.type !== 'room-created') return { truth: [], revealed: [] };
  let projection = replayTenantEvents(banqiTenant, [created]);
  let ply = 0;
  const truth: BanqiPostgameSnapshot[] = [
    { ply, view: getBanqiPlayerView(projection.state, 'red') },
  ];
  const revealed: BanqiPostgameSnapshot[] = [{ ply, view: banqiTruthView(projection.state) }];

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(banqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    truth.push({ ply, view: getBanqiPlayerView(projection.state, 'red') });
    revealed.push({ ply, view: banqiTruthView(projection.state) });
  }
  return { truth, revealed };
}

function banqiPostgameTimeline(
  events: readonly BanqiEvent[],
): Array<BanqiPostgameMove | BanqiPostgameTerminal> {
  const timeline: Array<BanqiPostgameMove | BanqiPostgameTerminal> = [];
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
        winner: oppositeBanqiSeat(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeBanqiSeat(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
