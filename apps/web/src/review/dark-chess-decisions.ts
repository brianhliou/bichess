// Client side of the fog chess decision layer. The server projects Misty's own per-ply solve
// into win% (mover POV): the best available move, the played move, its rank over all root
// moves, and the ranked alternatives. Here we turn those into display numbers — a decision
// quality glyph plus the alternatives block.
//
// Fog differs from the other chance variants in one way that matters: its luck axis is
// CATEGORICAL (the belief/sample/decision verdict), not a scalar swing, so no luck number is
// emitted. See the `luck` note on DecisionMoveInfo.
//
// Counterpart to game-analysis.ts; kept separate as the opt-in tier, mirroring
// review/jieqi-decisions.ts.
import { accuracyPercent, type MoveJudgment, moveJudgment } from '@mistboard/game';
import { postAnalysisJob } from './analysis-job-poll.js';

/** One ranked alternative, win% mover POV (mirrors the server shape). */
export type DarkChessDecisionCandidate = {
  move: string;
  win: number;
  played?: boolean;
};

/** One analyzed ply's decomposition, win% from the MOVER's POV. */
export type DarkChessDecision = {
  ply: number;
  mover: 'white' | 'black';
  bestWin: number;
  playedWin: number;
  playedRank: number | null;
  candidates?: DarkChessDecisionCandidate[];
  /** Fog error class: belief_lost_truth | sample_error | decision_error. */
  verdict?: string;
  beliefSize?: number;
  truthInBelief?: boolean;
  truthInSample?: boolean;
};

export type DarkChessDecisionsResponse = {
  engineId: string;
  depth: number;
  decisions: DarkChessDecision[];
};

// Deadband in WIN POINTS. Misty's root values cluster tightly in quiet positions, so a decision
// loss under this floor is solve noise rather than a real mistake — leave it unjudged. Same
// discipline as the jieqi deadband, in the same units.
const DECISION_NOISE_WINPCT = 5;

export type DecisionView = {
  ply: number;
  mover: 'white' | 'black';
  /** Decision-quality glyph from the win% the CHOICE gave up (null = fine, or within noise). */
  judgment: MoveJudgment;
  /** Win% the choice gave up vs the best move (>= 0). */
  decisionLoss: number;
  /** Per-decision accuracy in [0, 100] (lila's win%-drop curve, best -> played). */
  accuracy: number;
  playedRank: number | null;
  candidates?: DarkChessDecisionCandidate[];
  verdict?: string;
};

// A note on `truthInSample`, because it is tempting to gate grading on it and that
// is WRONG. It records whether this solve's root draw happened to include the
// position that actually existed — a findability diagnostic, not a validity check.
// Misty plays the same way: it samples roots from a belief reaching seven figures
// and its sample usually excludes the truth too. Reasoning over a sample of
// consistent worlds IS the architecture, and the player did not have the truth
// either. "Best across 200 worlds consistent with what you observed" is a real
// statement about a decision under uncertainty. `truthInSample` earns its place
// explaining WHY a graded mistake happened (sample_error), never deciding whether
// a grade may exist. Sampling noise is handled by the deadband below.
export function decisionView(d: DarkChessDecision): DecisionView {
  const decisionLoss = Math.max(0, d.bestWin - d.playedWin);
  const judgment =
    decisionLoss < DECISION_NOISE_WINPCT ? null : moveJudgment(d.bestWin, d.playedWin);
  return {
    ply: d.ply,
    mover: d.mover,
    judgment,
    decisionLoss,
    accuracy: accuracyPercent(d.bestWin, d.playedWin),
    playedRank: d.playedRank,
    ...(d.candidates?.length ? { candidates: d.candidates } : {}),
    ...(d.verdict ? { verdict: d.verdict } : {}),
  };
}

export type PlayerDecisionSummary = {
  /** How many decisions this player made (every analyzed ply of theirs). */
  decisions: number;
  /** Mean per-decision accuracy in [0, 100] (100 when the player made none). Grades the choice
   *  against what the mover could actually know, never against the hidden truth. */
  decisionAccuracy: number;
};

export type DarkChessDecisionSummary = {
  byPly: Map<number, DecisionView>;
  white: PlayerDecisionSummary;
  black: PlayerDecisionSummary;
};

export function summarizeDecisions(
  decisions: readonly DarkChessDecision[],
): DarkChessDecisionSummary {
  const views = decisions.map(decisionView);
  const byPly = new Map(views.map((view) => [view.ply, view]));
  const summarize = (mover: 'white' | 'black'): PlayerDecisionSummary => {
    const mine = views.filter((view) => view.mover === mover);
    return {
      decisions: mine.length,
      decisionAccuracy: mine.length ? mean(mine.map((v) => v.accuracy)) : 100,
    };
  };
  return { byPly, white: summarize('white'), black: summarize('black') };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, v) => a + v, 0) / values.length;
}

// Mirrors the analysis endpoint: GET reads only the cache (204 = the analysis it rides on has
// not been computed yet), POST computes (account-gated).
function decisionsUrl(roomId: string): string {
  return new URL(
    `/api/dark-chess/games/${encodeURIComponent(roomId)}/decisions`,
    window.location.href,
  ).pathname;
}

/** GET the already-cached decomposition, or null on a miss (204). Never triggers a compute. */
export async function fetchCachedDarkChessDecisions(
  roomId: string,
): Promise<DarkChessDecisionSummary | null> {
  const response = await fetch(decisionsUrl(roomId), { method: 'GET' });
  if (response.status === 204 || !response.ok) return null;
  return summarizeDecisions(((await response.json()) as DarkChessDecisionsResponse).decisions);
}

/** POST to compute (account-gated), then summarize. A cached game answers 200 immediately;
 *  otherwise the server enqueues a job (202) and this polls it (see analysis-job-poll). */
export async function requestDarkChessDecisions(roomId: string): Promise<DarkChessDecisionSummary> {
  const body = await postAnalysisJob<DarkChessDecisionsResponse>(decisionsUrl(roomId), {
    errorPrefix: 'decisions_request_failed',
  });
  return summarizeDecisions(body.decisions);
}
