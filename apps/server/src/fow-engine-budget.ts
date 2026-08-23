/**
 * Shared engine per-move time-budget policy.
 *
 * SINGLE SOURCE OF TRUTH for "how much time is Misty granted for one move",
 * used by BOTH driving paths so they cannot diverge:
 *   - PvE  (live server): live-engine.ts wraps `computeEngineBudget('live-cap', …)`.
 *   - EvE-3P (bot-match arbiter): arbiter.ts calls the same function.
 *
 * `pve-eve-conformance.test.ts` pins the equivalence in CI.
 *
 * Two named policies:
 *   - 'live-cap'     — what live PvE uses: a per-move ceiling of clock/movesLeft
 *                      (+ increment), hard-capped (default 12s). Keeps the engine
 *                      from burning its whole clock on one move.
 *   - 'self-managed' — the engine's ceiling is its WHOLE remaining clock; it
 *                      self-allocates and the arbiter enforces flag-fall on the
 *                      total clock. No artificial per-move cap — the clock is the
 *                      only bound. Intended for fair external engine-vs-engine
 *                      matches where each engine owns its own time management.
 */

export type EngineTimePolicy = 'live-cap' | 'self-managed';

export type EngineBudget = {
  /** Per-move think-time ceiling handed to the engine (compute budget). */
  computeBudgetMs: number;
  /** Hard deadline for producing a move (transport/watchdog bound). */
  watchdogTimeoutMs: number;
};

export type EngineBudgetKnobs = {
  safetyMs: number;
  processOverheadMs: number;
  clockGraceMs: number;
  maxTimeoutMs: number;
  movesRemainingEstimate: number;
  softBudgetCapMs: number;
};

/** Defaults matching the historical live-engine constants (do not change without a migration of expectations).
 * maxTimeoutMs raised 30s -> 60s with the liveness/allocation decoupling (see
 * liveCapBudget): it now bounds only "engine is presumed dead", not think time. */
export const DEFAULT_ENGINE_BUDGET = {
  safetyMs: 200,
  processOverheadMs: 10_000,
  clockGraceMs: 1_000,
  maxTimeoutMs: 60_000,
  movesRemainingEstimate: 12,
  softBudgetCapMs: 12_000,
} as const;

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Knobs from the environment, matching the live-engine env overrides exactly. */
export function defaultEngineBudgetKnobs(): EngineBudgetKnobs {
  return {
    safetyMs: DEFAULT_ENGINE_BUDGET.safetyMs,
    processOverheadMs: DEFAULT_ENGINE_BUDGET.processOverheadMs,
    clockGraceMs: DEFAULT_ENGINE_BUDGET.clockGraceMs,
    maxTimeoutMs: positiveIntegerEnv(
      'PYTHON_LIVE_MAX_TIMEOUT_MS',
      DEFAULT_ENGINE_BUDGET.maxTimeoutMs,
    ),
    movesRemainingEstimate: positiveIntegerEnv(
      'PYTHON_LIVE_MOVES_REMAINING_ESTIMATE',
      DEFAULT_ENGINE_BUDGET.movesRemainingEstimate,
    ),
    softBudgetCapMs: positiveIntegerEnv(
      'PYTHON_LIVE_SOFT_BUDGET_CAP_MS',
      DEFAULT_ENGINE_BUDGET.softBudgetCapMs,
    ),
  };
}

export type EngineBudgetInput = {
  /** Remaining clock for the side to move, ms. `undefined` = untimed. */
  clockRemainingMs: number | undefined;
  incrementMs: number;
  /** Budget to grant when untimed (live passes its configured timeout). */
  untimedFallbackMs: number;
};

export function computeEngineBudget(
  policy: EngineTimePolicy,
  input: EngineBudgetInput,
  knobs: EngineBudgetKnobs = defaultEngineBudgetKnobs(),
): EngineBudget {
  const remainingMs = input.clockRemainingMs;
  if (remainingMs === undefined) {
    return { computeBudgetMs: input.untimedFallbackMs, watchdogTimeoutMs: input.untimedFallbackMs };
  }
  return policy === 'self-managed'
    ? selfManagedBudget(remainingMs, knobs)
    : liveCapBudget(remainingMs, input.incrementMs, knobs);
}

/**
 * Per-move bank share: clock/movesLeft + increment, floored at 50ms and capped
 * at the soft cap. NB: called with an already-safety-shaved clock and shaves
 * safety again — this double-shave is the historical live behavior, preserved
 * deliberately (see the conformance/live-engine tests).
 */
function perMoveBankBudget(
  clockRemainingMs: number,
  incrementMs: number,
  knobs: EngineBudgetKnobs,
): number {
  const usable = Math.max(0, clockRemainingMs - knobs.safetyMs);
  const bankShare = Math.floor(usable / knobs.movesRemainingEstimate);
  const budget = bankShare + Math.max(0, incrementMs);
  return Math.max(50, Math.min(knobs.softBudgetCapMs, budget));
}

function liveCapBudget(
  remainingMs: number,
  incrementMs: number,
  knobs: EngineBudgetKnobs,
): EngineBudget {
  const usableClockMs = Math.max(0, remainingMs - knobs.safetyMs);
  const computeBudgetMs = Math.min(
    usableClockMs > 0 ? usableClockMs : 50,
    perMoveBankBudget(usableClockMs, incrementMs, knobs),
  );
  // The watchdog is a LIVENESS bound, not a time allocator. It used to be
  // derived from the allocation (compute + processOverheadMs, capped 30s),
  // which conflated "engine is slow" with "engine is dead": prod game
  // 12c8ff99 was forfeited at ~22s with 228s on the engine's clock, over one
  // ~30-50s belief-update turn (engine issue #11). The engine self-allocates
  // think time (v2 budgets from the real clock; computeBudgetMs still signals
  // the allocation to engines that use it) — the server only bounds a true
  // hang (maxTimeoutMs) and clock exhaustion (the clock is the honest
  // arbiter: an engine that overspends flags instead of being watchdogged).
  const clockBoundMs = Math.ceil(Math.max(0, remainingMs) + knobs.clockGraceMs);
  const watchdogTimeoutMs = Math.max(1, Math.min(knobs.maxTimeoutMs, clockBoundMs));
  return {
    computeBudgetMs: Math.max(1, Math.min(Math.ceil(computeBudgetMs), watchdogTimeoutMs)),
    watchdogTimeoutMs,
  };
}

function selfManagedBudget(remainingMs: number, knobs: EngineBudgetKnobs): EngineBudget {
  // Ceiling = the whole remaining clock (minus a small safety). The engine
  // self-allocates within this; the arbiter flags on the total clock. No
  // per-move cap: the clock is the only bound.
  const usable = Math.max(50, remainingMs - knobs.safetyMs);
  const watchdogTimeoutMs = Math.ceil(Math.max(0, remainingMs) + knobs.clockGraceMs);
  return {
    computeBudgetMs: Math.max(1, Math.min(usable, watchdogTimeoutMs)),
    watchdogTimeoutMs,
  };
}
