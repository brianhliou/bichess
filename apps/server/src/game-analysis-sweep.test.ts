import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sweepPlyEvals } from './game-analysis-sweep.js';

test('sweepPlyEvals evaluates 0..N ply prefixes (N+1 points) and threads depth', async () => {
  const seen: { moves: string[]; depth: number }[] = [];
  const evals = await sweepPlyEvals(
    ['a2a3', 'g7g6', 'Q@d4'],
    async (moves, opts) => {
      seen.push({ moves: [...moves], depth: opts.depth });
      return { cp: moves.length, mate: null, best: moves[moves.length - 1] ?? null };
    },
    9,
  );
  // 3 moves → 4 eval points (the start position + after each ply).
  assert.equal(evals.length, 4);
  assert.deepEqual(
    evals.map((e) => e.ply),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    evals.map((e) => e.cp),
    [0, 1, 2, 3],
  );
  // Each call sees the prefix up to that ply; the depth is threaded through verbatim.
  assert.deepEqual(seen[0], { moves: [], depth: 9 });
  assert.deepEqual(seen[2], { moves: ['a2a3', 'g7g6'], depth: 9 });
});
