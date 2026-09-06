// Practice exercises — a position plus a GOAL, graded by an engine rather than
// matched against a stored solution line.
//
// This is the half of the learning surface that scales without an author. A
// puzzle needs someone to write down `Rc5 Kb6 Rh6#` and is checked by string
// equality; a practice exercise needs only "Red to play and win", because the
// engine plays the defence and the engine says whether you still have the win.
// Everything here is therefore pure arithmetic over evaluations: no move list,
// no variant rules, no board. The engine and the board live at the call site.
//
// Modelled on lila's `modules/practice` (PracticeGoal.scala + the client's
// studyPracticeSuccess.ts), with three deliberate divergences, all forced by
// xiangqi:
//
//   1. No `Promotion` goal — xiangqi soldiers do not promote.
//   2. `EqualIn` is folded into `draw`; "equalise" and "hold the draw" are the
//      same instruction when the reference is a book endgame verdict.
//   3. The move bound is OPTIONAL on every goal. lila's basic-endgame chapters
//      are all short enough to bound; our corpus is book endgame CLASSES, and
//      a chariot grinding down the full four-piece defence is legitimately
//      thirty moves. An unbounded goal is "hold this until the engine agrees",
//      which is the honest form of a book verdict.
//
// WHICH WIN CURVE. Grading happens in win-percentage space, never in raw
// centipawns, and it must use the CALIBRATED curve in analysis.ts
// (`winPercent`), not the steeper constant the puzzle miner carries. See the
// threshold note on `practiceJudgment` — the choice of curve moves every
// threshold underneath it, and only one of the repo's two curves has a
// calibration study behind it.

import { winPercent } from './analysis.js';

// ── Goal ─────────────────────────────────────────────────────────────────────

/**
 * What the learner has to achieve. `moves`, where present, is a bound in FULL
 * moves (the unit a human reads: "mate in 3"), counted from the exercise's
 * start position and measured against the learner's own moves.
 */
export type PracticeGoal =
  | { kind: 'mate'; moves?: number }
  /**
   * Reach at least `centipawns` from the learner's point of view.
   *
   * Note this is a goal about GETTING somewhere, so it suits an exercise that
   * starts level or slightly better. A book endgame position is already past
   * any sane threshold on move one — "chariot beats advisors" means the
   * evaluation is decisive from the start — so the exercise there is to
   * CONVERT, and its goal is `mate`. Setting a `win` goal on an already-won
   * position asks the learner to do nothing.
   */
  | { kind: 'win'; centipawns: number; moves?: number }
  /** Keep the evaluation inside the drawing band (and, if bounded, survive `moves`). */
  | { kind: 'draw'; moves?: number };

/**
 * What "won" means for a `win` goal with no explicit number. A book endgame win
 * in xiangqi is decisive material plus technique; +600 is comfortably past the
 * point where a strong engine converts, and well clear of the ±150 drawing band
 * so the two verdicts can never both fire on one evaluation.
 */
export const PRACTICE_WIN_CP = 600;

/** How close to level still counts as holding a draw. lila uses the same 150. */
export const PRACTICE_DRAW_CP = 150;

const MATE_PATTERN = /^(?:check)?mate(?:\s+in\s+(\d+))?$/i;
const WIN_PATTERN = /^win(?:\s+in\s+(\d+))?$/i;
const DRAW_PATTERN = /^(?:draw|equalise|equalize)(?:\s+in\s+(\d+))?$/i;
const EVAL_PATTERN = /^([+-]?\d+)\s*cp(?:\s+in\s+(\d+))?$/i;

/**
 * Parse an authored goal string. Deliberately forgiving in the same way lila is
 * — the goal is free text an author types beside a position, and the whole
 * point of this surface is that authoring an exercise costs one line.
 *
 * Accepts: `mate`, `mate in 3`, `checkmate in 2`, `win`, `win in 12`, `draw`,
 * `draw in 20`, `equalise`, `+500cp`, `+500cp in 2`, `-800cp in 3`.
 *
 * Returns null on anything else. Callers decide the fallback; a null is NOT
 * silently coerced to `mate` here, because lila's doing exactly that is how 27
 * of its 316 chapters ended up with a goal nobody wrote.
 */
export function parsePracticeGoal(text: string | null | undefined): PracticeGoal | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const mate = MATE_PATTERN.exec(trimmed);
  if (mate) return bounded({ kind: 'mate' }, mate[1]);

  const win = WIN_PATTERN.exec(trimmed);
  if (win) return bounded({ kind: 'win', centipawns: PRACTICE_WIN_CP }, win[1]);

  const draw = DRAW_PATTERN.exec(trimmed);
  if (draw) return bounded({ kind: 'draw' }, draw[1]);

  const evalIn = EVAL_PATTERN.exec(trimmed);
  if (evalIn) {
    const centipawns = Number.parseInt(evalIn[1]!, 10);
    if (!Number.isFinite(centipawns)) return null;
    return bounded({ kind: 'win', centipawns }, evalIn[2]);
  }

  return null;
}

