// The point of this module is that two callers agree on it. The pre-push hook
// runs the Postgres suite for persistence changes; release:prod pushes with
// --no-verify and so never reaches the hook, which is why it has to ask the same
// question itself. These assert the answer, and that both scripts do ask.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isPersistenceWatchedPath, needsPersistenceGate } from './persistence-gate.mjs';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));

test('migrations, the migrator, and the persistence modules are watched', () => {
  assert.equal(isPersistenceWatchedPath('apps/server/migrations/120_thing.sql'), true);
  assert.equal(isPersistenceWatchedPath('apps/server/src/migrate.ts'), true);
  assert.equal(isPersistenceWatchedPath('apps/server/src/persistence.ts'), true);
  assert.equal(isPersistenceWatchedPath('apps/server/src/persistence-historical-xiangqi.ts'), true);
});

test('a persistence TEST file is watched too', () => {
  // The 2026-08-27 red main was fixed by a commit that touched only these two
  // files. If a *.test.ts under persistence* stopped counting, the fix for a
  // persistence failure would itself ship past the gate.
  assert.equal(
    isPersistenceWatchedPath('apps/server/src/persistence-historical-xiangqi.test.ts'),
    true,
  );
  assert.equal(
    isPersistenceWatchedPath('apps/server/src/persistence-xiangqi-explorer.test.ts'),
    true,
  );
});

test('the gate stays narrow', () => {
  // A 90-second suite on every push is a suite people learn to skip.
  assert.equal(isPersistenceWatchedPath('apps/web/src/xiangqi-board.ts'), false);
  assert.equal(isPersistenceWatchedPath('apps/server/src/routes/persistence-ish.ts'), false);
  assert.equal(isPersistenceWatchedPath('docs/persistence.md'), false);
  assert.equal(needsPersistenceGate(['apps/web/src/theme.ts', 'README.md']), false);
});

test('one watched file in a mixed push is enough', () => {
  assert.equal(
    needsPersistenceGate([
      'apps/web/src/theme.ts',
      'apps/server/src/persistence-historical-xiangqi.ts',
    ]),
    true,
  );
});

test('both the pre-push hook and the release script ask this module', () => {
  for (const script of ['pre-push-check.mjs', 'release-prod.mjs']) {
    const source = readFileSync(join(SCRIPTS, script), 'utf8');
    assert.match(
      source,
      /from '\.\/persistence-gate\.mjs'/,
      `${script} must resolve the persistence gate here, not with its own copy`,
    );
    assert.match(source, /needsPersistenceGate\(/, `${script} must consult the gate`);
  }
});
