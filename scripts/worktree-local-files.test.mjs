import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installWorktreeInstructionLinks } from './worktree-local-files.mjs';

test('new worktrees receive Claude and Codex instruction links', () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'mistboard-worktree-links-'));
  const sourceRoot = path.join(tempRoot, 'source');
  const targetRoot = path.join(tempRoot, 'target');
  mkdirSync(sourceRoot);
  mkdirSync(targetRoot);
  writeFileSync(path.join(sourceRoot, 'CLAUDE.md'), '# local instructions\n');

  try {
    assert.deepEqual(installWorktreeInstructionLinks({ sourceRoot, targetRoot }), {
      installed: true,
    });
    assert.equal(
      readlinkSync(path.join(targetRoot, 'CLAUDE.md')),
      path.join(sourceRoot, 'CLAUDE.md'),
    );
    assert.equal(readlinkSync(path.join(targetRoot, 'AGENTS.md')), 'CLAUDE.md');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
