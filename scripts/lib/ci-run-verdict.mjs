// Decide what a hosted CI run means for the release waiting on it.
//
// Extracted from release-prod.mjs so it can be tested: that script runs a
// release at module scope, so importing it is not an option.
//
// The subtle case is a CANCELLED run. ci.yml sets
// `concurrency: cancel-in-progress: true` on `refs/heads/main`, so a second
// push to main cancels the first push's run. The first release then reads a run
// whose test jobs are all `cancelled`, and the pre-existing rule ("cancelled and
// skipped are forgiven") called that a pass. In the 14 hours to 2026-08-28 five
// runs on main were cancelled that way, and two of the last three would have
// been reported to a waiting release as green with five test jobs unfinished.
//
// So forgiveness now depends on WHY jobs were cancelled. Cancelled housekeeping
// inside a run nobody superseded is still forgiven, because that is the case the
// rule was written for. Cancelled anything in a run that a newer commit
// superseded is not: the release has no verdict, and must say so.

/**
 * Split a run's jobs into ones that genuinely failed and ones that merely did
 * not succeed. Only `failure` and `timed_out` block a release.
 *
 * @param {Array<{name?: string, conclusion?: string|null}>} jobs
 */
export function classifyJobs(jobs) {
  const blocking = [];
  const forgiven = [];
  let succeeded = 0;
  for (const job of jobs) {
    if (job.conclusion === 'success') succeeded += 1;
    else if (job.conclusion === 'failure' || job.conclusion === 'timed_out') {
      blocking.push(job.name);
    } else forgiven.push(`${job.name}:${job.conclusion ?? 'none'}`);
  }
  return { blocking, forgiven, succeeded };
}

const short = (revision) =>
  typeof revision === 'string' ? revision.slice(0, 12) : String(revision);

/**
 * @param {object} params
 * @param {{status?: string, conclusion?: string|null, url?: string|null}|null} params.run
 *   the CI run for this release's revision, or null if none exists yet
 * @param {{blocking: string[], forgiven: string[], succeeded: number}|null} params.verdict
 *   job classification; null when the run has not completed
 * @param {string} params.headRevision the revision being released
 * @param {string|null} params.superseded the branch tip, when it is no longer
 *   headRevision; null when this release still owns the tip
 * @returns {{outcome: 'wait'|'pass'|'fail', message: string}}
 */
export function ciOutcome({ run, verdict, headRevision, superseded }) {
  const where = run?.url ?? short(headRevision);

  // A newer commit owns main. Whatever this run reports, it is either already
  // cancelled or about to be, so waiting longer cannot produce a verdict.
  if (superseded && run?.conclusion !== 'success') {
    return {
      outcome: 'fail',
      message:
        `superseded: ${short(headRevision)} was pushed to main, but main is now ` +
        `${short(superseded)}, so this run was cancelled rather than finished. ` +
        `${short(headRevision)} is an ancestor of ${short(superseded)} and will be ` +
        `verified by that release; this one has no verdict of its own. ` +
        `Re-run from the current main if you need one: ${where}`,
    };
  }

  if (!run) return { outcome: 'wait', message: 'waiting for the run to appear' };
  if (run.status !== 'completed') {
    return { outcome: 'wait', message: `${run.status} ${run.url ?? ''}`.trim() };
  }
  if (run.conclusion === 'success') {
    const note = superseded
      ? ` (main has since moved to ${short(superseded)}; this run still verified ${short(headRevision)})`
      : '';
    return { outcome: 'pass', message: `hosted CI passed: ${where}${note}` };
  }

  // Not superseded, so a cancelled or skipped job is housekeeping noise rather
  // than an unfinished test. Forgive it, and name what was forgiven.
  if (verdict && verdict.blocking.length === 0 && verdict.succeeded > 0) {
    return {
      outcome: 'pass',
      message:
        `hosted CI conclusion is ${run.conclusion ?? 'unknown'}, but no job failed: ` +
        `${verdict.succeeded} passed, forgiving [${verdict.forgiven.join(', ')}]\n` +
        `hosted CI passed: ${where}`,
    };
  }
  return {
    outcome: 'fail',
    message:
      `hosted CI failed with conclusion ${run.conclusion ?? 'unknown'}` +
      (verdict?.blocking.length ? `; failing jobs: ${verdict.blocking.join(', ')}` : '') +
      `: ${where}`,
  };
}
