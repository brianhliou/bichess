// Notation trainer -- personal bests. localStorage only, mirroring
// learn-storage.ts: best-score-wins is enforced HERE rather than at the call
// site, and every access is wrapped because a private window throws on
// localStorage rather than returning null.
//
// Only timed runs are recorded. An untimed run has no comparable score (you can
// sit on it), so writing one would poison the best.

import type { DrillDirection, DrillSideSetting, DrillTarget } from './notation-drill.js';

const STORAGE_KEY = 'mistboard:notation:xiangqi';

export interface NotationBests {
  /** Best score per drill setup. Kept separate because these are genuinely
   *  different difficulties: 'both' makes you flip every file prompt, and a
   *  90-answer point drill and a 9-answer file drill share no scale at all.
   *  The side is part of the key only for file prompts, since points are
   *  absolute and a side would fragment one best into three. */
  bests: Record<string, number>;
}

export function bestKey(
  target: DrillTarget,
  direction: DrillDirection,
  side: DrillSideSetting,
): string {
  return target === 'point' ? `point:${direction}` : `file:${direction}:${side}`;
}

const empty = (): NotationBests => ({ bests: {} });

export function loadNotationBests(): NotationBests {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as NotationBests;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.bests !== 'object') return empty();
    return { bests: parsed.bests ?? {} };
  } catch {
    return empty();
  }
}

function save(bests: NotationBests): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bests));
  } catch {
    // Storage unavailable (private mode): bests are session-only.
  }
}

/** Record a finished timed run. Keeps the existing score when it is higher. */
export function saveNotationScore(
  target: DrillTarget,
  direction: DrillDirection,
  side: DrillSideSetting,
  score: number,
): NotationBests {
  const stored = loadNotationBests();
  const key = bestKey(target, direction, side);
  if ((stored.bests[key] ?? 0) < score) stored.bests[key] = score;
  save(stored);
  return stored;
}

export function bestScore(
  bests: NotationBests,
  target: DrillTarget,
  direction: DrillDirection,
  side: DrillSideSetting,
): number {
  return bests.bests[bestKey(target, direction, side)] ?? 0;
}
