import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type Color,
  type CrazyhouseGameState,
  type CrazyhouseMove,
  DARK_CRAZYHOUSE_SPEC_ID,
  type Square,
} from '@mistboard/game';
import type {
  DarkCrazyhouseEvent,
  DarkCrazyhouseProjection,
} from './../dark-crazyhouse-runtime.js';
import {
  type DarkCrazyhouseWirePlayerView,
  darkCrazyhouseTenant,
  getDarkCrazyhouseClientView,
} from './../dark-crazyhouse-tenant.js';
import { darkCrazyhouseEnabled } from './../feature-flags.js';
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

type DarkCrazyhousePostgameViewKey = Color | 'truth';

type DarkCrazyhousePostgameViews = Partial<
  Record<DarkCrazyhousePostgameViewKey, DarkCrazyhouseWirePlayerView>
>;
type DarkCrazyhousePostgameSnapshot = { ply: number; view: DarkCrazyhouseWirePlayerView };
type DarkCrazyhousePostgameHistory = Partial<
  Record<DarkCrazyhousePostgameViewKey, DarkCrazyhousePostgameSnapshot[]>
>;

type DarkCrazyhousePostgameMove = {
  type: 'move-played';
  at: number;
  color: Color;
  move: CrazyhouseMove;
  ply: number;
};

type DarkCrazyhousePostgameTerminal =
  | { type: 'clock-expired'; at: number; color: Color; winner: Color }
  | { type: 'seat-resigned'; at: number; color: Color; winner: Color }
  | { type: 'seat-forfeited'; at: number; color: Color; winner: Color }
  | { type: 'game-aborted'; at: number; reason: string };

// The persistence slice the reveal builder needs, injected so the reveal-gate
// and masking are unit-testable without a live database.
export type DarkCrazyhousePostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<DarkCrazyhouseEvent[] | null>;
};

const livePersistence: DarkCrazyhousePostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DarkCrazyhouseEvent>(roomId),
};

function opponentOf(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const postgameMatch = pathname.match(/^\/api\/dark-crazyhouse\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!darkCrazyhouseEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await darkCrazyhousePostgameForApi(roomId, livePersistence);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function darkCrazyhousePostgameForApi(
  roomId: string,
  deps: DarkCrazyhousePostgamePersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== DARK_CRAZYHOUSE_SPEC_ID) return null;
  if (!events || !isTenantEventLog(darkCrazyhouseTenant, events, roomId)) return null;

  const projection = replayTenantEvents(darkCrazyhouseTenant, events);
  // The reveal gate: only a FINISHED game exposes the truth board and the
  // opponent's hidden history. A live or aborted-mid-play room returns 404.
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestDarkCrazyhouseMoveColor(events);
  return {
    game: postgameGameSummary(game),
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      clock: projection.clock,
      timeControl: projection.timeControl,
    },
    timeline: darkCrazyhousePostgameTimeline(events),
    view: darkCrazyhouseTruthView(projection.state),
    views: darkCrazyhousePostgameViews(projection.state, latestMoveColor),
    history: darkCrazyhousePostgameHistory(events),
  };
}

function darkCrazyhousePostgameViews(
  state: CrazyhouseGameState,
  latestMoveColor?: Color,
): DarkCrazyhousePostgameViews {
  return {
    white: getDarkCrazyhouseClientView(
      state,
      { id: 'postgame-white', seat: 'white', solo: false },
      latestMoveColor,
    ),
    truth: darkCrazyhouseTruthView(state),
    black: getDarkCrazyhouseClientView(
      state,
      { id: 'postgame-black', seat: 'black', solo: false },
      latestMoveColor,
    ),
  };
}

function darkCrazyhousePostgameHistory(
  events: readonly DarkCrazyhouseEvent[],
): DarkCrazyhousePostgameHistory {
  const created = events[0];
  if (created?.type !== 'room-created') return {};
  let projection = replayTenantEvents(darkCrazyhouseTenant, [created]);
  let ply = 0;
  let latestMoveColor: Color | undefined;
  const history = postgameHistoryViews(projection, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(darkCrazyhouseTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: DarkCrazyhouseProjection,
  ply: number,
  latestMoveColor?: Color,
): DarkCrazyhousePostgameHistory {
  const history: DarkCrazyhousePostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: DarkCrazyhousePostgameHistory,
  projection: DarkCrazyhouseProjection,
  ply: number,
  latestMoveColor?: Color,
): void {
  history.truth = [
    ...(history.truth ?? []),
    { ply, view: darkCrazyhouseTruthView(projection.state) },
  ];
  for (const color of ['white', 'black'] as const) {
    const view = getDarkCrazyhouseClientView(
      projection.state,
      { id: `postgame-history-${color}-${ply}`, seat: color, solo: false },
      latestMoveColor,
    );
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function darkCrazyhousePostgameTimeline(
  events: readonly DarkCrazyhouseEvent[],
): Array<DarkCrazyhousePostgameMove | DarkCrazyhousePostgameTerminal> {
  const timeline: Array<DarkCrazyhousePostgameMove | DarkCrazyhousePostgameTerminal> = [];
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
        winner: opponentOf(event.color),
      });
      continue;
    }
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: opponentOf(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function latestDarkCrazyhouseMoveColor(events: readonly DarkCrazyhouseEvent[]): Color | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color;
  }
  return undefined;
}

// The truth board: every piece revealed, every square visible. The reserves are
// carried on the per-color views (each side sees its own hand), so the truth view
// leaves `hand` empty — the postgame page reads both hands from views.white /
// views.black. Only ever built for a finished game (the reveal gate above).
function darkCrazyhouseTruthView(state: CrazyhouseGameState): DarkCrazyhouseWirePlayerView {
  return {
    id: state.id,
    variant: 'dark-chess',
    perspective: 'white',
    board: { ...state.board },
    hand: {},
    visibleSquares: allChessSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allChessSquares(): Square[] {
  const squares: Square[] = [];
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank += 1) squares.push(`${file}${rank}` as Square);
  }
  return squares;
}
