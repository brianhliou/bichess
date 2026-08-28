import assert from 'node:assert/strict';
import test from 'node:test';
import { ciOutcome, classifyJobs } from './lib/ci-run-verdict.mjs';

const HEAD = 'aaaaaaaabbbbbbbbccccccccdddddddd11111111';
const NEWER = 'ffffffffeeeeeeeeddddddddcccccccc22222222';

const completed = (conclusion) => ({ status: 'completed', conclusion, url: 'https://run' });
const decide = (params) =>
  ciOutcome({ headRevision: HEAD, superseded: null, verdict: null, run: null, ...params });

test('classifyJobs blocks only on failure and timed_out', () => {
  const verdict = classifyJobs([
    { name: 'a', conclusion: 'success' },
    { name: 'b', conclusion: 'failure' },
    { name: 'c', conclusion: 'timed_out' },
    { name: 'd', conclusion: 'cancelled' },
    { name: 'e', conclusion: 'skipped' },
    { name: 'f', conclusion: null },
  ]);

  assert.deepEqual(verdict.blocking, ['b', 'c']);
  assert.equal(verdict.succeeded, 1);
  assert.deepEqual(verdict.forgiven, ['d:cancelled', 'e:skipped', 'f:none']);
});

test('a green run passes', () => {
  const decision = decide({ run: completed('success') });

  assert.equal(decision.outcome, 'pass');
});

// The rule this file exists to protect. These are the real job counts from run
// 33140761199 on main (2026-08-28), which a newer push cancelled.
test('a cancelled run is NOT forgiven when a newer commit superseded it', () => {
  const jobs = [
    ...Array.from({ length: 6 }, (_, i) => ({ name: `ok${i}`, conclusion: 'success' })),
    ...Array.from({ length: 5 }, (_, i) => ({ name: `test${i}`, conclusion: 'cancelled' })),
    { name: 'notify', conclusion: 'skipped' },
  ];
  const verdict = classifyJobs(jobs);
  assert.deepEqual(
    verdict.blocking,
    [],
    'no job actually failed, which is what made this forgivable',
  );

  const decision = decide({ run: completed('cancelled'), verdict, superseded: NEWER });

  assert.equal(decision.outcome, 'fail');
  assert.match(decision.message, /superseded/);
  assert.match(decision.message, /ffffffffeeee/, 'names the commit that took main');
});

// The case the forgiveness rule was written for, which must keep working:
// housekeeping jobs going cancelled/skipped in a run nobody superseded.
test('a cancelled housekeeping job is still forgiven when nothing superseded the run', () => {
  const verdict = classifyJobs([
    { name: 'Unit tests', conclusion: 'success' },
    { name: 'close-ci-failure', conclusion: 'cancelled' },
  ]);

  const decision = decide({ run: completed('failure'), verdict, superseded: null });

  assert.equal(decision.outcome, 'pass');
  assert.match(decision.message, /forgiving \[close-ci-failure:cancelled\]/);
});

test('a real job failure blocks whether or not the run was superseded', () => {
  const verdict = classifyJobs([
    { name: 'Unit tests (server)', conclusion: 'failure' },
    { name: 'Lint', conclusion: 'success' },
  ]);

  for (const superseded of [null, NEWER]) {
    const decision = decide({ run: completed('failure'), verdict, superseded });
    assert.equal(decision.outcome, 'fail', `superseded=${superseded}`);
  }
});

// Waiting out the timeout would be pointless: the run is already doomed.
test('supersession stops a run that is still in progress', () => {
  const decision = decide({
    run: { status: 'in_progress', url: 'https://run' },
    superseded: NEWER,
  });

  assert.equal(decision.outcome, 'fail');
  assert.match(decision.message, /superseded/);
});

// A run that finished green before the other session pushed did real work, and
// the release should keep it rather than throw away a verdict it earned.
test('a run that passed before being superseded still counts as a pass', () => {
  const decision = decide({ run: completed('success'), superseded: NEWER });

  assert.equal(decision.outcome, 'pass');
  assert.match(decision.message, /main has since moved/);
});

test('an absent run keeps waiting', () => {
  assert.equal(decide({ run: null }).outcome, 'wait');
  assert.equal(decide({ run: { status: 'queued' } }).outcome, 'wait');
});
