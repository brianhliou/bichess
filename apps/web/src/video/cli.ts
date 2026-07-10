// Frame-export CLI: Mistboard's side of the studio frame contract.
//   npm run video:frames --workspace @mistboard/web -- --plan <scene-plan.json> --out <dir>
//
// Reads a scene plan (board steps + explicit segment durations; no narration
// text, no TTS — those live in the private mistboard-studio repo), renders the
// frame bundle (frames/, frames.ffconcat, sounds.json, bundle.json), and
// exits. Assembly into a watchable mp4 happens studio-side.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFrameBundle } from './bundle.js';
import { type ScenePlan, validateScenePlan } from './manifest.js';
import { expandTimeline } from './timeline.js';

function argValue(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function main(): void {
  const planPath = argValue('--plan');
  if (!planPath) {
    console.error('usage: video:frames -- --plan <scene-plan.json> [--out <dir>]');
    process.exit(1);
  }

  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as ScenePlan;
  const problems = validateScenePlan(plan);
  if (problems.length > 0) {
    console.error('scene-plan problems:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const outDir = path.resolve(
    argValue('--out') ??
      path.join(path.resolve(import.meta.dirname, '../..'), '.video-out', plan.id),
  );

  console.log(`plan ${plan.id}: ${plan.title}`);
  const timeline = expandTimeline(plan);
  console.log(
    `timeline: ${timeline.shots.length} shots, ${(timeline.totalMs / 1000).toFixed(1)}s, ${timeline.soundEvents.length} sound events`,
  );

  let lastLogged = 0;
  const bundle = writeFrameBundle(plan, timeline, outDir, (done, total, unique) => {
    if (done - lastLogged >= 200 || done === total) {
      console.log(`frames: ${done}/${total} shots (${unique} unique PNGs)`);
      lastLogged = done;
    }
  });

  console.log(`\nwrote ${bundle.metaPath}`);
  console.log(
    `${(timeline.totalMs / 1000 / 60).toFixed(1)} min of timeline, ${bundle.uniqueFrames} unique frames`,
  );
}

main();