function bounded<G extends PracticeGoal>(goal: G, moves: string | undefined): G | null {
  if (moves === undefined) return goal;
  const parsed = Number.parseInt(moves, 10);
  // "mate in 0" is not a goal anyone can be set; reject rather than accept a
  // bound that fails the learner before they have moved.
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return { ...goal, moves: parsed };
}

/** The goal as a one-line instruction for the learner. */
export function describePracticeGoal(goal: PracticeGoal): string {
  const bound = goal.moves === undefined ? '' : ` in ${goal.moves}`;
  switch (goal.kind) {
    case 'mate':
      return `Checkmate${bound}`;
    case 'win':
      return goal.centipawns === PRACTICE_WIN_CP
        ? `Win${bound}`
        : `Reach +${goal.centipawns}${bound}`;
    case 'draw':
      return goal.moves === undefined ? 'Hold the draw' : `Hold the draw for ${goal.moves} moves`;
  }
}

// ── Grading one move ─────────────────────────────────────────────────────────

export type PracticeVerdict = 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * lila's PRACTICE thresholds, which are NOT its game-analysis thresholds. The
 * distinction is easy to miss and matters:
 *
 *   Advice.scala (post-game blunder detection): 0.10 / 0.20 / 0.30 on a [-1, 1]
 *     winning-chances scale — ported already as `moveJudgment`, 5/10/15 win%
 *     points.
 *   practiceCtrl.ts (this):                     0.025 / 0.06 / 0.14 — roughly
 *     twice as strict, 1.25 / 3 / 7 win% points.
 *
 * Practice is harsher on purpose. Post-game analysis is asking "was this a
 * blunder"; an exercise is asking "did you keep the win", and letting a won
 * endgame slip toward level is exactly the mistake the exercise exists to
 * catch. A move graded `inaccuracy` does not fail the learner (see
 * `practiceMoveFails`), so 3 win% points is the real tolerance.
 *
 * These numbers are lila's, converted to our scale but NOT re-derived against
 * xiangqi data. They sit on the calibrated curve rather than the miner's
 * steeper one, which is the important half; re-deriving them wants solve-rate
 * data this surface does not have yet.
 */
const INACCURACY_DROP = 1.25;
const MISTAKE_DROP = 3;
const BLUNDER_DROP = 7;

/**
 * Grade the learner's move by how much win probability it gave up.
 *
 * Both arguments are win percentages from the LEARNER's point of view —
 * `winPercent(cp, mate)` with the sign already flipped to the learner's side if
 * the engine reported side-to-move. A move that improves the position is
 * always `good`.
 */
export function practiceJudgment(winBefore: number, winAfter: number): PracticeVerdict {
  const drop = winBefore - winAfter;
  if (drop >= BLUNDER_DROP) return 'blunder';
  if (drop >= MISTAKE_DROP) return 'mistake';
  if (drop >= INACCURACY_DROP) return 'inaccuracy';
  return 'good';
}

/**
 * The RESULT CLASS of an evaluation, from the learner's point of view. This is
 * the coarse read the corpus verification uses (decisive at 300, level under
 * 100), and with the NNUE net it separates the basic endgames cleanly: measured
 * over all 32 corpus positions the won ones read 328-1055cp and the drawn ones
 * 0-13cp, so the band between is genuinely "unclear" rather than a coin flip.
 */
export type PracticeClass = 'winning' | 'unclear' | 'level' | 'losing';

/** Centipawns at which the learner's position reads as decisively won or lost. */
export const PRACTICE_DECISIVE_CP = 300;
/** Centipawns inside which the position reads as level. */
export const PRACTICE_LEVEL_CP = 100;

export function practiceClass(cp: number | null, mate: number | null): PracticeClass {
  if (mate !== null) return mate > 0 ? 'winning' : 'losing';
  if (cp === null) return 'unclear';
  if (cp >= PRACTICE_DECISIVE_CP) return 'winning';
  if (cp <= -PRACTICE_DECISIVE_CP) return 'losing';
  if (Math.abs(cp) < PRACTICE_LEVEL_CP) return 'level';
  return 'unclear';
}

/** The class a goal requires the learner to keep. */
export function practiceGoalClass(goal: PracticeGoal): PracticeClass {
  return goal.kind === 'draw' ? 'level' : 'winning';
}

/**
 * Whether the learner's move gave up the exercise, judged on RESULT CLASS
 * rather than on the size of the win% drop.
 *
 * The drop thresholds alone are wrong here in both directions, and both were
 * observed on one line (#363):
 *
 *   FALSE POSITIVE. `winPercent` maps any forced mate to 100, so stepping out
 *     of mate-in-10 into a still-completely-won +456cp reads as a 15.7 point
 *     collapse and fails the learner for playing a slower winning move.
 *   FALSE NEGATIVE. A won position can bleed to level across many moves without
 *     any single move crossing 3 points, which is exactly how a reported attempt
 *     ran 32 plies from mate-in-9 into a dead draw graded "good" throughout.
 *
 * Class answers both: leaving the goal's class fails immediately however small
 * the step, and moving around inside it never fails however large the number
 * moves. The drop verdict stays as the LABEL the learner is shown, because
 * "inaccuracy" is still useful feedback on a move that kept the win.
 */
