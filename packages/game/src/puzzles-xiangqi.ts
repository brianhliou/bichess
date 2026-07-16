// Standard (9x10, open-information) Xiangqi puzzle model.
//
// Parallels puzzles-fortress-xiangqi.ts, but for the standard xiangqi kernel
// (variants-xiangqi-standard.ts): a puzzle is a legal position with the solver
// to move and a scripted solution line; solver plies are the even indices
// (0, 2, 4, ...), defender replies the odd ones.
//
// Unlike the Mini/Fortress registries (hand-built + engine self-play), the
// standard-xiangqi corpus is mined from REAL historical games by the
// lichess-style miner in scripts/variant-lab/xiangqi-puzzle-miner.ts, which
// overwrites puzzles-xiangqi-mined.ts. Curated hand-picked puzzles can be
// added to CURATED_XIANGQI_PUZZLES below (use ids with the `xiangqi-` prefix;
// mined ids use `xq-mined-`; both stay prefix-disjoint from the other puzzle
// registries so the server's id resolution can try each in turn).
//
// Source games are NOT embedded as a module (unlike Jungle/Fortress self-play):
// a mined puzzle's sourceGame.gameId points at a historical_xiangqi_games row
// (db mode) or an input file (dir mode).
//
// Standard-kernel notes (vs the Mini/Fortress validators):
//   - The kernel is CHECK-AWARE, so an "ambiguous immediate general capture"
//     start cannot exist (a general can never be legally captured); that check
//     is dropped here.
//   - Xiangqi stalemate is a WIN for the mover, so a `checkmate` goal accepts
//     both 'checkmate' and 'stalemate' finish reasons (困毙 counts as mate).

import { type GameSpecId, XIANGQI_SPEC_ID } from './game-specs.js';
import { MINED_XIANGQI_PUZZLES } from './puzzles-xiangqi-mined.js';
import { trimXiangqiWinningAdvantageMoves } from './puzzles-xiangqi-trim.js';
import type {
  XiangqiColor,
  XiangqiGameState,
  XiangqiGameStatus,
  XiangqiMove,
} from './variants-xiangqi.js';
import {
  applyStandardXiangqiMove,
  isStandardXiangqiLegalMove,
} from './variants-xiangqi-standard.js';

export type XiangqiPuzzleTheme =
  | 'checkmate'
  | 'matein1'
  | 'matein2'
  | 'matein3'
  | 'winning'
  | 'winning-material'
  | 'crushing'
  | 'endgame'
  | 'middlegame';

export type XiangqiPuzzleGoal =
  | {
      type: 'checkmate';
      winner?: XiangqiColor;
    }
  // A forced material/positional win that does NOT end in mate. The kernel has
  // no evaluator, so — unlike a checkmate goal — it cannot re-verify that the
  // final position is "winning"; that judgment is the miner's (Pikafish).
  // Validation only guarantees a fully legal line that ends on the solver's
  // move (the payoff), and `centipawns` records the verify-pass eval from the
  // solver's point of view for reference/seeding.
  | {
      type: 'winning-advantage';
      winner?: XiangqiColor;
      centipawns?: number;
    };

export type XiangqiPuzzle = {
  id: string;
  variant: typeof XIANGQI_SPEC_ID;
  title: string;
  initial: XiangqiGameState;
  solution: XiangqiMove[];
  goal: XiangqiPuzzleGoal;
  themes: XiangqiPuzzleTheme[];
  // Pointer to the real game this position came from: replaying the source
  // game's first `ply` moves from the standard opening reproduces `initial`
  // (modulo the puzzle-state reset of progressClock/positionCounts).
  //
  // The event/date/result/player fields are denormalized ATTRIBUTION copied
  // from the historical_xiangqi_games row at mine time. They travel with the
  // puzzle so the "From game" card renders without the source game being
  // hosted (the games themselves stay gated on license clearance — see
  // docs-private/historical-xiangqi-library-track.md). All optional: older
  // puzzles and non-db-mined puzzles carry only { gameId, ply }.
  sourceGame?: {
    gameId: string;
    ply: number;
    event?: string;
    playedOn?: string; // ISO date, YYYY-MM-DD
    result?: string; // "1-0" | "0-1" | "1/2-1/2"
    redName?: string;
    blackName?: string;
  };
};

