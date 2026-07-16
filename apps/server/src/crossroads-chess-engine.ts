// Fairy-Stockfish move provider for perfect-information Crossroads Chess.
//
// FSF plays the variant natively (loaded from crossroads-chess.ini), so it is a free,
// strong opponent for the open mode. Per the AI-serving decision this lives
// server-side behind a small move provider — NOT the Obscuro engine-worker (the
// fog engine), which speaks a different, redaction-shaped protocol. It spawns one
// FSF process per request (stateless, robust; FSF starts in ~100ms), which is plenty
// for turn-based local play. Promote to a persistent process or its own service only
// under real load (the task-#92 trigger).
//
// The process lifecycle (spawn/parse/timeout/kill + the concurrency pool) is the
// shared `uci-engine-harness`; this file is just the Crossroads config + tiers.

import {
  fairyStockfishBestmove,
  resolveFsfVariantIniPath,
  UciEnginePool,
} from './uci-engine-harness.js';

// Re-exported for the FSF-availability probe in tests / callers that still import it here.
export { fairyStockfishPath } from './uci-engine-harness.js';

const VARIANT = 'dualchess';
const VARIANT_INI = 'crossroads-chess.ini';
export const CROSSROADS_CHESS_DEFAULT_ENGINE_ID = 'fairy-stockfish-crossroads-strong';
// Engine BUILD version recorded per PvE game (subject_id encodes only the tier). The shipped
// engine is Fairy-Stockfish 14 for the Crossroads variant; bump on any engine/config change.
export const CROSSROADS_CHESS_ENGINE_VERSION = '0.1.0';

export type CrossroadsChessEngineTier = {
  id: string;
  name: string;
  movetimeMs: number;
  skill: number;
};

const CROSSROADS_CHESS_ENGINE_TIERS = [
  {
    id: 'fairy-stockfish-crossroads-amateur',
    name: 'Fairy Stockfish - Amateur',
    skill: 2,
    movetimeMs: 150,
  },
  {
    id: CROSSROADS_CHESS_DEFAULT_ENGINE_ID,
    name: 'Fairy Stockfish - Strong',
    skill: 8,
    movetimeMs: 300,
  },
  {
    id: 'fairy-stockfish-crossroads-very-strong',
    name: 'Fairy Stockfish - Strongest',
    skill: 20,
    movetimeMs: 2000,
  },
] as const satisfies readonly CrossroadsChessEngineTier[];

export const CROSSROADS_CHESS_PLAYABLE_ENGINES: readonly CrossroadsChessEngineTier[] =
  CROSSROADS_CHESS_ENGINE_TIERS;

const CROSSROADS_CHESS_ENGINE_BY_ID: ReadonlyMap<string, CrossroadsChessEngineTier> = new Map(
  CROSSROADS_CHESS_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

// Small FSF slot pool (separate from the other variants; low-traffic surface).
const fsfPool = new UciEnginePool({
  name: 'crossroads-chess-fsf',
  maxProcessesEnvVar: 'MISTBOARD_CROSSROADS_FSF_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_CROSSROADS_FSF_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'fsf concurrency queue timed out',
});

// crossroads-chess.ini lives in src/; tsc does not copy it to dist/, so look in both
// the tsx-dev (src) and built (dist -> ../src) locations.
export function crossroadsChessVariantIniPath(): string {
  return resolveFsfVariantIniPath(VARIANT_INI);
}

export type CrossroadsChessEngineOptions = { movetimeMs?: number; skill?: number };

export function crossroadsChessEngineTierFor(
  engineId: string | undefined,
): CrossroadsChessEngineTier | null {
  if (!engineId) return null;
  return CROSSROADS_CHESS_ENGINE_BY_ID.get(engineId) ?? null;
}

export function crossroadsChessEngineDisplayName(engineId: string): string {
  return crossroadsChessEngineTierFor(engineId)?.name ?? engineId;
}

export function isCrossroadsChessEngineClientId(clientId: string | undefined): boolean {
  return crossroadsChessEngineTierFor(clientId) !== null;
}

export function crossroadsChessEngineVersion(clientId: string | undefined): string | null {
  return isCrossroadsChessEngineClientId(clientId) ? CROSSROADS_CHESS_ENGINE_VERSION : null;
}

export async function crossroadsChessLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = crossroadsChessEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Crossroads Chess engine: ${engineId}`);
  const release = await fsfPool.acquire();
  try {
    return await crossroadsChessEngineMove(moves, {
      skill: tier.skill,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
    });
  } finally {
    release();
  }
}

/**
 * Ask Fairy-Stockfish for a move given the UCI move history from the start
 * position. Returns the UCI move (e.g. "d2d3", "a7a8q") or null if there is no
 * move (game already over). Callers MUST pre-validate each move string — it is
 * written to the engine's stdin.
 */
export function crossroadsChessEngineMove(
  moves: string[],
  opts: CrossroadsChessEngineOptions = {},
): Promise<string | null> {
  return fairyStockfishBestmove({
    moves,
    variant: VARIANT,
    iniPath: crossroadsChessVariantIniPath(),
    skill: opts.skill,
    movetimeMs: opts.movetimeMs ?? 500,
  });
}
