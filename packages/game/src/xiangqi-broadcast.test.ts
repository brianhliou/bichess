import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  replayXiangqiBroadcastBoard,
  validateXiangqiBroadcastBoard,
  validateXiangqiBroadcastBoards,
  validateXiangqiBroadcastRound,
  validateXiangqiBroadcastTour,
  xiangqiBroadcastVariant,
} from './index.js';

const fixtureRoot = new URL('../fixtures/xiangqi-broadcast/2025-wxc-sample/', import.meta.url);

function loadJson(path: URL): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('xiangqi broadcast fixture pack validates', () => {
  const tour = validateXiangqiBroadcastTour(loadJson(new URL('tour.json', fixtureRoot)));
  assert.equal(tour.ok, true, tour.ok ? undefined : tour.errors.join('\n'));

  const roundsRaw = loadJson(new URL('rounds.json', fixtureRoot));
  assert.ok(Array.isArray(roundsRaw));
  const rounds = roundsRaw.map((round) => validateXiangqiBroadcastRound(round));
  for (const round of rounds) {
    assert.equal(round.ok, true, round.ok ? undefined : round.errors.join('\n'));
  }

  const boards = validateXiangqiBroadcastBoards(loadJson(new URL('boards.json', fixtureRoot)));
  assert.equal(boards.ok, true, boards.ok ? undefined : boards.errors.join('\n'));
  assert.equal(boards.ok ? boards.value.length : 0, 2);
  assert.equal(xiangqiBroadcastVariant(), 'xiangqi');
});

test('valid xiangqi broadcast game fixtures replay through the standard rules engine', () => {
  const gamesRoot = new URL('games/', fixtureRoot);
  const files = readdirSync(gamesRoot)
    .filter((file) => file.endsWith('.json') && !file.includes('invalid'))
    .sort();

  assert.deepEqual(files, ['men-r1-b01.json', 'men-r1-b02-live.json']);
  for (const file of files) {
    const parsed = validateXiangqiBroadcastBoard(loadJson(new URL(file, gamesRoot)));
    assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.errors.join('\n'));
    if (!parsed.ok) continue;

    const replay = replayXiangqiBroadcastBoard(parsed.value);
    assert.equal(replay.ok, true, replay.ok ? undefined : `${replay.boardId} ${replay.reason}`);
    assert.equal(replay.ok ? replay.plies : 0, parsed.value.moves.length);
  }
});

test('invalid xiangqi broadcast game fixtures fail with board and ply diagnostics', () => {
  const parsed = validateXiangqiBroadcastBoard(
    loadJson(new URL('games/men-r1-b03-invalid.json', fixtureRoot)),
  );
  assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.errors.join('\n'));
  if (!parsed.ok) return;

  const replay = replayXiangqiBroadcastBoard(parsed.value);
  assert.equal(replay.ok, false);
  if (replay.ok) return;
  assert.equal(replay.boardId, '2025-wxc-sample-men-r1-b03-invalid');
  assert.equal(replay.ply, 1);
  assert.equal(replay.reason, 'illegal move at ply 1: a7a6');
});

test('xiangqi broadcast runtime validation rejects malformed payloads before replay', () => {
  const parsed = validateXiangqiBroadcastBoard({
    schema: 'mistboard.xiangqi.broadcast.v1',
    id: 'bad-board',
    tourSlug: '2025-wxc-sample',
    roundId: 'men-r1',
    sourceBoardId: 'bad',
    boardNumber: 1,
    red: { name: 'Red' },
    black: { name: 'Black' },
    status: 'complete',
    result: '*',
    moves: [{ from: 'j1', to: 'a1' }],
  });

  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(parsed.errors, [
    'board.result must be decided when board.status is complete',
    'board.moves[0].from must be a valid square',
  ]);
});