export type XiangqiPuzzleValidationIssueCode =
  | 'empty-solution'
  | 'illegal-move'
  | 'not-playing'
  | 'solution-continues-after-finish'
  | 'solution-ended-before-goal'
  | 'solution-must-end-on-solver-move'
  | 'unsupported-variant'
  | 'winning-advantage-filler-tail'
  | 'wrong-finish-reason'
  | 'wrong-winner';

export type XiangqiPuzzleValidationIssue = {
  code: XiangqiPuzzleValidationIssueCode;
  message: string;
  ply: number;
  move?: XiangqiMove;
};

export type XiangqiPuzzleValidationResult =
  | {
      ok: true;
      puzzleId: string;
      solver: XiangqiColor;
      // 'finished' for checkmate goals; 'playing' for winning-advantage goals
      // (the line stops at the payoff move, the game continues).
      finalStatus: XiangqiGameStatus;
      plyCount: number;
    }
  | {
      ok: false;
      puzzleId: string;
      variant: typeof XIANGQI_SPEC_ID | GameSpecId;
      issue: XiangqiPuzzleValidationIssue;
    };

export type XiangqiPuzzleAttemptFailureCode = 'incorrect-move' | 'illegal-move' | 'line-too-long';

export type XiangqiPuzzleAttemptResult =
  | {
      ok: true;
      puzzleId: string;
      variant: typeof XIANGQI_SPEC_ID;
      playedMoves: XiangqiMove[];
      solverMoves: XiangqiMove[];
      complete: boolean;
      ply: number;
      state: XiangqiGameState;
      lastMove?: XiangqiMove;
    }
  | {
      ok: false;
      puzzleId: string;
      variant: typeof XIANGQI_SPEC_ID;
      code: XiangqiPuzzleAttemptFailureCode;
      ply: number;
      state: XiangqiGameState;
      move: XiangqiMove;
    };

// Hand-curated standard-xiangqi puzzles (none yet; the corpus is mined).
export const CURATED_XIANGQI_PUZZLES: readonly XiangqiPuzzle[] = [];

// Normalize a winning-advantage puzzle so its line ends on the payoff (the
// solver's last capture), dropping the quiet PV tail the miner truncated to.
// Checkmate puzzles and captureless (positional) wins are returned unchanged.
export function trimXiangqiWinningAdvantageTail(puzzle: XiangqiPuzzle): XiangqiPuzzle {
  if (puzzle.goal.type !== 'winning-advantage') return puzzle;
  const trimmed = trimXiangqiWinningAdvantageMoves(puzzle.initial, puzzle.solution);
  if (trimmed.length === puzzle.solution.length) return puzzle;
  return { ...puzzle, solution: trimmed };
}

// A handful of mined puzzles whose flagged solver ply has a near-tied second
// move (two winning moves within a small eval gap), so the "one right answer"
// is not robust — the independent audit rejects them even though the gated
// miner accepted them (search nondeterminism between the two engine processes
// flips a small gap). Held back until the #185 follow-up lands (verify-hash
// determinism + a slightly higher material-gap so a future re-mine never
// produces them); then this set and the filter below are removed.
const AUDIT_FLAGGED_XIANGQI_PUZZLE_IDS: ReadonlySet<string> = new Set([
  'xq-mined-hxq_2b2b6b6d803b6f4bbd3a12d5-58',
  'xq-mined-hxq_3087b9e177dc6e0a08d2872a-65',
  'xq-mined-hxq_4a41e15e9d8a17414cf249ee-42',
  'xq-mined-hxq_5299fe14e58a6acd13d8dd33-101',
]);

export const XIANGQI_PUZZLES: readonly XiangqiPuzzle[] = [
  ...CURATED_XIANGQI_PUZZLES,
  // The mined corpus is gated at mine time — every solver ply is verified
  // uniquely correct by the extend-while-unique miner from the standalone FEN
  // (#180/#185) — minus the few audit-flagged near-tied cases above. The
  // quiet-tail trim stays a defensive, idempotent normalization.
  ...MINED_XIANGQI_PUZZLES.filter((puzzle) => !AUDIT_FLAGGED_XIANGQI_PUZZLE_IDS.has(puzzle.id)).map(
    trimXiangqiWinningAdvantageTail,
  ),
];

