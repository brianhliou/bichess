// An OFFLINE difficulty prior for standard-xiangqi puzzles, derived from the
// puzzle record alone.
//
// Why this exists: served puzzle ratings are Glicko, and Glicko needs solvers.
// At current traffic every puzzle in the corpus is still provisional, and the
// seed rating is a pure function of mate depth — so 251 of the 430 served
// puzzles carry the identical 1600 and "rating-adaptive" selection resolves a
// 251-way tie on random jitter. A prior computed from the line itself gives
// selection something to sort by on day one, and Glicko still overrides it
// later: this is the seed, not the truth.
//
// Every signal here is computed by replaying the solution through the real
// move generator, so it needs no engine, no mining evidence, and no network.
// That makes it backfillable over the whole existing corpus.

import type { XiangqiPuzzle } from './puzzles-xiangqi.js';
import type { XiangqiGameState, XiangqiPieceRole } from './variants-xiangqi.js';
import { applyMove, getLegalMoves, isLegalMove } from './variants-xiangqi.js';

/** Motifs detectable from the line alone. Distinct from the miner's goal/phase
 *  themes (checkmate/winning/endgame), which describe WHAT the puzzle is;
 *  these describe what makes it hard. */
export type XiangqiPuzzleMotif =
  | 'quiet-move'
  | 'sacrifice'
  | 'forced-line'
  | 'wide-defense'
  | 'free-material';

export type XiangqiPuzzleDifficulty = {
  /** Rating-scale prior, clamped to [DIFFICULTY_MIN, DIFFICULTY_MAX]. */
  score: number;
  solverPlies: number;
  /** The solver's first move captures nothing. Quiet keys are much harder to
   *  find than a capture that announces itself. */
  quietFirstMove: boolean;
  /** Largest material concession the solver never recovers, in centipawns. */
  sacrificeCp: number;
  /** Value of the piece the key move takes when nothing can recapture it, in
   *  centipawns; 0 when the key move captures nothing or the capture is
   *  answerable. A hanging piece is the easiest thing on a board to see, and
   *  it is also the most uniquely-best move there is, so the miner's gate
   *  admits these with its widest margins. Measured over the served corpus in
   *  September 2026: 27% of mined puzzles open with one, and in 12% the solver
   *  was ALSO already ahead by more than a horse, which is the set where the
   *  puzzle asks nothing at all. */
  freeCaptureCp: number;
  /** Mean legal replies available to the defender across the line. A line the
   *  defender can only answer one way is easier than one that branches. */
  meanDefenderReplies: number;
  /** False when the line could not be replayed (illegal move, truncated
   *  record). Callers should fall back to the depth-only seed. */
  complete: boolean;
  motifs: XiangqiPuzzleMotif[];
};

const MATERIAL_CP: Readonly<Record<XiangqiPieceRole, number>> = {
  general: 20_000,
  chariot: 900,
  cannon: 450,
  horse: 450,
  elephant: 200,
  advisor: 200,
  soldier: 100,
};

export const DIFFICULTY_MIN = 1000;
export const DIFFICULTY_MAX = 2600;

// Depth anchors match seedPuzzleRating so the prior stays on the same scale as
// the Glicko values it seeds; the adjustments below are what add spread.
const DEPTH_BASE: Readonly<Record<number, number>> = { 1: 1300, 2: 1600, 3: 1900 };
const DEPTH_FALLBACK_BASE = 1500;
const DEPTH_FALLBACK_STEP = 300;

// Quiet keys are harder to spot; a capturing key partly announces itself, so
// this is centred rather than a one-sided bonus — otherwise every adjustment
// pushes the prior above its depth base and the scale drifts off Glicko.
const QUIET_FIRST_MOVE_BONUS = 90;
const CAPTURING_FIRST_MOVE_PENALTY = 45;
/** A conceded chariot (900cp) is worth the full bonus; smaller gives less. */
const SACRIFICE_BONUS_MAX = 200;
// One rating point per centipawn of undefended material, capped at a chariot.
// Deliberately steep next to CAPTURING_FIRST_MOVE_PENALTY: an ordinary capture
// merely announces itself, while an unanswerable one removes the search. At a
// four-ply base of 2200 a free chariot lands near the floor, which is where
// "take the hanging piece" belongs however long the forced tail behind it runs.
const FREE_CAPTURE_PENALTY_MAX = 900;
const SACRIFICE_CP_PER_POINT = 4.5;
// Calibrated against the corpus, not intuition: xiangqi defenders have far more
// legal replies than chess ones (measured 14-53 across the seed corpus, median
// ~34). A chess-shaped pivot of 8 saturates the term for every puzzle and adds
// a useless constant.
const REPLY_PIVOT = 34;
const REPLY_ADJUST_PER_MOVE = 4.5;
const REPLY_ADJUST_MAX = 110;

const FORCED_LINE_MAX_REPLIES = 12;
const WIDE_DEFENSE_MIN_REPLIES = 45;
const SACRIFICE_MIN_CP = 200;

