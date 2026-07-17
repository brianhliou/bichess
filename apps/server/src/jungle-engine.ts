// MistyJungle move provider for Jungle (Dou Shou Qi / 斗兽棋) PvE — the Rust engine.
//
// Jungle is PERFECT-INFORMATION and deterministic, so — like banqi/jieqi/Crossroads
// (Tier-B) and unlike the fog engine-worker — we drive our own `jungle-engine` Rust
// binary (~/projects/mistboard-engine/jungle-engine) as a UCI subprocess and hand it
// a plain full-board FEN (jungle-fen.ts; no redaction). One process per request
// (stateless, robust); promote to a persistent pool only under real load.
//
// This is the strong backend behind the misty-jungle-level-* engine ids. It replaces
// the in-process TS alpha-beta (server-jungle-engine.ts) ONLY when MISTBOARD_JUNGLE_RUST_ENGINE
// is enabled AND the binary is present; otherwise the TS engine still serves (fallback).
// The win the Rust engine brings: proper win-distance (it takes the FASTEST win instead
// of dawdling — the TS engine scored all wins equally and an alphabetical tie-break could
// pick a slower one), plus the shared fail-closed/observability boundary.
//
// Strength is a NODE budget (CPU-independent), not a clock; a movetime cap bounds latency.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runUciBestmove, runUciEval, UciEnginePool, type UciEval } from './uci-engine-harness.js';

// The binary self-reports "MistyJungle <version>" over UCI; bump on every shipped
// eval/search change so the per-game configHash stays meaningful.
export const JUNGLE_RUST_ENGINE_VERSION = '0.0.2';

export type JungleRustTier = {
  id: string;
  // NODE budget = CPU-independent strength (`go nodes N`). Initial values; tune by
  // bakeoff (node budget is a clean difficulty dial — see the Flip Jungle ladder).
  nodes: number;
  // Latency cap: `go nodes N movetime CAP` halts at whichever hits first.
  movetimeCapMs: number;
};

// Same three engine ids the TS tiers expose, so the picker / existing PvE games keep
// working; only the backend changes when the flag is on. Strength rises with the node
// budget; level 3 uses the engine's "real" 1M budget.
const JUNGLE_RUST_TIERS: ReadonlyMap<string, JungleRustTier> = new Map([
  ['misty-jungle-level-1', { id: 'misty-jungle-level-1', nodes: 20_000, movetimeCapMs: 1_500 }],
  ['misty-jungle-level-2', { id: 'misty-jungle-level-2', nodes: 200_000, movetimeCapMs: 3_000 }],
  ['misty-jungle-level-3', { id: 'misty-jungle-level-3', nodes: 1_000_000, movetimeCapMs: 5_000 }],
]);

export function jungleRustEngineEnabled(): boolean {
  return process.env.MISTBOARD_JUNGLE_RUST_ENGINE === 'true';
}

export function jungleRustTierFor(engineId: string | undefined): JungleRustTier | null {
  if (!engineId) return null;
  return JUNGLE_RUST_TIERS.get(engineId) ?? null;
}

// True iff the binary resolves on this box. Lets the server fall back to the
// in-process TS engine when the flag is on but the binary wasn't shipped, rather
// than break Jungle PvE entirely.
export function jungleEngineBinaryAvailable(): boolean {
  try {
    jungleEnginePath();
    return true;
  } catch {
    return false;
  }
}