export function standardXiangqiPuzzleById(id: string): XiangqiPuzzle | null {
  return XIANGQI_PUZZLES.find((puzzle) => puzzle.id === id) ?? null;
}

export function validateStandardXiangqiPuzzle(
  puzzle: XiangqiPuzzle,
): XiangqiPuzzleValidationResult {
  if (puzzle.variant !== XIANGQI_SPEC_ID) {
    return validationError(puzzle, 'unsupported-variant', 0, 'Puzzle variant must be xiangqi.');
  }
  if (puzzle.initial.status.type !== 'playing') {
    return validationError(puzzle, 'not-playing', 0, 'Puzzle initial state must be playable.');
  }
  if (puzzle.solution.length === 0) {
    return validationError(puzzle, 'empty-solution', 0, 'Puzzle solution must contain a move.');
  }

  const solver = puzzle.initial.status.turn;
  let state: XiangqiGameState = puzzle.initial;
  for (let ply = 0; ply < puzzle.solution.length; ply += 1) {
    const move = puzzle.solution[ply] as XiangqiMove;
    if (state.status.type !== 'playing') {
      return validationError(
        puzzle,
        'solution-continues-after-finish',
        ply,
        'Puzzle solution continues after the game is already finished.',
        move,
      );
    }
    const applied = applyPuzzleMove(state, move);
    if (!applied) {
      return validationError(puzzle, 'illegal-move', ply, 'Illegal puzzle move.', move);
    }
    state = applied;
  }

  const expectedWinner = puzzle.goal.winner ?? solver;

  if (puzzle.goal.type === 'winning-advantage') {
    // No mate to verify. The line must end on the solver's own move (the
    // payoff): solver plies are the even indices, so the final index
    // (length - 1) must be even, i.e. the length must be odd.
    if (puzzle.solution.length % 2 === 0) {
      return validationError(
        puzzle,
        'solution-must-end-on-solver-move',
        puzzle.solution.length,
        'Winning-advantage solution must end on the solver move, so its length must be odd.',
      );
    }
    // The line must end on the payoff (the solver's last capture): a trailing
    // quiet solver move is non-forced (one of many winning replies) yet the
    // solver validates by exact match, so it would reject every alternative.
    const trimmed = trimXiangqiWinningAdvantageMoves(puzzle.initial, puzzle.solution);
    if (trimmed.length < puzzle.solution.length) {
      return validationError(
        puzzle,
        'winning-advantage-filler-tail',
        trimmed.length,
        'Winning-advantage solution has quiet moves after the last capture; it must end on the payoff.',
        puzzle.solution[trimmed.length],
      );
    }
    return {
      ok: true,
      puzzleId: puzzle.id,
      solver,
      finalStatus: state.status,
      plyCount: puzzle.solution.length,
    };
  }

  if (state.status.type !== 'finished') {
    return validationError(
      puzzle,
      'solution-ended-before-goal',
      puzzle.solution.length,
      'Puzzle solution ended before the goal was reached.',
    );
  }
  // Xiangqi terminal semantics: stalemate is a WIN for the mover, so both
  // 'checkmate' and 'stalemate' satisfy a mate goal.
  if (state.status.reason !== 'checkmate' && state.status.reason !== 'stalemate') {
    return validationError(
      puzzle,
      'wrong-finish-reason',
      puzzle.solution.length,
      `Expected checkmate or stalemate, got ${state.status.reason}.`,
    );
  }
  if (state.status.winner !== expectedWinner) {
    return validationError(
      puzzle,
      'wrong-winner',
      puzzle.solution.length,
      `Expected ${expectedWinner} to win.`,
    );
  }

  return {
    ok: true,
    puzzleId: puzzle.id,
    solver,
    finalStatus: state.status,
    plyCount: puzzle.solution.length,
  };
}

export function standardXiangqiPuzzleSideToMove(puzzle: XiangqiPuzzle): XiangqiColor | null {
  return puzzle.initial.status.type === 'playing' ? puzzle.initial.status.turn : null;
}

