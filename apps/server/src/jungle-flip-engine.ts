// MistyJungleFlip move provider for Flip Jungle (兽棋 / 翻翻棋) PvE.
//
// The engine is our own `jungle-flip-engine` binary ("MistyJungleFlip", in
// ~/projects/mistboard-engine/jungle-flip-engine) — a standalone Rust αβ+Star1+TT
// engine driven as a UCI subprocess, the same Tier-B pattern as banqi/jieqi/Crossroads
// (NOT the fog engine-worker). Flip Jungle has hidden piece IDENTITIES the engine must
// not learn, so we hand it a redacted CURRENT-position FEN built by jungle-flip-fen.ts.
// One process per request (stateless, robust); promote to a persistent pool only under
// real load.
//
// Fixed-strength classical engine (no net). Strength is a NODE budget (positions
// searched), not a time budget — so the bot plays the same strength on any CPU. A
// movetime cap bounds latency. One versioned bot. Unlike banqi, the binary ignores
// trailing `moves` (the clock is carried in the FEN); game-history threefold context
// goes as a `reps` tail of positions already seen twice. Since v0.4.0 the binary also
// loads the ≤4 exact tablebase (WLD + distance-to-mate) that railpack downloads next to
// it, and scores wins by distance — it converts won endgames by the shortest forced
// line instead of shuffling a won position to the repetition draw.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runUciBestmove, runUciEval, UciEnginePool, type UciEval } from './uci-engine-harness.js';

// Bump on every shipped eval/search change; the binary self-reports "MistyJungleFlip
// <version>" over UCI, and the engines registry records it (configHash) per game.
export const JUNGLE_FLIP_ENGINE_VERSION = '0.5.1';
export const JUNGLE_FLIP_DEFAULT_ENGINE_ID = 'misty-jungle-flip';

export type JungleFlipEngineTier = {
  id: string;
  name: string;
  version: string;
  // Strength is a NODE budget, not a time budget: `go nodes N` searches the same number
  // of positions on any CPU, so the bot plays the same strength regardless of how
  // slow/loaded the prod box is.
  nodes: number;
  // Latency cap (ms): `go nodes N movetime CAP` halts at whichever hits first, so a slow
  // box never exceeds CAP per move.
  movetimeCapMs: number;
};

// One versioned bot. The Rust engine searches ~512K nodes comfortably; the 4x4 board
// makes that very deep. Cap keeps moves playable on the shared prod vCPU.
const MISTY_JUNGLE_FLIP: JungleFlipEngineTier = {
  id: JUNGLE_FLIP_DEFAULT_ENGINE_ID,
  name: 'MistyJungleFlip',
  version: JUNGLE_FLIP_ENGINE_VERSION,
  nodes: 512_000,
  movetimeCapMs: 5000,
};

export const JUNGLE_FLIP_PLAYABLE_ENGINES: readonly JungleFlipEngineTier[] = [MISTY_JUNGLE_FLIP];

const JUNGLE_FLIP_ENGINE_BY_ID: ReadonlyMap<string, JungleFlipEngineTier> = new Map<
  string,
  JungleFlipEngineTier
>([[MISTY_JUNGLE_FLIP.id, MISTY_JUNGLE_FLIP]]);

// Small per-process slot pool (Tier-B UCI subprocess; shared harness).
const enginePool = new UciEnginePool({
  name: 'jungle-flip',
  maxProcessesEnvVar: 'MISTBOARD_JUNGLE_FLIP_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_JUNGLE_FLIP_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'jungle-flip-engine concurrency queue timed out',
});

