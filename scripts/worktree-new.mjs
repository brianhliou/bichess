#!/usr/bin/env node
// Create an isolated task worktree with predictable naming.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { installWorktreeInstructionLinks } from './worktree-local-files.mjs';

const options = parseArgs(process.argv.slice(2));
if (!options.slug) {
  printHelp();
  process.exit(1);
}

const repoRoot = git(['rev-parse', '--show-toplevel']);
const slug = normalizeSlug(options.slug);
const branch = options.branch ?? `agent/${slug}`;
const base = options.base ?? defaultBase();
const worktreePath =
  options.path ?? path.resolve(path.dirname(repoRoot), `${path.basename(repoRoot)}-${slug}`);

assertSafeBranch(branch);
if (branchExists(branch)) throw new Error(`branch already exists: ${branch}`);
if (existsSync(worktreePath)) throw new Error(`worktree path already exists: ${worktreePath}`);

run(['git', 'worktree', 'add', '-b', branch, worktreePath, base], repoRoot);
const instructionSourceRoot = primaryWorktreeRoot();
const instructionLinks = installWorktreeInstructionLinks({
  sourceRoot: instructionSourceRoot,
  targetRoot: worktreePath,
});

console.log('\ncreated worktree');
console.log(`branch:   ${branch}`);
console.log(`worktree: ${worktreePath}`);
console.log(`base:     ${base}`);
console.log(`commit:   ${git(['-C', worktreePath, 'rev-parse', '--short', 'HEAD'])}`);
if (instructionLinks.installed) {
  console.log(`guidance: linked CLAUDE.md + AGENTS.md from ${instructionSourceRoot}`);
} else {
  console.warn(
    'guidance: canonical CLAUDE.md was not found; local agent instructions were not linked',
  );
}

console.log('\ninitial scan');
const scan = spawnSync('npm', ['run', 'agent:scan'], {
  cwd: worktreePath,
  stdio: 'inherit',
});
if (scan.status !== 0) {
  console.log(
    'agent:scan did not complete; run it manually after installing dependencies if needed.',
  );
}

if (options.prepare) {
  console.log('\nprepare worktree');
  const prepare = spawnSync('npm', ['run', 'worktree:prepare'], {
    cwd: worktreePath,
    stdio: 'inherit',
  });
  if (prepare.error) throw prepare.error;
  if (prepare.status !== 0) process.exit(prepare.status ?? 1);
} else {
  console.log('\nnext: npm run worktree:prepare');
}

function parseArgs(args) {
  const result = {
    slug: null,
    branch: null,
    base: null,
    path: null,
    prepare: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--branch') {
      result.branch = requiredValue(args, ++index, '--branch');
    } else if (arg === '--base') {
      result.base = requiredValue(args, ++index, '--base');
    } else if (arg === '--path') {
      result.path = path.resolve(requiredValue(args, ++index, '--path'));
    } else if (arg === '--prepare') {
      result.prepare = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!result.slug) {
      result.slug = arg;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }
  return result;
}

function normalizeSlug(value) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
    throw new Error('slug must be 2-61 chars: lowercase letters, numbers, and hyphens');
  }
  return slug;
}

function assertSafeBranch(branch) {
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..') || branch.endsWith('/')) {
    throw new Error(`unsafe branch name: ${branch}`);
  }
}

function branchExists(branch) {
  const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  return result.status === 0;
}

function defaultBase() {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main']);
  return result.status === 0 ? 'origin/main' : 'HEAD';
}

function primaryWorktreeRoot() {
  const line = git(['worktree', 'list', '--porcelain'])
    .split('\n')
    .find((entry) => entry.startsWith('worktree '));
  if (!line) return repoRoot;
  return line.slice('worktree '.length);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function run(command, cwd) {
  console.log(`$ ${command.join(' ')}`);
  const result = spawnSync(command[0], command.slice(1), { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage:
  npm run worktree:new -- <slug> [--base <ref>] [--branch <name>] [--path <path>] [--prepare]

Creates a sibling task worktree from origin/main when available, using branch
agent/<slug> by default, then runs npm run agent:scan in the new worktree.

Use --prepare to also run npm run worktree:prepare in the new worktree.`);
}
