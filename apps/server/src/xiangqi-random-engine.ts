// A uniformly-random legal-move xiangqi bot. It is the calibration FLOOR — the
// weakest possible player, and the natural 0-Elo anchor for the xiangqi engine
// ladder (weaker than Fairy-Stockfish level 1). It is NOT a player-facing
// opponent, so it stays out of XIANGQI_PUBLIC_ENGINES / XIANGQI_PLAYABLE_ENGINES.
//
// EvE-only: the runner's xiangqi move provider (xiangqi-engine-game.ts) handles
// it directly by picking a random legal move; it never spawns a UCI subprocess,
// so xiangqiLiveEngineMove throws for it.

import { type XiangqiMove, xiangqiMoveToPikafishUci } from '@mistboard/game';

export const XIANGQI_RANDOM_ENGINE_ID = 'random-legal-xiangqi';
export const XIANGQI_RANDOM_ENGINE_VERSION = 'random-legal-v1';

export type XiangqiRandomEngineTier = {
  id: typeof XIANGQI_RANDOM_ENGINE_ID;
  name: string;
  movetimeMs: number;
  kind: 'random';
};

const RANDOM_TIER: XiangqiRandomEngineTier = {
  id: XIANGQI_RANDOM_ENGINE_ID,
  name: 'Random Mover',
  movetimeMs: 0,
  kind: 'random',
};

export function isXiangqiRandomEngine(engineId: string | undefined): boolean {
  return engineId === XIANGQI_RANDOM_ENGINE_ID;
}

export function xiangqiRandomEngineTierFor(
  engineId: string | undefined,
): XiangqiRandomEngineTier | null {
  return engineId === XIANGQI_RANDOM_ENGINE_ID ? RANDOM_TIER : null;
}

// Pick a uniformly random legal move, returned as Pikafish UCI (the runner's move
// wire format). rng is injectable for deterministic tests; defaults to Math.random.
export function xiangqiRandomMoveUci(
  legalMoves: readonly XiangqiMove[],
  rng: () => number = Math.random,
): string | null {
  if (legalMoves.length === 0) return null;
  const index = Math.min(legalMoves.length - 1, Math.floor(rng() * legalMoves.length));
  return xiangqiMoveToPikafishUci(legalMoves[index]!);
}
