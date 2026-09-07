#!/usr/bin/env node
// Scheduled guard over engine-budget-report.mjs: does any bot's search budget
// currently need a human?
//
// The report answers "which limit is binding each bot" on demand. Nobody runs it
// on demand, which is how fog xiangqi spent weeks searching 1.8% of its budget
// and jungle silently became time-bound so its strength tracked host load. Both
// were found by someone investigating an unrelated symptom. This script is the
// same analysis on a timer, and it is deliberately SILENT unless something
// crosses a threshold — a job that mails you a clean table every morning is a
// job you stop reading, and then it is worth nothing on the morning it isn't
// clean.
//
// It REPORTS. It never adjusts a budget. Every work limit in this repo is
// anchored to self-play Elo measured at that exact setting, so auto-tuning a
// strength parameter off a latency signal would trade away strength with nobody
// measuring what it cost.
//
// Usage (local Postgres, whatever DATABASE_URL points at):
//   node scripts/engine-budget-check.mjs --dry-run     # print, never send
//   node scripts/engine-budget-check.mjs               # send if there is a finding
//   node scripts/engine-budget-check.mjs --since 7d --json
//
// Against production, hand the connection to Railway rather than putting it in
// your shell. The connection string is referenced by name inside the child and
// never enters this process or the terminal:
//
//   railway run -s Postgres -- sh -c \
//     'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/engine-budget-check.mjs --dry-run'
//
// Sending from there needs the Resend variables too, which live on the `web`
// service rather than on Postgres — see the deployment note at the bottom of
// usage().
//
// Read-only: the analysis issues one SELECT and nothing else.

import { parseArgs } from 'node:util';
import pg from 'pg';

import {
  collectSummaries,
  DEFAULT_LIMIT,
  DEFAULT_SINCE,
  formatCount,
  formatMs,
  formatPercent,
  formatWorkBudget,
  isDifficultyLadderEngine,
  MIN_PLIES_FOR_VERDICT,
  parseSince,
  pgConnectionOptions,
  TIME_BOUND_UTILIZATION,
  VERDICT_TIME_BOUND,
  VERDICT_WORK_BOUND_WASTEFUL,
  verdictFor,
  WORK_BOUND_UTILIZATION,
} from './engine-budget-report.mjs';

// ---------------------------------------------------------------------------
// What is worth waking someone for
// ---------------------------------------------------------------------------

/**
 * The two verdicts that describe a MISCONFIGURATION, and the only two that mail.
 *
 * Everything else the report can say is either correct behavior or an admission
 * that the artifacts cannot answer the question:
 *   TIME-BOUND-BY-DESIGN           correct — the tier has no work limit to reach.
 *   TIME-BOUND-WORK-LIMIT-UNKNOWN  the writer never recorded the tier. Real, but
 *                                  it is a gap in instrumentation that no
 *                                  overnight page will move, and it would fire
 *                                  every night forever until someone changed a
 *                                  writer.
 *   CEILING-UNKNOWN                same shape: a writer gap, not a bot fault.
 *   INSUFFICIENT-DATA              a quiet week. Mailing about quiet weeks is how
 *                                  a check gets filtered to a folder.
 *   HEALTHY / NO-TIMING-RECORDED   nothing to do.
 */
export const ALERTING_VERDICTS = Object.freeze([VERDICT_TIME_BOUND, VERDICT_WORK_BOUND_WASTEFUL]);

export function isAlertingVerdict(verdict) {
  return ALERTING_VERDICTS.includes(verdict);
}

/**
 * The Fairy-Stockfish ladder rungs 1-7 are work-bound at tight ceilings ON
 * PURPOSE: the movetime IS the difficulty setting and their published Elo
 * anchors were measured at it. Level 1 sits at ~50 ms of a multi-second ceiling
 * and will read WORK-BOUND-WASTEFUL forever.
 *
 * Checked two ways because they fail differently. `byDesign` is what the report
 * computed for a summary it built; the id test catches a summary assembled by
 * some other caller (a --json file, a test) that never carried the flag. A
 * suppression that silently stops applying is worse than no suppression: the
 * check would page nightly about seven bots that are correct, and the real
 * finding underneath would be read as more of the same noise.
 */
