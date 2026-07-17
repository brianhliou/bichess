import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getJunglePlayerView,
  JUNGLE_SPEC_ID,
  type JungleColor,
  type JungleMove,
  type JunglePlayerView,
  oppositeJungleColor,
} from '@mistboard/game';
import { currentAccountUser } from './../account-session.js';
import { jungleEnabled } from './../feature-flags.js';
import { resolveJungleAnalysis, VacuousAnalysisError } from './../jungle-analysis.js';
import { jungleEngineBinaryAvailable } from './../jungle-engine.js';
import type { JungleEvent } from './../jungle-runtime.js';
import { jungleTenant } from './../jungle-tenant.js';
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

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  // Computer analysis: fixed-strength eval of every ply, Red POV, cached + coalesced.
  // GET returns only the cached result (204 on a miss, so the client can auto-load on
  // open); POST computes on a miss and is account-gated (the whole-game sweep is the
  // expensive path). Mirrors the fortress analysis route.
  const analysisMatch = pathname.match(/^\/api\/jungle\/games\/([^/]+)\/analysis$/);
  if (analysisMatch) {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!jungleEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (method === 'POST') {
      const user = await currentAccountUser(request);
      if (!user) {
        writeJson(response, 401, { error: 'not_signed_in' });
        return true;
      }
      // Fail closed, not open: the analysis engine is the Rust binary ONLY (no TS
      // fallback). If it is missing this is a broken deploy, so surface it (alertable
      // log + 503) instead of silently serving a weaker eval. Gated to the compute path
      // — GET only reads the cache and never needs the engine.
      if (!jungleEngineBinaryAvailable()) {
        logger.error(
          { kind: 'jungle_analysis_engine_unavailable' },
          'Jungle analysis requested but the jungle-engine binary is not present; failing closed',
        );
        writeJson(response, 503, { error: 'analysis_engine_unavailable' });
        return true;
      }
    }
    const analysisRoomId = decodeURIComponent(analysisMatch[1]!);
    const analysisPayload = await junglePostgameForApi(analysisRoomId);
    if (!analysisPayload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const moves = analysisPayload.timeline
      .filter((entry): entry is JunglePostgameMove => entry.type === 'move-played')
      .map((entry) => entry.move as JungleMove);
    let analysis: Awaited<ReturnType<typeof resolveJungleAnalysis>>;
    try {
      analysis = await resolveJungleAnalysis(
        analysisRoomId,
        moves,
        undefined,
        undefined,
        method === 'POST',
      );
    } catch (err) {
      // A scoreless sweep (engine emitted moves but no evals) fails closed like a missing
      // binary: 503, nothing cached, rather than a bogus flawless-game result.
      if (err instanceof VacuousAnalysisError) {
        logger.error(
          { kind: 'jungle_analysis_engine_vacuous', room_id: analysisRoomId },
          'Jungle analysis produced no evals (engine emitted no score); failing closed',
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
    writeJson(response, 200, analysis);
    return true;
  }

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
