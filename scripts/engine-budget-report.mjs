#!/usr/bin/env node
// Which limit is actually binding each bot's search: its WORK limit or its TIME
// limit?
//
// Every engine we serve carries two limits. A WORK limit (nodes, iterations, or
// depth) is chosen for STRENGTH — it is what the Elo anchor was measured at. A
// TIME limit (`movetime_ms`) is chosen for LATENCY — how long a human waits.
// What the engine actually does is `min(cost_of_work, time_ceiling)`, and
// nothing in the tier files, the registry, or the bot picker states which of the
// two wins. Both failure modes look identical from outside: a bot that plays.
//
//   TIME-BOUND       the work limit is unreachable, so the search is cut short
//                    by the clock. Strength stops being a property of the
//                    configuration and becomes a property of host load — the
//                    bot is weaker on a busy box and nobody is told.
//   WORK-BOUND, but  the work limit is so cheap the ceiling never comes near.
//   wastefully       Latency budget the player already agreed to wait is being
//                    handed back. Jungle-flip spends ~4% of its 5 s ceiling.
//
// Not every engine HAS a work limit, and that changes what the first verdict
// means. `pikafish-jieqi-strongest` is configured `go movetime 4000` with no
// depth and no node cap, so stopping on the clock is the design, not a defect;
// it reports TIME-BOUND-BY-DESIGN. The distinction is read off the tier fields
// the artifact records, never an engine-id list — a list goes stale the first
// time a tier is added, and stale in the direction that hides findings.
//
// This is the standing answer to that question, read off the per-move
// `live-engine-decision` artifacts the platform now persists for every PvE move.
// Fog xiangqi spent ~1.8% of its allotted budget for weeks because a 64-iteration
// cap made its deadline check unreachable, and no one number anywhere put the
// two figures side by side. This script is that number.
//
// Usage (local Postgres, whatever DATABASE_URL points at):
//   node scripts/engine-budget-report.mjs
//   node scripts/engine-budget-report.mjs --since 14d --variant jungle-flip
//   node scripts/engine-budget-report.mjs --json --limit 20000
//
// Against production, hand the connection to Railway rather than putting it in
// your shell. The connection string is referenced by name inside the child and
// never enters this process or the terminal:
//
//   railway run -s Postgres -- sh -c \
//     'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/engine-budget-report.mjs'
//
// Read-only: this script issues one SELECT and nothing else.

import { parseArgs } from 'node:util';
import pg from 'pg';

// ---------------------------------------------------------------------------
// Verdict thresholds. Tune here; both are ratios of think-time p50 to the time
// ceiling that was in force for the move.
// ---------------------------------------------------------------------------

/**
 * At or above this, the ceiling is what stops the search on a typical move, so
 * the configured work limit is decorative. 0.95 rather than 1.0 because the
 * measured number is wall time around the search: a genuinely pinned engine
 * lands a hair under its own movetime as often as a hair over it, and demanding
 * 100% would call a hard-pinned bot healthy.
 */
export const TIME_BOUND_UTILIZATION = 0.95;

/**
 * Below this, the work limit finishes so early that the ceiling is irrelevant
 * and most of the latency the player agreed to wait is unspent. 0.25 is a
 * deliberately loud floor: a bot using under a quarter of its budget could be
 * meaningfully stronger for free, and every case we have measured (jungle-flip
 * at 4%, banqi at 11%, fog xiangqi at 1.8%) is far below it. Between the two
 * thresholds the two limits are roughly in balance, which is the goal.
 */
export const WORK_BOUND_UTILIZATION = 0.25;

/**
 * Fewest scored plies before a group gets a verdict at all. An engine plays
 * roughly 30-60 plies in a game, so this is about one full game of evidence.
 * Below it the p50 is an anecdote: a single slow move on a cold worker moves it
 * far enough to flip the verdict, and a verdict that flips on one ply is worse
 * than no verdict, because someone will act on it.
 */
export const MIN_PLIES_FOR_VERDICT = 30;

/**
 * Pinned at the ceiling WITH a work limit (nodes or depth) configured that the
 * search never reaches. This is the finding: the configured strength is
 * unreachable, so what the bot actually plays is set by how busy the box is.
 */
