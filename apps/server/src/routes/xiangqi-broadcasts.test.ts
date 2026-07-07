import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  type XiangqiBroadcastApiPersistence,
  xiangqiBroadcastBoardExportForApi,
  xiangqiBroadcastBoardForApi,
  xiangqiBroadcastRoundForApi,
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
    getXiangqiBroadcastTour: async (slug) =>
      slug === tour.slug ? { ...tour, createdAt: new Date(0), updatedAt: new Date(0) } : null,
    listXiangqiBroadcastRounds: async (tourSlug) =>
      tourSlug === tour.slug
        ? rounds.map((round) => ({ ...round, createdAt: new Date(0), updatedAt: new Date(0) }))
        : [],
    listXiangqiBroadcastBoards: async (roundId) => (roundId === board.roundId ? [storedBoard] : []),
    getXiangqiBroadcastBoard: async (boardId) => (boardId === board.id ? storedBoard : null),
    ...overrides,
  };
}

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
