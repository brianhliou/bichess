// Pikafish-jieqi move provider for Jieqi (揭棋) PvE.
//
// The engine is the Pikafish `jieqi` / `jieqi_old` branch (our "PikaJieQi" binary)
// driven as a UCI subprocess — the same Tier-B pattern as Crossroads/Fairy-Stockfish,
// NOT the redaction-shaped Obscuro engine-worker (the fog engine). Unlike crossroads
// (perfect information, replayed from `position startpos moves ...`), jieqi has hidden
// identities that the engine must NOT learn, so we hand it a redacted CURRENT-position
// FEN built by jieqi-fen.ts. One process per request (stateless, robust); promote to a
// persistent pool only under real load.
//
// LAUNCH config is the no-net `jieqi_old` classical-eval build (handcrafted eval, no
// NNUE weights — clean GPL-3 with no net-licensing problem). The strength track swaps in
// the NNUE `jieqi` branch + our own-trained net via MISTBOARD_PIKAFISH_NET (EvalFile).

import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import {
  boundedEnvInt,
  runUciBestmove,
  runUciEval,
  runUciMultiPv,
  UciEnginePool,
  UciEngineSession,
  type UciEval,
  type UciMultiPvLine,
} from './uci-engine-harness.js';

export const JIEQI_DEFAULT_ENGINE_ID = 'pikafish-jieqi-strongest';
// Engine BUILD version recorded per PvE game (subject_id encodes only the tier). The shipped
// engine is the no-net classical Pikafish jieqi_old build; bump on any engine/config change.
export const JIEQI_ENGINE_VERSION = '0.2.0';
// ANALYSIS pins its own version. The 0.2.0 bump above is a LIVE-PLAY search-config change
// (top-tier movetime + Hash/Threads, see jieqiLiveResourceOptions); the two paths are
// independent, so a live-play change must not invalidate cached sweeps. Bump this one only
// when the binary or the analysis search config itself changes. Analysis now runs a fixed
// depth (JIEQI_ANALYSIS_DEPTH_SEARCH), single-threaded, on its OWN fixed Hash — see
// jieqiAnalysisResourceOptions; it is no longer "default hash", and depth is no longer 12.
// 0.2.0 (2026-08-27): jieqi analysis runs `go depth N movetime T` and halts on
// whichever binds first. When movetime wins, the final iteration is aborted and
// the last `info` line is a bound with a one-move pv — which the UCI reader used
// to take as the evaluation (see uci-engine-harness). Fixed there; this bump
// orphans sweeps whose movetime bound, since their evals and pvs are wrong.
// Fortress is NOT bumped: it runs a pure `go depth N`, which always completes
// its final iteration. The Misty-backed variants never touch this parser.
export const JIEQI_ANALYSIS_ENGINE_VERSION = '0.3.0';

// Short form of the upstream `jieqi_old` commit the prod image builds (pikafish-jieqi.ref).
// It belongs in the ANALYSIS cache key because that key's whole promise is "same inputs,
// same evals": the binary is an input, and until 2026-08-28 the build cloned branch tip on
// every deploy, so two deploys either side of an upstream commit filed evals from different
// engines under one identical key. Version alone could not catch that, being hand-maintained.
// jieqi-engine-ref.test.ts fails if this drifts from the .ref file, so swapping the engine
// cannot land without moving the key and forcing a recompute.
export const PIKAFISH_JIEQI_ENGINE_REF = '23b9466c';

export type JieqiEngineTier = {
  id: string;
  name: string;
  movetimeMs: number;
  // Optional hard search-depth cap. jieqi_old has NO Skill Level / UCI_Elo knob
  // (verified: absent from its UCI options), so depth is the only real strength
  // limiter — a shallow classical search is genuinely beatable. The top tier omits
  // it (full strength, time-bounded). Depths are starting points; calibrate vs play.
  depth?: number;
};

