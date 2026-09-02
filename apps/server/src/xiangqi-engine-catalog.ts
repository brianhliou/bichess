import type { UciEval } from './uci-engine-harness.js';
import {
  XIANGQI_FSF_ENGINE_VERSION,
  XIANGQI_FSF_PLAYABLE_ENGINES,
  type XiangqiFsfEngineTier,
  xiangqiFsfEngineTierFor,
  xiangqiFsfLiveEngineMove,
} from './xiangqi-fsf-engine.js';
import {
  isXiangqiEngineClientId as isPikafishXiangqiEngineClientId,
  xiangqiEngineTierFor as pikafishXiangqiEngineTierFor,
  xiangqiLiveEngineMove as pikafishXiangqiLiveEngineMove,
  XIANGQI_ENGINE_VERSION,
  XIANGQI_PLAYABLE_ENGINES as XIANGQI_PIKAFISH_PLAYABLE_ENGINES,
  type XiangqiEngineTier as XiangqiPikafishEngineTier,
} from './xiangqi-pikafish-engine.js';
import {
  isXiangqiRandomEngine,
  XIANGQI_RANDOM_ENGINE_VERSION,
  type XiangqiRandomEngineTier,
  xiangqiRandomEngineTierFor,
} from './xiangqi-random-engine.js';

export {
  XIANGQI_ENGINE_VERSION,
  XIANGQI_LEGACY_ENGINE_TIERS,
  xiangqiMoveToPikafishUci,
  xiangqiSquareToPikafish,
} from './xiangqi-pikafish-engine.js';

export type XiangqiEngineTier =
  | XiangqiPikafishEngineTier
  | XiangqiFsfEngineTier
  | XiangqiRandomEngineTier;

// The list is weakest-first within each family. The experimental FSF profile is
// deliberately separate and honestly named; Pikafish identities remain stable.
export const XIANGQI_PLAYABLE_ENGINES: readonly XiangqiEngineTier[] = [
  ...XIANGQI_FSF_PLAYABLE_ENGINES,
  ...XIANGQI_PIKAFISH_PLAYABLE_ENGINES,
];

// Human-facing selection is intentionally narrower than the runnable catalog:
// FSF supplies the eight useful stochastic difficulty levels, while only the
// strongest practical Pikafish profile is presented as an elite challenge.
// Every other Pikafish id remains resolvable above for history, EvE calibration,
// and future rated personalities.
const XIANGQI_ELITE_PIKAFISH_ID = 'pikafish-xiangqi-level-8';
export const XIANGQI_PUBLIC_ENGINES: readonly XiangqiEngineTier[] = [
  ...XIANGQI_FSF_PLAYABLE_ENGINES,
  ...XIANGQI_PIKAFISH_PLAYABLE_ENGINES.filter((engine) => engine.id === XIANGQI_ELITE_PIKAFISH_ID),
];

// Use a human-validated middle rung when a create request omits the choice.
// Analysis has its own Pikafish cache identity in xiangqi-games.ts and must not
// inherit this UI default.
export const XIANGQI_DEFAULT_ENGINE_ID = 'fairy-stockfish-xiangqi-level-4';

export function xiangqiEngineTierFor(engineId: string | undefined): XiangqiEngineTier | null {
  return (
    xiangqiFsfEngineTierFor(engineId) ??
    pikafishXiangqiEngineTierFor(engineId) ??
    xiangqiRandomEngineTierFor(engineId)
  );
}

export function isXiangqiEngineClientId(clientId: string | undefined): boolean {
  return xiangqiEngineTierFor(clientId) !== null;
}

export function xiangqiEngineDisplayName(engineId: string): string {
  return xiangqiEngineTierFor(engineId)?.name ?? engineId;
}

export function xiangqiEngineVersion(clientId: string | undefined): string | null {
  if (xiangqiFsfEngineTierFor(clientId)) return XIANGQI_FSF_ENGINE_VERSION;
  if (isXiangqiRandomEngine(clientId)) return XIANGQI_RANDOM_ENGINE_VERSION;
  return isPikafishXiangqiEngineClientId(clientId) ? XIANGQI_ENGINE_VERSION : null;
}

/**
 * One move from whichever family owns `engineId`. Both providers return the full
 * search summary (`best` plus depth/nodes/time/score/pv) so the live loop can
 * persist what the engine actually did; callers that only want the move read
 * `.best`.
 */
export function xiangqiLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<UciEval> {
  // The random floor bot has no UCI subprocess; the EvE runner's move provider
  // picks its move directly. Reaching here means a caller mis-routed it.
  if (isXiangqiRandomEngine(engineId)) {
    throw new Error(
      'random-legal-xiangqi has no UCI move provider (handle it in the move provider)',
    );
  }
  return xiangqiFsfEngineTierFor(engineId)
    ? xiangqiFsfLiveEngineMove(engineId, moves, opts)
    : pikafishXiangqiLiveEngineMove(engineId, moves, opts);
}
