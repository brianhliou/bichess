// Unit tests for the engine budget report. Everything here is offline: the SQL
// is one SELECT and what breaks silently is the normalization and the verdict
// boundaries, not the query.
//
// The payload fixtures below are shaped from the three WRITERS, not from this
// script's own reader — a fixture authored from the reader's assumptions would
// pass while the reader misread every real row.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectPayloadShape,
  finiteNumber,
  isDifficultyLadderEngine,
  MIN_PLIES_FOR_VERDICT,
  normalizeDecisionRow,
  parseSince,
  percentile,
  summarizeRows,
  TIME_BOUND_UTILIZATION,
  VERDICT_CEILING_UNKNOWN,
  VERDICT_HEALTHY,
  VERDICT_INSUFFICIENT_DATA,
  VERDICT_NO_TIMING,
  VERDICT_TIME_BOUND,
  VERDICT_WORK_BOUND_WASTEFUL,
  verdictFor,
  WORK_BOUND_UTILIZATION,
} from './engine-budget-report.mjs';

// --- percentiles ----------------------------------------------------------

test('percentile is nearest-rank and returns an observed value', () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(values, 0.5), 50);
  assert.equal(percentile(values, 0.9), 90);
  assert.equal(percentile(values, 1), 100);
  // Nearest-rank never interpolates, so every answer is a ply that happened.
  assert.ok(values.includes(percentile(values, 0.37)));
});

test('percentile sorts its input and ignores non-numbers', () => {
  assert.equal(percentile([90, 10, 50], 0.5), 50);
  assert.equal(percentile([5, null, undefined, Number.NaN, 15], 0.5), 5);
});

test('percentile of an empty sample is null, not zero', () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([null, undefined], 0.5), null);
});

// --- shape detection and normalization ------------------------------------

// variant-tenant/engine-decisions.ts — banqi/jungle/jungle-flip/jieqi/fortress.
const tenantPayload = {
  variant: 'jungle-flip',
  room_id: 'room-1',
  engine_id: 'jungle-flip-bot',
  engine_version: '3',
  engine_seat: 'red',
  ply: 12,
  move: 'a1a2',
  failed_closed: false,
  movetime_ms: 5000,
  remaining_ms: 240_000,
  increment_ms: 5000,
  think_time_ms: 217,
  tier_skill: null,
  tier_depth: null,
  tier_nodes: 524_288,
  tier_movetime_ms: 5000,
  unreachable: false,
  search: { depth: 14, nodes: 524_288, time_ms: 210, cp: 32, mate: null, pv: ['a1a2'] },
};

// server-xiangqi-engine.ts — the older shape, tier limits NESTED.
const xiangqiPayload = {
  variant: 'xiangqi',
  engine_id: 'fairy-stockfish-xiangqi-level-8',
  engine_version: 'fsf-master',
  engine_seat: 'black',
  ply: 20,
  move: 'b0c2',
  failed_closed: false,
  movetime_ms: 6000,
  think_time_ms: 3400,
  attempts: 1,
  tier: { skill: 20, depth: null, nodes: 1_000_000, movetime_ms: 6000, hash_mb: 64, nnue: true },
  search: { depth: 20, nodes: 1_000_000, time_ms: 3350, cp: 15, mate: null, pv: ['b0c2'] },
};

// room-manager.ts — the chess / dark-chess path. No budget, no node count.
const chessPayload = {
  requested_engine_id: 'misty',
  engine_id: 'misty',
  fallback: false,
  move: { from: 'e2', to: 'e4' },
  think_time_ms: 4800,
  duration_ms: 4900,
  scores: [{ move: { from: 'e2', to: 'e4' }, score: 0, reason: 'engine-worker:v2' }],
  engine_diagnostics: { beliefSize: 120, iters: 900, searchSeconds: 4.5, decisionSource: 'v2' },
};

