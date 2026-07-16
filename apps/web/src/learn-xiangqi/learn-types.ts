// Xiangqi Learn — level/stage schema. A direct port of lila's ui/learn level
// model (stage/list.ts) adapted to the xiangqi kernels: FEN fragments, apples
// on intersections, scripted opponent scenarios, assert predicates, and the
// lichess 50/500-300-100 scoring shape. Levels are pure declarative data; the
// runtime lives in learn-level-runner.ts.

import type { XiangqiColor, XiangqiGameState, XiangqiMove, XiangqiSquare } from '@mistboard/game';

// ── Shapes (board annotations drawn at level start / per scenario step) ─────

export type LearnBrush = 'green' | 'red' | 'yellow' | 'blue';

export type LearnShape =
  | { kind: 'arrow'; from: XiangqiSquare; to: XiangqiSquare; brush?: LearnBrush }
  | { kind: 'circle'; square: XiangqiSquare; brush?: LearnBrush };

export const arrow = (from: XiangqiSquare, to: XiangqiSquare, brush?: LearnBrush): LearnShape => ({
  kind: 'arrow',
  from,
  to,
  brush,
});

export const circle = (square: XiangqiSquare, brush?: LearnBrush): LearnShape => ({
  kind: 'circle',
  square,
  brush,
});

// ── Scenario (scripted move sequence from the level-start position) ─────────
// Steps are consumed strictly in turn order. A step on the player's turn is
// the ONLY accepted player move; a step on the opponent's turn auto-plays
// (after a beat), optionally annotating the board.

export type ScenarioStep = { move: XiangqiMove; shapes?: LearnShape[] };
export type ScenarioLevel = (XiangqiMove | ScenarioStep)[];

// ── Assert predicates ────────────────────────────────────────────────────────

export interface AssertData {
  /** Truth state AFTER the latest move (player or scripted opponent). */
  state: XiangqiGameState;
  /** The student's color. Load-bearing for the check asserts: on keepTurn
   *  (frozen-opponent) levels `state.status.turn` stays on the player, so
   *  asserts must read the player color here rather than the state turn to
   *  ask "did the PLAYER check the opponent" instead of the reverse. */
  playerColor: XiangqiColor;
  /** Remaining apples. */
  items: ReadonlySet<XiangqiSquare>;
  vm: {
    moves: number;
    /** The player's latest move, if any. */
    lastPlayerMove: XiangqiMove | null;
    scenarioComplete: boolean;
    scenarioFailed: boolean;
  };
}

export type LearnAssert = (data: AssertData) => boolean;

// ── Intent (machine-checked craft contract) ──────────────────────────────────

/** Declares what makes a one-move level a PUZZLE rather than an exercise, and
 *  lets the CI verifier prove it. Only allowed on levels with nbMoves 1 and
 *  neither apples nor a scenario: the verifier enumerates every legal first
 *  move through the exact runner pipeline (capture-threat scan, failure
 *  assert, success assert) and enforces these counts. */
export interface LearnIntent {
  /** Exactly this many legal first moves complete the level through the full
   *  pipeline. Almost always 1: the puzzle has one right answer. */
  solutions: number;
  /** At least `min` legal first moves satisfy `assert` on the raw post-move
   *  position, BEFORE the capture-threat and failure gates: the tempting
   *  candidates the student must choose among (e.g. all checking moves on a
   *  find-the-safe-check level). Solutions count toward the minimum. */
  candidates?: { assert: LearnAssert; min: number };
}

// ── Level ────────────────────────────────────────────────────────────────────

/** Which movegen drives the level. 'relaxed' = geometry only (FoW kernel
 *  pseudoDests: tolerates general-less fragments, allows self-check — the
 *  lila "Antichess movegen" trick). 'strict' = the check-aware standard
 *  kernel (both generals must be present; checkmate/stalemate detected). */
export type LearnRulesMode = 'relaxed' | 'strict';

export interface LearnLevelBase {
  /** Copy key into learn copy table (goal instruction, shown in the side panel). */
  goal: string;
  /** Xiangqi FEN placement + side to move, e.g. '9/9/9/9/9/9/9/9/4R4/9 w'.
   *  Rows rank 10 → rank 1; uppercase = red, lowercase = black;
   *  letters K/A/B(E)/N(H)/R/C/P per elephantops. */
  fen: string;
  /** Par move count: finishing within it earns the 500-point (3-star) bonus. */
  nbMoves: number;

  /** Apples: space-separated intersections ('c5 g5') the player must collect. */
  apples?: string;
  /** Custom success predicate. Default: all apples collected. */
  success?: LearnAssert;
  /** Custom failure predicate, checked after every move. */
  failure?: LearnAssert;
  /** Scripted move sequence (see ScenarioLevel). */
  scenario?: ScenarioLevel;
  /** Annotations drawn at level start. */
  shapes?: LearnShape[];

