// Frame-bundle writer: shots → deduped PNGs + an ffconcat list with per-shot
// durations + sounds.json (absolute-time sound events with resolved asset
// paths). This is the whole export contract: the studio repo takes it from
// here (narration, mixing, mp4 assembly). Identical shots dedupe to one PNG,
// so a mostly-holds explainer stays in the hundreds of frames.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderShotSvg } from './frame.js';
import type { ScenePlan } from './manifest.js';
import { rasterizeSvg } from './raster.js';
import type { Timeline } from './timeline.js';

export type BundleResult = {
  concatPath: string;
  soundsPath: string;
  metaPath: string;
  uniqueFrames: number;
  totalShots: number;
};

export function writeFrameBundle(
  plan: ScenePlan,
  timeline: Timeline,
  outDir: string,
  onProgress?: (done: number, total: number, unique: number) => void,
): BundleResult {
  const framesDir = path.join(outDir, 'frames');
  mkdirSync(framesDir, { recursive: true });

  const written = new Map<string, string>();
  const lines: string[] = ['ffconcat version 1.0'];
  let lastFile: string | null = null;

  const renderScale = plan.renderScale ?? 2;
  timeline.shots.forEach((shot, index) => {
    const svg = renderShotSvg(plan, shot);
    const hash = createHash('sha256').update(svg).digest('hex').slice(0, 16);
    let file = written.get(hash);
    if (!file) {
      file = path.join(framesDir, `${hash}.png`);
      writeFileSync(file, rasterizeSvg(svg, renderScale));
      written.set(hash, file);
    }
    lines.push(`file '${file}'`);
    lines.push(`duration ${(shot.durationMs / 1000).toFixed(4)}`);
    lastFile = file;
    onProgress?.(index + 1, timeline.shots.length, written.size);
  });
  // concat-demuxer quirk: the final entry's duration is honored only when the
  // file is listed once more at the end.
  if (lastFile) lines.push(`file '${lastFile}'`);

  const concatPath = path.join(outDir, 'frames.ffconcat');
  writeFileSync(concatPath, `${lines.join('\n')}\n`);

  const publicDir = path.resolve(import.meta.dirname, '../../public');
  const soundFiles = {
    move: path.join(publicDir, 'sound/piano/Move.mp3'),
    capture: path.join(publicDir, 'sound/piano/Capture.mp3'),
  };
  const soundsPath = path.join(outDir, 'sounds.json');
  writeFileSync(
    soundsPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        events: timeline.soundEvents.map((event) => ({
          atMs: event.atMs,
          sound: event.sound,
          file: soundFiles[event.sound],
        })),
      },
      null,
      2,
    )}\n`,
  );

  const metaPath = path.join(outDir, 'bundle.json');
  writeFileSync(
    metaPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        planId: plan.id,
        title: plan.title,
        fps: plan.fps,
        width: plan.width,
        height: plan.height,
        totalMs: timeline.totalMs,
        shotCount: timeline.shots.length,
        uniqueFrames: written.size,
        segmentStartsMs: timeline.segmentStartsMs,
        concat: concatPath,
        sounds: soundsPath,
      },
      null,
      2,
    )}\n`,
  );

  return {
    concatPath,
    soundsPath,
    metaPath,
    uniqueFrames: written.size,
    totalShots: timeline.shots.length,
  };
}