test('detectPayloadShape separates the three writers', () => {
  assert.equal(detectPayloadShape(tenantPayload), 'tenant');
  assert.equal(detectPayloadShape(xiangqiPayload), 'xiangqi');
  assert.equal(detectPayloadShape(chessPayload), 'chess');
  assert.equal(detectPayloadShape(null), 'unknown');
  assert.equal(detectPayloadShape({ some: 'other artifact' }), 'unknown');
});

// The xiangqi payload also carries a top-level movetime_ms. Testing that key
// first would classify it as the tenant shape and drop its nested tier limits.
test('the nested tier block wins over the top-level movetime_ms', () => {
  const row = normalizeDecisionRow({
    gameId: 'g1',
    ply: 20,
    payload: xiangqiPayload,
    variant: 'xiangqi',
    endedAt: new Date('2026-09-01T00:00:00Z'),
  });
  assert.equal(row.shape, 'xiangqi');
  assert.equal(row.tierMovetimeMs, 6000);
  assert.equal(row.workBudget, 1_000_000);
  assert.equal(row.workDone, 1_000_000);
  assert.equal(row.workUnit, 'nodes');
});

test('all three shapes normalize into one row type', () => {
  const rows = [
    { gameId: 'g1', ply: 12, payload: tenantPayload, variant: 'jungle-flip', endedAt: null },
    { gameId: 'g2', ply: 20, payload: xiangqiPayload, variant: 'xiangqi', endedAt: null },
    { gameId: 'g3', ply: 8, payload: chessPayload, variant: 'dark-chess', endedAt: null },
  ].map(normalizeDecisionRow);
  for (const row of rows) {
    for (const key of [
      'engineId',
      'thinkTimeMs',
      'allottedMs',
      'tierMovetimeMs',
      'workDone',
      'workBudget',
      'workUnit',
      'excluded',
    ]) {
      assert.ok(key in row, `${row.shape} row is missing ${key}`);
    }
  }
  assert.equal(rows[0].engineId, 'jungle-flip-bot');
  assert.equal(rows[0].allottedMs, 5000);
  assert.equal(rows[0].thinkTimeMs, 217);
  assert.equal(rows[1].engineId, 'fairy-stockfish-xiangqi-level-8');
  assert.equal(rows[2].engineId, 'misty');
  assert.equal(rows[2].thinkTimeMs, 4800);
  // Misty counts iterations, so the unit must travel with the number.
  assert.equal(rows[2].workDone, 900);
  assert.equal(rows[2].workUnit, 'iters');
});

test('an unreadable payload normalizes to null rather than an empty row', () => {
  assert.equal(normalizeDecisionRow({ gameId: 'g', ply: 1, payload: null }), null);
  assert.equal(normalizeDecisionRow({ gameId: 'g', ply: 1, payload: { unrelated: true } }), null);
});

// The whole point of the report. A missing node count means "this writer does
// not say", and reporting it as 0 invents the exact fault we are looking for.
test('a missing nodes field is null, never 0', () => {
  const noSearch = normalizeDecisionRow({
    gameId: 'g',
    ply: 1,
    payload: { ...tenantPayload, search: null, tier_nodes: null },
    variant: 'jungle-flip',
  });
  assert.equal(noSearch.workDone, null);
  assert.equal(noSearch.workBudget, null);
  assert.notEqual(noSearch.workDone, 0);

  const searchWithoutNodes = normalizeDecisionRow({
    gameId: 'g',
    ply: 1,
    payload: {
      ...tenantPayload,
      search: { depth: 4, nodes: null, time_ms: null, cp: 0, mate: null, pv: [] },
    },
    variant: 'jungle-flip',
  });
  assert.equal(searchWithoutNodes.workDone, null);
  assert.equal(searchWithoutNodes.searchTimeMs, null);

  // The chess writer records no node count at all.
  const chess = normalizeDecisionRow({ gameId: 'g', ply: 1, payload: chessPayload });
  assert.equal(chess.workBudget, null);
});