  /** Expected captures (feeds the level max score when pointsForCapture). */
  captures?: number;
  /** Extra CSS class on the board container (e.g. 'learn-highlight-palace'). */
  cssClass?: string;
  /** Track apples as bare markers instead of materializing capturable pieces
   *  (general/soldier stages, where phantom soldiers would distort legality). */
  emptyApples?: boolean;
  /** Require an explicit Next click instead of auto-advancing on success. */
  nextButton?: boolean;
  /** Score captures (+50 each, or piece value when showPieceValues). */
  pointsForCapture?: boolean;
  /** Score captures by xiangqi piece value instead of flat 50. */
  showPieceValues?: boolean;
  /** After a failure, the opponent plays one move to show the consequence. */
  showFailureFollowUp?: boolean;
  /** Space-separated from-to pairs ('g1e1 e9e5 ...') proving the level is
   *  solvable: the CI verifier replays this line through the runner pipeline
   *  (scenario steps, capture-threat scan, failure/success asserts) and
   *  requires it to complete in exactly nbMoves player moves. REQUIRED for
   *  levels with neither apples (BFS-proven) nor a scenario (walk-proven). */
  sampleSolution?: string;
  /** Craft contract for one-move puzzles: the verifier enumerates every legal
   *  first move and enforces the declared solution/candidate counts. */
  intent?: LearnIntent;
}

export interface LearnLevelDefaults {
  /** 1-based index within the stage. */
  id: number;
  /** Player color, derived from the FEN side-to-move unless the level starts
   *  with a scripted opponent move (then it's the other color). */
  color: XiangqiColor;
  /** Auto-fail when the opponent could capture the player's just-moved piece:
   *  'unprotected' = only when the player couldn't recapture; true = any
   *  capture; false = never. Default (lila parity): false when the level has
   *  apples, 'unprotected' otherwise. */
  detectCapture: 'unprotected' | boolean;
  /** Movegen mode. Default: 'relaxed'. Check/mate stages opt into 'strict'. */
  rules: LearnRulesMode;
  /** Keep it the player's turn after their move (apple levels). Default: true
   *  when there is no scenario, false when a scenario scripts the opponent. */
  keepTurn: boolean;
  /** Scenario craft contract: every scripted opponent reply must be the
   *  opponent's ONLY legal move, so the demonstrated line is forced, not
   *  cooperative (a "mate in 2" claim that black could have dodged is a
   *  false claim). Verifier-enforced. Default: true for scenario levels.
   *  Set false ONLY on demo scenarios whose copy frames the opponent's move
   *  as a choice or a blunder, never on a forced-sequence claim. */
  forcedReplies: boolean;
}

export type LearnLevel = LearnLevelBase & LearnLevelDefaults;
export type LearnLevelPartial = LearnLevelBase & Partial<LearnLevelDefaults>;

// ── Stage / category ─────────────────────────────────────────────────────────

export interface LearnStage {
  id: number;
  key: string;
  /** Copy keys. */
  title: string;
  subtitle: string;
  intro: string;
  complete: string;
  /** Emoji-or-piece illustration hook for the map tile / overlays (v1: a
   *  piece role name rendered with renderXiangqiPiece, or a literal glyph). */
  illustration: { piece?: string; glyph?: string };
  /** This stage's copy strings ('learn.xiangqi.<stage>.*' keys). Stage files
   *  own their copy so parallel authoring never touches a shared table;
   *  learn-copy.ts merges every registered stage's entries at load. */
  copy: Record<string, string>;
  levels: LearnLevel[];
  cssClass?: string;
}

export interface LearnCategory {
  key: string;
  /** Copy key. */
  name: string;
  stages: LearnStage[];
}

// ── Helpers (lila util.toLevel parity) ───────────────────────────────────────

export function fenColor(fen: string): XiangqiColor {
  return fen.split(' ')[1] === 'b' ? 'black' : 'red';
}

export function readApples(apples: string | undefined): XiangqiSquare[] {
  if (!apples) return [];
  return apples.split(' ').filter(Boolean) as XiangqiSquare[];
}

export function toLevel(partial: LearnLevelPartial, index: number): LearnLevel {
  // color defaults to the FEN side-to-move; opponent-first scenario levels
  // (FEN gives the opponent the move) set `color` explicitly and the spread
  // below keeps that override (lila parity).
  return {
    id: index + 1,
    color: fenColor(partial.fen),
    detectCapture: partial.apples ? false : 'unprotected',
    rules: 'relaxed',
    keepTurn: !partial.scenario,
    forcedReplies: Boolean(partial.scenario),
    ...partial,
  };
}

export function toStage(
  stage: Omit<LearnStage, 'id' | 'levels'> & { levels: LearnLevelPartial[] },
  id: number,
): LearnStage {
  return { ...stage, id, levels: stage.levels.map(toLevel) };
}
