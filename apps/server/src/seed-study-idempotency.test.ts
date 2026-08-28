// The study seeders create with a POST, so without a guard a second run leaves a
// second identically named study. That is how the QA database ended up with two
// "The Riverbank Cannon" and two "橘中秘 卷一", both rendering as duplicate rows
// in the homepage's Top studies list.
//
// The destructive branch (--replace deletes before creating) is covered here
// rather than against a live server: it is the branch that can lose content, and
// a fake lets it be exercised without risking any.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveExistingStudy, type StudyLookup } from './seed-study-idempotency.js';

const NAME = 'Fortress Xiangqi: twenty engine games';

type Fake = { lookup: StudyLookup; deleted: string[] };

function fakeApi(
  studies: { id: string; name: string }[],
  opts: { delOk?: boolean; getOk?: boolean } = {},
): Fake {
  const deleted: string[] = [];
  const lookup: StudyLookup = {
    get: async () =>
      new Response(JSON.stringify({ studies }), {
        status: opts.getOk === false ? 500 : 200,
        headers: { 'content-type': 'application/json' },
      }),
    del: async (path: string) => {
      deleted.push(path);
      return new Response(null, { status: opts.delOk === false ? 500 : 204 });
    },
  };
  return { lookup, deleted };
}

test('proceeds when the owner has no study of that name', async () => {
  const { lookup, deleted } = fakeApi([]);
  const decision = await resolveExistingStudy(lookup, NAME);
  assert.equal(decision.action, 'proceed');
  assert.deepEqual(deleted, []);
});

test('skips rather than creating a second copy', async () => {
  const { lookup, deleted } = fakeApi([{ id: 'OctrDSma', name: NAME }]);
  const decision = await resolveExistingStudy(lookup, NAME);
  assert.equal(decision.action, 'skip');
  assert.equal(decision.action === 'skip' ? decision.existing.id : null, 'OctrDSma');
  // The whole point: nothing is created and nothing is destroyed.
  assert.deepEqual(deleted, []);
});

test('matches on the exact name, not on a search near-miss', async () => {
  // `?q=` is a search, so it returns near misses. Creating a second "Vol. 1"
  // because the query also matched "Vol. 2" is the bug this guards against.
  const { lookup } = fakeApi([{ id: 'other', name: `${NAME} (draft)` }]);
  const decision = await resolveExistingStudy(lookup, NAME);
  assert.equal(decision.action, 'proceed');
});

test('deletes the existing study only when replace is requested', async () => {
  const { lookup, deleted } = fakeApi([{ id: 'OctrDSma', name: NAME }]);
  const decision = await resolveExistingStudy(lookup, NAME, { replace: true });
  assert.equal(decision.action, 'replaced');
  assert.deepEqual(deleted, ['/api/studies/OctrDSma']);
});

test('throws instead of proceeding when a replace delete fails', async () => {
  // Proceeding here would create a duplicate on top of the one it failed to
  // remove, which is worse than the state it was asked to fix.
  const { lookup } = fakeApi([{ id: 'OctrDSma', name: NAME }], { delOk: false });
  await assert.rejects(
    () => resolveExistingStudy(lookup, NAME, { replace: true }),
    /500/,
  );
});

test('still seeds when the lookup itself fails', async () => {
  // An older server without the route should not block seeding entirely.
  const { lookup, deleted } = fakeApi([], { getOk: false });
  const decision = await resolveExistingStudy(lookup, NAME);
  assert.equal(decision.action, 'proceed');
  assert.deepEqual(deleted, []);
});
