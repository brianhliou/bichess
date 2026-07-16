// Fairy-Stockfish move provider for perfect-information Mini Xiangqi (7x7).
//
// FSF plays `minixiangqi` natively (it is a built-in variant — unlike Crossroads
// Chess, no variants.ini is needed), so it is a free, strong opponent for the
// open mode. Per the AI-serving decision this lives server-side behind a small
// move provider — NOT the Obscuro engine-worker (the fog engine), which speaks a
// different, redaction-shaped protocol. It spawns one FSF process per request
// (stateless, robust; FSF starts in ~100ms), which is plenty for turn-based play.
//
// Strength tiers were calibrated by engine-vs-engine self-play (round-robin, both
// colours): amateur ≪ strong ≪ strongest, each step decisive (~90-97%). Weakening
// is via Skill Level (CPU-independent); the top tier is bounded by a node budget
// (reproducible across the slow prod vCPU — the banqi under-search lesson) plus a
// movetime cap as a wall-clock guard. The board is tiny, so 800k nodes is already
// near-perfect and cheap to serve.
//
// The process lifecycle (spawn/parse/timeout/kill + the concurrency pool) is the
// shared `uci-engine-harness`; this file is just the Mini Xiangqi config + tiers.

import { fairyStockfishBestmove, UciEnginePool } from './uci-engine-harness.js';

const VARIANT = 'minixiangqi';
export const MINI_XIANGQI_DEFAULT_ENGINE_ID = 'fairy-stockfish-mini-xiangqi-strong';
// Engine BUILD version recorded per PvE game (subject_id encodes only the tier).
// The shipped engine is Fairy-Stockfish for the minixiangqi variant; bump on any
// engine/config change.
export const MINI_XIANGQI_ENGINE_VERSION = '0.1.0';

export type MiniXiangqiEngineTier = {
  id: string;
  name: string;
  skill: number;
  nodes: number;
  movetimeMs: number;
};

const MINI_XIANGQI_ENGINE_TIERS = [
  {
    id: 'fairy-stockfish-mini-xiangqi-amateur',
    name: 'Fairy Stockfish - Amateur',
    skill: 1,
    nodes: 6_000,
    movetimeMs: 300,
  },
  {
    id: MINI_XIANGQI_DEFAULT_ENGINE_ID,
    name: 'Fairy Stockfish - Strong',
    skill: 8,
    nodes: 60_000,
    movetimeMs: 800,
  },
  {
    id: 'fairy-stockfish-mini-xiangqi-very-strong',
    name: 'Fairy Stockfish - Strongest',
    skill: 20,
    nodes: 800_000,
    movetimeMs: 2_000,
  },
] as const satisfies readonly MiniXiangqiEngineTier[];

export const MINI_XIANGQI_PLAYABLE_ENGINES: readonly MiniXiangqiEngineTier[] =
  MINI_XIANGQI_ENGINE_TIERS;

const MINI_XIANGQI_ENGINE_BY_ID: ReadonlyMap<string, MiniXiangqiEngineTier> = new Map(
  MINI_XIANGQI_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

// Mini Xiangqi keeps its own small FSF slot pool (separate from Crossroads).
// Both variants spawn the same binary; under genuine concurrent load on a single
// vCPU this could oversubscribe, but these are low-traffic surfaces. Promote to a
// shared pool or a dedicated process only under real load (the task-#92 trigger).
const fsfPool = new UciEnginePool({
  name: 'mini-xiangqi-fsf',
  maxProcessesEnvVar: 'MISTBOARD_MINI_XIANGQI_FSF_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_MINI_XIANGQI_FSF_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'fsf concurrency queue timed out',
});

export function miniXiangqiEngineTierFor(
  engineId: string | undefined,
): MiniXiangqiEngineTier | null {
  if (!engineId) return null;
  return MINI_XIANGQI_ENGINE_BY_ID.get(engineId) ?? null;
}

export function miniXiangqiEngineDisplayName(engineId: string): string {
  return miniXiangqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isMiniXiangqiEngineClientId(clientId: string | undefined): boolean {
  return miniXiangqiEngineTierFor(clientId) !== null;
}

export function miniXiangqiEngineVersion(clientId: string | undefined): string | null {
  return isMiniXiangqiEngineClientId(clientId) ? MINI_XIANGQI_ENGINE_VERSION : null;
}

export async function miniXiangqiLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = miniXiangqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Mini Xiangqi engine: ${engineId}`);
  const release = await fsfPool.acquire();
  try {
    return await miniXiangqiEngineMove(moves, {
      skill: tier.skill,
      nodes: tier.nodes,
      movetimeMs: Math.min(tier.movetimeMs, opts.movetimeMs ?? tier.movetimeMs),
    });
  } finally {
    release();
  }
}

export type MiniXiangqiEngineOptions = { movetimeMs?: number; skill?: number; nodes?: number };

/**
 * Ask Fairy-Stockfish for a move given the UCI move history from the start
 * position. Mini Xiangqi shares FSF's coordinate system exactly (files a-g,
 * ranks 1-7, red on rank 1, red to move first), so a platform move {from,to}
 * maps directly to the UCI string `${from}${to}` with no transform. Returns the
 * UCI move (e.g. "b1b2") or null if there is no move. Callers MUST pre-validate
 * each move string — it is written to the engine's stdin.
 */
export function miniXiangqiEngineMove(
  moves: string[],
  opts: MiniXiangqiEngineOptions = {},
): Promise<string | null> {
  return fairyStockfishBestmove({
    moves,
    variant: VARIANT,
    skill: opts.skill,
    nodes: opts.nodes,
    movetimeMs: opts.movetimeMs ?? 800,
  });
}