export function standardXiangqiPuzzleNextMove(
  puzzle: XiangqiPuzzle,
  playedPlyCount: number,
): XiangqiMove | null {
  return puzzle.solution[playedPlyCount] ?? null;
}

export function isStandardXiangqiPuzzleSolverPly(playedPlyCount: number): boolean {
  return playedPlyCount % 2 === 0;
}

export function standardXiangqiPuzzleMoveEquals(left: XiangqiMove, right: XiangqiMove): boolean {
  return left.from === right.from && left.to === right.to;
}

export function standardXiangqiPuzzleMoveLabel(move: XiangqiMove): string {
  return `${move.from}-${move.to}`;
}

// Replays a solver's guesses against the solution. Even plies are the solver's
// moves (checked against the solution); after each correct solver move the
// scripted defender reply is auto-applied, so the caller only ever submits
// solver moves.
export function attemptStandardXiangqiPuzzleLine(
  puzzle: XiangqiPuzzle,
  solverMoves: readonly XiangqiMove[],
): XiangqiPuzzleAttemptResult {
  let state: XiangqiGameState = puzzle.initial;
  let lastMove: XiangqiMove | null = null;
  let solutionPly = 0;
  const playedMoves: XiangqiMove[] = [];
  const acceptedSolverMoves: XiangqiMove[] = [];
  for (const move of solverMoves) {
    const expected = puzzle.solution[solutionPly];
    if (!expected) {
      return attemptFailure(puzzle, 'line-too-long', playedMoves.length, state, move);
    }
    if (!standardXiangqiPuzzleMoveEquals(move, expected)) {
      return attemptFailure(puzzle, 'incorrect-move', playedMoves.length, state, move);
    }
    const applied = applyPuzzleMove(state, move);
    if (!applied) {
      return attemptFailure(puzzle, 'illegal-move', playedMoves.length, state, move);
    }
    state = applied;
    lastMove = move;
    playedMoves.push(move);
    acceptedSolverMoves.push(move);
    solutionPly += 1;

    if (state.status.type !== 'playing' || solutionPly >= puzzle.solution.length) continue;
    const reply = puzzle.solution[solutionPly];
    if (!reply) continue;
    const replied = applyPuzzleMove(state, reply);
    if (!replied) {
      return attemptFailure(puzzle, 'illegal-move', playedMoves.length, state, reply);
    }
    state = replied;
    lastMove = reply;
    playedMoves.push(reply);
    solutionPly += 1;
  }

  const ply = playedMoves.length;
  // A checkmate puzzle is only complete once the board is actually finished
  // (mate or xiangqi stalemate); a winning-advantage puzzle completes when the
  // scripted line is exhausted (the game is still in progress at the payoff).
  const lineExhausted = solutionPly >= puzzle.solution.length;
  const complete =
    puzzle.goal.type === 'checkmate'
      ? lineExhausted && state.status.type === 'finished'
      : lineExhausted;
  return {
    ok: true,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    playedMoves,
    solverMoves: acceptedSolverMoves,
    complete,
    ply,
    state,
    ...(lastMove ? { lastMove } : {}),
  };
}

function applyPuzzleMove(state: XiangqiGameState, move: XiangqiMove): XiangqiGameState | null {
  if (state.status.type !== 'playing') return null;
  if (!isStandardXiangqiLegalMove(state, move)) return null;
  return applyStandardXiangqiMove(state, move);
}

function validationError(
  puzzle: XiangqiPuzzle,
  code: XiangqiPuzzleValidationIssueCode,
  ply: number,
  message: string,
  move?: XiangqiMove,
): XiangqiPuzzleValidationResult {
  return {
    ok: false,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    issue: {
      code,
      message,
      ply,
      ...(move ? { move } : {}),
    },
  };
}

function attemptFailure(
  puzzle: XiangqiPuzzle,
  code: XiangqiPuzzleAttemptFailureCode,
  ply: number,
  state: XiangqiGameState,
  move: XiangqiMove,
): XiangqiPuzzleAttemptResult {
  return {
    ok: false,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    code,
    ply,
    state,
    move,
  };
}