// Resolve the MistyJungleFlip binary: explicit env override, else the dev build
// location, else the prod (railpack-compiled) / system locations.
export function jungleFlipEnginePath(): string {
  const explicit = process.env.MISTBOARD_JUNGLE_FLIP_ENGINE_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_JUNGLE_FLIP_ENGINE_PATH points at ${resolved} but the binary does not exist`,
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
      'jungle-flip-engine',
      'target',
      'release',
      'jungle-flip-engine',
    );
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'jungle-flip-engine'),
    '/app/bin/jungle-flip-engine',
    '/usr/local/bin/jungle-flip-engine',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'MistyJungleFlip (jungle-flip) binary not found. Set MISTBOARD_JUNGLE_FLIP_ENGINE_PATH.',
  );
}

export function jungleFlipEngineTierFor(engineId: string | undefined): JungleFlipEngineTier | null {
  if (!engineId) return null;
  return JUNGLE_FLIP_ENGINE_BY_ID.get(engineId) ?? null;
}

// Presence check for the fail-closed analysis path: true when the binary resolves. The
// analysis route uses this to return 503 (not a silent weaker eval) when the build is
// missing the engine — mirrors jungleEngineBinaryAvailable().
export function jungleFlipEngineBinaryAvailable(): boolean {
  try {
    jungleFlipEnginePath();
    return true;
  } catch {
    return false;
  }
}

export function jungleFlipEngineDisplayName(engineId: string): string {
  return jungleFlipEngineTierFor(engineId)?.name ?? engineId;
}

export function isJungleFlipEngineClientId(clientId: string | undefined): boolean {
  return jungleFlipEngineTierFor(clientId) !== null;
}

// Engine BUILD version recorded per PvE game (subject_id is version-less). Bump
// JUNGLE_FLIP_ENGINE_VERSION on each shipped eval/search change.
export function jungleFlipEngineVersion(clientId: string | undefined): string | null {
  return isJungleFlipEngineClientId(clientId) ? JUNGLE_FLIP_ENGINE_VERSION : null;
}

export type JungleFlipEngineOptions = {
  nodes?: number;
  movetimeCapMs?: number;
  // Redacted FENs of positions already seen twice this game (see jungleFlipRepSeedFens).
  // Appended as a trailing `reps` token so the engine's search scores a move that re-enters
  // one as a threefold draw. Older binaries ignore the trailing token (state_from_fen reads
  // only the leading FEN fields), so this is backward-compatible.
  repSeedFens?: readonly string[];
  // Decimal seed passed as `JF_TIE_SEED` to break exact-value root ties (mainly the opening
  // flip). Omit to let the binary self-seed from entropy (varied but non-reproducible). A
  // stable per-game value (see jungleFlipTieSeed) gives variety AND exact replay. Unknown to
  // pre-tie-break binaries, which ignore the env var, so this is backward-compatible.
  tieSeed?: string;
};

/**
 * Deterministic per-game tie-break seed for the engine's `JF_TIE_SEED`, derived from the
 * (persisted) room id: tied choices vary across games yet replay exactly for a given game,
 * with no extra state to store. FNV-1a 64-bit as a decimal string; never "0" (the engine
 * reserves 0 as the "off"/legacy-deterministic sentinel).
 */
export function jungleFlipTieSeed(roomId: string): string {
  const mask = 0xffffffffffffffffn;
  const prime = 0x100000001b3n;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < roomId.length; i++) {
    hash = ((hash ^ BigInt(roomId.charCodeAt(i))) * prime) & mask;
  }
  return (hash === 0n ? 1n : hash).toString();
}

/**
 * Build the UCI `position` command. A non-empty rep seed is appended as
 * `... reps <fen1>;<fen2>;...` (FENs contain spaces, so they are ';'-delimited). Kept pure
 * for unit testing the wire format.
 */
export function buildJungleFlipPositionCommand(
  fen: string,
  repSeedFens: readonly string[] = [],
): string {
  if (repSeedFens.length === 0) return `position fen ${fen}`;
  return `position fen ${fen} reps ${repSeedFens.join(';')}`;
}

/**
 * Ask MistyJungleFlip for a move given a redacted FEN (see jungle-flip-fen.ts). Returns
 * the engine's bestmove in engine UCI (rank 0..3, e.g. "a0b0", flip "a0a0") or null.
 * FEN is server-built/trusted.
 */
export async function jungleFlipLiveEngineMove(
  engineId: string,
  fen: string,
  opts: JungleFlipEngineOptions = {},
): Promise<string | null> {
  const tier = jungleFlipEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Flip Jungle engine: ${engineId}`);
  const release = await enginePool.acquire();
  try {
    return await jungleFlipEngineMove(fen, {
      nodes: opts.nodes ?? tier.nodes,
      movetimeCapMs: opts.movetimeCapMs ?? tier.movetimeCapMs,
      repSeedFens: opts.repSeedFens,
      tieSeed: opts.tieSeed,
    });
  } finally {
    release();
  }
}

export function jungleFlipEngineMove(
  fen: string,
  opts: JungleFlipEngineOptions = {},
): Promise<string | null> {
  const nodes = opts.nodes ?? 512_000;
  const movetimeCapMs = opts.movetimeCapMs ?? 2500;
  // Node budget = CPU-independent strength; movetime cap bounds latency (halt at
  // whichever first). The position carries the clock in the FEN plus an optional
  // `reps` seed (threefold game history) so the search adjudicates repetition draws.
  const commands = [
    'uci',
    'ucinewgame',
    'isready',
    buildJungleFlipPositionCommand(fen, opts.repSeedFens),
    `go nodes ${nodes} movetime ${movetimeCapMs}`,
  ];
  return runUciBestmove({
    bin: jungleFlipEnginePath(),
    commands,
    timeoutMs: movetimeCapMs + 4000,
    timeoutMessage: 'jungle-flip-engine move timed out',
    env: opts.tieSeed ? { JF_TIE_SEED: opts.tieSeed } : undefined,
  });
}

// Whole-game ANALYSIS eval (distinct from the playable move provider above): read the
// engine's `info … score` for a redacted current-position FEN, side-to-move POV. Same
// node-budget dial as play, so the eval is CPU-independent and reproducible — which keeps
// the cached analysis stable. Gated through the shared pool so an analysis sweep runs
// sequentially. Each position is evaluated standalone (no `reps` seed — a single-position
// eval needs no threefold history); the redacted FEN is sent as-is (hidden ids stay hidden).
export async function evaluateJungleFlipFenNodes(
  fen: string,
  opts: { nodes: number; movetimeCapMs: number },
): Promise<UciEval> {
  const commands = [
    'uci',
    'ucinewgame',
    'isready',
    buildJungleFlipPositionCommand(fen),
    `go nodes ${opts.nodes} movetime ${opts.movetimeCapMs}`,
  ];
  const release = await enginePool.acquire();
  try {
    return await runUciEval({
      bin: jungleFlipEnginePath(),
      commands,
      timeoutMs: opts.movetimeCapMs + 4_000,
      timeoutMessage: 'jungle-flip-engine eval timed out',
    });
  } finally {
    release();
  }
}