const JIEQI_ENGINE_TIERS = [
  {
    id: 'pikafish-jieqi-amateur',
    name: 'PikaJieQi - Amateur',
    depth: 4,
    movetimeMs: 800,
  },
  {
    id: 'pikafish-jieqi-strong',
    name: 'PikaJieQi - Strong',
    depth: 10,
    movetimeMs: 1200,
  },
  {
    // The tier every jieqi PvE game is served by (the web registry offers exactly one
    // jieqi engine and the Pikafish bot profile points here). No depth cap, and the
    // movetime matches mainline Pikafish's top xiangqi rung (level-8, 4000ms) so the
    // two bots wearing the "Pikafish" badge at least get comparable think time.
    // Measured at the jieqi start position on an 8-core dev box: this config reaches
    // depth 32, against depth 10 for the 'strong' rung that used to serve every game.
    id: JIEQI_DEFAULT_ENGINE_ID,
    name: 'PikaJieQi - Strongest',
    movetimeMs: 4_000,
  },
] as const satisfies readonly JieqiEngineTier[];

// Per-process search resources for LIVE play. PikaJieQi ships UCI defaults of
// Threads=1 / Hash=16, and 16MB is badly undersized for this binary: it runs at
// ~3M nps, so hashfull pegs at 1000 (a fully thrashing table) inside the first
// second of a 4s search. Measured at the start position, 4000ms:
//   16MB/1thr -> depth 25 | 256MB/1thr -> depth 28 | 256MB/2thr -> depth 32.
// The THREAD count is what the analysis path must not borrow: a fixed-depth sweep is
// cached by (room, engine, depth) and promises a CPU-independent result, and parallel
// search is order-dependent. Measured, same position at depth 22, three runs:
// 1 thread -> cp 1055 / 1055 / 1055; 2 threads -> cp 1046 / 1055 / 1002. Hash is a
// fixed byte count and carries no such hazard, so analysis sets its own (below).
//
// Threads never claims more than HALF the container's cores: the engine shares the
// `web` box with the WS server's event loop, and the live pool can run
// MISTBOARD_PIKAFISH_MAX_PROCESSES (default 2) of these at once. So a 2-vCPU box
// stays single-threaded and only an 8-vCPU box reaches the cap of 4. Both knobs are
// env-tunable: raise MISTBOARD_PIKAFISH_JIEQI_THREADS / _HASH_MB if the container
// has headroom (each concurrent search allocates its own Hash).
function jieqiLiveResourceOptions(): string[] {
  const hashMb = boundedEnvInt('MISTBOARD_PIKAFISH_JIEQI_HASH_MB', 256, 16, 4_096);
  const threads = boundedEnvInt(
    'MISTBOARD_PIKAFISH_JIEQI_THREADS',
    Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))),
    1,
    16,
  );
  return [`setoption name Hash value ${hashMb}`, `setoption name Threads value ${threads}`];
}

export const JIEQI_PLAYABLE_ENGINES: readonly JieqiEngineTier[] = JIEQI_ENGINE_TIERS;

