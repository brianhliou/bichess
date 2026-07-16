// Xiangqi Learn — progress storage. v1 is localStorage only (anonymous and
// signed-in alike); the signed-in API path (learn_progress table +
// /api/learn/score, modeled on persistence-puzzle-ratings) is phase 3 and
// slots in behind this same facade. Best-score-wins is enforced HERE (lila
// parity: the server is last-write-wins; the client guard preserves bests).

import type { LearnStage } from './learn-types.js';

const STORAGE_KEY = 'mistboard:learn:xiangqi';

export interface LearnProgress {
  stages: Record<string, { scores: number[] }>;
}

const empty = (): LearnProgress => ({ stages: {} });

export function loadLearnProgress(): LearnProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as LearnProgress;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.stages !== 'object') {
      return empty();
    }
    return { stages: parsed.stages ?? {} };
  } catch {
    return empty();
  }
}

function save(progress: LearnProgress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage unavailable (private mode): progress is session-only.
  }
}

/** Record a level score. Keeps the existing score when it is higher. */
export function saveLevelScore(stageKey: string, levelId: number, score: number): LearnProgress {
  const progress = loadLearnProgress();
  const stage = progress.stages[stageKey] ?? { scores: [] };
  while (stage.scores.length < levelId) stage.scores.push(0);
  const index = levelId - 1;
  if ((stage.scores[index] ?? 0) < score) stage.scores[index] = score;
  progress.stages[stageKey] = stage;
  save(progress);
  return progress;
}

export function resetLearnProgress(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function stageScores(progress: LearnProgress, stageKey: string): number[] {
  return progress.stages[stageKey]?.scores ?? [];
}

export function isStageComplete(progress: LearnProgress, stage: LearnStage): boolean {
  const scores = stageScores(progress, stage.key);
  return stage.levels.length > 0 && stage.levels.every((level) => (scores[level.id - 1] ?? 0) > 0);
}

export function stageHasProgress(progress: LearnProgress, stage: LearnStage): boolean {
  return stageScores(progress, stage.key).some((score) => score > 0);
}

export function completedLevelCount(progress: LearnProgress, stages: LearnStage[]): number {
  let done = 0;
  for (const stage of stages) {
    const scores = stageScores(progress, stage.key);
    for (const level of stage.levels) {
      if ((scores[level.id - 1] ?? 0) > 0) done += 1;
    }
  }
  return done;
}

/** First level of the stage without a score (resume point), else level 1. */
export function firstUnscoredLevelId(progress: LearnProgress, stage: LearnStage): number {
  const scores = stageScores(progress, stage.key);
  const unscored = stage.levels.find((level) => (scores[level.id - 1] ?? 0) === 0);
  return unscored?.id ?? 1;
}
