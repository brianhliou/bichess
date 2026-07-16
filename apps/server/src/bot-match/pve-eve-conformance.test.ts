/**
 * PvE ↔ EvE-3P conformance.
 *
 * The live server (PvE) and the bot-match arbiter (EvE-3P) are two paths that
 * drive the same engine. These tests pin the pieces that could silently diverge:
 *   1. both derive the SAME per-move budget under the 'live-cap' policy, because
 *      live-engine.ts delegates to the shared `computeEngineBudget` (guards
 *      against a future un-delegation);
 *   2. the arbiter actually grants that shared budget and feeds the engine the
 *      same clock the live path would;
 *   3. 'self-managed' is the distinct whole-clock model for fair external matches.
 *
 * Redaction, request construction, rules, and seeds are ALREADY single-source
 * (buildEngineTurnRequest / packages/game), so they cannot diverge by
 * construction; arbiter.test.ts pins the request-field surface.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { EngineMoveContext } from '../engine-registry.js';
import { computeEngineBudget } from '../fow-engine-budget.js';
import { pythonLiveTimeoutBudgetMs } from '../live-engine.js';
import { type ArbiterMoveProvider, runArbiterGame } from './arbiter.js';

function liveCtx(clockRemainingMs: number | undefined, incrementMs: number): EngineMoveContext {
  // pythonLiveTimeoutBudgetMs reads only clockRemainingMs, incrementMs, and
  // state.clock — a minimal stand-in suffices.
  return { clockRemainingMs, incrementMs, state: { clock: null } } as unknown as EngineMoveContext;
}

const CLOCKS: Array<[number | undefined, number]> = [
  [180_000, 2_000],
  [30_000, 1_000],
  [5_000, 0],
  [900, 0],
  [60_000, 3_000],
  [undefined, 0],
];

test('PvE and EvE-3P derive the SAME live-cap budget for every clock (single source)', () => {
  for (const [clock, incr] of CLOCKS) {
    const live = pythonLiveTimeoutBudgetMs(liveCtx(clock, incr), 5_000);
    const shared = computeEngineBudget('live-cap', {
      clockRemainingMs: clock,
      incrementMs: incr,
      untimedFallbackMs: 5_000,
    });
    assert.deepEqual(shared, live, `budget diverged at clock=${clock} incr=${incr}`);
  }
});

async function captureFirstTurn(timePolicy: 'live-cap' | 'self-managed'): Promise<{
  budgetMs: number;
  clock: { remaining_ms: number | null; increment_ms: number };
}> {
  let captured: {
    budgetMs: number;
    clock: { remaining_ms: number | null; increment_ms: number };
  } | null = null;
  const provider: ArbiterMoveProvider = async (req, ctx) => {
    if (!captured) captured = { budgetMs: ctx.budgetMs, clock: req.clock };
    return { move: req.legalMoves[0]!, thinkTimeMs: 1 };
  };
  await runArbiterGame({
    gameId: 'conf',
    engineSecret: 'conf-secret',
    startedAtMs: 1_000_000,
    timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    timePolicy,
    maxPlies: 1,
    white: { engineId: 'w', provider },
    black: { engineId: 'b', provider },
  });
  assert.ok(captured, 'provider was never called');
  return captured;
}

test('arbiter grants the shared live-cap budget and the live clock at ply 0', async () => {
  const first = await captureFirstTurn('live-cap');
  const expected = computeEngineBudget('live-cap', {
    clockRemainingMs: 180_000,
    incrementMs: 2_000,
    untimedFallbackMs: 0,
  }).computeBudgetMs;
  assert.equal(first.budgetMs, expected); // 12_000 — identical to live PvE at 3+2
  // The engine sees the same clock the live path would send.
  assert.equal(first.clock.remaining_ms, 180_000);
  assert.equal(first.clock.increment_ms, 2_000);
});

test("'self-managed' grants a whole-clock ceiling (fair-match model), unlike live-cap", async () => {
  const first = await captureFirstTurn('self-managed');
  const expected = computeEngineBudget('self-managed', {
    clockRemainingMs: 180_000,
    incrementMs: 2_000,
    untimedFallbackMs: 0,
  }).computeBudgetMs;
  assert.equal(first.budgetMs, expected);
  assert.ok(
    first.budgetMs > 100_000,
    `self-managed ceiling should be ~the whole clock, got ${first.budgetMs}`,
  );
});