export const VERDICT_TIME_BOUND = 'TIME-BOUND';
/**
 * Pinned at the ceiling with NO work limit configured at all. Movetime is the
 * only limit the tier has, so time-binding is the design working, not a defect —
 * `pikafish-jieqi-strongest` runs a bare `go movetime 4000`, and reporting it
 * identically to a jungle bot whose node cap is unreachable made the TIME-BOUND
 * verdict useless. The lever here is the ceiling itself, not the work limit.
 */
export const VERDICT_TIME_BOUND_BY_DESIGN = 'TIME-BOUND-BY-DESIGN';
/**
 * Pinned at the ceiling, and the payload records no tier configuration at all,
 * so which of the two above applies is unknowable from the artifact. Saying so
 * is the finding, exactly as with CEILING-UNKNOWN: guessing here would either
 * invent a defect or excuse one.
 */
export const VERDICT_TIME_BOUND_WORK_LIMIT_UNKNOWN = 'TIME-BOUND-WORK-LIMIT-UNKNOWN';
export const VERDICT_WORK_BOUND_WASTEFUL = 'WORK-BOUND-WASTEFUL';
export const VERDICT_HEALTHY = 'HEALTHY';
export const VERDICT_INSUFFICIENT_DATA = 'INSUFFICIENT-DATA';
/**
 * The payload records no time ceiling at all, so the ratio is undefined. This is
 * NOT the same as a ceiling of zero and must never render as 0% utilization —
 * the fog/dark-chess writer in room-manager.ts persists think time but not the
 * budget it was given, so its rows land here. Saying so is the finding.
 */
export const VERDICT_CEILING_UNKNOWN = 'CEILING-UNKNOWN';
/** Timing itself is missing from every row in the group; nothing to compare. */
export const VERDICT_NO_TIMING = 'NO-TIMING-RECORDED';

/** Default window. Long enough to cover a quiet week, short enough to be current. */
const DEFAULT_SINCE = '30d';
/**
 * Default cap on artifact rows pulled. A busy month of PvE is well under this;
 * the cap exists so an unbounded prod table cannot be dragged into memory by
 * accident. Rows are taken most-recent-first, so a truncated run still describes
 * current behavior rather than a random slice.
 */
const DEFAULT_LIMIT = 50_000;

const LIVE_ENGINE_DECISION_ARTIFACT_TYPE = 'live-engine-decision';

/**
 * The Fairy-Stockfish difficulty ladder, rungs 1 through 7.
 *
 * These are work-bound at tight ceilings ON PURPOSE and must not read as
 * findings. Their movetime IS the difficulty setting — level 1 is 50 ms, level 7
 * is 500 ms — and their published Elo anchors were measured at exactly those
 * settings, so "raise the ceiling to use the budget" would silently re-rate the
 * whole ladder. The top rung (level 8) is excluded from this pattern on purpose:
 * it is node-anchored for strength, so its budget utilization IS a real signal.
 */
const DIFFICULTY_LADDER_ENGINE_PATTERN = /^fairy-stockfish-.*-level-[1-7]$/;

export function isDifficultyLadderEngine(engineId) {
  return typeof engineId === 'string' && DIFFICULTY_LADDER_ENGINE_PATTERN.test(engineId);
}

// ---------------------------------------------------------------------------
// Payload normalization
//
// Three writers produce `live-engine-decision` rows and they do NOT agree on a
// shape. Normalizing them here, once, is the whole reason this file can compare
// a banqi bot to a fog bot at all.
//
//   'tenant'  apps/server/src/variant-tenant/engine-decisions.ts — banqi, jungle,
//             jungle-flip, jieqi, fortress, dark-xiangqi. Flat snake_case, with
//             the tier's limits hoisted to top-level `tier_*` keys.
//   'xiangqi' apps/server/src/server-xiangqi-engine.ts — older, and the tier
//             limits live in a NESTED `tier` block (plus hash_mb / nnue).
//   'chess'   apps/server/src/room-manager.ts — the chess/dark-chess path.
//             Different again, and still the poorest: think time, free-form
//             `engine_diagnostics`, and (from 2026-09-06) the allotted
//             `movetime_ms`, but no tier block, so it can say what the ceiling
//             was and never what work limit the engine had. Misty's work unit is
//             search iterations (`iters`), not nodes.
//
// The rule everywhere below: an absent field becomes null, never 0. A missing
// node count means "this writer does not tell us", and reporting that as zero
// nodes consumed would invent the exact fault we are looking for.
// ---------------------------------------------------------------------------

