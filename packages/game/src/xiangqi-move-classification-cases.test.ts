import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyMove, createInitialXiangqiState } from './index.js';
import type { XiangqiMove, XiangqiSquare } from './variants-xiangqi.js';

// Mistboard computes only the NEGATIVE move judgments (blunder / mistake /
// inaccuracy). A 2026-08-28 attempt at the positive ones (! !? !!) failed, and
// this fixture is what it produced that was worth keeping: three hand-verified
// plies that every version of a material-based "sacrifice" detector marked, and
// that a correct one must not.
//
// The point is not that these numbers are interesting. It is that each entry
// looked right on the numbers and was only caught by replaying the game. A
// future implementation should start by failing on this file.
//
// Background: docs-private/xiangqi-positive-annotations-research.md.

type Case = {
  key: string;
  ply: number;
  side: 'red' | 'black';
  wxf: string;
  verdict: 'capture' | 'quiet' | 'losing-trade';
  why: string;
  iccs: string;
  balanceMoverPov: { before: number; after: number; next6: number[] };
  mustNotBeMarked: boolean;
};

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/xiangqi-move-classification/known-cases.json', import.meta.url),
    'utf8',
  ),
) as { cases: Case[] };

const VALUE: Record<string, number> = {
  chariot: 9,
  cannon: 4.5,
  horse: 4,
  advisor: 2,
  elephant: 2,
  soldier: 1,
  general: 0,
};

function iccsToMove(token: string): XiangqiMove {
  const square = (s: string) => `${s[0]}${Number(s[1]) + 1}` as XiangqiSquare;
  return { from: square(token.slice(0, 2)), to: square(token.slice(2, 4)) };
}

test('the move-classification fixture is present and covers every trap we hit', () => {
  assert.equal(fixture.cases.length, 3);
  assert.deepEqual(
    fixture.cases.map((c) => c.verdict).sort(),
    ['capture', 'losing-trade', 'quiet'],
    'each case defeats a different detector version; losing one loses that lesson',
  );
  for (const c of fixture.cases) assert.equal(c.mustNotBeMarked, true);
});

// The fixture carries move lists, so it can rot silently if a record is ever
// corrected. Replaying it through the kernel is what stops that.
test('every fixture line replays legally and its material facts still hold', () => {
  for (const c of fixture.cases) {
    const moves = c.iccs.split(/\s+/).map(iccsToMove);
    let state = createInitialXiangqiState(`case-${c.key}`);
    const states = [state];
    for (const move of moves) {
      const next = applyMove(state, move);
      assert.notEqual(next, state, `${c.key}: ply ${states.length} is not legal`);
      state = next;
      states.push(state);
    }

    const other = c.side === 'red' ? 'black' : 'red';
    const balance = (index: number): number => {
      const board = states[index]!.board as Record<string, { color: string; role: string }>;
      return Object.values(board).reduce(
        (total, piece) =>
          total +
          (piece.color === c.side ? (VALUE[piece.role] ?? 0) : 0) -
          (piece.color === other ? (VALUE[piece.role] ?? 0) : 0),
        0,
      );
    };
    assert.equal(balance(c.ply - 1), c.balanceMoverPov.before, `${c.key}: balance before drifted`);
    assert.equal(balance(c.ply), c.balanceMoverPov.after, `${c.key}: balance after drifted`);
  }
});

// The three traps, stated as the assertions a detector has to satisfy. There is
// no implementation to point them at yet; when there is, these become its
// acceptance tests.
test('the capture case must not read as a sacrifice', () => {
  const c = fixture.cases.find((x) => x.verdict === 'capture')!;
  // Balance jumps UP on the move itself: the mover took a chariot.
  assert.ok(c.balanceMoverPov.after > c.balanceMoverPov.before);
  // And the -9 that a naive window sees arrives three plies later, from a
  // different exchange entirely.
  assert.ok(c.balanceMoverPov.next6.includes(-9));
});

test('the quiet case must not read as a sacrifice', () => {
  const c = fixture.cases.find((x) => x.verdict === 'quiet')!;
  // Nothing is captured and nothing is offered; the move is materially inert.
  assert.equal(c.balanceMoverPov.before, c.balanceMoverPov.after);
  // A settle-on-quiet-plies horizon still finds a swing to blame on it.
  assert.ok(Math.min(...c.balanceMoverPov.next6) < 0);
});

test('the losing-trade case must not read as a sacrifice', () => {
  const c = fixture.cases.find((x) => x.verdict === 'losing-trade')!;
  // Material really is lost and never comes back, which is why a balance-only
  // test fires. A bad trade is still not a sacrifice.
  assert.ok(c.balanceMoverPov.next6.every((b) => b < c.balanceMoverPov.before));
});
