#!/usr/bin/env node
// Fast local orientation for agent sessions.
//
// This intentionally avoids .env files and provider CLIs. It reports repository
// shape, dirty state, large code surfaces, and targeted checks without needing
// network access.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentWorktreeRole } from './worktree-role.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const CODE_ROOTS = ['apps', 'packages', 'scripts'];
// Nested git repos gitignored by the main repo: invisible to plain `git status`,
// so sessions leave work uncommitted there unless the scan surfaces it.
const NESTED_REPOS = ['docs-private'];
const CODE_EXTENSIONS = new Set(['.css', '.js', '.mjs', '.ts', '.tsx']);
const SKIP_DIRS = new Set(['.git', '.vite', 'coverage', 'dist', 'node_modules', 'tmp']);
const CONTENT_HEAVY_FILES = new Set([path.join('apps', 'web', 'src', 'articles-data.ts')]);
const MARKER_SCAN_EXCLUDED_FILES = new Set(['scripts/agent-scan.mjs']);

const MARKERS = [
  { label: 'TODO/FIXME/XXX', pattern: /\b(?:TODO|FIXME|XXX)\b/ },
  { label: 'ts-ignore/expect-error', pattern: /@ts-(?:ignore|expect-error)/ },
  { label: 'biome-ignore', pattern: /biome-ignore/ },
  { label: 'as any', pattern: /\bas any\b/ },
];

function git(args, cwd = REPO_ROOT) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    const message = error.stderr?.toString().trim() || error.message;
    return `[git ${args.join(' ')} failed: ${message}]`;
  }
}

function toRepoPath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function lineCount(text) {
  if (text.length === 0) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function isSkippedDirectory(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!isSkippedDirectory(entry.name)) walk(fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!CODE_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }
  return files;
}

function codeFiles() {
  return CODE_ROOTS.flatMap((root) => {
    const dir = path.join(REPO_ROOT, root);
    return existsSync(dir) ? walk(dir) : [];
  });
}

function fileStats(files) {
  return files
    .map((filePath) => {
      const text = readFileSync(filePath, 'utf8');
      return {
        path: toRepoPath(filePath),
        lines: lineCount(text),
        bytes: statSync(filePath).size,
      };
    })
    .sort((a, b) => b.lines - a.lines);
}

function statusSummary() {
  const status = git(['status', '--short', '--branch', '--untracked-files=all']);
  const lines = status.split('\n').filter(Boolean);
  const branch = lines.find((line) => line.startsWith('##')) ?? '(unknown)';
  const files = lines.filter((line) => !line.startsWith('##'));
  const buckets = new Map();

  for (const line of files) {
    const code = line.slice(0, 2);
    buckets.set(code, (buckets.get(code) ?? 0) + 1);
  }

  return { branch, files, buckets };
}

function statusLabel(code) {
  if (code === '??') return 'untracked';
  if (code === ' M') return 'unstaged-modified';
  if (code === 'M ') return 'staged-modified';
  if (code === 'MM') return 'staged-and-unstaged';
  if (code === 'A ') return 'staged-added';
  if (code === ' D') return 'unstaged-deleted';
  if (code === 'D ') return 'staged-deleted';
  return code.trim() || 'modified';
}

function scanMarkers(files) {
  const counts = new Map(MARKERS.map(({ label }) => [label, 0]));
  const examples = [];

  for (const filePath of files) {
    const repoPath = toRepoPath(filePath);
    if (CONTENT_HEAVY_FILES.has(repoPath) || MARKER_SCAN_EXCLUDED_FILES.has(repoPath)) continue;

    const lines = readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const marker of MARKERS) {
        if (!marker.pattern.test(line)) continue;
        counts.set(marker.label, (counts.get(marker.label) ?? 0) + 1);
        if (examples.length < 12) {
          examples.push(`${repoPath}:${index + 1} (${marker.label})`);
        }
      }
    });
  }

  return { counts, examples };
}

function printList(items, emptyText) {
  if (items.length === 0) {
    console.log(emptyText);
    return;
  }
  for (const item of items) console.log(item);
}

