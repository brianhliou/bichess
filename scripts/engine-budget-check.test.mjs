// Unit tests for the scheduled engine budget check. Everything here is offline:
// no database, no mail provider.
//
// The summaries under test are built by running REAL artifact payloads through
// the report's own `summarizeRows`, not by hand-writing `{ verdict: 'TIME-BOUND' }`.
// A hand-written summary would only prove that a filter matches the string it
// was given; it would pass unchanged if the report stopped producing that
// verdict, or produced it for the wrong bots. What has to hold is the whole
// chain — payload, verdict, suppression, alert decision — because that chain is
// what decides whether an email leaves.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALERT_SEVERITY,
  ALERTING_VERDICTS,
  buildAlertPayload,
  describeError,
  describeFinding,
  EXIT_ALERT_FAILED,
  EXIT_CLEAN,
  EXIT_FINDINGS,
  exitCodeForOutcome,
  isAlertingVerdict,
  isSuppressedByDesign,
  MAX_ALERT_FINDING_FIELDS,
  renderCheckReport,
  selectFindings,
} from './engine-budget-check.mjs';
import {
  MIN_PLIES_FOR_VERDICT,
  normalizeDecisionRow,
  summarizeRows,
  VERDICT_CEILING_UNKNOWN,
  VERDICT_HEALTHY,
  VERDICT_INSUFFICIENT_DATA,
  VERDICT_TIME_BOUND,
  VERDICT_TIME_BOUND_BY_DESIGN,
  VERDICT_TIME_BOUND_WORK_LIMIT_UNKNOWN,
  VERDICT_WORK_BOUND_WASTEFUL,
} from './engine-budget-report.mjs';

// --- fixtures -------------------------------------------------------------

// The variant-tenant writer's flat shape (engine-decisions.ts): tier limits
// hoisted to top-level tier_* keys, search block for what actually happened.
// Every field the normalizer reads is present, including the ones set null,
// because the real writer emits them null rather than omitting them.
function tenantPlies({
  variant,
  engineId,
  plies = MIN_PLIES_FOR_VERDICT + 10,
  thinkTimeMs,
  movetimeMs,
  tierNodes = null,
  tierDepth = null,
  tierMovetimeMs = null,
  nodes = null,
}) {
  const rows = [];
  for (let ply = 0; ply < plies; ply += 1) {
    rows.push(
      normalizeDecisionRow({
        gameId: `room-${engineId}-${Math.floor(ply / 20)}`,
        ply,
        variant,
        endedAt: new Date('2026-09-05T00:00:00Z'),
        payload: {
          variant,
          engine_id: engineId,
          engine_version: '1.0.0',
          think_time_ms: thinkTimeMs,
          movetime_ms: movetimeMs,
          tier_skill: null,
          tier_depth: tierDepth,
          tier_nodes: tierNodes,
          tier_movetime_ms: tierMovetimeMs,
          search: { time_ms: thinkTimeMs, nodes, depth: null },
        },
      }),
    );
  }
  return rows;
}

/** The configured node cap is never reached; the clock ends every search. */
const timeBoundRows = tenantPlies({
  variant: 'jungle',
  engineId: 'mistboard-jungle-v2',
  thinkTimeMs: 4_950,
  movetimeMs: 5_000,
  tierNodes: 1_000_000,
  nodes: 180_000,
});

/** Node cap so cheap the ceiling is never approached: budget handed back. */
const wastefulRows = tenantPlies({
  variant: 'jungle-flip',
  engineId: 'mistboard-jungle-flip-v1',
  thinkTimeMs: 205,
  movetimeMs: 5_000,
  tierNodes: 20_000,
  nodes: 19_800,
});

/** Both limits roughly in balance. */
const healthyRows = tenantPlies({
  variant: 'banqi',
  engineId: 'mistboard-banqi-v3',
  thinkTimeMs: 3_000,
  movetimeMs: 5_000,
  tierNodes: 400_000,
  nodes: 260_000,
});

/**
 * A bare `go movetime 4000`: the tier is recorded (tier_movetime_ms) and
 * configures NO work limit, so stopping on the clock is the design.
 */
const byDesignRows = tenantPlies({
  variant: 'jieqi',
  engineId: 'pikafish-jieqi-strongest',
  thinkTimeMs: 3_980,
  movetimeMs: 4_000,
  tierMovetimeMs: 4_000,
});

/** One short game: not enough evidence for any verdict. */
const thinRows = tenantPlies({
  variant: 'fortress',
  engineId: 'mistboard-fortress-v1',
  plies: 6,
  thinkTimeMs: 120,
  movetimeMs: 5_000,
  tierNodes: 500_000,
});