export function isSuppressedByDesign(summary) {
  return summary?.byDesign === true || isDifficultyLadderEngine(summary?.engineId);
}

/** The alerting subset of a report's summaries, in the report's own order. */
export function selectFindings(summaries) {
  return (summaries ?? []).filter(
    (summary) => summary && isAlertingVerdict(summary.verdict) && !isSuppressedByDesign(summary),
  );
}

/**
 * Always `warning`, never `critical`, and that is a decision rather than an
 * oversight. Nothing this check can see is an outage: a misconfigured budget has
 * usually been wrong for weeks by the time a 30-day window notices, and the fix
 * is a reviewed change to a constant with an Elo measurement behind it, not a
 * 3am rollback. `critical` in this repo means a game is broken right now, and
 * spending it on slow configuration drift devalues it everywhere else.
 */
export const ALERT_SEVERITY = 'warning';

/**
 * How many findings get their own line in the email. The alert template renders
 * a flat `- key: value` list, so an unbounded fan-out turns the mail into a wall
 * nobody reads; past the cap the count carries the rest and the report command
 * in `next_step` has the detail.
 */
export const MAX_ALERT_FINDING_FIELDS = 12;

/** One finding as a single line: what is wrong, by how much, on what evidence. */
export function describeFinding(summary) {
  const utilization = formatPercent(summary.utilization);
  const ceiling = summary.ceilingMs === null ? 'unknown ceiling' : formatMs(summary.ceilingMs);
  const work =
    summary.workSamples === 0
      ? 'work unknown'
      : `work ${formatCount(summary.workP50)} ${summary.workUnit}`;
  return (
    `${summary.variant} ${summary.engineId}: ${summary.verdict}, ` +
    `p50 ${formatMs(summary.thinkP50Ms)} of ${ceiling} (${utilization}), ` +
    `${work} vs limit ${formatWorkBudget(summary)}, ` +
    `${summary.games} games / ${summary.scoredPlies} scored plies`
  );
}

/**
 * The flat payload the shared engine-alert email path renders. Values are
 * strings and numbers only: `sendEngineAlertNotification` prints them verbatim,
 * and an object here would reach the operator as `[object Object]`.
 *
 * Nothing derived from the environment goes in. The fields are counts, verdicts,
 * engine ids and timings — no connection string, no recipient, no key.
 */
export function buildAlertPayload(findings, meta = {}) {
  const timeBound = findings.filter((f) => f.verdict === VERDICT_TIME_BOUND).length;
  const wasteful = findings.filter((f) => f.verdict === VERDICT_WORK_BOUND_WASTEFUL).length;
  const payload = {
    severity: ALERT_SEVERITY,
    // The kind the check would be searched by in logs, and the throttle key the
    // shared path buckets on. Distinct from the runtime `engine_alert` kinds so
    // a nightly config finding can never mask a live engine failure.
    alert_kind: 'engine_budget',
    source: 'engine:budget-check',
    findings: findings.length,
    time_bound: timeBound,
    work_bound_wasteful: wasteful,
    window: meta.sinceLabel ?? 'all time',
    engines_reviewed: meta.enginesReviewed ?? findings.length,
  };
  if (meta.variant) payload.variant_filter = meta.variant;
  if (meta.engine) payload.engine_filter = meta.engine;

  for (const [index, finding] of findings.slice(0, MAX_ALERT_FINDING_FIELDS).entries()) {
    payload[`finding_${index + 1}`] = describeFinding(finding);
  }
  if (findings.length > MAX_ALERT_FINDING_FIELDS) {
    payload.findings_omitted = findings.length - MAX_ALERT_FINDING_FIELDS;
  }

  // The email's generic "suggested checks" are shaped for live engine faults.
  // Name the command that actually explains this alert.
  payload.next_step = `npm run engine:budget-report -- --since ${meta.sinceLabel ?? '30d'}`;
  return payload;
}

