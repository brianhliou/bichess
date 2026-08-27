import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XiangqiMove } from '@mistboard/game';
import { historicalXiangqiDigest } from './historical-xiangqi-digest.js';

const MOVES: XiangqiMove[] = [
  { from: 'h3', to: 'e3' },
  { from: 'h8', to: 'e8' },
] as XiangqiMove[];

test('the same game under a fresh set of source labels digests identically', () => {
  // This is the whole point. ElephantChess re-anonymizes every monthly release,
  // so the same game arrives with a new id and new player pseudonyms. If those
  // reached the digest, a re-import would insert a duplicate of every game.
  const june = historicalXiangqiDigest({ playedOn: '2026-05-04', result: '1-0', moves: MOVES });
  const july = historicalXiangqiDigest({ playedOn: '2026-05-04', result: '1-0', moves: MOVES });
  assert.equal(june, july);
});

test('date, result and moves each change the digest', () => {
  const base = historicalXiangqiDigest({ playedOn: '2026-05-04', result: '1-0', moves: MOVES });
  assert.notEqual(
    base,
    historicalXiangqiDigest({ playedOn: '2026-05-05', result: '1-0', moves: MOVES }),
  );
  assert.notEqual(
    base,
    historicalXiangqiDigest({ playedOn: '2026-05-04', result: '0-1', moves: MOVES }),
  );
  assert.notEqual(
    base,
    historicalXiangqiDigest({
      playedOn: '2026-05-04',
      result: '1-0',
      moves: [MOVES[0]!] as XiangqiMove[],
    }),
  );
});

test('a missing date is a value, not a hole that collapses onto other games', () => {
  const dated = historicalXiangqiDigest({ playedOn: '2026-05-04', result: '1-0', moves: MOVES });
  const undated = historicalXiangqiDigest({ playedOn: null, result: '1-0', moves: MOVES });
  assert.notEqual(dated, undated);
});

test('move order is part of the identity, not just the move set', () => {
  const forward = historicalXiangqiDigest({ playedOn: null, result: '*', moves: MOVES });
  const reversed = historicalXiangqiDigest({
    playedOn: null,
    result: '*',
    moves: [...MOVES].reverse() as XiangqiMove[],
  });
  assert.notEqual(forward, reversed);
});