const JIEQI_ENGINE_BY_ID: ReadonlyMap<string, JieqiEngineTier> = new Map(
  JIEQI_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

// Small per-process slot pool (Tier-B UCI subprocess; shared harness).
const enginePool = new UciEnginePool({
  name: 'pikajieqi',
  maxProcessesEnvVar: 'MISTBOARD_PIKAFISH_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_PIKAFISH_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'pikafish-jieqi concurrency queue timed out',
});

// Dedicated ANALYSIS pool: whole-game sweeps and decisions fan-outs acquire here,
// never from the live pool above, so analysis compute can never occupy a live
// bot-move slot (the queue-timeout starvation in #208/#168). Two slots match the
// decisions fan-out concurrency (see mapWithConcurrency call sites); the longer
// default queue timeout gives queued analysis evals headroom instead of shedding.
const analysisPool = new UciEnginePool({
  name: 'pikajieqi-analysis',
  maxProcessesEnvVar: 'MISTBOARD_PIKAFISH_JIEQI_ANALYSIS_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_PIKAFISH_JIEQI_ANALYSIS_QUEUE_TIMEOUT_MS',
  defaultMaxProcesses: 2,
  defaultQueueTimeoutMs: 30_000,
  queueTimeoutMessage: 'pikafish-jieqi analysis queue timed out',
});

// Resolve the PikaJieQi binary: explicit env override, else the known dev location,
// else the prod (railpack-compiled) / system locations.
export function pikaJieqiPath(): string {
  const explicit = process.env.MISTBOARD_PIKAFISH_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_PIKAFISH_PATH points at ${resolved} but the binary does not exist`,
      );
    }
    return resolved;
  }
  const home = process.env.HOME;
  if (home) {
    const dev = resolve(home, 'projects', 'tools', 'pikafish-jieqi-old', 'src', 'PikaJieQi');
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'pikafish-jieqi'),
    '/app/bin/pikafish-jieqi',
    '/usr/local/bin/pikafish-jieqi',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('PikaJieQi (jieqi) binary not found. Set MISTBOARD_PIKAFISH_PATH.');
}

// The classical jieqi_old build needs no net. When serving the NNUE `jieqi` branch,
// point MISTBOARD_PIKAFISH_NET at an ABSOLUTE path to our trained .nnue (the engine
// rejects a relative EvalFile).
function netOption(): string[] {
  const net = process.env.MISTBOARD_PIKAFISH_NET;
  if (!net) return [];
  const resolved = resolve(net);
  if (!existsSync(resolved)) {
    throw new Error(`MISTBOARD_PIKAFISH_NET points at ${resolved} but the file does not exist`);
  }
  return [`setoption name EvalFile value ${resolved}`];
}

export function jieqiEngineTierFor(engineId: string | undefined): JieqiEngineTier | null {
  if (!engineId) return null;
  return JIEQI_ENGINE_BY_ID.get(engineId) ?? null;
}

// Presence check for the fail-closed analysis path: true when the PikaJieQi binary resolves.
// The analysis route uses this to return 503 (not a silent weaker eval) when the build is
// missing the engine — mirrors banqiEngineBinaryAvailable() / jungleEngineBinaryAvailable().
export function jieqiEngineBinaryAvailable(): boolean {
  try {
    pikaJieqiPath();
    return true;
  } catch {
    return false;
  }
}

// Per-process search resources for ANALYSIS. Single-threaded, because parallel search
// is non-deterministic and a cached sweep promises a reproducible result. Hash is
// raised off the 16MB UCI default anyway: 16MB is badly undersized for a ~3M nps binary
// and hashfull pegs at 1000 mid-search, which does not merely slow the search down, it
// corrupts it. Measured at the start position, single-threaded, depths 12 through 32:
// 16MB wanders 238 -> 241 -> 265 -> 299 cp on a fully thrashing table, while 256MB holds
// 234 -> 238 -> 234 with hashfull under 12%. A fixed byte count is as reproducible as any
// other fixed option, so this preserves the cache guarantee that Threads would break.
//
// SCOPE OF THAT GUARANTEE, measured 2026-08-28 and narrower than this comment used to
// imply: reproducible means same-architecture. The same pinned commit built arm64/NEON
// and x86-64-sse41-popcnt disagrees on both eval and node count for one position
// (depth 20: 1043 cp / 1,106,314 nodes vs 1050 cp / 851,161). The cache key captures
// engine ref and depth, not ARCH, so ONLY an x86-64 build (what railpack builds) may
// write these rows. scripts/backfill-jieqi-analysis.mjs enforces that at runtime.
export function jieqiAnalysisResourceOptions(): string[] {
  return ['setoption name Hash value 256', 'setoption name Threads value 1'];
}

/** The exact UCI block a fixed-depth analysis eval sends. Exported so the analysis
 *  resource options (fixed Hash, single thread) are testable: a cached sweep is keyed
 *  by (room, engine, depth) and promises a CPU-independent result, which a second
 *  search thread would not preserve. */
export function buildJieqiAnalysisCommands(
  fen: string,
  opts: { depth: number; movetimeMs: number; moves?: readonly string[] },
): string[] {
  return [
    'uci',
    ...netOption(),
    ...jieqiAnalysisResourceOptions(),
    'ucinewgame',
    'isready',
    buildJieqiPositionCommand(fen, opts.moves),
    `go depth ${Math.max(1, Math.floor(opts.depth))} movetime ${opts.movetimeMs}`,
  ];
}

// Whole-game ANALYSIS eval (distinct from the playable move provider above): read PikaJieQi's
// `info … score` for a redacted current-position FEN, side-to-move POV. Unlike the 3 custom
// engines, Pikafish ALREADY emits `info score` — no engine change was needed here, so this just
// reads what the binary already prints. The dial is a fixed search DEPTH (CPU-independent
// result, so the cached analysis stays stable) with a movetime cap bounding latency. Gated
// through the dedicated ANALYSIS pool so a sweep can never occupy a live bot-move slot. Caller
// owns POV normalization; the redacted (as-played info-state) FEN is sent as-is — the engine
// never sees a hidden id.
export async function evaluateJieqiFen(
  fen: string,
  opts: { depth: number; movetimeMs: number; moves?: readonly string[] },
): Promise<UciEval> {
  const commands = buildJieqiAnalysisCommands(fen, opts);
  const release = await analysisPool.acquire();
  try {
    return await runUciEval({
      bin: pikaJieqiPath(),
      commands,
      timeoutMs: opts.movetimeMs + 4_000,
      timeoutMessage: 'pikafish-jieqi eval timed out',
    });
  } finally {
    release();
  }
}

/**
 * Run `fn` with a FEN evaluator backed by ONE persistent PikaJieQi process (the
 * xiangqi #168 pattern): binary spawn + option setup (including the optional
 * MISTBOARD_PIKAFISH_NET EvalFile — exactly what the per-spawn path loads) happen
 * once for the whole sweep, then each position is a `position fen …` + `go depth
 * N movetime T` round-trip — the EXACT go command evaluateJieqiFen sends, so the
 * eval semantics (and the versioned analysis engine id) are unchanged. Scores are
 * side-to-move POV; the caller owns normalization, and the redacted FEN is sent
 * as-is (the engine never sees a hidden id). Holds one analysis-pool slot for the
 * duration, so a sweep never occupies a live bot-move slot; the session is always
 * killed on the way out.
 */
export async function withJieqiAnalysisSession<T>(
  fn: (
    evaluateFen: (
      fen: string,
      opts: { depth: number; movetimeMs: number; moves?: readonly string[] },
    ) => Promise<UciEval>,
  ) => Promise<T>,
): Promise<T> {
  const release = await analysisPool.acquire();
  const session = new UciEngineSession({
    bin: pikaJieqiPath(),
    name: 'pikafish-jieqi-analysis',
    initCommands: [
      'uci',
      ...netOption(),
      ...jieqiAnalysisResourceOptions(),
      'ucinewgame',
      'isready',
    ],
  });
  try {
    await session.ready();
    return await fn((fen, opts) =>
      session.evalPosition({
        positionCommand: buildJieqiPositionCommand(fen, opts.moves),
        goCommand: `go depth ${Math.max(1, Math.floor(opts.depth))} movetime ${opts.movetimeMs}`,
        timeoutMs: opts.movetimeMs + 4_000,
        timeoutMessage: 'pikafish-jieqi analysis eval timed out',
      }),
    );
  } finally {
    session.close();
    release();
  }
}

// Decision-vs-luck analysis (Layer 2): the per-root-move EV table for a redacted position, in
// ONE search. Pikafish models dark pieces as chance nodes, so each root move's score is its
// probability-weighted (downside-adjusted) EXPECTED value over the reveal pool — an honest,
// non-god-view number. We use MultiPV rather than the plain-search top move because that top
// move is unreliable under jieqi's noisy no-net eval (verified: the plain best and the MultiPV
// best disagree); the MultiPV table is internally consistent (all rows same conditions), which
// is what the bestEV-vs-playedEV comparison needs. `multiPv` bounds the table width (cost scales
// with it). Scores are side-to-move POV; the caller normalizes. Gated through the analysis pool.
export async function evaluateJieqiMultiPv(
  fen: string,
  opts: { depth: number; movetimeMs: number; multiPv: number; moves?: readonly string[] },
): Promise<UciMultiPvLine[]> {
  const commands = [
    'uci',
    ...netOption(),
    ...jieqiAnalysisResourceOptions(),
    `setoption name MultiPV value ${Math.max(1, Math.floor(opts.multiPv))}`,
    'ucinewgame',
    'isready',
    buildJieqiPositionCommand(fen, opts.moves),
    `go depth ${Math.max(1, Math.floor(opts.depth))} movetime ${opts.movetimeMs}`,
  ];
  const release = await analysisPool.acquire();
  try {
    return await runUciMultiPv({
      bin: pikaJieqiPath(),
      commands,
      timeoutMs: opts.movetimeMs + 4_000,
      timeoutMessage: 'pikafish-jieqi multipv eval timed out',
    });
  } finally {
    release();
  }
}

// The EV of ONE specific root move (its chance-averaged score), via `searchmoves`. Used as the
// fallback for a played move that fell outside the MultiPV table's width. Side-to-move POV.
export async function evaluateJieqiMoveEv(
  fen: string,
  move: string,
  opts: { depth: number; movetimeMs: number; moves?: readonly string[] },
): Promise<UciEval> {
  const commands = [
    'uci',
    ...netOption(),
    'ucinewgame',
    'isready',
    buildJieqiPositionCommand(fen, opts.moves),
    `go depth ${Math.max(1, Math.floor(opts.depth))} movetime ${opts.movetimeMs} searchmoves ${move}`,
  ];
  const release = await analysisPool.acquire();
  try {
    return await runUciEval({
      bin: pikaJieqiPath(),
      commands,
      timeoutMs: opts.movetimeMs + 4_000,
      timeoutMessage: 'pikafish-jieqi searchmoves eval timed out',
    });
  } finally {
    release();
  }
}

export function jieqiEngineDisplayName(engineId: string): string {
  return jieqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isJieqiEngineClientId(clientId: string | undefined): boolean {
  return jieqiEngineTierFor(clientId) !== null;
}

export function jieqiEngineVersion(clientId: string | undefined): string | null {
  return isJieqiEngineClientId(clientId) ? JIEQI_ENGINE_VERSION : null;
}

// `moves`: the quiet plies since the last irreversible move (capture OR reveal), with `fen`
// being the position at that point. Pikafish replays them to build its position stack, which
// activates is_repeated() (gated on pliesFromNull>=4) so it honors xiangqi repetition /
// perpetual-check / perpetual-chase rules instead of being blind to threefold. Omit for the
// prior FEN-only behavior. Safe under redaction: a window has no reveal, so the window-start
// FEN's dark tiles stay dark and the replayed moves are all of already-revealed pieces.
export type JieqiEngineOptions = {
  movetimeMs?: number;
  depth?: number;
  moves?: readonly string[];
};

export function buildJieqiPositionCommand(fen: string, moves: readonly string[] = []): string {
  return moves.length > 0 ? `position fen ${fen} moves ${moves.join(' ')}` : `position fen ${fen}`;
}

/**
 * Ask PikaJieQi for a move given a redacted FEN (see jieqi-fen.ts) and an optional
 * repetition window (`opts.moves`; see JieqiEngineOptions). Returns the engine's bestmove in
 * Pikafish UCI (rank 0..9, e.g. "e7a7") or null. The FEN is server-built and trusted.
 */
export async function jieqiLiveEngineMove(
  engineId: string,
  fen: string,
  opts: { movetimeMs?: number; moves?: readonly string[] } = {},
): Promise<string | null> {
  const tier = jieqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Jieqi engine: ${engineId}`);
  const release = await enginePool.acquire();
  try {
    return await jieqiEngineMove(fen, {
      depth: tier.depth,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
      moves: opts.moves,
    });
  } finally {
    release();
  }
}

