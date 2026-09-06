// MistyBanqi move provider for Banqi (半棋) PvE.
//
// The engine is our own `banqi-engine` binary ("MistyBanqi", in
// ~/projects/mistboard-engine/banqi-engine) — a standalone Rust αβ+Star1+TT engine
// driven as a UCI subprocess, the same Tier-B pattern as jieqi/Crossroads (NOT the
// fog engine-worker). Banqi has hidden piece IDENTITIES the engine must not learn, so
// we hand it a redacted CURRENT-position FEN built by banqi-fen.ts. One process per
// request (stateless, robust); promote to a persistent pool only under real load.
//
// Fixed-strength classical engine (no net). Strength is a NODE budget (positions searched),
// not a time budget — so the bot plays the same strength on any CPU (prod's slow shared vCPU
// was under-searching the old movetime tiers). A movetime cap bounds latency. One versioned
// bot (v0.2.0; was 3 difficulty tiers through 2026-06-18).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from './obs.js';
import { runUciEval, UciEnginePool, type UciEval } from './uci-engine-harness.js';

// Bump on every shipped eval/search change; the binary self-reports "MistyBanqi <version>"
// over UCI, and the engines registry records it (configHash) on each game so we can always
// tell which build played.
export const BANQI_ENGINE_VERSION = '0.2.5';
export const BANQI_DEFAULT_ENGINE_ID = 'misty-banqi';

export type BanqiEngineTier = {
  id: string;
  name: string;
  version: string;
  // Strength is a NODE budget, not a time budget: `go nodes N` searches the same number of
  // positions on any CPU, so the bot plays the same strength regardless of how slow/loaded the
  // prod box is. (Movetime-only tiers under-searched in prod: 600ms on a slow shared vCPU reaches
  // ~200K nodes vs ~1.2M on a dev Mac — the bot was far weaker in prod than in testing.)
  nodes: number;
  // Latency cap (ms): `go nodes N movetime CAP` halts at whichever hits first, so a slow box never
  // exceeds CAP per move. Generous enough that a normal prod CPU reaches the full node budget.
  movetimeCapMs: number;
};

// ONE versioned bot (2026-06-18). Was 3 difficulty tiers (amateur/strong/strongest); collapsed
// to a single full-strength MistyBanqi when the cheap-strength eval shipped (v0.2.0: cover_mat +
// king_ctx + value-aware mobility + adaptive domination + corrected value table, +16.6% vs hw3).
// 1.5M nodes is the strongest budget; the cap keeps moves playable.
//
// Cap raised 5000 -> 8000 (2026-07-24): the node budget is the CPU-independent strength dial,
// but prod's slow shared vCPU (~330K nodes/s vs ~1.5M/s on a dev Mac) needs ~4.5s to reach 1.5M
// nodes, so a 5s cap truncated below budget under any contention — the bot played the shallow,
// weaker move (a diagnosed banqi horizon miss: a full-budget search finds the win, a truncated
// one doesn't). 8s gives headroom to actually reach the configured budget. `banqiEngineMove`
// now logs a truncation warning when a move still hits the cap, so real prod behavior is visible.
const MISTY_BANQI: BanqiEngineTier = {
  id: BANQI_DEFAULT_ENGINE_ID,
  name: 'MistyBanqi',
  version: BANQI_ENGINE_VERSION,
  nodes: 1_500_000,
  movetimeCapMs: 8000,
};

export const BANQI_PLAYABLE_ENGINES: readonly BanqiEngineTier[] = [MISTY_BANQI];

// Legacy tier ids from old / in-flight game records still RESOLVE to the single bot (so the
// engine keeps moving and they display fine), but are not offered in the picker.
const BANQI_LEGACY_IDS = ['misty-banqi-strong', 'misty-banqi-amateur', 'misty-banqi-strongest'];

const BANQI_ENGINE_BY_ID: ReadonlyMap<string, BanqiEngineTier> = new Map<string, BanqiEngineTier>([
  [MISTY_BANQI.id, MISTY_BANQI],
  ...BANQI_LEGACY_IDS.map((id) => [id, MISTY_BANQI] as [string, BanqiEngineTier]),
]);

// Small per-process slot pool (Tier-B UCI subprocess; shared harness).
const enginePool = new UciEnginePool({
  name: 'banqi',
  maxProcessesEnvVar: 'MISTBOARD_BANQI_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_BANQI_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'banqi-engine concurrency queue timed out',
});