export function practiceMoveAbandonsGoal(
  goal: PracticeGoal,
  before: { cp: number | null; mate: number | null },
  after: { cp: number | null; mate: number | null },
): boolean {
  const required = practiceGoalClass(goal);
  // An exercise that did not start in its own goal class (an unclear book win,
  // a position the engine has not resolved yet) has no class to leave, so fall
  // back to letting the goal adjudicator decide rather than failing on contact.
  if (practiceClass(before.cp, before.mate) !== required) return false;
  return practiceClass(after.cp, after.mate) !== required;
}

/** Convenience: grade straight from evaluations rather than win percentages. */
export function practiceJudgmentFromEval(
  before: { cp: number | null; mate: number | null },
  after: { cp: number | null; mate: number | null },
): PracticeVerdict {
  return practiceJudgment(winPercent(before.cp, before.mate), winPercent(after.cp, after.mate));
}

/**
 * Whether a verdict ends the attempt. An inaccuracy is survivable; a mistake is
 * not. This is lila's rule and it is the reason the effective tolerance is the
 * MISTAKE threshold, not the inaccuracy one.
 */
export function practiceMoveFails(verdict: PracticeVerdict): boolean {
  return verdict === 'mistake' || verdict === 'blunder';
}

// ── Adjudicating the goal ────────────────────────────────────────────────────

export type PracticeOutcome = 'ongoing' | 'success' | 'failure';

/**
 * How the game itself ended, if it did. A real result always outranks an
 * evaluation: an actual checkmate on the board is not a claim the engine has to
 * agree with.
 */
export type PracticeTermination = 'none' | 'learner-wins' | 'learner-loses' | 'drawn';

export interface PracticeProgress {
  goal: PracticeGoal;
  /** The learner's own moves played so far. */
  movesPlayed: number;
  /** Current evaluation from the LEARNER's point of view. */
  cp: number | null;
  /** Signed moves-to-mate from the LEARNER's point of view (positive = they mate). */
  mate: number | null;
  termination: PracticeTermination;
}

/**
 * Decide whether the exercise is won, lost, or still running.
 *
 * The evaluation is expected to come from a search the caller already trusts —
 * lila gates this on `depth >= 16` and so should we. Feeding a shallow eval in
 * here produces a confident wrong verdict, not an uncertain one.
 */
export function evaluatePracticeGoal(progress: PracticeProgress): PracticeOutcome {
  const { goal, termination } = progress;

  // A finished game short-circuits every evaluation-based test.
  if (termination === 'learner-wins') {
    // Mating is a superset of winning, and of holding a draw.
    return 'success';
  }
  if (termination === 'learner-loses') return 'failure';
  if (termination === 'drawn') return goal.kind === 'draw' ? 'success' : 'failure';

  // Nothing decided on evaluation alone before the learner has moved. The start
  // position is the exercise's PREMISE, not the learner's achievement — and a
  // book endgame win is by definition already winning, so without this guard
  // every "Red to play and win" exercise would complete itself on load.
  if (progress.movesPlayed < 1) return 'ongoing';

  switch (goal.kind) {
    case 'mate':
      return mateOutcome(progress);
    case 'win':
      return winOutcome(progress, goal.centipawns);
    case 'draw':
      return drawOutcome(progress);
  }
}

function mateOutcome(progress: PracticeProgress): PracticeOutcome {
  const { goal, mate, movesPlayed } = progress;
  // Only a delivered mate counts as success; a forced mate the engine can see
  // is not the exercise. The game-over branch above is the only way to win a
  // mate goal, so an unbounded mate goal simply stays 'ongoing' until then.
  if (goal.moves === undefined) return 'ongoing';

  // Bounded: fail the moment the mate provably no longer fits in the budget.
  // `mate` is moves-to-mate from here, so the total is what is already spent
  // plus what remains.
  if (mate === null || mate <= 0) return 'failure';
  return movesPlayed + mate > goal.moves ? 'failure' : 'ongoing';
}

function winOutcome(progress: PracticeProgress, centipawns: number): PracticeOutcome {
  const { goal, cp, mate, movesPlayed } = progress;
  const reached = mate !== null ? mate > 0 : cp !== null && cp >= centipawns;
  if (reached) return 'success';
  if (goal.moves !== undefined && movesPlayed >= goal.moves) return 'failure';
  return 'ongoing';
}

function drawOutcome(progress: PracticeProgress): PracticeOutcome {
  const { goal, cp, mate, movesPlayed } = progress;
  // A forced mate either way means the draw is gone.
  if (mate !== null) return 'failure';
  const level = cp !== null && Math.abs(cp) < PRACTICE_DRAW_CP;
  if (!level) return 'failure';
  // Unbounded: holding level is the whole exercise, so it never self-completes;
  // the caller ends it (the position repeats, the material is bare, the learner
  // stops). Bounded: survive the move budget at level and it is held.
  if (goal.moves === undefined) return 'ongoing';
  return movesPlayed >= goal.moves ? 'success' : 'ongoing';
}