/** The exact UCI block a live bot move sends. Exported so the resource options and
 *  go-limit wiring are unit-testable without spawning the binary. */
export function buildJieqiLiveCommands(fen: string, opts: JieqiEngineOptions = {}): string[] {
  const movetimeMs = opts.movetimeMs ?? 500;
  const depth = opts.depth !== undefined ? Math.max(1, Math.floor(opts.depth)) : null;
  return [
    'uci',
    ...netOption(),
    ...jieqiLiveResourceOptions(),
    'ucinewgame',
    'isready',
    buildJieqiPositionCommand(fen, opts.moves),
    // depth cap (if any) stops the search early for weaker tiers; movetime bounds
    // latency on the deep tiers. `go depth N movetime T` halts at whichever hits first.
    depth === null ? `go movetime ${movetimeMs}` : `go depth ${depth} movetime ${movetimeMs}`,
  ];
}

export function jieqiEngineMove(
  fen: string,
  opts: JieqiEngineOptions = {},
): Promise<string | null> {
  const movetimeMs = opts.movetimeMs ?? 500;
  const commands = buildJieqiLiveCommands(fen, opts);
  return runUciBestmove({
    bin: pikaJieqiPath(),
    commands,
    timeoutMs: movetimeMs + 4000,
    timeoutMessage: 'pikafish-jieqi move timed out',
  });
}