// Dedicated ANALYSIS pool: whole-game sweeps and decisions fan-outs acquire here,
// never from the live pool above, so analysis compute can never occupy a live
// bot-move slot (the queue-timeout starvation in #208/#168). Two slots match the
// decisions fan-out concurrency (see mapWithConcurrency call sites); the longer
// default queue timeout gives queued analysis evals headroom instead of shedding.
const analysisPool = new UciEnginePool({
  name: 'banqi-analysis',
  maxProcessesEnvVar: 'MISTBOARD_BANQI_ANALYSIS_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_BANQI_ANALYSIS_QUEUE_TIMEOUT_MS',
  defaultMaxProcesses: 2,
  defaultQueueTimeoutMs: 30_000,
  queueTimeoutMessage: 'banqi-engine analysis queue timed out',
});

// Resolve the MistyBanqi binary: explicit env override, else the dev build location,
// else the prod (railpack-compiled) / system locations.
export function banqiEnginePath(): string {
  const explicit = process.env.MISTBOARD_BANQI_ENGINE_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_BANQI_ENGINE_PATH points at ${resolved} but the binary does not exist`,
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
      'banqi-engine',
      'target',
      'release',
      'banqi-engine',
    );
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'banqi-engine'),
    '/app/bin/banqi-engine',
    '/usr/local/bin/banqi-engine',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('MistyBanqi (banqi) binary not found. Set MISTBOARD_BANQI_ENGINE_PATH.');
}

export function banqiEngineTierFor(engineId: string | undefined): BanqiEngineTier | null {
  if (!engineId) return null;
  return BANQI_ENGINE_BY_ID.get(engineId) ?? null;
}

// Presence check for the fail-closed analysis path: true when the binary resolves. The
// analysis route uses this to return 503 (not a silent weaker eval) when the build is
// missing the engine — mirrors jungleEngineBinaryAvailable().
export function banqiEngineBinaryAvailable(): boolean {
  try {
    banqiEnginePath();
    return true;
  } catch {
    return false;
  }
}

export function banqiEngineDisplayName(engineId: string): string {
  return banqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isBanqiEngineClientId(clientId: string | undefined): boolean {
  return banqiEngineTierFor(clientId) !== null;
}

// Engine BUILD version recorded per PvE game (subject_id is version-less). Bump
// BANQI_ENGINE_VERSION on each shipped eval/search change.
export function banqiEngineVersion(clientId: string | undefined): string | null {
  return isBanqiEngineClientId(clientId) ? BANQI_ENGINE_VERSION : null;
}

// `moves`: the quiet plies since the last irreversible move (capture/flip). When present,
// `fen` is the position at that irreversible move (window start), and the engine replays
// the moves to seed its repetition history — so it avoids/seeks threefold (perpetual-chase)
// draws instead of shuffling into them blind. Omit for the prior FEN-only behavior.
export type BanqiEngineOptions = {
  nodes?: number;
  movetimeCapMs?: number;
  moves?: readonly string[];
};

export function buildBanqiPositionCommand(fen: string, moves: readonly string[] = []): string {
  return moves.length > 0 ? `position fen ${fen} moves ${moves.join(' ')}` : `position fen ${fen}`;
}

/**
 * Ask MistyBanqi for a move given a redacted FEN (see banqi-fen.ts) and an optional
 * repetition window (`opts.moves`; see BanqiEngineOptions). Returns the engine's bestmove
 * in engine UCI (rank 0..3, e.g. "a0b0", flip "a0a0") or null. FEN is server-built/trusted.
 */
export async function banqiLiveEngineMove(
  engineId: string,
  fen: string,
  opts: BanqiEngineOptions = {},
): Promise<UciEval> {
  const tier = banqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Banqi engine: ${engineId}`);
  const release = await enginePool.acquire();
  try {
    return await banqiEngineSearch(fen, {
      nodes: opts.nodes ?? tier.nodes,
      movetimeCapMs: opts.movetimeCapMs ?? tier.movetimeCapMs,
      moves: opts.moves,
    });
  } finally {
    release();
  }
}

// Fraction of the node budget below which a move counts as truncated (cut short by the
// movetime cap before finishing its search), and the fraction of the cap that counts as
// "hit the cap". A truncated move plays a shallower, weaker choice than the configured
// strength — the failure mode behind the diagnosed banqi horizon miss (2026-07-24). We warn
// so this is visible in prod instead of silent (the binary emitted no search stats before).
const BANQI_TRUNCATION_NODE_FRACTION = 0.9;
const BANQI_CAP_HIT_FRACTION = 0.95;