// ---------------------------------------------------------------------------
// Exit codes
//
// Distinct rather than "0 or 1", because a scheduler has to tell three outcomes
// apart and only one of them means a bot needs attention. Collapsing the last
// two in particular would let the check go quiet in exactly the failure it
// exists to prevent: findings detected, email never delivered, job green.
// ---------------------------------------------------------------------------

/** Nothing crossed a threshold. No email was sent. */
export const EXIT_CLEAN = 0;
/** Findings, and the operator has been told (or, under --dry-run, would be). */
export const EXIT_FINDINGS = 1;
/** Bad arguments or missing environment. Nothing was analysed. */
export const EXIT_USAGE = 2;
/** Findings, but the alert did NOT go out. The loudest outcome. */
export const EXIT_ALERT_FAILED = 3;

/**
 * Outcome to process exit code. Pure, so the mapping is testable without a
 * database or a mail provider.
 *
 * `emailStatus` is whatever `sendEngineAlertNotification` returned, or the
 * string 'dry-run' when nothing was attempted. 'throttled' counts as delivered:
 * the operator was mailed inside the throttle window about this same kind, so
 * the information reached them.
 */
export function exitCodeForOutcome({ findingCount, emailStatus }) {
  if (findingCount === 0) return EXIT_CLEAN;
  if (emailStatus === 'dry-run' || emailStatus === 'sent' || emailStatus === 'throttled') {
    return EXIT_FINDINGS;
  }
  return EXIT_ALERT_FAILED;
}

/** Console summary. Printed on every run, including the silent-and-clean one. */
export function renderCheckReport(findings, meta) {
  const scope =
    `window ${meta.sinceLabel ?? 'all time'}` +
    `${meta.variant ? `, variant=${meta.variant}` : ''}` +
    `${meta.engine ? `, engine=${meta.engine}` : ''}`;
  const lines = [
    `Engine budget check — ${scope}`,
    `engines reviewed: ${meta.enginesReviewed ?? 0}, artifacts scanned: ${meta.scannedRows ?? 0}` +
      `${meta.truncated ? ` (capped at --limit ${meta.limit})` : ''}`,
  ];
  if (findings.length === 0) {
    lines.push('no findings: nothing is time-bound with an unreachable work limit,');
    lines.push(`and nothing is under ${Math.round(WORK_BOUND_UTILIZATION * 100)}% of its ceiling.`);
    return lines.join('\n');
  }
  lines.push('', `findings (${findings.length}):`);
  for (const finding of findings) lines.push(`  ${describeFinding(finding)}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return [
    'Usage: node scripts/engine-budget-check.mjs [options]',
    '',
    'Runs the engine budget report and emails ONLY when a bot is misconfigured.',
    'Silent and exit 0 when clean.',
    '',
    `  --since <ISO|Nd|Nw>    window of finished games (default ${DEFAULT_SINCE})`,
    '  --variant <id>         restrict to one variant (games.variant)',
    '  --engine <id>          restrict to one engine id',
    `  --limit <n>            cap artifact rows scanned, newest first (default ${DEFAULT_LIMIT})`,
    `  --time-bound <ratio>   pinned-at-ceiling threshold (default ${TIME_BOUND_UTILIZATION})`,
    `  --work-bound <ratio>   wasteful-budget threshold (default ${WORK_BOUND_UTILIZATION})`,
    `  --min-plies <n>        scored plies before a verdict (default ${MIN_PLIES_FOR_VERDICT})`,
    '  --dry-run              print the email that would be sent; send nothing',
    '  --json                 machine-readable output',
    '',
    `Exit codes: ${EXIT_CLEAN} clean, ${EXIT_FINDINGS} findings alerted, ` +
      `${EXIT_USAGE} usage/environment, ${EXIT_ALERT_FAILED} findings but the alert failed.`,
    '',
    'Environment: DATABASE_URL for the analysis; the alert path additionally needs',
    'RESEND_API_KEY, MISTBOARD_ALERT_EMAIL_FROM and MISTBOARD_ALERT_EMAIL_TO. Those',
    'three live on the `web` service, not on Postgres, so a run through',
    '`railway run -s Postgres` can analyse but not send — use --dry-run there, or run',
    'the check from a context that has all four.',
  ].join('\n');
}

function fail(message) {
  console.error(message);
  process.exitCode = EXIT_USAGE;
}

/**
 * A failure, in words, for an operator who is looking at a job log and nothing
 * else.
 *
 * `err.message` alone is not enough here. A refused Postgres connection arrives
 * as an AggregateError — one sub-error per address the host resolved to — whose
 * own message is the EMPTY STRING, so the obvious `err.message` formatting
 * printed "Could not read live-engine-decision artifacts: " and stopped. The one
 * fact the operator needed (connection refused, or no such host) was in
 * `err.errors`.
 *
 * Nothing here can carry a credential: pg keeps the password out of both its
 * error text and its error codes, and the connection string is never formatted.
 */
export function describeError(err) {
  if (!err) return 'unknown error';
  const parts = [];
  if (err.message) parts.push(err.message);
  if (err.code) parts.push(`code ${err.code}`);
  if (Array.isArray(err.errors)) {
    for (const inner of err.errors) {
      if (inner?.message) parts.push(inner.message);
      else if (inner?.code) parts.push(`code ${inner.code}`);
    }
  }
  return parts.length > 0 ? parts.join('; ') : String(err);
}

/** A ratio option: a finite number in (0, 1]. */
function parseRatio(raw, flag) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${flag} must be a ratio greater than 0 and at most 1 (got ${raw}).`);
  }
  return value;
}