/** A number, or null. Anything non-finite (undefined, null, NaN, a string) is null. */
export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Keys no writer but room-manager.ts emits. `requested_engine_id` is the
 * strongest of them: only the chess path distinguishes the engine asked from the
 * engine that answered.
 */
const CHESS_PAYLOAD_MARKERS = [
  'requested_engine_id',
  'engine_diagnostics',
  'scores',
  'duration_ms',
];

export function detectPayloadShape(payload) {
  if (!payload || typeof payload !== 'object') return 'unknown';
  // Check the CHESS markers FIRST. Since 2026-09-06 that writer records a
  // `movetime_ms` of its own, so the old order — which reached the bare
  // `movetime_ms` test before any chess key — would now classify every fog/chess
  // row as the tenant shape and read its engine id, work count and exclusions
  // out of fields that shape does not have.
  if (CHESS_PAYLOAD_MARKERS.some((marker) => marker in payload)) return 'chess';
  // Then the nested tier block: the xiangqi payload also carries a top-level
  // `movetime_ms`, so testing that key first would misread it as the tenant
  // shape and silently drop its configured limits.
  if (payload.tier && typeof payload.tier === 'object') return 'xiangqi';
  if ('movetime_ms' in payload) return 'tenant';
  return 'unknown';
}

/**
 * One artifact row plus its game context, flattened to the fields a budget
 * comparison needs. Returns null for a row we cannot attribute to an engine —
 * an unattributed ply would land in a group named `null` and skew nothing
 * usefully.
 */
