import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  replayXiangqiBroadcastBoard,
  type XiangqiBroadcastBoard,
  type XiangqiBroadcastRound,
  type XiangqiBroadcastTour,
} from '@mistboard/game';
import type { StoredXiangqiBroadcastBoard } from '../persistence.js';
import {
  manualXiangqiBroadcastPollForApi,
  tryHandle,
  type XiangqiBroadcastApiPersistence,
  xiangqiBroadcastBoardExportForApi,
  xiangqiBroadcastBoardForApi,
  xiangqiBroadcastBoardStreamForApi,
  xiangqiBroadcastIndexForApi,
  xiangqiBroadcastOpsIndexForApi,
  xiangqiBroadcastRoundForApi,
  xiangqiBroadcastRoundStreamForApi,
  xiangqiBroadcastTourForApi,
} from './xiangqi-broadcasts.js';

const FIXTURE_DIR = new URL(
  '../../../../packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample/',
  import.meta.url,
);

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, FIXTURE_DIR)), 'utf-8')) as T;
}

const tour = readJson<XiangqiBroadcastTour>('tour.json');
const rounds = readJson<XiangqiBroadcastRound[]>('rounds.json');
const board = readJson<XiangqiBroadcastBoard[]>('boards.json')[0]!;
const replay = replayXiangqiBroadcastBoard(board);
assert.equal(replay.ok, true);
if (!replay.ok) throw new Error('fixture replay failed');

