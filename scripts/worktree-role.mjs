import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function currentWorktreeRole(repoRoot) {
  const gitDir = resolveGitPath(repoRoot, git(repoRoot, ['rev-parse', '--git-dir']));
  const commonDir = resolveGitPath(repoRoot, git(repoRoot, ['rev-parse', '--git-common-dir']));
  return roleForGitDirs(gitDir, commonDir);
}

export function roleForGitDirs(gitDir, commonDir) {
  return path.resolve(gitDir) === path.resolve(commonDir) ? 'control' : 'linked';
}

/** Root of the control worktree, the checkout that owns the shared `.git`
 *  directory: for a linked task worktree that is the primary tree, for the
 *  control tree it is the tree itself. It is the one checkout that cannot be
 *  swept out from under a long-running script. */
export function primaryWorktreeRoot(repoRoot) {
  const commonDir = resolveGitPath(repoRoot, git(repoRoot, ['rev-parse', '--git-common-dir']));
  return primaryWorktreeRootForCommonDir(commonDir);
}

export function primaryWorktreeRootForCommonDir(commonDir) {
  return path.dirname(path.resolve(commonDir));
}

function resolveGitPath(repoRoot, value) {
  return path.resolve(repoRoot, value);
}

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}