export function normalizeDecisionRow(input) {
  const payload = input.payload ?? null;
  const shape = detectPayloadShape(payload);
  if (shape === 'unknown') return null;

  const base = {
    gameId: input.gameId ?? null,
    variant: input.variant ?? (typeof payload.variant === 'string' ? payload.variant : null),
    ply: finiteNumber(input.ply),
    endedAt: input.endedAt ?? null,
    shape,
  };

  if (shape === 'chess') {
    const diagnostics =
      payload.engine_diagnostics && typeof payload.engine_diagnostics === 'object'
        ? payload.engine_diagnostics
        : {};
    const searchSeconds = finiteNumber(diagnostics.searchSeconds);
    return {
      ...base,
      engineId: payload.engine_id ?? payload.requested_engine_id ?? null,
      engineVersion: null,
      // The chess writer names it think_time_ms; older rows only have duration_ms.
      thinkTimeMs: finiteNumber(payload.think_time_ms) ?? finiteNumber(payload.duration_ms),
      searchTimeMs: searchSeconds === null ? null : Math.round(searchSeconds * 1000),
      // The per-move compute budget the live-cap allocator granted. Recorded
      // only from 2026-09-06 — rows written before that carry no budget at all
      // and stay null, which is why CEILING-UNKNOWN still has to exist.
      allottedMs: finiteNumber(payload.movetime_ms),
      tierMovetimeMs: null,
      // Misty counts search iterations, not nodes. Reporting `iters` in a column
      // headed "nodes" would compare two different units, so the unit rides along.
      workDone: finiteNumber(diagnostics.iters),
      workBudget: null,
      workUnit: 'iters',
      depth: null,
      tierDepth: null,
      // This writer persists no tier configuration, so it cannot say whether the
      // engine has a work limit. False here means "unknowable", which is a
      // different answer from "none configured" and must not collapse into it.
      tierConfigured: false,
      // `fallback` means the requested engine did not produce the move, so the
      // timing describes the fallback path rather than the engine we are grading.
      excluded: payload.fallback === true,
    };
  }

  const search = payload.search && typeof payload.search === 'object' ? payload.search : null;
  const tier = shape === 'xiangqi' && payload.tier ? payload.tier : null;
  const tierSkill = tier ? finiteNumber(tier.skill) : finiteNumber(payload.tier_skill);
  const tierDepth = tier ? finiteNumber(tier.depth) : finiteNumber(payload.tier_depth);
  const tierNodes = tier ? finiteNumber(tier.nodes) : finiteNumber(payload.tier_nodes);
  const tierMovetimeMs = tier
    ? finiteNumber(tier.movetime_ms)
    : finiteNumber(payload.tier_movetime_ms);
  return {
    ...base,
    engineId: payload.engine_id ?? null,
    engineVersion: payload.engine_version ?? null,
    thinkTimeMs: finiteNumber(payload.think_time_ms),
    searchTimeMs: search ? finiteNumber(search.time_ms) : null,
    // What the SERVER allotted this move. The tenant writer documents null as
    // "this engine gets no time budget at all" (the depth-limited in-process
    // searches), which is a different statement from a budget of zero.
    allottedMs: finiteNumber(payload.movetime_ms),
    tierMovetimeMs,
    workDone: search ? finiteNumber(search.nodes) : null,
    workBudget: tierNodes,
    workUnit: 'nodes',
    depth: search ? finiteNumber(search.depth) : null,
    // A depth cap is a WORK limit too, and for the engines that have no Skill
    // Level knob (PikaJieQi, the depth-capped rungs) it is the only one. Missing
    // it here would call a depth-limited engine "no work limit configured" and
    // excuse a ceiling that is genuinely cutting its search short.
    tierDepth,
    // Did this writer record the tier's configuration at all? Value-based, not
    // key-based, on purpose: the tenant writer always EMITS tier_skill /
    // tier_depth / tier_nodes / tier_movetime_ms, and emits them all null for a
    // caller that passed no tier. Reading key presence would then assert "no
    // work limit configured" about an engine whose configuration we never saw.
    tierConfigured:
      tierSkill !== null || tierDepth !== null || tierNodes !== null || tierMovetimeMs !== null,
    // A failed-closed or unreachable ply times out AT the ceiling by definition.
    // Leaving those in the percentiles would manufacture TIME-BOUND verdicts out
    // of engine outages, which is a different problem with a different fix.
    excluded: payload.failed_closed === true || payload.unreachable === true,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Nearest-rank percentile over an unsorted array of numbers, no interpolation:
 * the answer is always a ply that actually happened. Returns null for an empty
 * sample rather than 0 or NaN.
 */
export function percentile(values, fraction) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

/**
 * Group normalized rows by (variant, engine) and reduce each group to the
 * numbers a budget verdict needs.
 */
export function summarizeRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row?.engineId) continue;
    const key = `${row.variant ?? 'unknown'} ${row.engineId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        variant: row.variant ?? 'unknown',
        engineId: row.engineId,
        engineVersions: new Set(),
        shapes: new Set(),
        games: new Set(),
        plies: 0,
        excludedPlies: 0,
        thinkTimes: [],
        searchTimes: [],
        ceilings: [],
        tierMovetimes: [],
        workDone: [],
        workBudgets: [],
        tierDepths: [],
        // Plies whose payload described the tier at all, and of those, plies
        // that named a work limit. Counted separately so "the tier configures no
        // work limit" and "no ply told us what the tier configures" stay
        // distinguishable all the way to the verdict.
        tierConfiguredPlies: 0,
        workLimitPlies: 0,
        workUnit: row.workUnit,
        firstEndedAt: null,
        lastEndedAt: null,
      };
      groups.set(key, group);
    }
    group.plies += 1;
    group.shapes.add(row.shape);
    if (row.engineVersion) group.engineVersions.add(row.engineVersion);
    if (row.gameId) group.games.add(row.gameId);
    if (row.endedAt instanceof Date) {
      if (!group.firstEndedAt || row.endedAt < group.firstEndedAt) group.firstEndedAt = row.endedAt;
      if (!group.lastEndedAt || row.endedAt > group.lastEndedAt) group.lastEndedAt = row.endedAt;
    }
    // Tier limits are configuration, not observation, so they are collected even
    // from plies whose timing we throw away.
    if (row.tierMovetimeMs !== null) group.tierMovetimes.push(row.tierMovetimeMs);
    if (row.workBudget !== null) group.workBudgets.push(row.workBudget);
    if (row.tierDepth !== null && row.tierDepth !== undefined) group.tierDepths.push(row.tierDepth);
    if (row.tierConfigured) group.tierConfiguredPlies += 1;
    if (row.workBudget !== null || (row.tierDepth !== null && row.tierDepth !== undefined)) {
      group.workLimitPlies += 1;
    }
    if (row.excluded) {
      group.excludedPlies += 1;
      continue;
    }
    if (row.thinkTimeMs !== null) group.thinkTimes.push(row.thinkTimeMs);
    if (row.searchTimeMs !== null) group.searchTimes.push(row.searchTimeMs);
    if (row.allottedMs !== null) group.ceilings.push(row.allottedMs);
    if (row.workDone !== null) group.workDone.push(row.workDone);
  }

  return [...groups.values()]
    .map((group) => finalizeGroup(group))
    .sort((a, b) => a.variant.localeCompare(b.variant) || a.engineId.localeCompare(b.engineId));
}

function finalizeGroup(group) {
  const thinkP50 = percentile(group.thinkTimes, 0.5);
  // The ceiling in force is the budget the server actually handed over, which
  // the clock allocator can shrink below the tier's configured cap under time
  // pressure. Take its median so one bullet finish cannot redefine the ceiling;
  // fall back to the tier's own number when the writer records no per-ply budget.
  const allottedP50 = percentile(group.ceilings, 0.5);
  const tierMovetimeMs = percentile(group.tierMovetimes, 0.5);
  const ceilingMs = allottedP50 ?? tierMovetimeMs;
  const ceilingSource = allottedP50 !== null ? 'allotted' : tierMovetimeMs !== null ? 'tier' : null;
  const summary = {
    variant: group.variant,
    engineId: group.engineId,
    engineVersions: [...group.engineVersions].sort(),
    shapes: [...group.shapes].sort(),
    games: group.games.size,
    plies: group.plies,
    scoredPlies: group.thinkTimes.length,
    excludedPlies: group.excludedPlies,
    firstEndedAt: group.firstEndedAt,
    lastEndedAt: group.lastEndedAt,
    thinkP50Ms: thinkP50,
    thinkP90Ms: percentile(group.thinkTimes, 0.9),
    thinkMaxMs: percentile(group.thinkTimes, 1),
    searchP50Ms: percentile(group.searchTimes, 0.5),
    ceilingMs,
    ceilingSource,
    tierMovetimeMs,
    utilization: thinkP50 !== null && ceilingMs ? thinkP50 / ceilingMs : null,
    workUnit: group.workUnit,
    workP50: percentile(group.workDone, 0.5),
    workBudget: percentile(group.workBudgets, 0.5),
    tierDepth: percentile(group.tierDepths, 0.5),
    // Tri-state, and the null case is load-bearing:
    //   true  — a node or depth cap is configured (the cap can be unreachable,
    //           which is what TIME-BOUND means).
    //   false — the tier was recorded and configures NO work limit, so movetime
    //           is the only limit it has and binding on it is correct.
    //   null  — no ply described the tier, so we cannot tell which. Derived from
    //           the recorded tier fields rather than an engine-id list on
    //           purpose: a hardcoded list goes stale the first time a tier is
    //           added, and silently, since a missing id just reads as "has one".
    workLimitConfigured:
      group.workLimitPlies > 0 ? true : group.tierConfiguredPlies > 0 ? false : null,
    // How many scored plies actually reported a work count. A group where this
    // is 0 tells you nothing about node consumption, and must not read as zero
    // nodes consumed.
    workSamples: group.workDone.length,
    byDesign: isDifficultyLadderEngine(group.engineId),
  };
  summary.verdict = verdictFor(summary);
  return summary;
}

/**
 * The verdict for one summarized group. Pure, and deliberately ordered: data
 * sufficiency is checked before any ratio, so a thin or shapeless sample can
 * never produce a confident-looking TIME-BOUND.
 *
 * `summary.workLimitConfigured` splits the time-bound case three ways. A bot
 * with no work limit at all is SUPPOSED to stop on the clock, and calling that
 * a finding is what emptied the verdict of meaning: on the 2026-09-06 prod run
 * `pikafish-jieqi-strongest` (a bare `go movetime 4000`, no depth, no nodes)
 * scored the same 100% utilization as jungle, whose node cap the search never
 * gets near. Only the second of those is a defect.
 */
export function verdictFor(summary, thresholds = {}) {
  const timeBound = thresholds.timeBound ?? TIME_BOUND_UTILIZATION;
  const workBound = thresholds.workBound ?? WORK_BOUND_UTILIZATION;
  const minPlies = thresholds.minPlies ?? MIN_PLIES_FOR_VERDICT;

  const scored = summary.scoredPlies ?? 0;
  if (scored < minPlies) return VERDICT_INSUFFICIENT_DATA;
  if (summary.thinkP50Ms === null || summary.thinkP50Ms === undefined) return VERDICT_NO_TIMING;
  if (!summary.ceilingMs) return VERDICT_CEILING_UNKNOWN;

  const utilization = summary.thinkP50Ms / summary.ceilingMs;
  if (utilization >= timeBound) {
    if (summary.workLimitConfigured === true) return VERDICT_TIME_BOUND;
    if (summary.workLimitConfigured === false) return VERDICT_TIME_BOUND_BY_DESIGN;
    // null/undefined: the payload never described the tier. Default to saying so
    // rather than to the finding — an unknown that renders as a defect gets
    // acted on, and there is nothing to act on here but the writer.
    return VERDICT_TIME_BOUND_WORK_LIMIT_UNKNOWN;
  }
  if (utilization < workBound) return VERDICT_WORK_BOUND_WASTEFUL;
  return VERDICT_HEALTHY;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** `--since` accepts an ISO date (2026-08-01) or a relative window (14d, 4w). */
export function parseSince(value, now = new Date()) {
  if (!value) return null;
  const relative = /^(\d+)\s*([dhw])$/i.exec(value.trim());
  if (relative) {
    const amount = Number.parseInt(relative[1], 10);
    const unitMs = { h: 3_600_000, d: 86_400_000, w: 604_800_000 }[relative[2].toLowerCase()];
    return new Date(now.getTime() - amount * unitMs);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Could not read --since ${value}. Use an ISO date (2026-08-01) or 14d / 4w.`);
  }
  return parsed;
}