export function deriveXiangqiPuzzleDifficulty(puzzle: XiangqiPuzzle): XiangqiPuzzleDifficulty {
  const solverPlies = Math.max(1, Math.ceil(puzzle.solution.length / 2));
  const walk = walkSolution(puzzle);

  const motifs: XiangqiPuzzleMotif[] = [];
  if (walk.quietFirstMove) motifs.push('quiet-move');
  if (walk.sacrificeCp >= SACRIFICE_MIN_CP) motifs.push('sacrifice');
  if (walk.freeCaptureCp > 0) motifs.push('free-material');
  if (walk.replyCounts.length > 0) {
    const maxReplies = Math.max(...walk.replyCounts);
    if (maxReplies <= FORCED_LINE_MAX_REPLIES) motifs.push('forced-line');
    else if (walk.meanDefenderReplies >= WIDE_DEFENSE_MIN_REPLIES) motifs.push('wide-defense');
  }

  let score = depthBase(solverPlies);
  if (walk.complete) {
    score += walk.quietFirstMove ? QUIET_FIRST_MOVE_BONUS : -CAPTURING_FIRST_MOVE_PENALTY;
    // Stacks with the capture penalty rather than replacing it: the move both
    // announces itself AND removes the search.
    score -= Math.min(FREE_CAPTURE_PENALTY_MAX, walk.freeCaptureCp);
    if (walk.sacrificeCp > 0) {
      score += Math.min(SACRIFICE_BONUS_MAX, Math.round(walk.sacrificeCp / SACRIFICE_CP_PER_POINT));
    }
    if (walk.replyCounts.length > 0) {
      const drift = (walk.meanDefenderReplies - REPLY_PIVOT) * REPLY_ADJUST_PER_MOVE;
      score += Math.round(clamp(drift, -REPLY_ADJUST_MAX, REPLY_ADJUST_MAX));
    }
  }

  return {
    score: Math.round(clamp(score, DIFFICULTY_MIN, DIFFICULTY_MAX)),
    solverPlies,
    quietFirstMove: walk.quietFirstMove,
    sacrificeCp: walk.sacrificeCp,
    freeCaptureCp: walk.freeCaptureCp,
    meanDefenderReplies: walk.meanDefenderReplies,
    complete: walk.complete,
    motifs,
  };
}

type SolutionWalk = {
  complete: boolean;
  quietFirstMove: boolean;
  sacrificeCp: number;
  freeCaptureCp: number;
  meanDefenderReplies: number;
  replyCounts: number[];
};

// Replay the line through the real generator. Solver moves sit on even indices,
// the scripted defender reply on odd ones — the same convention the per-variant
// *PuzzleNextMove helpers use.
function walkSolution(puzzle: XiangqiPuzzle): SolutionWalk {
  const first = puzzle.solution[0];
  const quietFirstMove = first !== undefined && puzzle.initial.board[first.to] === undefined;

  let state: XiangqiGameState = puzzle.initial;
  const replyCounts: number[] = [];
  // Squares where the defender took a solver piece, still awaiting recapture.
  let openConcessions: { square: string; valueCp: number }[] = [];
  let sacrificeCp = 0;
  let freeCaptureCp = 0;
  let complete = true;

  for (const [index, move] of puzzle.solution.entries()) {
    const defenderPly = index % 2 === 1;
    if (state.status.type !== 'playing') {
      // The line continues past a terminal position: the record disagrees with
      // the kernel, so the walk is not trustworthy past this point.
      complete = index === puzzle.solution.length;
      break;
    }
    if (defenderPly) replyCounts.push(getLegalMoves(state).length);
    if (!isLegalMove(state, move)) {
      complete = false;
      break;
    }

    const captured = state.board[move.to];
    if (captured) {
      if (defenderPly) {
        openConcessions.push({ square: move.to, valueCp: MATERIAL_CP[captured.role] });
      } else {
        // A solver capture on a conceded square recovers that concession; what
        // it does not cover stays booked as a sacrifice.
        const recoveredCp = MATERIAL_CP[captured.role];
        const remaining: typeof openConcessions = [];
        for (const concession of openConcessions) {
          if (concession.square === move.to) {
            const shortfall = concession.valueCp - recoveredCp;
            if (shortfall > 0) sacrificeCp = Math.max(sacrificeCp, shortfall);
          } else remaining.push(concession);
        }
        openConcessions = remaining;
      }
    }

    state = applyMove(state, move);

    // Is the key move an unanswerable grab? Only the solver's first move, and
    // only while the game is still running: a capture that MATES also leaves
    // the opponent no legal moves, and reading that as "nothing can recapture"
    // would penalise every mating capture in the corpus.
    if (index === 0 && captured && state.status.type === 'playing') {
      const recaptures = getLegalMoves(state).filter((reply) => reply.to === move.to);
      if (recaptures.length === 0) freeCaptureCp = MATERIAL_CP[captured.role];
    }
  }

  // Anything still open at the end of the line was never recovered.
  for (const concession of openConcessions) {
    sacrificeCp = Math.max(sacrificeCp, concession.valueCp);
  }

  const meanDefenderReplies =
    replyCounts.length === 0
      ? 0
      : Math.round((replyCounts.reduce((total, n) => total + n, 0) / replyCounts.length) * 10) / 10;

  return {
    complete,
    quietFirstMove,
    sacrificeCp,
    freeCaptureCp,
    meanDefenderReplies,
    replyCounts,
  };
}

function depthBase(solverPlies: number): number {
  return DEPTH_BASE[solverPlies] ?? DEPTH_FALLBACK_BASE + (solverPlies - 1) * DEPTH_FALLBACK_STEP;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