// null budget means "this engine gets no time budget" (the depth-limited
// in-process searches), which is not a budget of zero.
test('a null movetime_ms stays null, and a real 0 stays 0', () => {
  const unbudgeted = normalizeDecisionRow({
    gameId: 'g',
    ply: 1,
    payload: { ...tenantPayload, movetime_ms: null },
    variant: 'jungle',
  });
  assert.equal(unbudgeted.allottedMs, null);
  assert.equal(finiteNumber(0), 0);
  assert.equal(finiteNumber(null), null);
  assert.equal(finiteNumber(undefined), null);
  assert.equal(finiteNumber('5000'), null);
});

test('failed-closed, unreachable and fallback plies are flagged as excluded', () => {
  const failed = normalizeDecisionRow({
    gameId: 'g',
    ply: 1,
    payload: { ...tenantPayload, failed_closed: true },
  });
  assert.equal(failed.excluded, true);
  const unreachable = normalizeDecisionRow({
    gameId: 'g',
    ply: 1,
    payload: { ...tenantPayload, unreachable: true },
  });
  assert.equal(unreachable.excluded, true);
  const fellBack = normalizeDecisionRow({
    gameId: 'g',
    ply: 1,
    payload: { ...chessPayload, fallback: true },
  });
  assert.equal(fellBack.excluded, true);
  assert.equal(
    normalizeDecisionRow({ gameId: 'g', ply: 1, payload: tenantPayload }).excluded,
    false,
  );
});

// --- verdict boundaries ---------------------------------------------------

const enoughPlies = MIN_PLIES_FOR_VERDICT;

function summaryAt(utilization, overrides = {}) {
  const ceilingMs = 1000;
  return {
    scoredPlies: enoughPlies,
    thinkP50Ms: utilization * ceilingMs,
    ceilingMs,
    ...overrides,
  };
}

test('TIME-BOUND begins exactly at the threshold', () => {
  assert.equal(verdictFor(summaryAt(TIME_BOUND_UTILIZATION)), VERDICT_TIME_BOUND);
  assert.equal(verdictFor(summaryAt(TIME_BOUND_UTILIZATION + 0.01)), VERDICT_TIME_BOUND);
  assert.equal(verdictFor(summaryAt(TIME_BOUND_UTILIZATION - 0.01)), VERDICT_HEALTHY);
  // The jungle regression: pinned at its 4,000 ms cap every ply.
  assert.equal(
    verdictFor({ scoredPlies: 120, thinkP50Ms: 4000, ceilingMs: 4000 }),
    VERDICT_TIME_BOUND,
  );
});

test('WORK-BOUND-WASTEFUL ends just below the threshold', () => {
  assert.equal(verdictFor(summaryAt(WORK_BOUND_UTILIZATION - 0.001)), VERDICT_WORK_BOUND_WASTEFUL);
  // The threshold itself is healthy: the band is [workBound, timeBound).
  assert.equal(verdictFor(summaryAt(WORK_BOUND_UTILIZATION)), VERDICT_HEALTHY);
  // jungle-flip: 217 ms against a 5,000 ms ceiling.
  assert.equal(
    verdictFor({ scoredPlies: 90, thinkP50Ms: 217, ceilingMs: 5000 }),
    VERDICT_WORK_BOUND_WASTEFUL,
  );
  // banqi: ~843 ms against 8,000 ms.
  assert.equal(
    verdictFor({ scoredPlies: 90, thinkP50Ms: 843, ceilingMs: 8000 }),
    VERDICT_WORK_BOUND_WASTEFUL,
  );
});

test('HEALTHY covers the band between the two thresholds', () => {
  assert.equal(verdictFor(summaryAt(0.5)), VERDICT_HEALTHY);
  assert.equal(verdictFor(summaryAt(0.26)), VERDICT_HEALTHY);
  assert.equal(verdictFor(summaryAt(0.94)), VERDICT_HEALTHY);
});

