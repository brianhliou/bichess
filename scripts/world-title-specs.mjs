#!/usr/bin/env node
// Regenerate every world-title board spec from the committed annotations.
//
//   node scripts/world-title-specs.mjs --out /tmp/specs
//
// This exists so the ten boards in the world championship article are a build
// product rather than a thing that happened once. Before the annotations were
// committed they lived in /tmp, which meant regenerating a spec cost a fresh
// harvest and about fifteen minutes of engine time, and the pipeline was
// re-runnable only in principle.
//
// It does NOT write into the article. Baking is a separate, reviewable step.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATA = 'scripts/data/world-title-annotations';
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/tmp/world-specs';
mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'));
let failed = 0;
for (const game of manifest.games) {
  const argv = [
    'scripts/annotated-game-to-spec.mjs',
    join(DATA, `${game.slug}.json`),
    '--event',
    game.event,
    '--out',
    join(outDir, `${game.slug}.json`),
  ];
  for (const [zh, en] of Object.entries(game.names)) argv.push('--name', `${zh}=${en}`);
  const run = spawnSync('node', argv, { encoding: 'utf8' });
  if (run.status !== 0) {
    failed += 1;
    console.error(`${game.slug}: ${run.stderr.trim().split('\n').at(-1)}`);
  } else {
    console.log(`${game.slug} -> ${game.const}  ${run.stderr.trim()}`);
  }
}
if (failed) {
  console.error(`${failed} of ${manifest.games.length} failed`);
  process.exit(1);
}
console.log(`regenerated ${manifest.games.length} specs into ${outDir}`);
void dirname;
