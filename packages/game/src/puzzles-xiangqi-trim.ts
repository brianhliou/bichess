// Trim trailing quiet moves off a mined winning-advantage xiangqi solution.
//
// The miner truncates Pikafish's PV to the longest odd prefix (a line must end
// on the solver's own move). When the engine keeps calculating past the point
// where the material is already won, that prefix can end on a QUIET consolidating
// move — one that captures nothing and is one of dozens of equally-winning
// options. Because the puzzle solver validates by EXACT move match, such a tail
// demands a specific non-forced move and rejects every other winning reply.
//
// A winning-advantage puzzle's payoff is the material it wins, so the honest
// line ends on the solver's LAST capture. This trims the trailing non-capturing
// solver plies (and the defender replies between them) back to that capture.
//
// Only winning-advantage lines are eligible: a checkmate line's final move is
// often a non-capturing mating move, which must never be trimmed. A line with no
// solver capture at all (a purely positional win) is left untouched — there is no
// material payoff to fall back to. The transform is IDEMPOTENT: after trimming,
// the new final solver move is a capture, so re-running finds nothing to remove.

import type { XiangqiGameState, XiangqiMove } from './variants-xiangqi.js';
import { applyStandardXiangqiMove } from './variants-xiangqi-standard.js';

/**
 * Return `solution` truncated so it ends on the solver's last capturing move.
 * Returns a copy of the original (unchanged length) when there is no trailing
 * quiet solver move to trim — including the no-solver-capture (positional) case.
 * Assumes solver plies are the even indices, per the puzzle line convention.
 */
export function trimXiangqiWinningAdvantageMoves(
  initial: XiangqiGameState,
  solution: readonly XiangqiMove[],
): XiangqiMove[] {
  let state: XiangqiGameState = initial;
  let lastSolverCapturePly = -1;
  for (let ply = 0; ply < solution.length; ply += 1) {
    if (state.status.type !== 'playing') break;
    const move = solution[ply] as XiangqiMove;
    // Xiangqi has no non-landing captures, so an occupied destination (never a
    // friendly piece in a legal move) means this move captured.
    if (ply % 2 === 0 && state.board[move.to] !== undefined) lastSolverCapturePly = ply;
    state = applyStandardXiangqiMove(state, move);
  }
  if (lastSolverCapturePly < 0 || lastSolverCapturePly + 1 >= solution.length) {
    return solution.slice();
  }
  return solution.slice(0, lastSolverCapturePly + 1);
}
