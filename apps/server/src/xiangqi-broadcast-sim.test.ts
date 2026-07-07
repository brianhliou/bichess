import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readXiangqiBroadcastFixturePack } from './import-xiangqi-broadcast.js';
import {
  buildXiangqiBroadcastTapeFrames,
  xiangqiBroadcastBoardsAt,
  xiangqiBroadcastSourceResponse,
} from './xiangqi-broadcast-sim.js';

const FIXTURE_DIR = fileURLToPath(
  new URL('../../../packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample', import.meta.url),
);
const TAPE_PATH = fileURLToPath(
  new URL(
    '../../../packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample/tape.json',
    import.meta.url,
  ),
);

function tapeFixture(): unknown {
  return JSON.parse(readFileSync(TAPE_PATH, 'utf-8')) as unknown;
}

test('xiangqi broadcast tape frames build deterministic board snapshots', async () => {
  const pack = await readXiangqiBroadcastFixturePack(FIXTURE_DIR);
  const frames = buildXiangqiBroadcastTapeFrames(pack, tapeFixture());

  assert.equal(frames.length, 9);
  assert.equal(frames[0]?.board.moves.length, 0);
  assert.equal(frames[2]?.board.moves.length, 1);
  assert.equal(frames[4]?.board.moves.length, 1);
  assert.equal(frames[7]?.board.status, 'complete');
  assert.equal(frames[7]?.board.result, '1-0');
});

test('xiangqi broadcast source snapshots can be clean, stale, malformed, or erroring', async () => {
  const pack = await readXiangqiBroadcastFixturePack(FIXTURE_DIR);
  const tape = tapeFixture();

  const clean = xiangqiBroadcastSourceResponse(pack, tape, 16000, 'clean');
  assert.equal(clean.status, 200);
  assert.ok(!('malformed' in clean.body));
  if ('malformed' in clean.body) return;
  assert.equal(clean.body.boards[0]?.moves.length, 8);

  const stale = xiangqiBroadcastSourceResponse(pack, tape, 16000, 'stale');
  assert.equal(stale.status, 200);
  assert.ok(!('malformed' in stale.body));
  if ('malformed' in stale.body) return;
  assert.equal(stale.body.boards[0]?.moves.length, 2);

  const malformed = xiangqiBroadcastSourceResponse(pack, tape, 16000, 'malformed');
  assert.equal(malformed.status, 200);
  assert.ok('malformed' in malformed.body);

  const error = xiangqiBroadcastSourceResponse(pack, tape, 16000, 'error');
  assert.equal(error.status, 500);
});

test('xiangqi broadcast boardsAt returns initial metadata before any tape frame', async () => {
  const pack = await readXiangqiBroadcastFixturePack(FIXTURE_DIR);
  const boards = xiangqiBroadcastBoardsAt(pack, tapeFixture(), 1);

  assert.equal(boards.length, 2);
  assert.equal(boards[0]?.moves.length, 0);
  assert.equal(boards[0]?.status, 'live');
  assert.equal(boards[1]?.status, 'live');
});
