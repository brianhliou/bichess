import assert from 'node:assert/strict';
import test from 'node:test';
import { roleForGitDirs } from './worktree-role.mjs';

test('the primary git directory is the control worktree', () => {
  assert.equal(roleForGitDirs('/repo/.git', '/repo/.git'), 'control');
});

test('a linked git directory is an isolated task worktree', () => {
  assert.equal(roleForGitDirs('/repo/.git/worktrees/task', '/repo/.git'), 'linked');
});
