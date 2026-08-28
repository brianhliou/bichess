// Whole-game postgame analysis for xiangqi (P3.2). Evaluates every position of a
// finished game so the client can draw the advantage chart, mark move judgments,
// and score accuracy. Orchestration only — the eval work is Pikafish (Red POV),
// run through the shared sweep walker (game-analysis-sweep). The real path opens
// ONE persistent engine process per sweep (#168): spawn + NNUE net load happen
// once, then each ply is an incremental `position startpos moves …` prefix with
// a fixed NODE budget (`go nodes N`), so the eval is CPU-independent, uniform
// per position, and several-fold faster than the old spawn-per-ply depth sweep.

import type { AnalysisProgressStore } from './game-analysis-kernel.js';
import { sweepPlyEvals } from './game-analysis-sweep.js';
import { withXiangqiAnalysisSession, type XiangqiPositionEval } from './xiangqi-pikafish-engine.js';

// Version of the ANALYSIS configuration (binary + net + the Red-POV sweep),
// independent of the PvE ladder's XIANGQI_ENGINE_VERSION. Bump whenever the
// analysis output would change so stored evals invalidate.
// @2 (2026-07-16, #168): the sweep budget moved from `go depth 12` to
// `go nodes 1_000_000` on a persistent process. A node-budget eval has
// different semantics than depth-12 (deeper in quiet positions, no depth-parity
// sawtooth), so @1 rows must NOT be served as if comparable — the id bump
// orphans them deliberately instead of silently mixing cache semantics.
// @3 (2026-08-27): every @2 row is WRONG, not merely differently-scaled. The UCI
// reader took the last scored `info` line, which under a node budget is the
// fail-high/fail-low line of the ABORTED final iteration — a bound score with a
// one-move pv. Measured over a 156-ply game: 38% of positions carried a
// truncated pv, evals were off by up to 163cp, and a real blunder was graded an
// inaccuracy. Fixed in uci-engine-harness (prefer the last COMPLETE iteration);
// this bump orphans the corrupted rows so they recompute on demand.
export const XIANGQI_ANALYSIS_ENGINE_VERSION = 3;

// Cache engine id, version-suffixed so an engine/config change invalidates stored
// evals (the sibling pattern: JIEQI/BANQI/JUNGLE_ANALYSIS_ENGINE_ID). Xiangqi
// analyses were historically cached under the PvE bot id (XIANGQI_DEFAULT_ENGINE_ID),
// so the 2026-07-10 ladder rename ('pikafish-xiangqi-strong' -> 'pikafish-xiangqi-
// level-5') silently orphaned every cached row; migration 104 maps both old ids
// onto this dedicated id (at @1; @2 recomputes on demand).
export const XIANGQI_ANALYSIS_ENGINE_ID = `pikafish-xiangqi-analysis@${XIANGQI_ANALYSIS_ENGINE_VERSION}`;

export type PlyEval = {
  /** Position AFTER this many plies (0 = start position). */
  ply: number;
  /** Centipawns from Red's POV; null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from Red's POV; null otherwise. */
  mate: number | null;
  /** Engine best move at this position (engine UCI). */
  best: string | null;
  /** Principal variation at this position (engine UCI, capped) — the review's
   *  inline best-play line at judged moves. Absent on pre-PV cached rows. */
  pv?: string[];
};

export type AnalyzeXiangqiGameOptions = {
  /** Depth handed to an INJECTED evaluate (tests / depth-based fallback). The
   *  real node-budget session path ignores it — nodes are the strength dial. */
  depth?: number;
  /** Node budget per position for the real sweep (default XIANGQI_ANALYSIS_NODES). */
  nodes?: number;
  /** Injectable for tests; defaults to the persistent-session Pikafish sweep. */
  evaluate?: (moves: string[], opts: { depth?: number }) => Promise<XiangqiPositionEval>;
  /** Incremental-checkpoint store: the sweep saves after every evaluated ply and
   *  resumes from the last checkpoint (persist expensive output incrementally). */
  progress?: AnalysisProgressStore<PlyEval>;
};

/**
 * Evaluate positions after 0, 1, … N plies (N+1 points) and return the Red-POV
 * series. `movesUci` is the game's move history in Pikafish UCI (the caller builds
 * it from the timeline via xiangqiMoveToPikafishUci). With an injected `evaluate`
 * this is a plain prefix walk (the shared sweep); the default path runs the walk
 * against one persistent engine session at the analysis node budget.
 */
export async function analyzeXiangqiGame(
  movesUci: readonly string[],
  opts: AnalyzeXiangqiGameOptions = {},
): Promise<PlyEval[]> {
  const injected = opts.evaluate;
  if (injected) {
    const depth = opts.depth ?? XIANGQI_ANALYSIS_DEPTH_FALLBACK;
    return await sweepPlyEvals(movesUci, (moves, o) => injected(moves, o), depth, opts.progress);
  }
  return await withXiangqiAnalysisSession(
    // The session evaluator carries the node budget internally; the sweep's depth
    // argument is the nominal cache dimension and is not a search limit here.
    (evaluate) => sweepPlyEvals(movesUci, (moves) => evaluate(moves), 0, opts.progress),
    { nodes: opts.nodes },
  );
}

// Depth handed to an injected evaluate when none is specified. Kept at the old
// request-depth default so the injectable (test) contract is unchanged.
const XIANGQI_ANALYSIS_DEPTH_FALLBACK = 12;
