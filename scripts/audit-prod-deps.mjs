#!/usr/bin/env node
// `npm audit --omit=dev`, with the registry's flakiness separated from a real
// finding.
//
// The bare command conflates two failures behind one exit code: "these
// production dependencies have a known vulnerability", which must red main, and
// "npm's audit endpoint did not answer", which must not. On 2026-09-04 the
// second one happened — the registry returned 400 Bad Request from
// /-/npm/v1/security/audits/quick with "This endpoint is being retired" — and it
// failed a release whose every other job passed. Re-running the same job minutes
// later, against the same commit and lockfile, went green.
//
// That is worth handling rather than ignoring, because CI is not the deploy
// gate here (railway.json's "Wait for CI" is deliberately off): a red main from
// a flaky endpoint does not stop a deploy, it just hides the next real failure
// behind an alarm everybody has learned to expect.
//
// So: parse --json, retry only the transient class, and fail on findings alone.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Audit the repo this script lives in, not whatever directory invoked it.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ATTEMPTS = 3;
const BACKOFF_MS = [5_000, 15_000];

// npm reports a registry problem as a JSON object carrying `error`, and a real
// audit as one carrying `metadata.vulnerabilities`. Anything we cannot parse is
// treated as transient too: a proxy's HTML error page is not evidence about
// this lockfile, and the next attempt either parses or exhausts the retries.
export function classifyAuditOutput(stdout) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return { kind: 'unavailable', detail: firstLine(stdout) || 'audit produced no JSON' };
  }
  if (report && typeof report === 'object' && report.error) {
    // npm's error shape is not guaranteed. The first CI run of this script hit
    // one whose code/summary/detail were all absent and logged a bare "audit:"
    // with nothing after it, which is the one thing this branch exists to avoid:
    // the retry line is only useful if it says what went wrong. So fall back to
    // the raw error, and never return an empty detail.
    const { code, summary, detail } = typeof report.error === 'object' ? report.error : {};
    const parts = [code, summary, detail].filter(Boolean).join(': ');
    return { kind: 'unavailable', detail: parts || describeUnknownError(report.error) };
  }
  const counts = report?.metadata?.vulnerabilities;
  if (!counts) {
    return { kind: 'unavailable', detail: 'audit JSON carried neither error nor metadata' };
  }
  // `info` is excluded deliberately: npm's own default audit level is `low`, and
  // this script must not quietly become a weaker gate than the command it
  // replaced.
  const total =
    (counts.low ?? 0) + (counts.moderate ?? 0) + (counts.high ?? 0) + (counts.critical ?? 0);
  return { kind: total > 0 ? 'vulnerable' : 'clean', counts, total };
}

function describeUnknownError(error) {
  if (typeof error === 'string' && error.trim()) return error.trim();
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') return serialized.slice(0, 500);
  } catch {
    // Fall through to the generic line below.
  }
  return 'npm reported an audit error with no description';
}

function firstLine(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function describeCounts(counts) {
  return ['critical', 'high', 'moderate', 'low']
    .map((level) => `${level}: ${counts[level] ?? 0}`)
    .join(', ');
}

function runAudit() {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    return { kind: 'unavailable', detail: `could not run npm audit: ${result.error.message}` };
  }
  return classifyAuditOutput(result.stdout);
}

async function main() {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    last = runAudit();
    if (last.kind === 'clean') {
      console.log(`audit: ok, no production vulnerabilities (${describeCounts(last.counts)})`);
      return 0;
    }
    if (last.kind === 'vulnerable') {
      console.error(`audit: FAILED, ${last.total} production vulnerabilities`);
      console.error(`audit: ${describeCounts(last.counts)}`);
      console.error('audit: run `npm audit --omit=dev` locally for the advisory list');
      return 1;
    }
    console.error(`audit: attempt ${attempt}/${ATTEMPTS} could not reach the registry`);
    console.error(`audit: ${last.detail}`);
    const backoff = BACKOFF_MS[attempt - 1];
    if (attempt < ATTEMPTS && backoff) {
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  // Deliberately green. The audit gate is off for this run and the log says so
  // in one line; the alternative is a red main that reports nothing about the
  // code and trains everyone to ignore the badge.
  console.error(`audit: SKIPPED after ${ATTEMPTS} attempts, npm's audit endpoint is unavailable`);
  console.error(`audit: last error: ${last?.detail}`);
  console.error('audit: this run proves nothing about dependency vulnerabilities');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
