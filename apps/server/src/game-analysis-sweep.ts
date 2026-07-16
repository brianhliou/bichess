// Variant-neutral whole-game eval sweep. Evaluate the position after 0, 1, … N plies
// (N+1 points) with a per-variant `evaluate`, returning a Red-POV eval per ply cursor.
// The `evaluate` fn owns the engine binary, the variant config, AND the POV
// normalization (the score must already be Red POV — see evaluateXiangqiPosition /
// evaluateFortressXiangqiPosition); this helper only walks the move prefixes,
// SEQUENTIALLY, since each evaluate typically gates through a per-engine pool and a
// stampede would just queue-timeout. This is the shared spine the per-variant
// analysis routes call (xiangqi keeps its own copy in analyzeXiangqiGame for now).

export type SweepPlyEval = {
  ply: number;
  cp: number | null;
  mate: number | null;
  best: string | null;
};

/**
 * Raised when a completed sweep carries no evaluation at all (every ply cp+mate null).
 * That means the engine produced moves but never emitted a score — a broken/stale binary
 * that would otherwise cache as a flat, mistake-free game. Fail closed: the caller surfaces
 * "engine unavailable" and nothing is persisted, so a later fixed engine can recompute.
 * Shared by every per-variant analysis module (jungle / banqi / jungle-flip).
 */
export class VacuousAnalysisError extends Error {
  constructor(variant?: string) {
    super(variant ? `${variant}_analysis_vacuous` : 'analysis_vacuous');
    this.name = 'VacuousAnalysisError';
  }
}

/** A sweep with zero usable evals (no cp and no mate on any ply). Empty = not vacuous. */
export function isVacuousAnalysis(plies: readonly SweepPlyEval[]): boolean {
  return plies.length > 0 && plies.every((p) => p.cp == null && p.mate == null);
}

export type PositionEvaluate = (
  moves: string[],
  opts: { depth: number },
) => Promise<{ cp: number | null; mate: number | null; best: string | null }>;

export async function sweepPlyEvals(
  movesUci: readonly string[],
  evaluate: PositionEvaluate,
  depth: number,
): Promise<SweepPlyEval[]> {
  const evals: SweepPlyEval[] = [];
  for (let ply = 0; ply <= movesUci.length; ply += 1) {
    const evaluation = await evaluate([...movesUci.slice(0, ply)], { depth });
    evals.push({ ply, cp: evaluation.cp, mate: evaluation.mate, best: evaluation.best });
  }
  return evals;
}