/**
 * Load the shared alert sender from the built server output.
 *
 * Dynamic, and deliberately attempted BEFORE the query rather than after the
 * findings: a check that discovers its own mail path is missing only on the
 * night it finally has something to say is a check that was never armed. The
 * import is skipped entirely under --dry-run only for the SEND function; the
 * renderers are still needed to show what would go out.
 */
async function loadAlertModule() {
  try {
    return await import('../apps/server/dist/engine-alert-email.js');
  } catch (err) {
    throw new Error(
      'Could not load the shared engine alert path from apps/server/dist.\n' +
        'Build the server first:  npm run build --workspace @mistboard/server\n' +
        `(${describeError(err)})`,
    );
  }
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
        'time-bound': { type: 'string' },
        'work-bound': { type: 'string' },
        'min-plies': { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (err) {
    fail(`${err.message}\n\n${usage()}`);
    return;
  }
  if (values.help) {
    console.log(usage());
    return;
  }

  const sinceLabel = values.since ?? DEFAULT_SINCE;
  let since;
  let thresholds;
  let limit;
  try {
    since = parseSince(sinceLabel);
    limit = values.limit ? Number.parseInt(values.limit, 10) : DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit <= 0)
      throw new Error('--limit must be a positive integer.');
    thresholds = {
      timeBound: values['time-bound']
        ? parseRatio(values['time-bound'], '--time-bound')
        : TIME_BOUND_UTILIZATION,
      workBound: values['work-bound']
        ? parseRatio(values['work-bound'], '--work-bound')
        : WORK_BOUND_UTILIZATION,
      minPlies: values['min-plies']
        ? Number.parseInt(values['min-plies'], 10)
        : MIN_PLIES_FOR_VERDICT,
    };
    if (!Number.isInteger(thresholds.minPlies) || thresholds.minPlies <= 0) {
      throw new Error('--min-plies must be a positive integer.');
    }
  } catch (err) {
    fail(err.message);
    return;
  }

  if (!process.env.DATABASE_URL) {
    fail(
      'DATABASE_URL is not set, so there is nothing to check.\n' +
        'For production, run this through Railway so the connection string never\n' +
        'enters your shell:\n' +
        '  railway run -s Postgres -- sh -c \'DATABASE_URL="$DATABASE_PUBLIC_URL" ' +
        "node scripts/engine-budget-check.mjs --dry-run'",
    );
    return;
  }

  let alertModule;
  try {
    alertModule = await loadAlertModule();
  } catch (err) {
    fail(err.message);
    return;
  }

  const client = new pg.Client(pgConnectionOptions(process.env.DATABASE_URL));
  let summaries;
  let reportMeta;
  try {
    await client.connect();
    try {
      ({ summaries, meta: reportMeta } = await collectSummaries(client, {
        since,
        variant: values.variant,
        engine: values.engine,
        limit,
      }));
    } finally {
      await client.end();
    }
  } catch (err) {
    // A connection or query failure is an environment problem, not a finding.
    // The message is the driver's; it describes host and database but never the
    // password, which pg keeps out of its error text.
    fail(`Could not read live-engine-decision artifacts: ${describeError(err)}`);
    return;
  }

  // Re-verdict only when the operator overrode a threshold. summarizeRows
  // already applied the report's own constants, so an unmodified run reuses that
  // verdict verbatim rather than recomputing a possibly-different one.
  const overridden =
    thresholds.timeBound !== TIME_BOUND_UTILIZATION ||
    thresholds.workBound !== WORK_BOUND_UTILIZATION ||
    thresholds.minPlies !== MIN_PLIES_FOR_VERDICT;
  if (overridden) {
    for (const summary of summaries) summary.verdict = verdictFor(summary, thresholds);
  }

  const findings = selectFindings(summaries);
  const meta = {
    sinceLabel,
    variant: reportMeta.variant,
    engine: reportMeta.engine,
    limit: reportMeta.limit,
    scannedRows: reportMeta.scannedRows,
    truncated: reportMeta.truncated,
    enginesReviewed: summaries.length,
  };

  if (findings.length === 0) {
    // The silent path. Something is printed for whoever is watching a terminal
    // or a job log, but no mail leaves and the exit code is clean.
    if (values.json) {
      console.log(JSON.stringify(runJson(meta, 0), null, 2));
    } else {
      console.log(renderCheckReport(findings, meta));
    }
    process.exitCode = EXIT_CLEAN;
    return;
  }

  const alert = buildAlertPayload(findings, meta);
  const at = new Date();
  const subject = alertModule.engineAlertEmailSubject(alert);
  const text = alertModule.engineAlertEmailText(alert, at);

  let emailStatus;
  if (values['dry-run']) {
    emailStatus = 'dry-run';
  } else {
    const result = await alertModule.sendEngineAlertNotification(alert);
    emailStatus = result.status;
    if (result.status === 'disabled') {
      console.error(
        'Alert email is disabled: RESEND_API_KEY, MISTBOARD_ALERT_EMAIL_FROM and\n' +
          'MISTBOARD_ALERT_EMAIL_TO must all be present. Findings were NOT delivered.',
      );
    } else if (result.status === 'failed') {
      console.error(
        `Alert email failed${result.statusCode ? ` (HTTP ${result.statusCode})` : ''}. ` +
          'Findings were NOT delivered.',
      );
    }
  }

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          ...runJson(meta, findings.length),
          emailStatus,
          alert,
          findings: findings.map((finding) => ({
            variant: finding.variant,
            engineId: finding.engineId,
            verdict: finding.verdict,
            utilization: finding.utilization,
            thinkP50Ms: finding.thinkP50Ms,
            ceilingMs: finding.ceilingMs,
            workP50: finding.workP50,
            workBudget: finding.workBudget,
            workUnit: finding.workUnit,
            games: finding.games,
            scoredPlies: finding.scoredPlies,
            line: describeFinding(finding),
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(renderCheckReport(findings, meta));
    console.log('');
    console.log(
      values['dry-run'] ? '--dry-run: this email was NOT sent.' : `email: ${emailStatus}`,
    );
    console.log(`subject: ${subject}`);
    console.log(text);
  }

  process.exitCode = exitCodeForOutcome({ findingCount: findings.length, emailStatus });
}

function runJson(meta, findingCount) {
  return {
    kind: 'engine_budget_check',
    window: meta.sinceLabel,
    variant: meta.variant,
    engine: meta.engine,
    enginesReviewed: meta.enginesReviewed,
    scannedRows: meta.scannedRows,
    truncated: meta.truncated,
    findingCount,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
