// Client side of postgame computer analysis (P3.5): POST the request, then turn
// the server's per-ply eval series into everything the UI shows — the advantage
// chart data, per-move judgments (glyphs), and per-player accuracy / ACPL. The
// win%/accuracy/judgment math is the shared, unit-tested code in @mistboard/game.
import {
  accuracyPercent,
  gameAccuracy,
  type MoveJudgment,
  moveJudgment,
  winPercent,
} from '@mistboard/game';
import { postAnalysisJob } from './analysis-job-poll.js';

/** One eval point from the server: position AFTER `ply` plies, from Red's POV. */
export type PlyEval = {
  ply: number;
  cp: number | null;
  mate: number | null;
  best: string | null;
};

export type XiangqiGameAnalysisResponse = {
  engineId: string;
  depth: number;
  plies: PlyEval[];
  /** Plies whose move was a CHANCE move (a flip, in banqi/jungle-flip): the eval swing there
   *  mixes decision quality with the random reveal, so we can't yet attribute it to the player.
   *  Such moves are left UNJUDGED (no glyph, no "was best", not counted) until the engine can
   *  report per-move expected values (decision-vs-luck decomposition). Empty/absent for
   *  deterministic variants (xiangqi/jungle). */
  chancePlies?: number[];
};

export type MoveAnalysis = {
  /** Ply this move lands on (1..N). */
  ply: number;
  mover: 'red' | 'black';
  judgment: MoveJudgment;
  /** This move's accuracy in [0, 100]. */
  accuracy: number;
};

export type PlayerAnalysis = {
  accuracy: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  /** Average centipawn loss. */
  acpl: number;
};

export type GameAnalysis = {
  engineId: string;
  depth: number;
  /** Red-POV eval per ply cursor (0..N). */
  evals: PlyEval[];
  moves: MoveAnalysis[];
  /** 1-based plies whose move was a chance (reveal) move — left unjudged here; graded luck-free by
   *  the decision decomposition (see mergeDecisionAnalysis). Empty for deterministic variants. */
  chancePlies: number[];
  red: PlayerAnalysis;
  black: PlayerAnalysis;
};

/** Lichess-style move glyph for a judgment: ?! inaccuracy, ? mistake, ?? blunder.
 *  Returns null for a fine move (no glyph). `suffixClass` matches the
 *  .review-move--<class> colour hooks in move-list.css. */
export function judgmentGlyph(
  judgment: MoveJudgment,
): { suffix: string; suffixClass: string } | null {
  switch (judgment) {
    case 'blunder':
      return { suffix: '??', suffixClass: 'blunder' };
    case 'mistake':
      return { suffix: '?', suffixClass: 'mistake' };
    case 'inaccuracy':
      return { suffix: '?!', suffixClass: 'inaccuracy' };
    default:
      return null;
  }
}

const ACPL_CAP = 1000;

/** Centipawns from a side's POV, capped so a decisive eval / mate can't blow up ACPL. */
function moverCp(cpRed: number | null, mate: number | null, mover: 'red' | 'black'): number {
  const sign = mover === 'red' ? 1 : -1;
  if (mate != null) return mate * sign >= 0 ? ACPL_CAP : -ACPL_CAP;
  return sign * Math.max(-ACPL_CAP, Math.min(ACPL_CAP, cpRed ?? 0));
}

/** Turn the Red-POV eval series into per-move judgments + per-player aggregates. */
export function computeGameAnalysis(response: XiangqiGameAnalysisResponse): GameAnalysis {
  const evals = [...response.plies].sort((a, b) => a.ply - b.ply);
  const moves: MoveAnalysis[] = [];
  const redWinPercents = evals.map((entry) => winPercent(entry.cp, entry.mate));
  // CHANCE moves (flips) are left unjudged: their eval swing conflates decision quality with
  // the random reveal, so grading them on outcome would blame the player for variance. Until
  // the engine reports per-move expected values, we neither glyph nor count them.
  const chancePlies = new Set(response.chancePlies ?? []);
  const acc: Record<'red' | 'black', { losses: number[]; i: number; m: number; b: number }> = {
    red: { losses: [], i: 0, m: 0, b: 0 },
    black: { losses: [], i: 0, m: 0, b: 0 },
  };

  for (let ply = 1; ply < evals.length; ply += 1) {
    const before = evals[ply - 1]!;
    const after = evals[ply]!;
    const mover: 'red' | 'black' = ply % 2 === 1 ? 'red' : 'black';
    // Win% from the mover's POV: Red POV as-is, Black POV is its complement.
    const redBefore = redWinPercents[ply - 1]!;
    const redAfter = redWinPercents[ply]!;
    const winBefore = mover === 'red' ? redBefore : 100 - redBefore;
    const winAfter = mover === 'red' ? redAfter : 100 - redAfter;
    const isChance = chancePlies.has(ply);
    const judgment = isChance ? null : moveJudgment(winBefore, winAfter);
    const accuracy = accuracyPercent(winBefore, winAfter);
    moves.push({ ply, mover, judgment, accuracy });

    // A chance move doesn't contribute to a player's mistake counts or ACPL — we can't say the
    // swing was their fault (or credit).
    if (isChance) continue;
    const bucket = acc[mover];
    bucket.losses.push(
      Math.max(0, moverCp(before.cp, before.mate, mover) - moverCp(after.cp, after.mate, mover)),
    );
    if (judgment === 'inaccuracy') bucket.i += 1;
    else if (judgment === 'mistake') bucket.m += 1;
    else if (judgment === 'blunder') bucket.b += 1;
  }

  // Whole-game accuracy is lila's volatility-weighted + harmonic blend — NOT a
  // plain mean of per-move accuracies (which reads flatteringly high). CHANCE (reveal) plies are
  // dropped here so this base grades only the moves a player fully controls — a reveal's swing is
  // luck. For chance variants this base is provisional: mergeDecisionAnalysis re-grades the reveals
  // luck-free once the decomposition loads. Empty map for deterministic variants (unchanged).
  const accuracies = gameAccuracy(
    redWinPercents,
    chancePlies.size ? new Map([...chancePlies].map((ply) => [ply, null])) : undefined,
  );

  const summarize = (side: 'red' | 'black'): PlayerAnalysis => {
    const b = acc[side];
    return {
      accuracy: side === 'red' ? accuracies.first : accuracies.second,
      inaccuracies: b.i,
      mistakes: b.m,
      blunders: b.b,
      acpl: Math.round(mean(b.losses)),
    };
  };

  return {
    engineId: response.engineId,
    depth: response.depth,
    evals,
    moves,
    chancePlies: [...chancePlies].sort((a, b) => a - b),
    red: summarize('red'),
    black: summarize('black'),
  };
}

