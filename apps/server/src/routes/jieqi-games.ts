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
import { jieqiEnabled } from './../feature-flags.js';
import {
  jieqiChancePlies,
  resolveJieqiAnalysis,
  resolveJieqiDecisions,
} from './../jieqi-analysis.js';
import { jieqiEngineBinaryAvailable } from './../jieqi-engine.js';
import type { JieqiEvent, JieqiProjection } from './../jieqi-runtime.js';
import { jieqiTenant } from './../jieqi-tenant.js';
import * as persistence from './../persistence.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from './../variant-tenant/runtime.js';
import { createGameAnalysisRoutes } from './game-analysis-route.js';
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

// Computer analysis (Layer 1): fixed-strength eval of every ply, red-seat POV, cached +
// coalesced. Decision-vs-luck decomposition (Layer 2): the heavier, opt-in tier on top —
// per REVEAL ply it returns {best, played, realized} EVs (mover POV) so the client can
// split the swing into decision quality vs luck. Jieqi hides face-down IDENTITIES, so
// reconstruction needs the per-game DEAL (events[0].setup) — we replay the raw event log
// (which retains the server-secret deal), not the client payload. Gates/envelopes: the
// shared factory.
const handleAnalysisRoutes = createGameAnalysisRoutes({
  routeId: 'jieqi',
  logPrefix: 'jieqi',
  variantLabel: 'Jieqi',
  enabled: jieqiEnabled,
  requiresPersistence: true,
  // Fail closed, not open: the analysis engine is the PikaJieQi binary ONLY. A missing
  // binary is a broken deploy, so surface it (alertable log + 503) instead of a weaker eval.
  engineBinary: { available: jieqiEngineBinaryAvailable, label: 'PikaJieQi binary' },
  loadInputs: loadFinishedJieqiGameInputs,
  countPlies: (inputs) => inputs.moves.length,
  resolveAnalysis: (roomId, inputs, computeIfMissing) =>
    resolveJieqiAnalysis(roomId, inputs.moves, inputs.deal, undefined, undefined, computeIfMissing),
  // Mark the REVEAL (chance) plies so the client leaves them unjudged. Unlike banqi's
  // from===to flip, a jieqi reveal is a normal move of a face-down piece, so we detect it by
  // replaying the deal (jieqiChancePlies), not by move shape.
  analysisExtras: (inputs) => ({ chancePlies: jieqiChancePlies(inputs.moves, inputs.deal) }),
  resolveDecisions: (roomId, inputs, computeIfMissing) =>
    resolveJieqiDecisions(
      roomId,
      inputs.moves,
      inputs.deal,
      undefined,
      undefined,
      computeIfMissing,
    ),
});

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  if (await handleAnalysisRoutes(request, response, pathname)) return true;

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

// Shared loader for the analysis tiers (both `/analysis` and `/decisions`): the per-game deal
// (from the room-created event) + the move list, but only for a FINISHED game. Returns null for
// a missing / non-jieqi / unfinished game or a log with no deal.
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
  if (created?.type !== 'room-created') return {};
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