function printStatus() {
  const role = currentWorktreeRole(REPO_ROOT);
  console.log('## Workspace role');
  if (role === 'control') {
    console.log('shared control worktree');
    console.log(
      'agent note: keep this tree clean. Before write work, run npm run worktree:new -- <slug> --prepare and continue in the new path.',
    );
  } else {
    console.log('isolated task worktree');
  }

  const { branch, files, buckets } = statusSummary();
  console.log('\n## Git');
  console.log(branch);
  if (files.length === 0) {
    console.log('clean worktree');
  } else {
    const bucketText = [...buckets.entries()]
      .map(([code, count]) => `${statusLabel(code)}=${count}`)
      .join(', ');
    console.log(`${files.length} dirty path(s): ${bucketText}`);
    printList(
      files.slice(0, 40).map((line) => `  ${line}`),
      '  none',
    );
    if (files.length > 40) console.log(`  ... ${files.length - 40} more`);
    console.log("agent note: treat existing dirty files as someone else's work.");
  }

  console.log('\n## Worktrees');
  printList(
    git(['worktree', 'list'])
      .split('\n')
      .map((line) => `  ${line}`),
    '  none',
  );
}

function printNestedRepos() {
  for (const repo of NESTED_REPOS) {
    const repoDir = path.join(REPO_ROOT, repo);
    if (!existsSync(path.join(repoDir, '.git'))) continue;

    const status = git(['status', '--short', '--branch'], repoDir);
    const lines = status.split('\n').filter(Boolean);
    const branch = lines.find((line) => line.startsWith('##')) ?? '(unknown)';
    const files = lines.filter((line) => !line.startsWith('##'));
    const unpushed = /\[ahead \d+/.test(branch);

    console.log(`\n## Nested repo: ${repo}`);
    console.log(branch);
    if (files.length === 0 && !unpushed) {
      console.log('clean and pushed');
      continue;
    }
    if (files.length > 0) {
      console.log(
        `${files.length} uncommitted path(s). ${repo} is its OWN repo (gitignored by the main repo, so plain git status never shows this).`,
      );
      printList(
        files.slice(0, 15).map((line) => `  ${line}`),
        '  none',
      );
      if (files.length > 15) console.log(`  ... ${files.length - 15} more`);
      console.log(`agent note: commit work you did in ${repo} inside that repo before handoff.`);
    }
    if (unpushed) console.log(`agent note: ${repo} has commits not pushed to origin.`);
  }
}

function printLargeFiles(stats) {
  const codeStats = stats.filter((item) => !CONTENT_HEAVY_FILES.has(item.path));
  const contentStats = stats.filter((item) => CONTENT_HEAVY_FILES.has(item.path));

  console.log('\n## Largest code surfaces');
  for (const item of codeStats.slice(0, 20)) {
    const flag = item.lines >= 1500 ? ' split-candidate' : '';
    console.log(`${String(item.lines).padStart(5)}  ${item.path}${flag}`);
  }

  if (contentStats.length > 0) {
    console.log('\n## Content-heavy files excluded from code ranking');
    for (const item of contentStats) {
      console.log(`${String(item.lines).padStart(5)}  ${item.path}`);
    }
  }
}

function printMarkers(files) {
  const { counts, examples } = scanMarkers(files);
  console.log('\n## Friction markers');
  for (const [label, count] of counts.entries()) {
    console.log(`${String(count).padStart(5)}  ${label}`);
  }
  if (examples.length > 0) {
    console.log('examples:');
    for (const example of examples) console.log(`  ${example}`);
  }
}

function printChecks() {
  console.log('\n## Targeted checks');
  console.log('game rules/visibility:');
  console.log('  npm run test:unit --workspace @mistboard/game');
  console.log('server room/api/persistence:');
  console.log('  npm run test:unit --workspace @mistboard/server');
  console.log('  npm run test:integration --workspace @mistboard/server');
  console.log('web UI/client state:');
  console.log('  npm run test:unit --workspace @mistboard/web');
  console.log('  npm run typecheck --workspace @mistboard/web');
  console.log('cross-package confidence:');
  console.log('  npm run typecheck');
  console.log('  npm run test:unit');
  console.log('  npm run check:cycles');
  console.log('mobile/article visual loop, dev server already running:');
  console.log('  npm run test:mobile:shots');
}

function main() {
  const files = codeFiles();
  const stats = fileStats(files);

  console.log('# Mistboard agent scan');
  console.log(`repo: ${REPO_ROOT}`);
  printStatus();
  printNestedRepos();
  printLargeFiles(stats);
  printMarkers(files);
  printChecks();
}

main();
