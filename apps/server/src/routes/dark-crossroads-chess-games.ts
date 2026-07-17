import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessSquare,
  DARK_CROSSROADS_CHESS_SPEC_ID,
  oppositeCrossroadsChessColor,
} from '@mistboard/game';
import type {
  DarkCrossroadsChessEvent,
  DarkCrossroadsChessProjection,
} from './../dark-crossroads-chess-runtime.js';
import {
  type DarkCrossroadsChessWirePlayerView,
  darkCrossroadsChessTenant,
  getDarkCrossroadsChessClientView,
} from './../dark-crossroads-chess-tenant.js';
import { darkCrossroadsChessEnabled } from './../feature-flags.js';
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

type DarkCrossroadsChessPostgameViewKey = CrossroadsChessColor | 'truth';

type DarkCrossroadsChessPostgameViews = Partial<
  Record<DarkCrossroadsChessPostgameViewKey, DarkCrossroadsChessWirePlayerView>
>;
type DarkCrossroadsChessPostgameSnapshot = {
  ply: number;
  view: DarkCrossroadsChessWirePlayerView;
};
type DarkCrossroadsChessPostgameHistory = Partial<
  Record<DarkCrossroadsChessPostgameViewKey, DarkCrossroadsChessPostgameSnapshot[]>
>;

type DarkCrossroadsChessPostgameMove = {
  type: 'move-played';
  at: number;
  color: CrossroadsChessColor;
  move: { from: string; to: string };
  ply: number;
};

type DarkCrossroadsChessPostgameTerminal =
  | { type: 'clock-expired'; at: number; color: CrossroadsChessColor; winner: CrossroadsChessColor }
  | { type: 'seat-resigned'; at: number; color: CrossroadsChessColor; winner: CrossroadsChessColor }
  | {
      type: 'seat-forfeited';
      at: number;
      color: CrossroadsChessColor;
      winner: CrossroadsChessColor;
    }
  | { type: 'game-aborted'; at: number; reason: string };

// The persistence slice the reveal builder needs, injected so the reveal-gate
// and masking are unit-testable without a live database.
export type DarkCrossroadsChessPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<DarkCrossroadsChessEvent[] | null>;
};

const livePersistence: DarkCrossroadsChessPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DarkCrossroadsChessEvent>(roomId),
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/dark-crossroads-chess\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!darkCrossroadsChessEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await darkCrossroadsChessPostgameForApi(roomId, livePersistence);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function darkCrossroadsChessPostgameForApi(
  roomId: string,
  deps: DarkCrossroadsChessPostgamePersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== DARK_CROSSROADS_CHESS_SPEC_ID) return null;
  if (!events || !isTenantEventLog(darkCrossroadsChessTenant, events, roomId)) return null;

  const projection = replayTenantEvents(darkCrossroadsChessTenant, events);
  // The reveal gate: only a FINISHED game exposes the truth board and the
  // opponent's hidden history. A live or aborted-mid-play room returns 404.
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestDarkCrossroadsChessMoveColor(events);
  return {
    game: postgameGameSummary(game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      clock: projection.clock,
      timeControl: projection.timeControl,
    },
    timeline: darkCrossroadsChessPostgameTimeline(events),
    view: darkCrossroadsChessTruthView(projection.state),
    views: darkCrossroadsChessPostgameViews(projection.state, latestMoveColor),
    history: darkCrossroadsChessPostgameHistory(events),
  };
}

function darkCrossroadsChessPostgameViews(
  state: CrossroadsChessGameState,
  latestMoveColor?: CrossroadsChessColor,
): DarkCrossroadsChessPostgameViews {
  return {
    white: getDarkCrossroadsChessClientView(
      state,
      { id: 'postgame-white', seat: 'white', solo: false },
      latestMoveColor,
    ),
    truth: darkCrossroadsChessTruthView(state),
    red: getDarkCrossroadsChessClientView(
      state,
      { id: 'postgame-red', seat: 'red', solo: false },
      latestMoveColor,
    ),
  };
}

function darkCrossroadsChessPostgameHistory(
  events: readonly DarkCrossroadsChessEvent[],
): DarkCrossroadsChessPostgameHistory {
  const created = events[0];
  if (created?.type !== 'room-created') return {};
  let projection = replayTenantEvents(darkCrossroadsChessTenant, [created]);
  let ply = 0;
  let latestMoveColor: CrossroadsChessColor | undefined;
  const history = postgameHistoryViews(projection, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(darkCrossroadsChessTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: DarkCrossroadsChessProjection,
  ply: number,
  latestMoveColor?: CrossroadsChessColor,
): DarkCrossroadsChessPostgameHistory {
  const history: DarkCrossroadsChessPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: DarkCrossroadsChessPostgameHistory,
  projection: DarkCrossroadsChessProjection,
  ply: number,
  latestMoveColor?: CrossroadsChessColor,
): void {
  history.truth = [
    ...(history.truth ?? []),
    { ply, view: darkCrossroadsChessTruthView(projection.state) },
  ];
  for (const color of ['white', 'red'] as const) {
    const view = getDarkCrossroadsChessClientView(
      projection.state,
      { id: `postgame-history-${color}-${ply}`, seat: color, solo: false },
      latestMoveColor,
    );
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function darkCrossroadsChessPostgameTimeline(
  events: readonly DarkCrossroadsChessEvent[],
): Array<DarkCrossroadsChessPostgameMove | DarkCrossroadsChessPostgameTerminal> {
  const timeline: Array<DarkCrossroadsChessPostgameMove | DarkCrossroadsChessPostgameTerminal> = [];
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
        winner: oppositeCrossroadsChessColor(event.color),
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
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function latestDarkCrossroadsChessMoveColor(
  events: readonly DarkCrossroadsChessEvent[],
): CrossroadsChessColor | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color;
  }
  return undefined;
}

// The truth board: every piece revealed, every square visible. Only ever built
// for a finished game (the reveal gate in darkCrossroadsChessPostgameForApi).
function darkCrossroadsChessTruthView(
  state: CrossroadsChessGameState,
): DarkCrossroadsChessWirePlayerView {
  return {
    id: state.id,
    perspective: 'white',
    board: Object.fromEntries(
      Object.entries(state.board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as DarkCrossroadsChessWirePlayerView['board'],
    visibleSquares: allCrossroadsChessSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allCrossroadsChessSquares(): CrossroadsChessSquare[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f'];
  const squares: CrossroadsChessSquare[] = [];
  for (let rank = 1; rank <= 8; rank += 1) {
    for (const file of files) {
      squares.push(`${file}${rank}` as CrossroadsChessSquare);
    }
  }
  return squares;
}