/**
 * Emit search-truncation telemetry for one MistyBanqi move. `nodes` reports (depth/nodes/time)
 * come from the engine's `info` lines; older builds that emit none fall back to wall-clock
 * `elapsedMs` (an upper bound, includes spawn + handshake). Warns only on a truncated move, so
 * a healthy engine stays quiet and a warning is an actionable "cap too low / CPU starved" signal.
 */
function reportBanqiSearchTelemetry(input: {
  result: UciEval;
  nodeBudget: number;
  movetimeCapMs: number;
  elapsedMs: number;
}): void {
  const { result, nodeBudget, movetimeCapMs, elapsedMs } = input;
  const reachedBudget =
    result.nodes != null ? result.nodes >= nodeBudget * BANQI_TRUNCATION_NODE_FRACTION : null;
  const capMs = movetimeCapMs * BANQI_CAP_HIT_FRACTION;
  const hitCap = result.timeMs != null ? result.timeMs >= capMs : elapsedMs >= capMs;
  // Truncated: the engine reported fewer nodes than its budget, or it ran up against the cap.
  const truncated = reachedBudget === false || hitCap;
  if (!truncated) return;
  logger.warn(
    {
      kind: 'banqi_search_truncated',
      nodeBudget,
      movetimeCapMs,
      reportedNodes: result.nodes ?? null,
      reportedDepth: result.depth || null,
      reportedTimeMs: result.timeMs ?? null,
      elapsedMs: Math.round(elapsedMs),
      // A truncated search on the slow prod vCPU plays below configured strength; if this fires
      // steadily, raise movetimeCapMs or speed the engine (e.g. enable move ordering).
    },
    'MistyBanqi move truncated below node budget',
  );
}

export async function banqiEngineMove(
  fen: string,
  opts: BanqiEngineOptions = {},
): Promise<string | null> {
  return (await banqiEngineSearch(fen, opts)).best;
}

/**
 * The same move request, but returning the whole search summary rather than just
 * the move. Live play takes this one so the per-move decision artifact can record
 * what the engine actually consumed (depth, nodes, time) next to the budget it was
 * given; without those two numbers side by side, an engine that spends a fraction
 * of its allocation looks exactly like one that spends all of it.
 */
export async function banqiEngineSearch(
  fen: string,
  opts: BanqiEngineOptions = {},
): Promise<UciEval> {
  const nodes = opts.nodes ?? 500_000;
  const movetimeCapMs = opts.movetimeCapMs ?? 2500;
  const position = buildBanqiPositionCommand(fen, opts.moves);
  // Node budget = CPU-independent strength; movetime cap bounds latency (halt at whichever first).
  const commands = [
    'uci',
    'ucinewgame',
    'isready',
    position,
    `go nodes ${nodes} movetime ${movetimeCapMs}`,
  ];
  const startedAt = Date.now();
  const result = await runUciEval({
    bin: banqiEnginePath(),
    commands,
    timeoutMs: movetimeCapMs + 4000,
    timeoutMessage: 'banqi-engine move timed out',
  });
  reportBanqiSearchTelemetry({
    result,
    nodeBudget: nodes,
    movetimeCapMs,
    elapsedMs: Date.now() - startedAt,
  });
  return result;
}

// Whole-game ANALYSIS eval (distinct from the playable move provider above): read the
// engine's `info … score` for a redacted current-position FEN, side-to-move POV. Same
// node-budget dial as play, so the eval is CPU-independent and reproducible — which keeps
// the cached analysis stable. Gated through the dedicated ANALYSIS pool so a sweep can
// never occupy a live bot-move slot. Caller owns POV normalization; the
// redacted (as-played info-state) FEN is sent as-is — the engine never sees a hidden id.
export async function evaluateBanqiFenNodes(
  fen: string,
  opts: { nodes: number; movetimeCapMs: number; moves?: readonly string[] },
): Promise<UciEval> {
  const commands = [
    'uci',
    'ucinewgame',
    'isready',
    buildBanqiPositionCommand(fen, opts.moves),
    `go nodes ${opts.nodes} movetime ${opts.movetimeCapMs}`,
  ];
  const release = await analysisPool.acquire();
  try {
    return await runUciEval({
      bin: banqiEnginePath(),
      commands,
      timeoutMs: opts.movetimeCapMs + 4_000,
      timeoutMessage: 'banqi-engine eval timed out',
    });
  } finally {
    release();
  }
}