export function formatMs(value) {
  if (value === null || value === undefined) return '-';
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

export function formatCount(value) {
  if (value === null || value === undefined) return '-';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  // Only abbreviate past 10K: a depth-capped rung's few thousand nodes rounds to
  // a useless "4K", and those are exactly the rungs whose budget is in question.
  if (value >= 10_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(Math.round(value));
}

export function formatPercent(value) {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * The work-limit cell. Three outcomes, and they must read differently, because
 * they are the reason the verdict beside them says what it says:
 *   "524K nodes" / "depth 10"  a work limit IS configured
 *   "none"                     the tier was recorded and configures none
 *   "unknown"                  no ply described the tier
 * The old cell printed "unknown" for the middle case too, which is how a
 * correctly time-bound bot read as a broken one.
 */
export function formatWorkBudget(summary) {
  if (summary.workBudget !== null && summary.workBudget !== undefined) {
    return `${formatCount(summary.workBudget)} ${summary.workUnit}`;
  }
  if (summary.tierDepth !== null && summary.tierDepth !== undefined) {
    return `depth ${formatCount(summary.tierDepth)}`;
  }
  return summary.workLimitConfigured === false ? 'none' : 'unknown';
}

/** Left-aligned fixed-width table, matching the plain-text style of the other ops scripts. */
export function renderTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? '').length), 1),
  );
  const line = (cells) =>
    cells
      .map((cell, index) => String(cell ?? '').padEnd(widths[index]))
      .join('  ')
      .trimEnd();
  return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)];
}

