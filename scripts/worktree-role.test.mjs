import assert from 'node:assert/strict';
import test from 'node:test';
import { primaryWorktreeRootForCommonDir, roleForGitDirs } from './worktree-role.mjs';

test('the primary git directory is the control worktree', () => {
  assert.equal(roleForGitDirs('/repo/.git', '/repo/.git'), 'control');
});

test('a linked git directory is an isolated task worktree', () => {
  assert.equal(roleForGitDirs('/repo/.git/worktrees/task', '/repo/.git'), 'linked');
});

test('the control root is the parent of the common git directory, from either tree', () => {
  // `git rev-parse --git-common-dir` answers `/repo/.git` from the control tree
  // and from every linked worktree alike; the control root is its parent.
  assert.equal(primaryWorktreeRootForCommonDir('/repo/.git'), '/repo');
  assert.equal(primaryWorktreeRootForCommonDir('/repo/.git/'), '/repo');
});
