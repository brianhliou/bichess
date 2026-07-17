// Persistence-off behavior of the puzzle store (#183): without a DB the store
// serves the committed seed corpus directly, byte-identical and in serving
// order, so dev:memory and unit-test runtimes expose the same puzzle surface
// as prod. The DB-backed path (seed sync + round trip) is covered by the
// Postgres-gated tests in persistence-puzzles.test.ts.

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllSeedPuzzles } from '@mistboard/game/puzzle-seed';
import { isInitialized } from './persistence-db.js';
import { getPuzzleStore, resetPuzzleStoreForTests } from './puzzle-store.js';

test('persistence-off store serves the seed corpus byte-identically, in order', async () => {
  assert.equal(isInitialized(), false, 'this test expects a persistence-off runtime');
  resetPuzzleStoreForTests();
  const store = await getPuzzleStore();

  assert.equal(store.source, 'seed');
  const seed = loadAllSeedPuzzles();
  assert.ok(seed.length > 0);
  assert.equal(store.puzzles.length, seed.length);
  // Byte-level pin: the snapshot serializes exactly like the seed, which is
  // exactly how the pre-#183 in-memory arrays serialized.
  assert.equal(JSON.stringify(store.puzzles), JSON.stringify(seed));
});

test('persistence-off store resolves ids through the byId map', async () => {
  resetPuzzleStoreForTests();
  const store = await getPuzzleStore();
  const first = store.puzzles[0]!;
  assert.equal(store.byId.get(first.id), first);
  assert.equal(store.byId.get('not-a-real-puzzle'), undefined);
  assert.equal(store.byId.size, store.puzzles.length, 'ids are unique');
});

test('persistence-off store snapshot is cached across calls', async () => {
  resetPuzzleStoreForTests();
  const first = await getPuzzleStore();
  const second = await getPuzzleStore();
  assert.equal(first, second);
});
