/**
 * Fog chess decision layer — the ranked alternatives block.
 *
 * Under fog a principal variation is undefined: a move leads to a
 * distribution over the opponent's real position, so "and then the best reply
 * is…" has no single answer. The honest analogue of lichess's alternatives
 * block is therefore the ranked candidate SET the engine actually scored, best
 * first, with the played move marked — the same contract the chance variants
 * (jieqi, banqi, jungle-flip) settled on 2026-08-22. Do not try to make Misty
 * emit a longer PV.
 *
 * Cheaper than the jieqi equivalent, and deliberately so: jieqi runs a second
 * expensive pass to true-baseline its candidates, whereas Misty's per-ply solve
 * already produces `action_values_at_root` for EVERY root move. The analyzer
 * keeps the top few (engine-side CANDIDATE_SET_SIZE); this module only projects
 * what is already in the cached analysis row. There is no second cache row and
 * no second job — a game with analysis has decisions for free.
 *
 * Units: Misty's action values are GT-CFR expected values in [-1, 1] (win = +1).
 * The review contract speaks win%, so they are mapped once, here, at the
 * boundary. This is NOT a centipawn->win curve and must not be conflated with
 * one; there are already two of those in the tree with different calibrations.
 */

import {
  type DarkChessAnalysisCache,
  type DarkChessAnalysisPublication,
  type DarkChessGameAnalysis,
  type MistySeatAnalysis,
  resolveDarkChessAnalysis,
} from './dark-chess-analysis.js';

/** One ranked alternative from the solve, in win% (mover POV). */
export type DarkChessDecisionCandidate = {
  /** Root move in plain chess UCI ("e2d3"); formatted for display at the web seam. */
  move: string;
  /** Misty's belief-relative value for this move, as win%. */
  win: number;
  /** True when this is the move actually played. */
  played?: boolean;
};

/** One analyzed ply's decision view. Every fog ply is played under uncertainty,
 *  so unlike jieqi (where only reveals are chance plies) every analyzed ply of a
 *  seat gets one. */
export type DarkChessDecision = {
  ply: number;
  mover: 'white' | 'black';
  /** Best available move's value — the decision ceiling. */
  bestWin: number;
  /** The played move's value, in the same units. */
  playedWin: number;
  /** Rank of the played move over ALL root moves (1 = it was the engine's top). */
  playedRank: number | null;
  /** Ranked alternatives, best first, played move marked. Absent on rows cached
   *  before the analyzer kept them; consumers degrade to the rank alone. */
  candidates?: DarkChessDecisionCandidate[];
  /**
   * The fog error class for this ply, when the analyzer assigned one. This is
   * fog's luck axis and it is CATEGORICAL, not a scalar: `belief_lost_truth`
   * (the observation history never contained the truth), `sample_error` (truth
   * was in the belief set but not in the sampled subgame), `decision_error`
   * (the truth was in hand and the move was still wrong). Carried through, not
   * yet rendered.
   */
  verdict?: string;
  /** Size of the mover's belief set at this ply. */
  beliefSize?: number;
  /** Truth membership: in the belief set, and in the sampled subgame. */
  truthInBelief?: boolean;
  truthInSample?: boolean;
};

export type DarkChessDecisionsResult = {
  engineId: string;
  depth: number;
  decisions: DarkChessDecision[];
};

/** GT-CFR expected value in [-1, 1] -> win%. Clamped: a mate-ish value can sit a
 *  hair outside the range, and a win% above 100 would poison the accuracy curve. */
function valueToWin(value: number): number {
  const win = ((value + 1) / 2) * 100;
  return Math.max(0, Math.min(100, win));
}

type SearchBlock = {
  engine_top?: string;
  top_value?: number;
  played_value?: number;
  played_rank?: number;
  candidates?: Array<{ move: string; value: number; played?: boolean }>;
};

type BeliefBlock = { size?: number; truth_in_p?: boolean; truth_in_i?: boolean };

function decisionsForSeat(
  seat: MistySeatAnalysis | undefined,
  mover: 'white' | 'black',
): DarkChessDecision[] {
  if (!seat?.rows) return [];
  const out: DarkChessDecision[] = [];
  for (const row of seat.rows) {
    const search = row.search as SearchBlock | undefined;
    const ply = row.ply as number | undefined;
    // No solve at this ply (the analyzer ran without search, or the ply was
    // skipped) -> nothing to rank, so no decision row rather than a fake one.
    if (typeof ply !== 'number' || !search || typeof search.top_value !== 'number') continue;
    if (typeof search.played_value !== 'number') continue;
    const belief = row.belief as BeliefBlock | undefined;
    const candidates = search.candidates?.map((c) => ({
      move: c.move,
      win: valueToWin(c.value),
      ...(c.played ? { played: true as const } : {}),
    }));
    out.push({
      ply,
      mover,
      bestWin: valueToWin(search.top_value),
      playedWin: valueToWin(search.played_value),
      playedRank: typeof search.played_rank === 'number' ? search.played_rank : null,
      ...(candidates?.length ? { candidates } : {}),
      ...(typeof row.verdict === 'string' ? { verdict: row.verdict } : {}),
      ...(typeof belief?.size === 'number' ? { beliefSize: belief.size } : {}),
      ...(typeof belief?.truth_in_p === 'boolean' ? { truthInBelief: belief.truth_in_p } : {}),
      ...(typeof belief?.truth_in_i === 'boolean' ? { truthInSample: belief.truth_in_i } : {}),
    });
  }
  return out;
}

/**
 * Project the cached whole-game analysis into the decision layer. Rides the
 * analysis cache entirely — `computeIfMissing=false` is a pure cache read, so a
 * miss means the analysis itself has not been requested yet and the route
 * answers 204.
 */
export async function resolveDarkChessDecisions(
  roomId: string,
  publication: DarkChessAnalysisPublication,
  computeIfMissing = true,
  /** Test seams, passed straight through to the analysis resolver — decisions own
   *  no cache of their own, so injecting one here is injecting the analysis's. */
  cache?: DarkChessAnalysisCache,
  compute?: (publication: DarkChessAnalysisPublication) => Promise<DarkChessGameAnalysis>,
): Promise<DarkChessDecisionsResult | null> {
  const analysis = await resolveDarkChessAnalysis(
    roomId,
    publication,
    cache,
    compute,
    computeIfMissing,
  );
  if (!analysis) return null;
  const decisions = [
    ...decisionsForSeat(analysis.seats.white, 'white'),
    ...decisionsForSeat(analysis.seats.black, 'black'),
  ].sort((a, b) => a.ply - b.ply);
  return { engineId: analysis.engineId, depth: analysis.depth, decisions };
}