const storedBoard: StoredXiangqiBroadcastBoard = {
  ...board,
  plyCount: replay.plies,
  finalStatus: replay.finalStatus,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function deps(
  overrides: Partial<XiangqiBroadcastApiPersistence> = {},
): XiangqiBroadcastApiPersistence {
  return {
    listXiangqiBroadcastTours: async () => [
      { ...tour, createdAt: new Date(0), updatedAt: new Date(1_000) },
    ],
    getXiangqiBroadcastTour: async (slug) =>
      slug === tour.slug ? { ...tour, createdAt: new Date(0), updatedAt: new Date(1_000) } : null,
    listXiangqiBroadcastRounds: async (tourSlug) =>
      tourSlug === tour.slug
        ? rounds.map((round) => ({ ...round, createdAt: new Date(0), updatedAt: new Date(2_000) }))
        : [],
    listXiangqiBroadcastBoards: async (roundId) => (roundId === board.roundId ? [storedBoard] : []),
    getXiangqiBroadcastBoard: async (boardId) => (boardId === board.id ? storedBoard : null),
    listXiangqiBroadcastSyncLogs: async (input) =>
      input.tourSlug === tour.slug
        ? [
            {
              id: 1,
              tourSlug: tour.slug,
              roundId: null,
              boardId: null,
              sourceBoardId: null,
              severity: 'info',
              kind: 'poll_ok',
              message: 'source snapshot imported',
              payload: {},
              createdAt: new Date(3_000),
            },
          ]
        : [],
    recordXiangqiBroadcastSyncLog: async () => {},
    ...overrides,
  };
}

test('broadcast index API summarizes tournaments and sync status', async () => {
  const payload = await xiangqiBroadcastIndexForApi(deps());

  assert.equal(payload.tours.length, 1);
  const entry = payload.tours[0]!;
  assert.equal(entry.tour.slug, tour.slug);
  assert.equal(entry.roundCount, 1);
  assert.equal(entry.boardCount, 1);
  assert.equal(entry.liveBoardCount, 0);
  assert.equal(entry.completeBoardCount, 1);
  assert.equal(entry.scheduledBoardCount, 0);
  assert.equal(entry.totalPlies, board.moves.length);
  assert.deepEqual(entry.updatedAt, new Date(2_000));
  assert.equal(entry.lastSyncLog?.kind, 'poll_ok');
  assert.equal(Object.hasOwn(entry.lastSyncLog ?? {}, 'payload'), false);
  assert.equal(Object.hasOwn(entry.lastSyncLog ?? {}, 'message'), false);
});

test('broadcast ops API exposes source and operator sync log detail', async () => {
  const payload = await xiangqiBroadcastOpsIndexForApi(deps());

  assert.equal(payload.tours.length, 1);
  const entry = payload.tours[0]!;
  assert.equal(entry.tour.slug, tour.slug);
  assert.equal(entry.sourceUrl, tour.sourceUrl ?? null);
  assert.equal(entry.boardCount, 1);
  assert.equal(entry.syncLogs.length, 1);
  assert.equal(entry.syncLogs[0]?.kind, 'poll_ok');
  assert.equal(entry.syncLogs[0]?.message, 'source snapshot imported');
  assert.equal(Object.hasOwn(entry.syncLogs[0] ?? {}, 'payload'), false);
});

test('manual broadcast poll uses configured tour source and records operator result', async () => {
  const recorded: unknown[] = [];
  const result = await manualXiangqiBroadcastPollForApi(
    tour.slug,
    { allowCorrection: true, timeoutMs: 750 },
    deps({
      recordXiangqiBroadcastSyncLog: async (input) => {
        recorded.push(input);
      },
    }),
    async (input) => ({
      ok: true,
      sourceUrl: input.sourceUrl,
      tourSlug: tour.slug,
      roundsImported: 1,
      boardsSeen: 3,
      boardsFailed: 1,
      updates: [],
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.result.sourceUrl : '', tour.sourceUrl);
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], {
    tourSlug: tour.slug,
    severity: 'warning',
    kind: 'manual_poll_ok',
    message: 'manual source poll completed',
    payload: {
      sourceUrl: tour.sourceUrl,
      roundsImported: 1,
      boardsSeen: 3,
      boardsFailed: 1,
      allowCorrection: true,
    },
  });
});

test('manual broadcast poll reports missing source before polling', async () => {
  const result = await manualXiangqiBroadcastPollForApi(
    tour.slug,
    { allowCorrection: false, timeoutMs: 5_000 },
    deps({
      getXiangqiBroadcastTour: async (slug) =>
        slug === tour.slug
          ? { ...tour, sourceUrl: undefined, createdAt: new Date(0), updatedAt: new Date(0) }
          : null,
    }),
    async () => {
      throw new Error('poller should not run');
    },
  );

  assert.deepEqual(result, { ok: false, status: 400, error: 'missing_source_url' });
});

test('manual broadcast poll records tour-scoped source failures', async () => {
  const recorded: unknown[] = [];
  const result = await manualXiangqiBroadcastPollForApi(
    tour.slug,
    { allowCorrection: false, timeoutMs: 1_000 },
    deps({
      recordXiangqiBroadcastSyncLog: async (input) => {
        recorded.push(input);
      },
    }),
    async (input) => ({
      ok: false,
      sourceUrl: input.sourceUrl,
      kind: 'source_http_error',
      message: 'source answered HTTP 500',
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.status, 502);
  assert.deepEqual(recorded, [
    {
      tourSlug: tour.slug,
      severity: 'error',
      kind: 'manual_poll_failed',
      message: 'source answered HTTP 500',
      payload: {
        sourceUrl: tour.sourceUrl,
        errorKind: 'source_http_error',
        allowCorrection: false,
      },
    },
  ]);
});

test('broadcast tour API returns tour detail with rounds', async () => {
  const payload = await xiangqiBroadcastTourForApi(tour.slug, deps());

  assert.ok(payload);
  assert.equal(payload.tour.slug, tour.slug);
  assert.equal(payload.rounds.length, 1);
  assert.equal(payload.rounds[0]?.id, 'men-r1');
});

test('broadcast round API returns only boards under the requested round', async () => {
  const payload = await xiangqiBroadcastRoundForApi(tour.slug, 'men-r1', deps());

  assert.ok(payload);
  assert.equal(payload.round.id, 'men-r1');
  assert.equal(payload.boards.length, 1);
  assert.equal(payload.boards[0]?.id, board.id);
});

test('broadcast round stream includes a stable version for reconnect comparisons', async () => {
  const payload = await xiangqiBroadcastRoundStreamForApi(tour.slug, 'men-r1', deps());

  assert.ok(payload);
  assert.equal(payload.payload.round.id, 'men-r1');
  assert.match(payload.version, /2025-wxc-sample-men-r1-b01/);
  assert.match(payload.version, /complete/);
});

test('broadcast board API builds replay-compatible timeline and history', async () => {
  const payload = await xiangqiBroadcastBoardForApi(board.id, deps());

  assert.ok(payload);
  assert.equal(payload.board.id, board.id);
  assert.equal(payload.board.plyCount, board.moves.length);
  assert.equal(payload.timeline.length, board.moves.length);
  assert.equal(payload.timeline[0]?.color, 'red');
  assert.equal(payload.timeline[1]?.color, 'black');
  assert.equal(payload.history.truth.length, board.moves.length + 1);
  assert.deepEqual(payload.timeline[0]?.move, board.moves[0]);
  assert.equal(payload.views.truth.id, board.id);
  assert.deepEqual(payload.board.updatedAt, storedBoard.updatedAt);
});

test('broadcast board stream version changes when persisted state changes', async () => {
  const first = await xiangqiBroadcastBoardStreamForApi(board.id, deps());
  const updatedBoard = {
    ...storedBoard,
    moves: storedBoard.moves.slice(0, 2),
    plyCount: 2,
    updatedAt: new Date(10_000),
  };
  const next = await xiangqiBroadcastBoardStreamForApi(
    board.id,
    deps({
      getXiangqiBroadcastBoard: async (boardId) => (boardId === board.id ? updatedBoard : null),
    }),
  );

  assert.ok(first);
  assert.ok(next);
  assert.notEqual(first.version, next.version);
  assert.equal(next.payload.timeline.length, 2);
});

test('broadcast board export returns canonical coordinate JSON', async () => {
  const payload = await xiangqiBroadcastBoardExportForApi(board.id, deps());

  assert.ok(payload);
  assert.equal(payload.schema, board.schema);
  assert.equal(payload.id, board.id);
  assert.deepEqual(payload.moves, board.moves);
});

test('broadcast APIs return null for unknown records', async () => {
  assert.equal(await xiangqiBroadcastTourForApi('missing', deps()), null);
  assert.equal(await xiangqiBroadcastRoundForApi(tour.slug, 'missing', deps()), null);
  assert.equal(await xiangqiBroadcastBoardForApi('missing', deps()), null);
  assert.equal(await xiangqiBroadcastBoardExportForApi('missing', deps()), null);
});

test('admin broadcast ops route requires admin before persistence in production', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const response = captureResponse();
    const handled = await tryHandle(
      emptyCtx(),
      { method: 'GET', headers: {} } as IncomingMessage,
      response,
      '/api/admin/xiangqi/broadcasts',
      new URL('http://test.local/api/admin/xiangqi/broadcasts'),
    );

    assert.equal(handled, true);
    assert.equal(response.statusCode, 403);
    assert.deepEqual(JSON.parse(response.body), { error: 'admin_required' });
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

function emptyCtx() {
  return {
    rooms: new Map(),
    lobbyTickets: new Map(),
    lobbyQueue: [],
    databaseRequired: false,
    pveBuiltinEngineClientId: 'random-engine',
    annotationsFile: '',
    liveClockInitialMs: 60_000,
    liveClockIncrementMs: 0,
    createRoom: async () => {
      throw new Error('unused');
    },
    reserveLiveEngineSeat: async () => null,
    releaseLiveEngineReservation: () => {},
    abandonRoom: async () => ({ ok: false, error: 'not_found' as const }),
    inMemoryGameSummary: () => null,
    isDraining: () => false,
    drainDeadlineMs: () => null,
    activeGameCount: () => 0,
  };
}

type ResponseCapture = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
};

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    statusCode: 200,
    headers: {} as Record<string, string | string[]>,
    body: '',
    writeHead(statusCode: number, headers: Record<string, string | string[]> = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
      return this;
    },
    end(chunk?: string) {
      if (chunk) this.body += chunk;
      return this;
    },
    write(chunk: string) {
      this.body += chunk;
      return true;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}
