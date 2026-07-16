// Client side of the jieqi decision-vs-luck decomposition (Layer 2). The server does the hard
// part now: per REVEAL ply it returns three win% numbers (mover POV) — the played move's TRUE
// pool-mean EV, the best move's pool-mean EV, and the realized outcome. Here we just turn those
// into the display numbers: a DECISION-quality glyph (graded) and a LUCK value (shown per move,
// never graded). Counterpart to game-analysis.ts; kept separate as a heavier, opt-in tier.
import { accuracyPercent, type MoveJudgment, moveJudgment } from '@mistboard/game';

/** One reveal ply's decomposition, all win% from the MOVER's POV (mirrors the server shape). */
export type JieqiDecision = {
  ply: number;
  mover: 'red' | 'black';
  /** True pool-mean EV (win%) of the best available move — the decision ceiling. */
  bestWin: number;
  /** True pool-mean EV (win%) of the played move — the decision, before the dice. */
  playedWin: number;
  /** Win% the reveal ACTUALLY produced — the truth, including luck. */
  realizedWin: number;
  /** Rank of the played move among candidates by true baseline (1 = it WAS the best). */
  playedRank: number | null;
};

export type JieqiDecisionsResponse = {
  engineId: string;
  depth: number;
  decisions: JieqiDecision[];
};

// Deadband in WIN POINTS. The top jieqi reveals cluster within a few win% under the noisy no-net
// eval, so a decision loss below this floor is engine noise, not a real mistake — leave it
// unjudged. Same discipline that stopped the eval-swing over-flagging, in win% space now that the
// server averages the baseline itself.
const DECISION_NOISE_WINPCT = 5;

/** A reveal ply's derived, display-ready view. `luck` and `decisionLoss` are win% (points). */
export type DecisionView = {
  ply: number;
  mover: 'red' | 'black';
  /** Decision-quality glyph from the win% the CHOICE gave up (null = fine, or within noise). */
  judgment: MoveJudgment;
  /** Win% the choice gave up vs the best move (>= 0). */
  decisionLoss: number;
  /** Win% the reveal swung vs its OWN pool-average expectation (signed: + lucky, - unlucky).
   *  0 = the reveal came out exactly average — "the average piece still in the bag". */
  luck: number;
  /** Per-decision accuracy in [0, 100] (lila's win%-drop curve, best -> played). */
  accuracy: number;
  playedRank: number | null;
};

export function decisionView(d: JieqiDecision): DecisionView {
  const decisionLoss = Math.max(0, d.bestWin - d.playedWin);
  // Deadband: a sub-noise decision loss is not a real mistake, so no glyph.
  const judgment =
    decisionLoss < DECISION_NOISE_WINPCT ? null : moveJudgment(d.bestWin, d.playedWin);
  return {
    ply: d.ply,
    mover: d.mover,
    judgment,
    decisionLoss,
    luck: d.realizedWin - d.playedWin,
    accuracy: accuracyPercent(d.bestWin, d.playedWin),
    playedRank: d.playedRank,
  };
}

export type PlayerDecisionSummary = {
  /** How many reveal decisions this player made. */
  reveals: number;
  /** Mean per-decision accuracy in [0, 100] (100 when the player made no reveals). Grades only
   *  the choice, never the outcome — the only number here that could ever feed a rating. */
  decisionAccuracy: number;
};

export type JieqiDecisionSummary = {
  /** Per-reveal view keyed by ply, so the move list can look one up on navigation. */
  byPly: Map<number, DecisionView>;
  red: PlayerDecisionSummary;
  black: PlayerDecisionSummary;
};

export function summarizeDecisions(decisions: readonly JieqiDecision[]): JieqiDecisionSummary {
  const views = decisions.map(decisionView);
  const byPly = new Map(views.map((view) => [view.ply, view]));
  const summarize = (mover: 'red' | 'black'): PlayerDecisionSummary => {
    const mine = views.filter((view) => view.mover === mover);
    return {
      reveals: mine.length,
      decisionAccuracy: mine.length ? mean(mine.map((v) => v.accuracy)) : 100,
    };
  };
  return { byPly, red: summarize('red'), black: summarize('black') };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, v) => a + v, 0) / values.length;
}

// The decisions endpoint mirrors the analysis one: GET reads only the cache (204 = not computed
// yet, INCLUDING when the basic analysis it rides alongside isn't cached), POST computes (gated).
function decisionsUrl(roomId: string): string {
  return new URL(`/api/jieqi/games/${encodeURIComponent(roomId)}/decisions`, window.location.href)
    .pathname;
}

/** GET the already-cached decomposition, or null on a miss (204). Never triggers a compute. */
export async function fetchCachedJieqiDecisions(
  roomId: string,
): Promise<JieqiDecisionSummary | null> {
  const response = await fetch(decisionsUrl(roomId), { method: 'GET' });
  if (response.status === 204 || !response.ok) return null;
  return summarizeDecisions(((await response.json()) as JieqiDecisionsResponse).decisions);
}

/** POST to compute the decomposition (account-gated on the server), then summarize it. */
export async function requestJieqiDecisions(roomId: string): Promise<JieqiDecisionSummary> {
  const response = await fetch(decisionsUrl(roomId), { method: 'POST' });
  if (!response.ok) throw new Error(`decisions_request_failed_${response.status}`);
  return summarizeDecisions(((await response.json()) as JieqiDecisionsResponse).decisions);
}
