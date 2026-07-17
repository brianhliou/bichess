import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getRevealChessPlayerView,
  oppositeRevealChessColor,
  REVEAL_CHESS_SPEC_ID,
  type RevealChessColor,
  type RevealChessGameState,
  type RevealChessPlayerView,
  revealChessTruthView,
} from '@mistboard/game';
import { revealChessEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import type { RevealChessEvent, RevealChessProjection } from './../reveal-chess-runtime.js';
import { revealChessTenant } from './../reveal-chess-tenant.js';
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

type RevealChessPostgameViewKey = RevealChessColor | 'truth';

type RevealChessPostgameViews = Partial<Record<RevealChessPostgameViewKey, RevealChessPlayerView>>;
type RevealChessPostgameSnapshot = {
  ply: number;
  view: RevealChessPlayerView;
};
type RevealChessPostgameHistory = Partial<
  Record<RevealChessPostgameViewKey, RevealChessPostgameSnapshot[]>
>;

type RevealChessPostgameMove = {
  type: 'move-played';
  at: number;
  color: RevealChessColor;
  move: { from: string; to: string; promotion?: string };
  ply: number;
};

type RevealChessPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: RevealChessColor; winner: RevealChessColor }
  | { type: 'seat-resigned'; at: number; color: RevealChessColor; winner: RevealChessColor }
  | { type: 'seat-forfeited'; at: number; color: RevealChessColor; winner: RevealChessColor }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database, mirroring
// the jieqi route.
export type RevealChessPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<RevealChessEvent[] | null>;
};

const defaultPersistence: RevealChessPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<RevealChessEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/reveal-chess\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!revealChessEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await revealChessPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function revealChessPostgameForApi(
  roomId: string,
  deps: RevealChessPostgamePersistence = defaultPersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== REVEAL_CHESS_SPEC_ID) return null;
  if (!events || !isTenantEventLog(revealChessTenant, events, roomId)) return null;

  // Replay reconstructs the FULL-TRUTH state: the per-game deal lives in
  // events[0].setup and is applied during createInitialState, so every hidden
  // identity is known to the server here. Redaction happens below per view.
  const projection = replayTenantEvents(revealChessTenant, events);
  if (projection.state.status.type !== 'finished') return null;

  return {
    game: postgameGameSummary(game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: revealChessPostgameTimeline(events),
    // Truth view: every identity revealed (postgame-only; never on a live wire).
    view: revealChessTruthView(projection.state),
    // Per-color views reuse the EXISTING leak-safe redaction: the opponent's
    // face-down pieces stay faceDown, and captured face-down pieces the viewer
    // did not take carry role:null. No hand-rolled masking.
    views: revealChessPostgameViews(projection.state),
    history: revealChessPostgameHistory(events),
  };
}

function revealChessPostgameViews(state: RevealChessGameState): RevealChessPostgameViews {
  return {
    white: getRevealChessPlayerView(state, 'white'),
    truth: revealChessTruthView(state),
    black: getRevealChessPlayerView(state, 'black'),
  };
}

function revealChessPostgameHistory(
  events: readonly RevealChessEvent[],
): RevealChessPostgameHistory {
  const created = events[0];
  if (created?.type !== 'room-created') return {};
  let projection = replayTenantEvents(revealChessTenant, [created]);
  let ply = 0;
  const history = postgameHistoryViews(projection, ply);

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(revealChessTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    appendPostgameHistoryViews(history, projection, ply);
  }
  return history;
}

function postgameHistoryViews(
  projection: RevealChessProjection,
  ply: number,
): RevealChessPostgameHistory {
  const history: RevealChessPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply);
  return history;
}

function appendPostgameHistoryViews(
  history: RevealChessPostgameHistory,
  projection: RevealChessProjection,
  ply: number,
): void {
  history.truth = [...(history.truth ?? []), { ply, view: revealChessTruthView(projection.state) }];
  for (const color of ['white', 'black'] as const) {
    const view = getRevealChessPlayerView(projection.state, color);
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function revealChessPostgameTimeline(
  events: readonly RevealChessEvent[],
): Array<RevealChessPostgameMove | RevealChessPostgameTerminal> {
  const timeline: Array<RevealChessPostgameMove | RevealChessPostgameTerminal> = [];
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
        winner: oppositeRevealChessColor(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeRevealChessColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}
