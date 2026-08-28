import assert from 'node:assert/strict';
import test from 'node:test';
import { shardFiles } from './persistent-shard.mjs';

const files = Array.from({ length: 10 }, (_, i) => `dist/${String(i).padStart(2, '0')}.test.js`);

test('every file lands in exactly one shard', () => {
  const dealt = [1, 2, 3].flatMap((index) => shardFiles(files, index, 3));

  assert.deepEqual([...dealt].sort(), [...files].sort());
  assert.equal(new Set(dealt).size, files.length);
});

test('shards stay within one file of each other', () => {
  const sizes = [1, 2, 3].map((index) => shardFiles(files, index, 3).length);

  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, sizes.join(','));
});

// The globs come back in whatever order the filesystem gives them, so a shard
// that sorted only within itself would run different files on different
// machines and a failure would not reproduce.
test('assignment does not depend on input order', () => {
  const shuffled = [...files].reverse();

  assert.deepEqual(shardFiles(shuffled, 2, 3), shardFiles(files, 2, 3));
});

test('a single shard runs everything, which is the local default', () => {
  assert.deepEqual(shardFiles(files, 1, 1), [...files].sort());
});

test('rejects a shard index outside the range', () => {
  assert.throws(() => shardFiles(files, 0, 3), /SHARD_INDEX/);
  assert.throws(() => shardFiles(files, 4, 3), /SHARD_INDEX/);
  assert.throws(() => shardFiles(files, 1, 0), /SHARD_TOTAL/);
});
