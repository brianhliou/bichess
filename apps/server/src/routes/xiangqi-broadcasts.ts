import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  getStandardXiangqiPlayerView,
  type StandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiMove,
} from '@mistboard/game';
import * as persistence from './../persistence.js';
import { type HttpApiContext, requireMethod, requirePersistence, writeJson } from './lib.js';

type BroadcastMoveTimelineEntry = {
  type: 'move-played';
  color: XiangqiColor;
  move: XiangqiMove;
  ply: number;
};

type BroadcastHistorySnapshot = {
  ply: number;
  view: StandardXiangqiPlayerView;
};

export type XiangqiBroadcastApiPersistence = {
  listXiangqiBroadcastTours(): ReturnType<typeof persistence.listXiangqiBroadcastTours>;
  getXiangqiBroadcastTour(slug: string): ReturnType<typeof persistence.getXiangqiBroadcastTour>;
  listXiangqiBroadcastRounds(
    tourSlug: string,
  ): ReturnType<typeof persistence.listXiangqiBroadcastRounds>;
  listXiangqiBroadcastBoards(
    roundId: string,
  ): ReturnType<typeof persistence.listXiangqiBroadcastBoards>;
  getXiangqiBroadcastBoard(
    boardId: string,
  ): ReturnType<typeof persistence.getXiangqiBroadcastBoard>;
  listXiangqiBroadcastSyncLogs(
    input: Parameters<typeof persistence.listXiangqiBroadcastSyncLogs>[0],
  ): ReturnType<typeof persistence.listXiangqiBroadcastSyncLogs>;
};

const livePersistence: XiangqiBroadcastApiPersistence = {
  listXiangqiBroadcastTours: () => persistence.listXiangqiBroadcastTours(),
  getXiangqiBroadcastTour: (slug) => persistence.getXiangqiBroadcastTour(slug),
  listXiangqiBroadcastRounds: (tourSlug) => persistence.listXiangqiBroadcastRounds(tourSlug),
  listXiangqiBroadcastBoards: (roundId) => persistence.listXiangqiBroadcastBoards(roundId),
  getXiangqiBroadcastBoard: (boardId) => persistence.getXiangqiBroadcastBoard(boardId),
  listXiangqiBroadcastSyncLogs: (input) => persistence.listXiangqiBroadcastSyncLogs(input),
};

export async function xiangqiBroadcastIndexForApi(
  deps: XiangqiBroadcastApiPersistence = livePersistence,
) {
  const tours = await deps.listXiangqiBroadcastTours();
  const entries = await Promise.all(
    tours.map(async (tour) => {
      const [rounds, syncLogs] = await Promise.all([
        deps.listXiangqiBroadcastRounds(tour.slug),
        deps.listXiangqiBroadcastSyncLogs({ tourSlug: tour.slug }),
      ]);
      const boardsByRound = await Promise.all(
        rounds.map((round) => deps.listXiangqiBroadcastBoards(round.id)),
      );
      const boards = boardsByRound.flat();
      return {
        tour,
        roundCount: rounds.length,
        boardCount: boards.length,
        liveBoardCount: boards.filter((board) => board.status === 'live').length,
        completeBoardCount: boards.filter((board) => board.status === 'complete').length,
        scheduledBoardCount: boards.filter((board) => board.status === 'scheduled').length,
        totalPlies: boards.reduce((sum, board) => sum + board.plyCount, 0),
        updatedAt: latestDate([
          tour.updatedAt,
          ...rounds.map((round) => round.updatedAt),
          ...boards.map((board) => board.updatedAt),
        ]),
        lastSyncLog: syncLogs[0]
          ? {
              severity: syncLogs[0].severity,
              kind: syncLogs[0].kind,
              createdAt: syncLogs[0].createdAt,
            }
          : null,
      };
    }),
  );
  return { tours: entries };
}

export async function xiangqiBroadcastTourForApi(
  tourSlug: string,
  deps: XiangqiBroadcastApiPersistence = livePersistence,
) {
  const [tour, rounds] = await Promise.all([
    deps.getXiangqiBroadcastTour(tourSlug),
    deps.listXiangqiBroadcastRounds(tourSlug),
  ]);
  if (!tour) return null;
  return { tour, rounds };
}

export async function xiangqiBroadcastRoundForApi(
  tourSlug: string,
  roundId: string,
  deps: XiangqiBroadcastApiPersistence = livePersistence,
) {
  const [tour, rounds, boards] = await Promise.all([
    deps.getXiangqiBroadcastTour(tourSlug),
    deps.listXiangqiBroadcastRounds(tourSlug),
    deps.listXiangqiBroadcastBoards(roundId),
  ]);
  if (!tour) return null;
  const round = rounds.find((entry) => entry.id === roundId);
  if (!round) return null;
  return { tour, round, boards };
}