export function renderReport(summaries, meta) {
  const lines = [
    'Engine budget report — which limit is binding, per bot',
    `window: ${meta.since ? `since ${meta.since.toISOString().slice(0, 10)}` : 'all time'}` +
      `${meta.variant ? `, variant=${meta.variant}` : ''}` +
      `${meta.engine ? `, engine=${meta.engine}` : ''}`,
    `artifacts scanned: ${meta.scannedRows}${meta.truncated ? ` (capped at --limit ${meta.limit})` : ''}` +
      `, unreadable payloads: ${meta.unreadableRows}`,
    '',
  ];

  if (summaries.length === 0) {
    lines.push('No live-engine-decision artifacts matched. Widen --since or drop --variant.');
    return lines.join('\n');
  }

  const table = renderTable(
    [
      'variant',
      'engine',
      'games',
      'plies',
      'p50',
      'p90',
      'max',
      'ceiling',
      'util',
      'work p50',
      'work budget',
      'verdict',
    ],
    summaries.map((summary) => [
      summary.variant,
      summary.engineId,
      String(summary.games),
      // Scored plies is the sample the percentiles came from; the total matters
      // only when they differ, which is when an engine has been failing.
      summary.excludedPlies > 0
        ? `${summary.scoredPlies}(+${summary.excludedPlies})`
        : String(summary.scoredPlies),
      formatMs(summary.thinkP50Ms),
      formatMs(summary.thinkP90Ms),
      formatMs(summary.thinkMaxMs),
      summary.ceilingMs === null
        ? 'unknown'
        : `${formatMs(summary.ceilingMs)}${summary.ceilingSource === 'tier' ? '*' : ''}`,
      formatPercent(summary.utilization),
      summary.workSamples === 0 ? 'unknown' : `${formatCount(summary.workP50)} ${summary.workUnit}`,
      formatWorkBudget(summary),
      // The marker belongs only on the two verdicts that would otherwise read as
      // findings; "INSUFFICIENT-DATA (by design)" says nothing.
      summary.byDesign &&
      (summary.verdict === VERDICT_WORK_BOUND_WASTEFUL || summary.verdict === VERDICT_TIME_BOUND)
        ? `${summary.verdict} (by design)`
        : summary.verdict,
    ]),
  );
  lines.push(...table, '');

  const dated = summaries.filter((summary) => summary.firstEndedAt && summary.lastEndedAt);
  if (dated.length > 0) {
    const first = new Date(Math.min(...dated.map((summary) => summary.firstEndedAt.getTime())));
    const last = new Date(Math.max(...dated.map((summary) => summary.lastEndedAt.getTime())));
    lines.push(
      `games covered: ${first.toISOString().slice(0, 10)} .. ${last.toISOString().slice(0, 10)}`,
    );
  }

  lines.push(
    '',
    `verdicts: at p50 >= ${Math.round(TIME_BOUND_UTILIZATION * 100)}% of ceiling the clock is ` +
      `what stops the search, and the work-limit column says whether that is a fault:`,
    '  TIME-BOUND                     a node/depth cap IS configured and is never reached, so',
    '                                 the configured strength is fiction and the real strength',
    '                                 follows host load. This is the finding.',
    '  TIME-BOUND-BY-DESIGN           the tier configures NO work limit, so movetime is its only',
    '                                 limit and binding on it is correct (pikafish-jieqi-strongest',
    '                                 runs a bare `go movetime 4000`). Raise the ceiling to buy',
    '                                 strength; there is no work cap to raise.',
    '  TIME-BOUND-WORK-LIMIT-UNKNOWN  pinned at the ceiling, but no ply recorded the tier at all,',
    '                                 so which of the two above applies cannot be told from here.',
    `  WORK-BOUND-WASTEFUL            below ${Math.round(WORK_BOUND_UTILIZATION * 100)}% of the ceiling: the latency the player already`,
    '                                 agreed to wait is being handed back.',
    `  HEALTHY                        between the two. INSUFFICIENT-DATA under ${MIN_PLIES_FOR_VERDICT} scored plies.`,
    'CEILING-UNKNOWN means the writer persisted no budget for that move. The chess /',
    '  dark-chess path records one from 2026-09-06; rows written before that do not.',
    '  It is not a ceiling of zero.',
    'work budget "none" = the tier configures no work limit; "unknown" = no ply said.',
    '"(by design)" marks the Fairy-Stockfish ladder rungs 1-7: their movetime IS the',
    '  difficulty setting and their Elo anchors were measured at it, so a low',
    '  utilization there is the configuration working, not a finding. --exclude-ladder',
    '  drops them entirely.',
    "ceiling* = no per-ply budget recorded; the tier's configured movetime was used.",
    'plies shown as n(+m): n scored, m dropped as failed-closed/unreachable/fallback',
    '  (those time out AT the ceiling and would manufacture TIME-BOUND verdicts).',
  );
  return lines.join('\n');
}

