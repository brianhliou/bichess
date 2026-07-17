import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getJunglePlayerView,
  JUNGLE_SPEC_ID,
  type JungleColor,
  type JungleMove,
  type JunglePlayerView,
  oppositeJungleColor,
} from '@mistboard/game';
import { jungleEnabled } from './../feature-flags.js';
import { resolveJungleAnalysis } from './../jungle-analysis.js';
import { jungleEngineBinaryAvailable } from './../jungle-engine.js';
import type { JungleEvent } from './../jungle-runtime.js';
import { jungleTenant } from './../jungle-tenant.js';
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

// Jungle postgame review. Jungle is PERFECT-INFORMATION: the board was fully
// visible to both players the whole game, so there is a single review surface and
// a single per-ply history (no masked/revealed split, unlike banqi/jieqi). The web
// postgame steps through `history` and shows the final result.

type JunglePostgameSnapshot = {
  ply: number;
  view: JunglePlayerView;
};

type JunglePostgameMove = {
  type: 'move-played';
  at: number;
  color: JungleColor;
  move: { from: string; to: string };
  ply: number;
};

type JunglePostgameTerminal =
  | { type: 'clock-expired'; at: number; color: JungleColor; winner: JungleColor }
  | { type: 'seat-resigned'; at: number; color: JungleColor; winner: JungleColor }
  | { type: 'seat-forfeited'; at: number; color: JungleColor; winner: JungleColor }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database.
export type JunglePostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<JungleEvent[] | null>;
};

const defaultPersistence: JunglePostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<JungleEvent>(roomId),
};

// Computer analysis: fixed-strength eval of every ply, Red POV, cached + coalesced.
// Jungle is perfect-information, so the inputs are just the move list off the postgame
// payload (no deal, no decisions tier). Gates/envelopes: the shared factory. Fail closed,
// not open on the engine gate: the analysis engine is the Rust binary ONLY (no TS
// fallback) — a missing binary is a broken deploy, surfaced as alertable log + 503.
const handleAnalysisRoutes = createGameAnalysisRoutes({
  routeId: 'jungle',
  logPrefix: 'jungle',
  variantLabel: 'Jungle',
  enabled: jungleEnabled,
  requiresPersistence: false,
  engineBinary: { available: jungleEngineBinaryAvailable, label: 'jungle-engine binary' },
  loadInputs: async (roomId) => {
    const payload = await junglePostgameForApi(roomId);
    if (!payload) return null;
    return {
      moves: payload.timeline
        .filter((entry): entry is JunglePostgameMove => entry.type === 'move-played')
        .map((entry) => entry.move as JungleMove),
    };
  },
  countPlies: (inputs) => inputs.moves.length,
  resolveAnalysis: (roomId, inputs, computeIfMissing) =>
    resolveJungleAnalysis(roomId, inputs.moves, undefined, undefined, computeIfMissing),
});

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  if (await handleAnalysisRoutes(request, response, pathname)) return true;

  const postgameMatch = pathname.match(/^\/api\/jungle\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!jungleEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await junglePostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function junglePostgameForApi(
  roomId: string,
  deps: JunglePostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== JUNGLE_SPEC_ID) return null;
  if (!events || !isTenantEventLog(jungleTenant, events, roomId)) return null;

  const projection = replayTenantEvents(jungleTenant, events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: postgameGameSummary(game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: junglePostgameTimeline(events),
    // Final full-board position (perfect-info: identical to either seat's view).
    view: getJunglePlayerView(projection.state, 'red'),
    // Single per-ply history (perfect-info: no masked/revealed split).
    history: junglePostgameHistory(events),
  };
}

function junglePostgameHistory(events: readonly JungleEvent[]): JunglePostgameSnapshot[] {
  const created = events[0];
  if (created?.type !== 'room-created') return [];
  let projection = replayTenantEvents(jungleTenant, [created]);
  let ply = 0;
  const history: JunglePostgameSnapshot[] = [
    { ply, view: getJunglePlayerView(projection.state, 'red') },
  ];
  for (const event of events.slice(1)) {
    projection = applyTenantEvent(jungleTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    history.push({ ply, view: getJunglePlayerView(projection.state, 'red') });
  }
  return history;
}

function junglePostgameTimeline(
  events: readonly JungleEvent[],
): Array<JunglePostgameMove | JunglePostgameTerminal> {
  const timeline: Array<JunglePostgameMove | JunglePostgameTerminal> = [];
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
        winner: oppositeJungleColor(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeJungleColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
