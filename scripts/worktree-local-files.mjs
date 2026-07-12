import { existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';

export function installWorktreeInstructionLinks({ sourceRoot, targetRoot }) {
  const sourceClaude = path.join(sourceRoot, 'CLAUDE.md');
  if (!existsSync(sourceClaude)) return { installed: false, reason: 'source_missing' };

  const targetClaude = path.join(targetRoot, 'CLAUDE.md');
  const targetAgents = path.join(targetRoot, 'AGENTS.md');
  if (!existsSync(targetClaude)) symlinkSync(sourceClaude, targetClaude);
  if (!existsSync(targetAgents)) symlinkSync('CLAUDE.md', targetAgents);
  return { installed: true };
}