function usage() {
  return [
    'Usage: node scripts/engine-budget-report.mjs [options]',
    '',
    '  --since <ISO|Nd|Nw>   only games ended since then (default 30d)',
    '  --variant <id>        restrict to one variant (games.variant)',
    '  --engine <id>         restrict to one engine id',
    '  --limit <n>           cap artifact rows scanned, newest first (default 50000)',
    '  --exclude-ladder      omit the Fairy-Stockfish difficulty rungs 1-7',
    '  --json                machine-readable output',
  ].join('\n');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

export async function loadDecisionRows(client, options) {
  // Read-only, one statement. `storage = 'jsonb'` because an offloaded artifact
  // has its payload behind a uri and there is nothing here to read.
  const { rows } = await client.query(
    `SELECT artifact.game_id,
            artifact.ply,
            artifact.payload,
            game.variant,
            game.ended_at
       FROM game_debug_artifacts artifact
       JOIN games game ON game.room_id = artifact.game_id
      WHERE artifact.artifact_type = $1
        AND artifact.storage = 'jsonb'
        AND artifact.payload IS NOT NULL
        AND ($2::timestamptz IS NULL OR game.ended_at >= $2)
        AND ($3::text IS NULL OR game.variant = $3)
      ORDER BY game.ended_at DESC, artifact.game_id, artifact.ply
      LIMIT $4`,
    [
      LIVE_ENGINE_DECISION_ARTIFACT_TYPE,
      options.since ? options.since.toISOString() : null,
      options.variant ?? null,
      options.limit,
    ],
  );
  return rows;
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        since: { type: 'string' },
        variant: { type: 'string' },
        engine: { type: 'string' },
        limit: { type: 'string' },
        'exclude-ladder': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (err) {
    fail(`${err.message}\n\n${usage()}`);
  }
  if (values.help) {
    console.log(usage());
    return;
  }

  let since;
  try {
    since = parseSince(values.since ?? DEFAULT_SINCE);
  } catch (err) {
    fail(err.message);
  }

  const limit = values.limit ? Number.parseInt(values.limit, 10) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) fail(`--limit must be a positive integer.`);

  if (!process.env.DATABASE_URL) {
    fail(
      'DATABASE_URL is not set. For production, run this through Railway so the\n' +
        'connection string never enters your shell:\n' +
        '  railway run -s Postgres -- sh -c \'DATABASE_URL="$DATABASE_PUBLIC_URL" ' +
        "node scripts/engine-budget-report.mjs'",
    );
  }

  // Managed Postgres wants TLS; the local dev container has none. Matching the
  // detection the other ops scripts use rather than inventing a third rule.
  const isLocal =
    /(?:@|\/\/)(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(process.env.DATABASE_URL) ||
    /sslmode=disable/.test(process.env.DATABASE_URL);
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  let raw;
  try {
    raw = await loadDecisionRows(client, { since, variant: values.variant, limit });
  } finally {
    await client.end();
  }

  let unreadableRows = 0;
  const normalized = [];
  for (const row of raw) {
    const normalizedRow = normalizeDecisionRow({
      gameId: row.game_id,
      ply: row.ply,
      payload: row.payload,
      variant: row.variant,
      endedAt: row.ended_at,
    });
    if (!normalizedRow) {
      unreadableRows += 1;
      continue;
    }
    if (values.engine && normalizedRow.engineId !== values.engine) continue;
    normalized.push(normalizedRow);
  }

  let summaries = summarizeRows(normalized);
  if (values['exclude-ladder']) summaries = summaries.filter((summary) => !summary.byDesign);

  const meta = {
    since,
    variant: values.variant ?? null,
    engine: values.engine ?? null,
    limit,
    scannedRows: raw.length,
    truncated: raw.length >= limit,
    unreadableRows,
  };

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          kind: 'engine_budget_report',
          thresholds: {
            timeBound: TIME_BOUND_UTILIZATION,
            workBound: WORK_BOUND_UTILIZATION,
            minPlies: MIN_PLIES_FOR_VERDICT,
          },
          window: {
            since: since ? since.toISOString() : null,
            variant: meta.variant,
            engine: meta.engine,
            limit,
            scannedRows: meta.scannedRows,
            truncated: meta.truncated,
            unreadableRows,
          },
          engines: summaries.map((summary) => ({
            ...summary,
            firstEndedAt: summary.firstEndedAt ? summary.firstEndedAt.toISOString() : null,
            lastEndedAt: summary.lastEndedAt ? summary.lastEndedAt.toISOString() : null,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(renderReport(summaries, meta));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
