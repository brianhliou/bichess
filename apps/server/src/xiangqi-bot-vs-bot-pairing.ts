// Pairing policy for automated xiangqi bot-vs-bot generation (Phase 2 of #196).
// Two lanes over the 9-rung public strength ladder (FSF levels 1-8 + the elite
// Pikafish on top):
//
//   - content     — populates /watch. Top-heavy (favours the strongest rungs so
//                   the feed shows strong play); mirrors (same engine both sides)
//                   are allowed and are often the most watchable. NOT rated.
//   - calibration — produces the data the engine Elo report needs. Adjacent-
//                   weighted CROSS-TIER games (rung i vs a near neighbour), never
//                   a mirror: a same-strength game is ~50/50 by construction and
//                   carries zero ranking signal. An absolute anchor
//                   (python-random-legal) is a Phase 3 concern; cross-tier games
//                   already give a connected relative ladder.
//
// Pure + rng-injected so it is deterministic under test.

import { XIANGQI_PUBLIC_ENGINES } from './xiangqi-engine-catalog.js';

export type BotVsBotLane = 'content' | 'calibration';
export type BotVsBotPairing = { redEngineId: string; blackEngineId: string };
export type BotVsBotPairingChoice = { lane: BotVsBotLane; pairing: BotVsBotPairing };

// Strength-ascending: XIANGQI_PUBLIC_ENGINES lists FSF weakest-first then the
// elite Pikafish, which is the ladder order we want (weakest index 0 → strongest
// last). Kept as a function so callers can override for tests.
export function xiangqiBotLadder(): string[] {
  return XIANGQI_PUBLIC_ENGINES.map((engine) => engine.id);
}

// How many of the strongest rungs the content lane draws from.
export const CONTENT_TOP_RUNGS = 3;

function weightedPick(rng: () => number, weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let threshold = rng() * total;
  for (let index = 0; index < weights.length; index++) {
    threshold -= weights[index]!;
    if (threshold < 0) return index;
  }
  return weights.length - 1;
}

// Content: both sides drawn (independently) from the top rungs, weighted toward
// the strongest. Mirrors happen naturally and are fine here.
export function pickContentPairing(
  rng: () => number,
  ladder: string[],
  topRungs: number = CONTENT_TOP_RUNGS,
): BotVsBotPairing {
  const n = ladder.length;
  const k = Math.max(1, Math.min(topRungs, n));
  const start = n - k;
  // Increasing weight toward the strongest rung (last index).
  const weights = Array.from({ length: k }, (_, idx) => idx + 1);
  const red = start + weightedPick(rng, weights);
  const black = start + weightedPick(rng, weights);
  return { redEngineId: ladder[red]!, blackEngineId: ladder[black]! };
}

// Calibration: rung i vs a near neighbour, adjacency-weighted (mostly ±1, some
// ±2, rare ±3), never a mirror. Colours assigned at random.
export function pickCalibrationPairing(rng: () => number, ladder: string[]): BotVsBotPairing {
  const n = ladder.length;
  if (n < 2) throw new Error('calibration pairing needs a ladder of at least 2 rungs');
  const i = Math.min(n - 1, Math.floor(rng() * n));
  const roll = rng();
  const delta = roll < 0.7 ? 1 : roll < 0.95 ? 2 : 3;
  const canUp = i + delta <= n - 1;
  const canDown = i - delta >= 0;
  let j: number;
  if (canUp && canDown) j = rng() < 0.5 ? i + delta : i - delta;
  else if (canUp) j = i + delta;
  else if (canDown) j = i - delta;
  else j = i + 1 <= n - 1 ? i + 1 : i - 1; // delta overshoots this position; nearest neighbour
  const [a, b] = rng() < 0.5 ? [i, j] : [j, i];
  return { redEngineId: ladder[a]!, blackEngineId: ladder[b]! };
}

// Choose a lane by weighted coin flip, then a pairing from that lane.
export function pickPairing(
  rng: () => number,
  ladder: string[],
  calibrationRatio: number,
): BotVsBotPairingChoice {
  const ratio = Math.min(1, Math.max(0, calibrationRatio));
  if (rng() < ratio) {
    return { lane: 'calibration', pairing: pickCalibrationPairing(rng, ladder) };
  }
  return { lane: 'content', pairing: pickContentPairing(rng, ladder) };
}