test('INSUFFICIENT-DATA is checked before any ratio', () => {
  // One ply pinned at the ceiling is not a TIME-BOUND finding.
  assert.equal(
    verdictFor({ scoredPlies: 1, thinkP50Ms: 5000, ceilingMs: 5000 }),
    VERDICT_INSUFFICIENT_DATA,
  );
  assert.equal(
    verdictFor({ scoredPlies: MIN_PLIES_FOR_VERDICT - 1, thinkP50Ms: 100, ceilingMs: 5000 }),
    VERDICT_INSUFFICIENT_DATA,
  );
  assert.equal(
    verdictFor({ scoredPlies: MIN_PLIES_FOR_VERDICT, thinkP50Ms: 100, ceilingMs: 5000 }),
    VERDICT_WORK_BOUND_WASTEFUL,
  );
});

// A ceiling the writer never recorded must not read as 0% utilization.
test('an absent ceiling is CEILING-UNKNOWN, not a wasteful verdict', () => {
  assert.equal(
    verdictFor({ scoredPlies: 200, thinkP50Ms: 4800, ceilingMs: null }),
    VERDICT_CEILING_UNKNOWN,
  );
  assert.equal(
    verdictFor({ scoredPlies: 200, thinkP50Ms: null, ceilingMs: 5000 }),
    VERDICT_NO_TIMING,
  );
});

test('thresholds are overridable for tuning', () => {
  const summary = summaryAt(0.5);
  assert.equal(verdictFor(summary, { timeBound: 0.4 }), VERDICT_TIME_BOUND);
  assert.equal(verdictFor(summary, { workBound: 0.6 }), VERDICT_WORK_BOUND_WASTEFUL);
  assert.equal(verdictFor(summary, { minPlies: enoughPlies + 1 }), VERDICT_INSUFFICIENT_DATA);
});

// --- the FSF difficulty ladder --------------------------------------------

test('the FSF ladder rungs 1-7 are recognized, the node-anchored top rung is not', () => {
  assert.equal(isDifficultyLadderEngine('fairy-stockfish-xiangqi-level-1'), true);
  assert.equal(isDifficultyLadderEngine('fairy-stockfish-xiangqi-level-7'), true);
  assert.equal(isDifficultyLadderEngine('fairy-stockfish-fortress-xiangqi-level-3'), true);
  // Level 8 is node-anchored for strength, so its utilization IS a real signal.
  assert.equal(isDifficultyLadderEngine('fairy-stockfish-xiangqi-level-8'), false);
  assert.equal(isDifficultyLadderEngine('pikafish-xiangqi-level-8'), false);
  assert.equal(isDifficultyLadderEngine('jungle-flip-bot'), false);
  assert.equal(isDifficultyLadderEngine(undefined), false);
});

// --- aggregation ----------------------------------------------------------

function tenantRows(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) =>
    normalizeDecisionRow({
      gameId: `g${Math.floor(index / 30)}`,
      ply: index,
      payload: { ...tenantPayload, ...overrides },
      variant: 'jungle-flip',
      endedAt: new Date(2026, 8, 1 + (index % 3)),
    }),
  );
}

test('summarizeRows groups by variant and engine and counts games', () => {
  const rows = [
    ...tenantRows(60),
    ...Array.from({ length: 40 }, (_, index) =>
      normalizeDecisionRow({
        gameId: `x${index}`,
        ply: index,
        payload: xiangqiPayload,
        variant: 'xiangqi',
        endedAt: new Date(2026, 8, 2),
      }),
    ),
  ];
  const summaries = summarizeRows(rows);
  assert.equal(summaries.length, 2);
  const flip = summaries.find((summary) => summary.variant === 'jungle-flip');
  assert.equal(flip.games, 2);
  assert.equal(flip.plies, 60);
  assert.equal(flip.scoredPlies, 60);
  assert.equal(flip.thinkP50Ms, 217);
  assert.equal(flip.ceilingMs, 5000);
  assert.equal(flip.ceilingSource, 'allotted');
  assert.ok(Math.abs(flip.utilization - 217 / 5000) < 1e-9);
  assert.equal(flip.verdict, VERDICT_WORK_BOUND_WASTEFUL);
  assert.equal(flip.byDesign, false);
  assert.equal(flip.workUnit, 'nodes');
  assert.equal(flip.workP50, 524_288);

  const xiangqi = summaries.find((summary) => summary.variant === 'xiangqi');
  assert.equal(xiangqi.games, 40);
  assert.equal(xiangqi.verdict, VERDICT_HEALTHY);
  assert.deepEqual(xiangqi.engineVersions, ['fsf-master']);
  assert.equal(xiangqi.firstEndedAt instanceof Date, true);
});

