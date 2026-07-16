// Xiangqi Learn — scoring and star ranks. Verbatim port of lila learn's
// score.ts: 50-point items, 500/300/100 par bonus, rank thresholds derived
// from the level's max score. Rank 1 = 3 stars, rank 2 = 2, rank 3 = 1.

import { type LearnLevel, type LearnStage, readApples } from './learn-types.js';

export const APPLE_POINTS = 50;
export const CAPTURE_POINTS = 50;
export const SCENARIO_POINTS = 50;

export type LearnRank = 1 | 2 | 3;

/** Move-count bonus: at/under par = 500; barely late (within max(1, par/8)
 *  extra moves) = 300; otherwise 100. */
export function levelBonus(level: LearnLevel, movesUsed: number): number {
  const late = movesUsed - level.nbMoves;
  if (late <= 0) return 500;
  if (late <= Math.max(1, level.nbMoves / 8)) return 300;
  return 100;
}

export function levelMaxScore(level: LearnLevel): number {
  const appleScore = readApples(level.apples).length * APPLE_POINTS;
  const captureScore = level.pointsForCapture ? (level.captures ?? 0) * CAPTURE_POINTS : 0;
  return appleScore + captureScore + 500;
}

export function levelRank(level: LearnLevel, score: number): LearnRank {
  const max = levelMaxScore(level);
  if (score >= max) return 1;
  if (score >= max - 200) return 2;
  return 3;
}

export function stageMaxScore(stage: LearnStage): number {
  return stage.levels.reduce((sum, level) => sum + levelMaxScore(level), 0);
}

export function stageRank(stage: LearnStage, scores: readonly number[]): LearnRank {
  const total = scores.reduce((sum, score) => sum + score, 0);
  const max = stageMaxScore(stage);
  if (total >= max) return 1;
  if (total >= max - Math.max(200, stage.levels.length * 150)) return 2;
  return 3;
}

export function starsOfRank(rank: LearnRank): number {
  return 4 - rank;
}
