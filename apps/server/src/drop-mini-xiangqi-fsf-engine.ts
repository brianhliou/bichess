// Fairy-Stockfish move provider for perfect-information Drop Mini Xiangqi (7x7).
//
// Drop Mini is 7x7 Mini Xiangqi plus crazyhouse-style drops. FSF does not ship
// this as a built-in variant, but it plays it natively from a custom variants.ini
// (drop-mini-xiangqi.ini) that inherits the built-in `minixiangqi` and adds
// pieceDrops/capturesToHand + the no-enemy-palace drop region. The config matches
// DEFAULT_DROP_MINI_XIANGQI_RULES exactly (validated against the game kernel by
// scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts).
//
// This mirrors the Mini Xiangqi provider (move-list position, per-request FSF
// process, node+skill tiers) and the Crossroads provider (custom variant loaded
// via VariantPath). It replaces the previous in-process minimax heuristic. Engine
// ids follow the Fairy-Stockfish naming (fairy-stockfish-drop-mini-xiangqi-*),
// matching Mini Xiangqi / Crossroads; public bot identities live in bot_profiles
// (migration 063, separate from the executable engine id).
//
// The process lifecycle (spawn/parse/timeout/kill + the concurrency pool) is the
// shared `uci-engine-harness`; this file is just the Drop Mini config + tiers.

import {
  fairyStockfishBestmove,
  resolveFsfVariantIniPath,
  UciEnginePool,
} from './uci-engine-harness.js';

const VARIANT = 'dropminixiangqi';
const VARIANT_INI = 'drop-mini-xiangqi.ini';

export const DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID = 'fairy-stockfish-drop-mini-xiangqi-strong';
// Engine BUILD version recorded per PvE game. Bumped from the 0.1.0 minimax
// heuristic to mark the switch to Fairy-Stockfish. Bump on any engine/config change.
export const DROP_MINI_XIANGQI_ENGINE_VERSION = '0.2.0';

export type DropMiniXiangqiEngineTier = {
  id: string;
  name: string;
  skill: number;
  nodes: number;
  movetimeMs: number;
};

// Tiers mirror Mini Xiangqi: Skill Level weakens CPU-independently, a node budget
// pins top-tier strength reproducibly across the slow prod vCPU, and a movetime cap
// guards wall-clock. The 7x7 board is tiny, so these node budgets are cheap to serve.
const DROP_MINI_XIANGQI_ENGINE_TIERS = [
  {
    id: 'fairy-stockfish-drop-mini-xiangqi-amateur',
    name: 'Fairy Stockfish - Amateur',
    skill: 1,
    nodes: 6_000,
    movetimeMs: 300,
  },
  {
    id: DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
    name: 'Fairy Stockfish - Strong',
    skill: 8,
    nodes: 60_000,
    movetimeMs: 800,
  },
  {
    id: 'fairy-stockfish-drop-mini-xiangqi-very-strong',
    name: 'Fairy Stockfish - Strongest',
    skill: 20,
    nodes: 800_000,
    movetimeMs: 2_000,
  },
] as const satisfies readonly DropMiniXiangqiEngineTier[];

export const DROP_MINI_XIANGQI_PLAYABLE_ENGINES: readonly DropMiniXiangqiEngineTier[] =
  DROP_MINI_XIANGQI_ENGINE_TIERS;

const DROP_MINI_XIANGQI_ENGINE_BY_ID: ReadonlyMap<string, DropMiniXiangqiEngineTier> = new Map(
  DROP_MINI_XIANGQI_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

// Small FSF slot pool, separate from Mini Xiangqi / Crossroads. Drop Mini is a
// low-traffic surface; promote to a shared pool only under real concurrent load.
const fsfPool = new UciEnginePool({
  name: 'drop-mini-xiangqi-fsf',
  maxProcessesEnvVar: 'MISTBOARD_DROP_MINI_XIANGQI_FSF_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_DROP_MINI_XIANGQI_FSF_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'fsf concurrency queue timed out',
});

export function dropMiniXiangqiEngineTierFor(
  engineId: string | undefined,
): DropMiniXiangqiEngineTier | null {
  if (!engineId) return null;
  return DROP_MINI_XIANGQI_ENGINE_BY_ID.get(engineId) ?? null;
}

export function dropMiniXiangqiEngineDisplayName(engineId: string): string {
  return dropMiniXiangqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isDropMiniXiangqiEngineClientId(clientId: string | undefined): boolean {
  return dropMiniXiangqiEngineTierFor(clientId) !== null;
}

export function dropMiniXiangqiEngineVersion(clientId: string | undefined): string | null {
  return isDropMiniXiangqiEngineClientId(clientId) ? DROP_MINI_XIANGQI_ENGINE_VERSION : null;
}

// drop-mini-xiangqi.ini lives in src/; tsc does not copy it to dist/, so look in
// both the tsx-dev (src) and built (dist -> ../src) locations.
export function dropMiniXiangqiVariantIniPath(): string {
  return resolveFsfVariantIniPath(VARIANT_INI);
}

export type DropMiniXiangqiEngineRequestOptions = {
  movetimeMs?: number;
  skill?: number;
  nodes?: number;
};

/**
 * Resolve the engine tier, take a concurrency slot, and ask FSF for a move given
 * the UCI move history from the start position. Returns the UCI move (board move
 * "b1b3" or drop "C@d4") or null when there is no move.
 */
export async function dropMiniXiangqiLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = dropMiniXiangqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Drop Mini Xiangqi engine: ${engineId}`);
  const release = await fsfPool.acquire();
  try {
    return await dropMiniXiangqiEngineMove(moves, {
      skill: tier.skill,
      nodes: tier.nodes,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
    });
  } finally {
    release();
  }
}

export function dropMiniXiangqiEngineMove(
  moves: string[],
  opts: DropMiniXiangqiEngineRequestOptions = {},
): Promise<string | null> {
  return fairyStockfishBestmove({
    moves,
    variant: VARIANT,
    iniPath: dropMiniXiangqiVariantIniPath(),
    skill: opts.skill,
    nodes: opts.nodes,
    movetimeMs: opts.movetimeMs ?? 800,
  });
}
