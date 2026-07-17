import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DARK_MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiPlayerView,
  type MiniXiangqiSquare,
  oppositeMiniXiangqiColor,
} from '@mistboard/game';
import { buildDarkMiniXiangqiPublicationJson } from './../dark-mini-xiangqi-export.js';
import type {
  DarkMiniXiangqiEvent,
  DarkMiniXiangqiProjection,
} from './../dark-mini-xiangqi-runtime.js';
import {
  darkMiniXiangqiTenant,
  getDarkMiniXiangqiClientView,
} from './../dark-mini-xiangqi-tenant.js';
import { darkMiniXiangqiEnabled } from './../feature-flags.js';
import { FinishedGameCache } from './../finished-game-cache.js';
import * as persistence from './../persistence.js';
import {
  applyTenantEvent,
  isTenantEventLog,
  replayTenantEvents,
} from './../variant-tenant/runtime.js';
import {
  type HttpApiContext,
  postgamePlayers,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

type DarkMiniXiangqiPostgameViewKey = MiniXiangqiColor | 'truth';

type DarkMiniXiangqiPostgameViews = Partial<
  Record<DarkMiniXiangqiPostgameViewKey, MiniXiangqiPlayerView>
>;
type DarkMiniXiangqiPostgameSnapshot = {
  ply: number;
  view: MiniXiangqiPlayerView;
};
type DarkMiniXiangqiPostgameHistory = Partial<
  Record<DarkMiniXiangqiPostgameViewKey, DarkMiniXiangqiPostgameSnapshot[]>
>;

type DarkMiniXiangqiPostgameMove = {
  type: 'move-played';
  at: number;
  color: MiniXiangqiColor;
  move: { from: string; to: string };
  ply: number;
};

type DarkMiniXiangqiPostgameTerminal =
  | { type: 'seat-resigned'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'seat-forfeited'; at: number; color: MiniXiangqiColor; winner: MiniXiangqiColor }
  | { type: 'game-aborted'; at: number; reason: string };

// Injectable so the route can be unit-tested without a live database.
export type DarkMiniXiangqiPostgamePersistence = {
  getGameSummary(roomId: string): ReturnType<typeof persistence.getGameSummary>;
  loadRoomEvents(roomId: string): Promise<DarkMiniXiangqiEvent[] | null>;
};

const defaultPersistence: DarkMiniXiangqiPostgamePersistence = {
  getGameSummary: (roomId) => persistence.getGameSummary(roomId),
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<DarkMiniXiangqiEvent>(roomId),
};

// Postgame rebuild is O(plies) × per-ply fogged views, so a Mistboard TV switch
// to the Dark Mini Xiangqi channel pays it on every game. Finished games are
// immutable, so memoize the projection by room id, mirroring the Crossroads
// path. Only consulted on the production path (defaultPersistence); unit tests
// inject their own `deps` and reuse a fixed room id with different event logs,
// so they must bypass it to stay deterministic.
const darkMiniXiangqiPostgameCache = new FinishedGameCache<
  NonNullable<Awaited<ReturnType<typeof buildDarkMiniXiangqiPostgame>>>
>();

export function clearDarkMiniXiangqiPostgameCache(): void {
  darkMiniXiangqiPostgameCache.clear();
}

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const exportMatch = pathname.match(/^\/api\/dark-mini-xiangqi\/games\/([^/]+)\/export\.json$/);
  if (exportMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!darkMiniXiangqiEnabled()) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    if (!requirePersistence(response)) return true;
    const roomId = decodeURIComponent(exportMatch[1]!);
    const [game, events] = await Promise.all([
      persistence.getGameSummary(roomId),
      persistence.loadRoomEvents<DarkMiniXiangqiEvent>(roomId),
    ]);
    if (!game || game.variant !== DARK_MINI_XIANGQI_SPEC_ID || !events) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const payload = buildDarkMiniXiangqiPublicationJson(game, events);
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `inline; filename="mistboard-${roomId}.json"`,
    });
    response.end(JSON.stringify(payload));
    return true;
  }

  const postgameMatch = pathname.match(/^\/api\/dark-mini-xiangqi\/games\/([^/]+)$/);
  if (!postgameMatch) return false;

  if (!requireMethod(request, response, 'GET')) return true;
  if (!darkMiniXiangqiEnabled()) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  const roomId = decodeURIComponent(postgameMatch[1]!);
  const payload = await darkMiniXiangqiPostgameForApi(roomId);
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}

