// Puzzle rating math, layered on the shared Glicko-2 engine (glicko.ts).
//
// A rated attempt is a single "game" between the user and the puzzle: solving is
// a win for the user (and a loss for the puzzle), failing is the reverse. Both
// sides update symmetrically via the same `rate` used for the live ladder, so
// puzzle ratings self-calibrate exactly like player ratings do.

import { DEFAULT_RD, DEFAULT_VOLATILITY, type Glicko2, isProvisional, rate } from './glicko.js';

// Seed a puzzle's initial rating from its mate depth (solution plies -> full
// moves). The value only needs to be roughly ordered by difficulty; Glicko then
// self-calibrates as users attempt it, so we start provisional (default RD) and
// let real outcomes pull it to its true strength.
const SEED_BY_MATE_DEPTH: Readonly<Record<number, number>> = { 1: 1300, 2: 1600, 3: 1900 };
const SEED_BASE = 1500;
const SEED_STEP = 300;
const SEED_MAX = 2400;

// `derivedDifficulty` is the offline prior from deriveXiangqiPuzzleDifficulty:
// mate depth plus whether the key move is quiet, material conceded and not
// recovered, and how many replies the defence has. Mate depth alone gives four
// values across the whole corpus -- 943 of 1,605 puzzles seeded to exactly the
// same number -- which makes rating-adaptive selection a coin flip among
// hundreds of ties. The derived prior gives 402. Passed through unclamped by
// SEED_MAX, which exists to stop the crude depth extrapolation running away and
// has no business truncating a measured value.
export function seedPuzzleRating(solutionPlyCount: number, derivedDifficulty?: number): Glicko2 {
  if (derivedDifficulty !== undefined && Number.isFinite(derivedDifficulty)) {
    return {
      rating: Math.round(derivedDifficulty),
      rd: DEFAULT_RD,
      volatility: DEFAULT_VOLATILITY,
    };
  }
  const mateDepth = Math.max(1, Math.ceil(solutionPlyCount / 2));
  const seeded = SEED_BY_MATE_DEPTH[mateDepth] ?? SEED_BASE + (mateDepth - 1) * SEED_STEP;
  return {
    rating: Math.min(SEED_MAX, seeded),
    rd: DEFAULT_RD,
    volatility: DEFAULT_VOLATILITY,
  };
}

export type PuzzleRatingChange = {
  user: Glicko2;
  puzzle: Glicko2;
};

// Apply one rated attempt outcome, returning the post-attempt ratings for both
// the user and the puzzle. `solved` = the user found the solution without a wrong
// move (lichess counts the first attempt only; idempotency is enforced upstream
// by the puzzle_attempts primary key, not here).
export function ratePuzzleAttempt(
  user: Glicko2,
  puzzle: Glicko2,
  solved: boolean,
): PuzzleRatingChange {
  const userScore = solved ? 1 : 0;
  return {
    user: rate(user, [{ opponentRating: puzzle.rating, opponentRd: puzzle.rd, score: userScore }]),
    puzzle: rate(puzzle, [
      { opponentRating: user.rating, opponentRd: user.rd, score: 1 - userScore },
    ]),
  };
}

// Display helpers so callers agree on rounding + the provisional marker.
export function displayPuzzleRating(r: Glicko2): { rating: number; provisional: boolean } {
  return { rating: Math.round(r.rating), provisional: isProvisional(r.rd) };
}