export async function xiangqiBroadcastBoardForApi(
  boardId: string,
  deps: XiangqiBroadcastApiPersistence = livePersistence,
) {
  const board = await deps.getXiangqiBroadcastBoard(boardId);
  if (!board) return null;
  return buildXiangqiBroadcastBoardReplay(board);
}

export async function xiangqiBroadcastBoardExportForApi(
  boardId: string,
  deps: XiangqiBroadcastApiPersistence = livePersistence,
) {
  const board = await deps.getXiangqiBroadcastBoard(boardId);
  if (!board) return null;
  return {
    schema: board.schema,
    id: board.id,
    tourSlug: board.tourSlug,
    roundId: board.roundId,
    sourceBoardId: board.sourceBoardId,
    boardNumber: board.boardNumber,
    red: board.red,
    black: board.black,
    status: board.status,
    result: board.result,
    moves: board.moves,
    ...(board.sourceUrl ? { sourceUrl: board.sourceUrl } : {}),
  };
}

function buildXiangqiBroadcastBoardReplay(board: persistence.StoredXiangqiBroadcastBoard) {
  let state = createInitialXiangqiState(board.id);
  const timeline: BroadcastMoveTimelineEntry[] = [];
  const truth: BroadcastHistorySnapshot[] = [
    { ply: 0, view: getStandardXiangqiPlayerView(state, 'red') },
  ];

  for (const [index, move] of board.moves.entries()) {
    if (state.status.type !== 'playing') {
      throw new Error(`stored broadcast board ${board.id} has moves after terminal state`);
    }
    const color = state.status.turn;
    state = applyStandardXiangqiMove(state, move);
    const ply = index + 1;
    timeline.push({ type: 'move-played', color, move, ply });
    truth.push({ ply, view: getStandardXiangqiPlayerView(state, 'red') });
  }

  return {
    board: {
      id: board.id,
      tourSlug: board.tourSlug,
      roundId: board.roundId,
      sourceBoardId: board.sourceBoardId,
      boardNumber: board.boardNumber,
      red: board.red,
      black: board.black,
      status: board.status,
      result: board.result,
      plyCount: board.plyCount,
      finalStatus: board.finalStatus,
      ...(board.sourceUrl ? { sourceUrl: board.sourceUrl } : {}),
    },
    state: {
      status: state.status,
      moveNumber: state.moveNumber,
    },
    timeline,
    view: getStandardXiangqiPlayerView(state, 'red'),
    views: {
      truth: getStandardXiangqiPlayerView(state, 'red'),
    },
    history: { truth },
  };
}

function latestDate(values: Date[]): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!latest || value.getTime() > latest.getTime()) latest = value;
  }
  return latest;
}

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
): Promise<boolean> {
  const boardExportMatch = pathname.match(/^\/api\/xiangqi\/broadcasts\/boards\/([^/]+)\/export$/);
  if (boardExportMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const payload = await xiangqiBroadcastBoardExportForApi(
      decodeURIComponent(boardExportMatch[1]!),
    );
    if (!payload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, payload);
    return true;
  }

  const boardMatch = pathname.match(/^\/api\/xiangqi\/broadcasts\/boards\/([^/]+)$/);
  if (boardMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const payload = await xiangqiBroadcastBoardForApi(decodeURIComponent(boardMatch[1]!));
    if (!payload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, payload);
    return true;
  }

  const roundMatch = pathname.match(/^\/api\/xiangqi\/broadcasts\/([^/]+)\/rounds\/([^/]+)$/);
  if (roundMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const payload = await xiangqiBroadcastRoundForApi(
      decodeURIComponent(roundMatch[1]!),
      decodeURIComponent(roundMatch[2]!),
    );
    if (!payload) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, payload);
    return true;
  }

  if (pathname === '/api/xiangqi/broadcasts') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    writeJson(response, 200, await xiangqiBroadcastIndexForApi());
    return true;
  }

  const tourMatch = pathname.match(/^\/api\/xiangqi\/broadcasts\/([^/]+)$/);
  if (!tourMatch) return false;
  if (!requireMethod(request, response, 'GET')) return true;
  if (!requirePersistence(response)) return true;
  const payload = await xiangqiBroadcastTourForApi(decodeURIComponent(tourMatch[1]!));
  if (!payload) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, payload);
  return true;
}