test('excluded plies are counted but kept out of the percentiles', () => {
  const rows = [...tenantRows(40), ...tenantRows(20, { failed_closed: true, think_time_ms: 5000 })];
  const [summary] = summarizeRows(rows);
  assert.equal(summary.plies, 60);
  assert.equal(summary.scoredPlies, 40);
  assert.equal(summary.excludedPlies, 20);
  // Without the exclusion the p50 would climb toward the 5,000 ms ceiling and
  // report a TIME-BOUND engine that is really just failing.
  assert.equal(summary.thinkP50Ms, 217);
  assert.equal(summary.verdict, VERDICT_WORK_BOUND_WASTEFUL);
});

test('a group with no recorded work count reports unknown, not zero', () => {
  const rows = tenantRows(40, { search: null, tier_nodes: null });
  const [summary] = summarizeRows(rows);
  assert.equal(summary.workSamples, 0);
  assert.equal(summary.workP50, null);
  assert.equal(summary.workBudget, null);
});

test('the chess path lands on CEILING-UNKNOWN rather than 0% utilization', () => {
  const rows = Array.from({ length: 50 }, (_, index) =>
    normalizeDecisionRow({
      gameId: `c${index}`,
      ply: index,
      payload: chessPayload,
      variant: 'dark-chess',
      endedAt: new Date(2026, 8, 3),
    }),
  );
  const [summary] = summarizeRows(rows);
  assert.equal(summary.ceilingMs, null);
  assert.equal(summary.ceilingSource, null);
  assert.equal(summary.utilization, null);
  assert.equal(summary.verdict, VERDICT_CEILING_UNKNOWN);
  assert.equal(summary.workUnit, 'iters');
});

test('the tier movetime backfills a ceiling when no per-ply budget was recorded', () => {
  const rows = tenantRows(40, { movetime_ms: null });
  const [summary] = summarizeRows(rows);
  assert.equal(summary.ceilingMs, 5000);
  assert.equal(summary.ceilingSource, 'tier');
});

test('a ladder rung is marked by design without changing its raw verdict', () => {
  const rows = Array.from({ length: 40 }, (_, index) =>
    normalizeDecisionRow({
      gameId: `l${index}`,
      ply: index,
      payload: {
        ...xiangqiPayload,
        engine_id: 'fairy-stockfish-xiangqi-level-1',
        movetime_ms: 50,
        think_time_ms: 8,
        tier: { skill: -9, depth: 5, nodes: null, movetime_ms: 50, hash_mb: 16, nnue: false },
        search: { depth: 5, nodes: 4000, time_ms: 7, cp: 0, mate: null, pv: [] },
      },
      variant: 'xiangqi',
      endedAt: new Date(2026, 8, 1),
    }),
  );
  const [summary] = summarizeRows(rows);
  assert.equal(summary.byDesign, true);
  assert.equal(summary.verdict, VERDICT_WORK_BOUND_WASTEFUL);
});

// --- flags ----------------------------------------------------------------

test('parseSince reads relative windows and ISO dates', () => {
  const now = new Date('2026-09-05T12:00:00Z');
  assert.equal(parseSince('14d', now).toISOString(), '2026-08-22T12:00:00.000Z');
  assert.equal(parseSince('4w', now).toISOString(), '2026-08-08T12:00:00.000Z');
  assert.equal(parseSince('6h', now).toISOString(), '2026-09-05T06:00:00.000Z');
  assert.equal(parseSince('2026-08-01', now).toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(parseSince(undefined, now), null);
  assert.throws(() => parseSince('last tuesday', now), /Could not read --since/);
});
