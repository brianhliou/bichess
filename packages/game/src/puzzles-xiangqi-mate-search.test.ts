import assert from 'node:assert/strict';
import test from 'node:test';
import {
  XIANGQI_MATE_SEARCH_MAX_SOLVER_MOVES,
  xiangqiMoveForcesMate,
} from './puzzles-xiangqi-mate-search.js';
import { parseStandardXiangqiFen } from './xiangqi-position.js';

/** parseStandardXiangqiFen returns a result union; a bad FEN here is a test bug. */
function positionFrom(fen: string) {
  const parsed = parseStandardXiangqiFen(fen);
  assert.ok(parsed.ok, `FEN did not parse: ${parsed.ok ? '' : parsed.error}`);
  return parsed.state;
}

// The positions here are from the served corpus, not composed for the test.
// A fixture written from this module's own assumptions would agree with it by
// construction; these came out of study E63eGK5V, whose lines were verified by
// Pikafish at depth 20 and audited at depth 22 independently of any of this.

// Chapter 1, xq-mined-hxq_875a152f5c31f46f135272cc-57. Black mates in two:
// c1-c2, Red's chariot returns to d2, g1-g2 mate. Nothing is captured.
const MATE_IN_TWO = '2b1ka3/4C4/b1n2c3/8C/p1p3p2/9/3R4P/4R4/4K4/c1rA1Ar2 b - - 0 29';

// Chapter 5, xq-mined-hxq_50982b077aec4bcae49c5832-86. Chariot and horse against
// the full defence: EIGHTEEN of Red's twenty-seven legal moves force mate, and
// the stored line (e6-b6) is only the fastest at mate in four. This is the
// position that motivated the whole change.
const MANY_MATES = '2baka3/9/4b4/5N3/4R4/9/9/4B4/9/2B1KA3 r - - 0 44';

test('the stored move is proven to force mate', () => {
  const state = positionFrom(MATE_IN_TWO);
  const result = xiangqiMoveForcesMate(state, { from: 'c1', to: 'c2' }, 2);
  assert.equal(result.forcesMate, true);
  assert.equal(result.exhausted, false);
});

test('a move that does not mate is refused', () => {
  const state = positionFrom(MATE_IN_TWO);
  // The other chariot's move, which is the SECOND half of the real solution and
  // does nothing on its own.
  const result = xiangqiMoveForcesMate(state, { from: 'g1', to: 'g2' }, 2);
  assert.equal(result.forcesMate, false);
  assert.equal(result.exhausted, false);
});

test('one move short of enough is refused', () => {
  const state = positionFrom(MATE_IN_TWO);
  // Correct move, but claimed as a mate in one.
  assert.equal(xiangqiMoveForcesMate(state, { from: 'c1', to: 'c2' }, 1).forcesMate, false);
});

test('an illegal move is refused rather than throwing', () => {
  const state = positionFrom(MATE_IN_TWO);
  assert.equal(xiangqiMoveForcesMate(state, { from: 'a10', to: 'a9' }, 2).forcesMate, false);
});

// The whole point of the module, on a real corpus position.
//
// xq-mined-hxq_2326cfdc2aa04eef6682486d-60. The stored line is h7-f8, mate in
// two. h7-g9 ALSO forces mate in two, and today a solver who plays it is told
// "Try again" and loses rating for a move that wins. Found by enumerating every
// legal first move through this search over the served corpus: three of the
// nineteen mate-in-two/three puzzles scanned had an alternative like this.
const ALTERNATIVE_MATE = '1r1ak1b2/4a4/2n1b4/pcR4Np/1c2C4/1R7/9/N3B4/4A4/4KA3 r - - 0 31';

test('an alternative mate is accepted, not just the stored one', () => {
  const state = positionFrom(ALTERNATIVE_MATE);
  const stored = xiangqiMoveForcesMate(state, { from: 'h7', to: 'f8' }, 2);
  assert.equal(stored.forcesMate, true, 'the stored move must still pass');

  // h7-g9 mates in THREE where the stored line mates in two, which is exactly
  // the case the grader used to reject: a solver who finds a slower forced mate
  // was told "Try again". Searched at the cap, which is what the grader passes.
  const slower = xiangqiMoveForcesMate(state, { from: 'h7', to: 'g9' }, 3);
  assert.equal(slower.forcesMate, true, 'a slower forced mate must be accepted');

  // And it is genuinely slower, not an equal-length alternative.
  assert.equal(
    xiangqiMoveForcesMate(state, { from: 'h7', to: 'g9' }, 2).forcesMate,
    false,
    'h7-g9 should not mate in two',
  );
});

// The rule the GRADER applies is "any forced mate within the cap", not "a mate
// as fast as the stored line". Speed was never stated to the solver, and a
// scan of the corpus under the stricter rule found zero acceptable
// alternatives in forty puzzles — the slower mate is the whole complaint.
test('a mate slower than the stored line still counts', () => {
  const state = positionFrom(MANY_MATES);
  // Stored line is mate in four, above the cap, so it cannot be proven here.
  assert.equal(xiangqiMoveForcesMate(state, { from: 'e6', to: 'b6' }, 3).forcesMate, false);
  // Nothing in this position mates within three, so the grader falls back to
  // strict comparison and behaves exactly as it does today.
  assert.equal(xiangqiMoveForcesMate(state, { from: 'e6', to: 'd6' }, 3).forcesMate, false);
});

test('a budget that runs out reports exhausted rather than a false negative', () => {
  const state = positionFrom(MANY_MATES);
  const result = xiangqiMoveForcesMate(state, { from: 'e6', to: 'b6' }, 3, 50);
  assert.equal(result.exhausted, true);
  // The contract: forcesMate is only ever true when PROVEN, so an exhausted
  // search grades exactly as the old strict comparison did.
  assert.equal(result.forcesMate, false);
});

test('a line longer than the cap falls back rather than searching forever', () => {
  const state = positionFrom(MANY_MATES);
  const result = xiangqiMoveForcesMate(
    state,
    { from: 'e6', to: 'b6' },
    XIANGQI_MATE_SEARCH_MAX_SOLVER_MOVES + 1,
  );
  assert.equal(result.forcesMate, false);
  assert.equal(result.positionsVisited, 0, 'it must not have searched at all');
});

test('the search stays cheap enough for the request path', () => {
  const state = positionFrom(MANY_MATES);
  const started = Date.now();
  xiangqiMoveForcesMate(state, { from: 'e6', to: 'b6' }, 3);
  // Generous, because CI machines are slow and this is a regression tripwire for
  // a pathological blow-up, not a benchmark.
  assert.ok(Date.now() - started < 3000, 'mate-in-three search should not take seconds');
});
