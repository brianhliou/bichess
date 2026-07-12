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

function resolveGitPath(repoRoot, value) {
  return path.resolve(repoRoot, value);
}

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}