// Resolve the MistyJungle binary: explicit env override, else the dev build location,
// else the prod (railpack-compiled) / system locations. Mirrors banqiEnginePath.
export function jungleEnginePath(): string {
  const explicit = process.env.MISTBOARD_JUNGLE_ENGINE_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_JUNGLE_ENGINE_PATH points at ${resolved} but the binary does not exist`,
      );
    }
    return resolved;
  }
  const home = process.env.HOME;
  if (home) {
    const dev = resolve(
      home,
      'projects',
      'mistboard-engine',
      'jungle-engine',
      'target',
      'release',
      'jungle-engine',
    );
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'jungle-engine'),
    '/app/bin/jungle-engine',
    '/usr/local/bin/jungle-engine',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('MistyJungle (jungle) binary not found. Set MISTBOARD_JUNGLE_ENGINE_PATH.');
}

// Best move for `engineId` given a full-board FEN (jungle-fen.ts), in engine UCI
// ("d8d9") or null. FEN is server-built/trusted. Concurrency-capped per process.
export async function jungleLiveEngineMove(
  engineId: string,
  fen: string,
  opts: { nodes?: number; movetimeCapMs?: number } = {},
): Promise<string | null> {
  const tier = jungleRustTierFor(engineId);
  if (!tier) throw new Error(`unknown Jungle engine: ${engineId}`);
  const release = await enginePool.acquire();
  try {
    return await jungleEngineMove(fen, {
      nodes: opts.nodes ?? tier.nodes,
      movetimeCapMs: opts.movetimeCapMs ?? tier.movetimeCapMs,
    });
  } finally {
    release();
  }
}

export function jungleEngineMove(
  fen: string,
  opts: { nodes?: number; movetimeCapMs?: number } = {},
): Promise<string | null> {
  const nodes = opts.nodes ?? 1_000_000;
  const movetimeCapMs = opts.movetimeCapMs ?? 5_000;
  // Node budget = CPU-independent strength; movetime cap bounds latency (halt at
  // whichever hits first). Perfect-info: the full board FEN is sent as-is.
  const commands = [
    'uci',
    'ucinewgame',
    'isready',
    `position fen ${fen}`,
    `go nodes ${nodes} movetime ${movetimeCapMs}`,
  ];
  return runUciBestmove({
    bin: jungleEnginePath(),
    commands,
    timeoutMs: movetimeCapMs + 4000,
    timeoutMessage: 'jungle-engine move timed out',
  });
}

// Per-process concurrency cap (mirrors banqi-engine.ts; shared harness).
const enginePool = new UciEnginePool({
  name: 'jungle',
  maxProcessesEnvVar: 'MISTBOARD_JUNGLE_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_JUNGLE_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'jungle-engine concurrency queue timed out',
});

// Dedicated ANALYSIS pool: whole-game sweeps and decisions fan-outs acquire here,
// never from the live pool above, so analysis compute can never occupy a live
// bot-move slot (the queue-timeout starvation in #208/#168). Two slots match the
// decisions fan-out concurrency (see mapWithConcurrency call sites); the longer
// default queue timeout gives queued analysis evals headroom instead of shedding.
const analysisPool = new UciEnginePool({
  name: 'jungle-analysis',
  maxProcessesEnvVar: 'MISTBOARD_JUNGLE_ANALYSIS_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_JUNGLE_ANALYSIS_QUEUE_TIMEOUT_MS',
  defaultMaxProcesses: 2,
  defaultQueueTimeoutMs: 30_000,
  queueTimeoutMessage: 'jungle-engine analysis queue timed out',
});

// Whole-game ANALYSIS eval (distinct from the playable move providers above): read the
// engine's `info … score` for a full-board FEN, side-to-move POV. Same node-budget dial
// as play (jungle has no `go depth`), so the eval is CPU-independent and reproducible —
// which keeps the cached analysis stable. Gated through the dedicated ANALYSIS pool so a
// sweep can never occupy a live bot-move slot. Caller owns POV
// normalization; the fog-free full board is sent as-is (jungle is perfect information).
export async function evaluateJungleFenNodes(
  fen: string,
  opts: { nodes: number; movetimeCapMs: number },
): Promise<UciEval> {
  const commands = [
    'uci',
    'ucinewgame',
    'isready',
    `position fen ${fen}`,
    `go nodes ${opts.nodes} movetime ${opts.movetimeCapMs}`,
  ];
  const release = await analysisPool.acquire();
  try {
    return await runUciEval({
      bin: jungleEnginePath(),
      commands,
      timeoutMs: opts.movetimeCapMs + 4_000,
      timeoutMessage: 'jungle-engine eval timed out',
    });
  } finally {
    release();
  }
}