/** The writer persisted no budget for the move; the ratio is undefined. */
const ceilingUnknownRows = tenantPlies({
  variant: 'dark-chess',
  engineId: 'misty-v4',
  thinkTimeMs: 900,
  movetimeMs: null,
  tierNodes: null,
});

/** Pinned at the ceiling, but no ply described the tier at all. */
const workLimitUnknownRows = tenantPlies({
  variant: 'dark-xiangqi',
  engineId: 'misty-dxq-v2',
  thinkTimeMs: 4_990,
  movetimeMs: 5_000,
});

/** Ladder rung 3: 200 ms of a 5 s ceiling IS the difficulty setting. */
const ladderWastefulRows = tenantPlies({
  variant: 'xiangqi',
  engineId: 'fairy-stockfish-xiangqi-level-3',
  thinkTimeMs: 200,
  movetimeMs: 5_000,
  tierMovetimeMs: 200,
  tierDepth: 4,
  nodes: 9_000,
});

/** Ladder rung 8 is node-anchored for strength, so its budget IS a signal. */
const ladderLevel8Rows = tenantPlies({
  variant: 'xiangqi',
  engineId: 'fairy-stockfish-xiangqi-level-8',
  thinkTimeMs: 210,
  movetimeMs: 6_000,
  tierNodes: 1_000_000,
  nodes: 40_000,
});

function summarize(...rowSets) {
  return summarizeRows(rowSets.flat());
}

function verdictOf(summaries, engineId) {
  const summary = summaries.find((candidate) => candidate.engineId === engineId);
  assert.ok(summary, `no summary produced for ${engineId}`);
  return summary.verdict;
}

// --- the fixtures produce the verdicts the alert decision is built on -------

test('fixtures reproduce every verdict the check has to sort', () => {
  const summaries = summarize(
    timeBoundRows,
    wastefulRows,
    healthyRows,
    byDesignRows,
    thinRows,
    ceilingUnknownRows,
    workLimitUnknownRows,
    ladderWastefulRows,
    ladderLevel8Rows,
  );
  assert.equal(verdictOf(summaries, 'mistboard-jungle-v2'), VERDICT_TIME_BOUND);
  assert.equal(verdictOf(summaries, 'mistboard-jungle-flip-v1'), VERDICT_WORK_BOUND_WASTEFUL);
  assert.equal(verdictOf(summaries, 'mistboard-banqi-v3'), VERDICT_HEALTHY);
  assert.equal(verdictOf(summaries, 'pikafish-jieqi-strongest'), VERDICT_TIME_BOUND_BY_DESIGN);
  assert.equal(verdictOf(summaries, 'mistboard-fortress-v1'), VERDICT_INSUFFICIENT_DATA);
  assert.equal(verdictOf(summaries, 'misty-v4'), VERDICT_CEILING_UNKNOWN);
  assert.equal(verdictOf(summaries, 'misty-dxq-v2'), VERDICT_TIME_BOUND_WORK_LIMIT_UNKNOWN);
  assert.equal(
    verdictOf(summaries, 'fairy-stockfish-xiangqi-level-3'),
    VERDICT_WORK_BOUND_WASTEFUL,
  );
  assert.equal(
    verdictOf(summaries, 'fairy-stockfish-xiangqi-level-8'),
    VERDICT_WORK_BOUND_WASTEFUL,
  );
});

// --- which verdicts fire ---------------------------------------------------

test('only the two misconfiguration verdicts are alerting', () => {
  assert.deepEqual([...ALERTING_VERDICTS], [VERDICT_TIME_BOUND, VERDICT_WORK_BOUND_WASTEFUL]);
  assert.equal(isAlertingVerdict(VERDICT_TIME_BOUND), true);
  assert.equal(isAlertingVerdict(VERDICT_WORK_BOUND_WASTEFUL), true);
  for (const quiet of [
    VERDICT_TIME_BOUND_BY_DESIGN,
    VERDICT_TIME_BOUND_WORK_LIMIT_UNKNOWN,
    VERDICT_CEILING_UNKNOWN,
    VERDICT_HEALTHY,
    VERDICT_INSUFFICIENT_DATA,
  ]) {
    assert.equal(isAlertingVerdict(quiet), false, `${quiet} must not alert`);
  }
});

test('a findings set alerts, and names both faults', () => {
  const findings = selectFindings(summarize(timeBoundRows, wastefulRows, healthyRows));
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((finding) => finding.engineId).sort(), [
    'mistboard-jungle-flip-v1',
    'mistboard-jungle-v2',
  ]);
});