export async function darkMiniXiangqiPostgameForApi(
  roomId: string,
  deps: DarkMiniXiangqiPostgamePersistence = defaultPersistence,
) {
  const useCache = deps === defaultPersistence;
  if (useCache) {
    const cached = darkMiniXiangqiPostgameCache.get(roomId);
    if (cached) return cached;
  }
  const payload = await buildDarkMiniXiangqiPostgame(roomId, deps);
  if (payload && useCache) darkMiniXiangqiPostgameCache.set(roomId, payload);
  return payload;
}

async function buildDarkMiniXiangqiPostgame(
  roomId: string,
  deps: DarkMiniXiangqiPostgamePersistence,
) {
  const [game, events] = await Promise.all([
    deps.getGameSummary(roomId),
    deps.loadRoomEvents(roomId),
  ]);
  if (!game || game.variant !== DARK_MINI_XIANGQI_SPEC_ID) return null;
  if (!events || !isTenantEventLog(darkMiniXiangqiTenant, events, roomId)) return null;

  const projection = replayTenantEvents(darkMiniXiangqiTenant, events);
  if (projection.state.status.type !== 'finished') return null;

  const latestMoveColor = latestDarkMiniXiangqiMoveColor(events);
  return {
    game: {
      roomId: game.roomId,
      variant: game.variant,
      mode: game.mode,
      // Red occupies the white/first slot, Black the second.
      redName: postgameSeatDisplayName(game, 'red'),
      blackName: postgameSeatDisplayName(game, 'black'),
      result: game.result,
      termination: game.termination,
      plyCount: game.plyCount,
      startedAt: game.startedAt.toISOString(),
      endedAt: game.endedAt.toISOString(),
      rated: game.rated,
      visibility: game.visibility,
      players: postgamePlayers(game.participants ?? []),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    state: {
      status: projection.state.status,
      moveNumber: projection.state.moveNumber,
      ...(projection.clock ? { clock: projection.clock } : {}),
      ...(projection.timeControl ? { timeControl: projection.timeControl } : {}),
    },
    timeline: darkMiniXiangqiPostgameTimeline(events),
    view: darkMiniXiangqiTruthView(projection.state),
    views: darkMiniXiangqiPostgameViews(projection.state, latestMoveColor),
    history: darkMiniXiangqiPostgameHistory(events),
    clocks: darkMiniXiangqiPostgameClocks(events),
  };
}

function postgameSeatDisplayName(
  game: Awaited<ReturnType<DarkMiniXiangqiPostgamePersistence['getGameSummary']>>,
  color: MiniXiangqiColor,
): string {
  const persistedName =
    participantDisplayName(game, color) ?? (color === 'red' ? game?.whiteName : game?.blackName);
  if (!persistedName) return 'Guest';
  if (persistedName === (color === 'red' ? 'Red' : 'Black')) return 'Guest';
  return persistedName;
}

function participantDisplayName(
  game: Awaited<ReturnType<DarkMiniXiangqiPostgamePersistence['getGameSummary']>>,
  color: MiniXiangqiColor,
): string | null {
  const legacyColor = color === 'red' ? 'white' : 'black';
  return (
    game?.participants?.find((participant) => participant.color === color)?.displayName ??
    game?.participants?.find((participant) => participant.color === legacyColor)?.displayName ??
    null
  );
}

// Per-ply remaining time, indexed by ply. The move events do not snapshot the
// clock, but replaying them recomputes it (nextDarkMiniXiangqiClockForMove
// decrements from each move's timestamp and respects the clock-starts-after-
// opening delay), so this is accurate without a runtime change.
function darkMiniXiangqiPostgameClocks(
  events: readonly DarkMiniXiangqiEvent[],
): Array<Record<MiniXiangqiColor, number>> {
  const created = events[0];
  if (created?.type !== 'room-created') return [];
  let projection = replayTenantEvents(darkMiniXiangqiTenant, [created]);
  const clocks: Array<Record<MiniXiangqiColor, number>> = [];
  const capture = (ply: number): void => {
    if (projection.clock) clocks[ply] = { ...projection.clock.remainingMs };
  };
  let ply = 0;
  capture(0);
  for (const event of events.slice(1)) {
    projection = applyTenantEvent(darkMiniXiangqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    capture(ply);
  }
  return clocks;
}

function darkMiniXiangqiPostgameViews(
  state: MiniXiangqiGameState,
  latestMoveColor?: MiniXiangqiColor,
): DarkMiniXiangqiPostgameViews {
  return {
    red: getDarkMiniXiangqiClientView(
      state,
      { id: 'postgame-red', seat: 'red', solo: false },
      latestMoveColor,
    ),
    truth: darkMiniXiangqiTruthView(state),
    black: getDarkMiniXiangqiClientView(
      state,
      { id: 'postgame-black', seat: 'black', solo: false },
      latestMoveColor,
    ),
  };
}

function darkMiniXiangqiPostgameHistory(
  events: readonly DarkMiniXiangqiEvent[],
): DarkMiniXiangqiPostgameHistory {
  const created = events[0];
  if (created?.type !== 'room-created') return {};
  let projection = replayTenantEvents(darkMiniXiangqiTenant, [created]);
  let ply = 0;
  let latestMoveColor: MiniXiangqiColor | undefined;
  const history = postgameHistoryViews(projection, ply, latestMoveColor);

  for (const event of events.slice(1)) {
    projection = applyTenantEvent(darkMiniXiangqiTenant, projection, event);
    if (event.type !== 'move-played') continue;
    ply += 1;
    latestMoveColor = event.color;
    appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  }
  return history;
}

function postgameHistoryViews(
  projection: DarkMiniXiangqiProjection,
  ply: number,
  latestMoveColor?: MiniXiangqiColor,
): DarkMiniXiangqiPostgameHistory {
  const history: DarkMiniXiangqiPostgameHistory = {};
  appendPostgameHistoryViews(history, projection, ply, latestMoveColor);
  return history;
}

function appendPostgameHistoryViews(
  history: DarkMiniXiangqiPostgameHistory,
  projection: DarkMiniXiangqiProjection,
  ply: number,
  latestMoveColor?: MiniXiangqiColor,
): void {
  history.truth = [
    ...(history.truth ?? []),
    { ply, view: darkMiniXiangqiTruthView(projection.state) },
  ];
  for (const color of ['red', 'black'] as const) {
    const view = getDarkMiniXiangqiClientView(
      projection.state,
      { id: `postgame-history-${color}-${ply}`, seat: color, solo: false },
      latestMoveColor,
    );
    history[color] = [...(history[color] ?? []), { ply, view }];
  }
}

function darkMiniXiangqiPostgameTimeline(
  events: readonly DarkMiniXiangqiEvent[],
): Array<DarkMiniXiangqiPostgameMove | DarkMiniXiangqiPostgameTerminal> {
  const timeline: Array<DarkMiniXiangqiPostgameMove | DarkMiniXiangqiPostgameTerminal> = [];
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
    if (event.type === 'seat-resigned' || event.type === 'seat-forfeited') {
      timeline.push({
        type: event.type,
        at: event.at,
        color: event.color,
        winner: oppositeMiniXiangqiColor(event.color),
      });
      continue;
    }
    if (event.type === 'game-aborted') {
      timeline.push({ type: event.type, at: event.at, reason: event.reason });
    }
  }
  return timeline;
}

function latestDarkMiniXiangqiMoveColor(
  events: readonly DarkMiniXiangqiEvent[],
): MiniXiangqiColor | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color;
  }
  return undefined;
}

function darkMiniXiangqiTruthView(state: MiniXiangqiGameState): MiniXiangqiPlayerView {
  return {
    id: state.id,
    perspective: 'red',
    board: Object.fromEntries(
      Object.entries(state.board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as MiniXiangqiPlayerView['board'],
    visibleSquares: allMiniXiangqiSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allMiniXiangqiSquares(): MiniXiangqiSquare[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const squares: MiniXiangqiSquare[] = [];
  for (let rank = 1; rank <= 7; rank += 1) {
    for (const file of files) {
      squares.push(`${file}${rank}` as MiniXiangqiSquare);
    }
  }
  return squares;
}
