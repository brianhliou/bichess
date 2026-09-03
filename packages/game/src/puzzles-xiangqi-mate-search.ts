// Does THIS move still force mate? A kernel-only check, no engine.
//
// The miner admits a mate puzzle when the best move mates strictly faster than
// the runner-up (`fastest-mate`, puzzles-xiangqi-mining.ts). That is not the
// same as the position having one answer: measured over the served corpus,
// 237 of 812 checkmate-goal puzzles have a runner-up that also mates, and the
// verify pass runs MultiPV 2 so the true count is higher. One study chapter has
// eighteen mating moves out of twenty-seven legal ones.
//
// Today a solver who finds the mate in five where the stored line mates in four
// is told "Try again" and loses rating for a move that wins. This module is how
// the grader stops doing that: on a move that does NOT match the stored line, ask
// whether it forces mate anyway within the same budget, and accept it if it does.
//
// Why the kernel and not an engine: forced mate is a pure game-tree property.
// The variant-lab miners already establish the pattern (mini-xiangqi, fortress
// and both jungle miners search for forced wins with no engine at all). An
// engine call per wrong answer would put a search on the request path and a
// denial-of-service lever in every attempt.
//
// SOUNDNESS NOTE. Real mate solvers prune solver nodes to checking moves. That
// is unsound in xiangqi, where stalemate is a LOSS: a quiet move that takes away
// every reply mates without ever giving check. So checks are used only to ORDER
// moves, never to exclude them.

import type { XiangqiColor, XiangqiGameState, XiangqiMove } from './variants-xiangqi.js';
import {
  applyStandardXiangqiMove,
  getStandardXiangqiLegalMoves,
  isStandardXiangqiGeneralInCheck,
  isStandardXiangqiLegalMove,
} from './variants-xiangqi-standard.js';

/**
 * The most solver moves this search will look for.
 *
 * Every extra solver move multiplies the tree by roughly the branching factor
 * twice, and this runs while a solver waits for their attempt to be graded.
 * Three covers mate in one, two and three; a stored line longer than that falls
 * back to strict grading, which is what happens today for all of them.
 */
export const XIANGQI_MATE_SEARCH_MAX_SOLVER_MOVES = 3;

/** Positions visited before the search gives up and the caller grades strictly. */
export const XIANGQI_MATE_SEARCH_DEFAULT_BUDGET = 120_000;

export type XiangqiMateSearchResult = {
  /** True only when the move is PROVEN to force mate inside the budget. */
  forcesMate: boolean;
  /** True when the budget ran out first, so `forcesMate: false` proves nothing. */
  exhausted: boolean;
  positionsVisited: number;
};

type Budget = { remaining: number; exhausted: boolean };

/**
 * Does `move` force mate for the side to move within `solverMoves` of their own
 * moves, counting this one?
 *
 * Fail-closed in both directions that matter: an out-of-range `solverMoves`, an
 * illegal move, or an exhausted budget all return `forcesMate: false`, which
 * grades exactly as the code did before this existed.
 */
export function xiangqiMoveForcesMate(
  state: XiangqiGameState,
  move: XiangqiMove,
  solverMoves: number,
  budgetLimit: number = XIANGQI_MATE_SEARCH_DEFAULT_BUDGET,
): XiangqiMateSearchResult {
  if (state.status.type !== 'playing') return miss(0);
  if (!Number.isInteger(solverMoves) || solverMoves < 1) return miss(0);
  if (solverMoves > XIANGQI_MATE_SEARCH_MAX_SOLVER_MOVES) return miss(0);

  const solver = state.status.turn;
  const budget: Budget = { remaining: budgetLimit, exhausted: false };
  const forced = movePropagatesMate(state, move, solver, solverMoves, budget);
  return {
    forcesMate: forced && !budget.exhausted,
    exhausted: budget.exhausted,
    positionsVisited: budgetLimit - budget.remaining,
  };
}

const miss = (positionsVisited: number): XiangqiMateSearchResult => ({
  forcesMate: false,
  exhausted: false,
  positionsVisited,
});

/** One solver move: play it, then every defender reply must still lose. */
function movePropagatesMate(
  state: XiangqiGameState,
  move: XiangqiMove,
  solver: XiangqiColor,
  solverMoves: number,
  budget: Budget,
): boolean {
  budget.remaining -= 1;
  if (budget.remaining < 0) {
    budget.exhausted = true;
    return false;
  }

  if (!isStandardXiangqiLegalMove(state, move)) return false;
  const after = applyStandardXiangqiMove(state, move);

  // The kernel already adjudicates: checkmate AND stalemate end the game, and in
  // xiangqi both are a loss for the side with no move. Reading the winner rather
  // than testing for check is what makes the quiet-move mate work.
  if (after.status.type === 'finished') return after.status.winner === solver;
  if (solverMoves <= 1) return false;

  // Defender's turn. EVERY reply must still lose, so one escape refutes the move.
  for (const reply of getStandardXiangqiLegalMoves(after)) {
    budget.remaining -= 1;
    if (budget.remaining < 0) {
      budget.exhausted = true;
      return false;
    }
    const afterReply = applyStandardXiangqiMove(after, reply);
    if (afterReply.status.type === 'finished') {
      if (afterReply.status.winner === solver) continue; // defender mated themselves
      return false;
    }
    if (!solverCanForceMate(afterReply, solver, solverMoves - 1, budget)) return false;
    if (budget.exhausted) return false;
  }
  return true;
}

/** Solver to move: one move that forces mate in the remaining budget is enough. */
function solverCanForceMate(
  state: XiangqiGameState,
  solver: XiangqiColor,
  solverMoves: number,
  budget: Budget,
): boolean {
  if (solverMoves < 1) return false;
  if (state.status.type !== 'playing' || state.status.turn !== solver) return false;

  for (const move of orderChecksFirst(state)) {
    if (movePropagatesMate(state, move, solver, solverMoves, budget)) return true;
    if (budget.exhausted) return false;
  }
  return false;
}

/**
 * Checking moves first, so the early exit fires on the first try in the common
 * case. This is ordering ONLY — every legal move is still searched, because a
 * quiet move can mate by stalemate (see the soundness note above).
 */
function orderChecksFirst(state: XiangqiGameState): XiangqiMove[] {
  const moves = getStandardXiangqiLegalMoves(state);
  const checks: XiangqiMove[] = [];
  const quiet: XiangqiMove[] = [];
  for (const move of moves) {
    const after = applyStandardXiangqiMove(state, move);
    const defender = after.status.type === 'playing' ? after.status.turn : null;
    if (defender === null || isStandardXiangqiGeneralInCheck(after, defender)) checks.push(move);
    else quiet.push(move);
  }
  return [...checks, ...quiet];
}