test('a clean set is silent', () => {
  const findings = selectFindings(summarize(healthyRows));
  assert.deepEqual(findings, []);
  assert.equal(exitCodeForOutcome({ findingCount: findings.length }), EXIT_CLEAN);
});

test('by-design and insufficient-data alone are silent', () => {
  // The set that broke the first version of this idea: three bots that look
  // alarming in a table and are all correct. If any of these mails, the check
  // becomes a daily message and stops being read.
  const findings = selectFindings(
    summarize(byDesignRows, thinRows, ceilingUnknownRows, workLimitUnknownRows),
  );
  assert.deepEqual(findings, []);
});

test('an empty or absent summary list is silent, not a crash', () => {
  assert.deepEqual(selectFindings([]), []);
  assert.deepEqual(selectFindings(undefined), []);
  assert.deepEqual(selectFindings([null, undefined]), []);
});

// --- ladder suppression ----------------------------------------------------

test('ladder rungs 1-7 are suppressed even when they look wasteful', () => {
  const summaries = summarize(ladderWastefulRows);
  assert.equal(
    verdictOf(summaries, 'fairy-stockfish-xiangqi-level-3'),
    VERDICT_WORK_BOUND_WASTEFUL,
  );
  assert.deepEqual(selectFindings(summaries), []);
});

test('ladder suppression holds when a summary lost its byDesign flag', () => {
  // A summary can reach this code from somewhere other than finalizeGroup — a
  // --json file, a future caller. The id test is what keeps suppression from
  // depending on a flag that a different producer never sets.
  const [summary] = summarize(ladderWastefulRows);
  delete summary.byDesign;
  assert.equal(isSuppressedByDesign(summary), true);
  assert.deepEqual(selectFindings([summary]), []);
});

test('ladder suppression covers time-bound rungs too, not just wasteful ones', () => {
  const rows = tenantPlies({
    variant: 'xiangqi',
    engineId: 'fairy-stockfish-xiangqi-level-7',
    thinkTimeMs: 498,
    movetimeMs: 500,
    tierNodes: 900_000,
    tierMovetimeMs: 500,
    nodes: 120_000,
  });
  const summaries = summarize(rows);
  assert.equal(verdictOf(summaries, 'fairy-stockfish-xiangqi-level-7'), VERDICT_TIME_BOUND);
  assert.deepEqual(selectFindings(summaries), []);
});

test('ladder rung 8 is NOT suppressed: it is node-anchored for strength', () => {
  const findings = selectFindings(summarize(ladderLevel8Rows));
  assert.deepEqual(
    findings.map((finding) => finding.engineId),
    ['fairy-stockfish-xiangqi-level-8'],
  );
});

test('a real finding still fires when ladder rungs are in the same set', () => {
  // The suppression must drop rungs, not the whole run. This is the shape the
  // check will actually see in production: seven quiet rungs plus one fault.
  const findings = selectFindings(summarize(ladderWastefulRows, timeBoundRows, byDesignRows));
  assert.deepEqual(
    findings.map((finding) => finding.engineId),
    ['mistboard-jungle-v2'],
  );
});

// --- the alert payload -----------------------------------------------------

test('alert payload counts each fault and carries a line per finding', () => {
  const findings = selectFindings(summarize(timeBoundRows, wastefulRows));
  const payload = buildAlertPayload(findings, { sinceLabel: '30d', enginesReviewed: 5 });
  assert.equal(payload.severity, ALERT_SEVERITY);
  assert.equal(payload.alert_kind, 'engine_budget');
  assert.equal(payload.findings, 2);
  assert.equal(payload.time_bound, 1);
  assert.equal(payload.work_bound_wasteful, 1);
  assert.equal(payload.window, '30d');
  assert.equal(payload.engines_reviewed, 5);
  assert.equal(typeof payload.finding_1, 'string');
  assert.equal(typeof payload.finding_2, 'string');
  assert.equal(payload.findings_omitted, undefined);
  assert.match(payload.next_step, /engine:budget-report/);
});

test('alert payload values are all strings or numbers', () => {
  // sendEngineAlertNotification renders `- key: String(value)`. An object here
  // reaches the operator as [object Object], which is a silent loss of the one
  // thing the email exists to carry.
  const payload = buildAlertPayload(selectFindings(summarize(timeBoundRows)), {
    sinceLabel: '7d',
    variant: 'jungle',
  });
  for (const [key, value] of Object.entries(payload)) {
    assert.ok(
      typeof value === 'string' || typeof value === 'number',
      `${key} is ${typeof value}, which the alert template cannot render`,
    );
  }
  assert.equal(payload.variant_filter, 'jungle');
});