/** A reveal ply's luck-free decision grade, from the decomposition (see review/jieqi-decisions). */
export type PlyDecision = {
  /** Accuracy in [0, 100] of the CHOICE (best-vs-played pool means), luck stripped. */
  accuracy: number;
  /** Judgment of the choice (?!/?/??), already deadband-guarded. null = a fine choice. */
  judgment: MoveJudgment;
};

/**
 * Fold the decision-vs-luck decomposition into the headline per-player analysis for a chance
 * variant (jieqi). The base computeGameAnalysis leaves reveal plies unjudged (their realized swing
 * is luck); here we grade EVERY move luck-free — reveals via their pool-mean decision grade, quiet
 * moves via the realized swing — so the accuracy and the inaccuracy/mistake/blunder counts finally
 * reflect how the player actually chose. ACPL is intentionally dropped (centipawn loss can't be
 * luck-stripped and reads as noise here). A reveal with no decision entry is left ungraded.
 */
export function mergeDecisionAnalysis(
  analysis: GameAnalysis,
  decisionByPly: ReadonlyMap<number, PlyDecision>,
): { red: PlayerAnalysis; black: PlayerAnalysis } {
  const redWinPercents = analysis.evals.map((e) => winPercent(e.cp, e.mate));
  const chance = new Set(analysis.chancePlies);
  const override = new Map<number, number | null>();
  const counts: Record<'red' | 'black', { i: number; m: number; b: number }> = {
    red: { i: 0, m: 0, b: 0 },
    black: { i: 0, m: 0, b: 0 },
  };
  const bump = (side: 'red' | 'black', judgment: MoveJudgment): void => {
    if (judgment === 'inaccuracy') counts[side].i += 1;
    else if (judgment === 'mistake') counts[side].m += 1;
    else if (judgment === 'blunder') counts[side].b += 1;
  };
  for (const move of analysis.moves) {
    if (chance.has(move.ply)) {
      const decision = decisionByPly.get(move.ply);
      if (!decision) {
        override.set(move.ply, null); // a reveal we couldn't decompose — leave it ungraded
        continue;
      }
      override.set(move.ply, decision.accuracy);
      bump(move.mover, decision.judgment);
    } else {
      // Quiet (fully-controlled) move: its realized judgment already stands.
      bump(move.mover, move.judgment);
    }
  }
  const accuracies = gameAccuracy(redWinPercents, override);
  const build = (side: 'red' | 'black', accuracy: number): PlayerAnalysis => ({
    accuracy,
    inaccuracies: counts[side].i,
    mistakes: counts[side].m,
    blunders: counts[side].b,
    acpl: 0, // not shown for chance variants (see AnalysisSummaryOptions.hideAcpl)
  });
  return { red: build('red', accuracies.first), black: build('black', accuracies.second) };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// The analysis endpoint is per-variant (`/api/<variant>/games/:id/analysis`); the
// wire shape + all derived-view math are variant-neutral, so only the URL segment
// differs. Callers pass the game-spec route id ('xiangqi', 'fortress-xiangqi', …).
function analysisUrl(variant: string, roomId: string): string {
  return new URL(
    `/api/${variant}/games/${encodeURIComponent(roomId)}/analysis`,
    window.location.href,
  ).pathname;
}

/** POST the analysis request for a finished game and compute the derived view.
 *  A cached game answers immediately (200); otherwise the server enqueues a
 *  background job (202) and this polls it to completion (see analysis-job-poll). */
export async function requestGameAnalysis(variant: string, roomId: string): Promise<GameAnalysis> {
  const body = await postAnalysisJob<XiangqiGameAnalysisResponse>(analysisUrl(variant, roomId));
  return computeGameAnalysis(body);
}

/** GET the already-cached analysis, or null if it hasn't been computed yet (204).
 *  Never triggers an engine pass, so the postgame can auto-load on open. */
export async function fetchCachedGameAnalysis(
  variant: string,
  roomId: string,
): Promise<GameAnalysis | null> {
  const response = await fetch(analysisUrl(variant, roomId), { method: 'GET' });
  if (response.status === 204 || !response.ok) return null;
  return computeGameAnalysis((await response.json()) as XiangqiGameAnalysisResponse);
}