test('alert payload caps the per-finding lines and reports the overflow', () => {
  const many = [];
  for (let index = 0; index < MAX_ALERT_FINDING_FIELDS + 3; index += 1) {
    many.push(
      ...tenantPlies({
        variant: 'jungle',
        engineId: `mistboard-overflow-${index}`,
        thinkTimeMs: 100,
        movetimeMs: 5_000,
        tierNodes: 10_000,
        nodes: 9_000,
      }),
    );
  }
  const findings = selectFindings(summarizeRows(many));
  assert.equal(findings.length, MAX_ALERT_FINDING_FIELDS + 3);
  const payload = buildAlertPayload(findings, { sinceLabel: '30d' });
  assert.equal(payload[`finding_${MAX_ALERT_FINDING_FIELDS}`] !== undefined, true);
  assert.equal(payload[`finding_${MAX_ALERT_FINDING_FIELDS + 1}`], undefined);
  assert.equal(payload.findings_omitted, 3);
});

test('a finding line names the bot, the verdict, and both sides of the budget', () => {
  const [finding] = selectFindings(summarize(wastefulRows));
  const line = describeFinding(finding);
  assert.match(line, /jungle-flip/);
  assert.match(line, /mistboard-jungle-flip-v1/);
  assert.match(line, new RegExp(VERDICT_WORK_BOUND_WASTEFUL));
  assert.match(line, /205ms/);
  assert.match(line, /5000ms/);
  // The report's own formatter abbreviates past 10K, and the line reuses it so
  // an operator reading the email sees the same numbers as the table.
  assert.match(line, /work 20K nodes/);
  assert.match(line, /limit 20K nodes/);
});

// --- exit codes ------------------------------------------------------------

test('exit code separates clean, alerted, and undelivered', () => {
  assert.equal(exitCodeForOutcome({ findingCount: 0, emailStatus: undefined }), EXIT_CLEAN);
  assert.equal(exitCodeForOutcome({ findingCount: 2, emailStatus: 'sent' }), EXIT_FINDINGS);
  assert.equal(exitCodeForOutcome({ findingCount: 2, emailStatus: 'dry-run' }), EXIT_FINDINGS);
  // Throttled means an email about this same kind already reached the operator
  // inside the window, so the information is not lost.
  assert.equal(exitCodeForOutcome({ findingCount: 2, emailStatus: 'throttled' }), EXIT_FINDINGS);
  // The outcome the codes exist for: something is wrong AND nobody was told.
  assert.equal(exitCodeForOutcome({ findingCount: 2, emailStatus: 'disabled' }), EXIT_ALERT_FAILED);
  assert.equal(exitCodeForOutcome({ findingCount: 2, emailStatus: 'failed' }), EXIT_ALERT_FAILED);
});

test('a clean run is clean even if the mail path is broken', () => {
  // Nothing to say, so a disabled mailer is not an error worth failing a job on.
  assert.equal(exitCodeForOutcome({ findingCount: 0, emailStatus: 'disabled' }), EXIT_CLEAN);
});

// --- failure messages ------------------------------------------------------

test('a refused connection reports a cause, not an empty string', () => {
  // The shape node actually throws when a host resolves to several addresses
  // and every one refuses: an AggregateError whose OWN message is empty. The
  // first version of this script printed the message and produced a job log
  // that said "Could not read live-engine-decision artifacts: " and nothing.
  const aggregate = new AggregateError(
    [Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })],
    '',
  );
  const described = describeError(aggregate);
  assert.match(described, /ECONNREFUSED/);
  assert.notEqual(described.trim(), '');
});

test('describeError keeps a plain error message and its code', () => {
  const err = Object.assign(new Error('password authentication failed'), { code: '28P01' });
  assert.equal(describeError(err), 'password authentication failed; code 28P01');
  assert.equal(describeError(null), 'unknown error');
});

// --- console output --------------------------------------------------------

test('the clean report says nothing crossed a threshold', () => {
  const text = renderCheckReport([], { sinceLabel: '30d', enginesReviewed: 9, scannedRows: 4_212 });
  assert.match(text, /no findings/);
  assert.match(text, /engines reviewed: 9/);
  assert.doesNotMatch(text, /TIME-BOUND/);
});

test('the findings report lists every finding', () => {
  const findings = selectFindings(summarize(timeBoundRows, wastefulRows));
  const text = renderCheckReport(findings, { sinceLabel: '30d', enginesReviewed: 3 });
  assert.match(text, /findings \(2\)/);
  assert.match(text, /mistboard-jungle-v2/);
  assert.match(text, /mistboard-jungle-flip-v1/);
});
