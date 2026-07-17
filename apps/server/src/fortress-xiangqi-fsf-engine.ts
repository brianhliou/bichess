// Fairy-Stockfish move provider for Fortress Xiangqi (7x8, "xiangqi with a
// pocket").
//
// Fortress is perfect-information (opposite-corner-palace xiangqi + the Treasure
// + crazyhouse drops + the chasing rule). FSF plays it natively from a custom
// variants.ini (fortress-xiangqi.ini) that inherits the built-in `minixiangqi`
// and layers on the 8th rank, corner palaces, the elephant/advisor/Treasure
// pieces, both-side drops, and chasingRule=axf. The config is validated against
// the game kernel byte-for-byte on the legal-move set by
// scripts/variant-lab/fortress-xiangqi-fsf-play.ts (0 mismatches over 10k+
// positions).
//
// Mirrors the Drop Mini Xiangqi provider (per-request FSF process, node+skill
// tiers, custom variant via VariantPath). Engine ids follow the Fairy-Stockfish
// naming (fairy-stockfish-fortress-xiangqi-*); public bot identities live in
// bot_profiles, separate from the executable engine id.
//
// The process lifecycle (spawn/parse/timeout/kill + the concurrency pool) is the
// shared `uci-engine-harness`; this file is just the Fortress config + tiers.

import {
  fairyStockfishBestmove,
  fairyStockfishPath,
  resolveFsfVariantIniPath,
  runUciEval,
  UciEnginePool,
  UciEngineSession,
  type UciEval,
} from './uci-engine-harness.js';

const VARIANT = 'fortressxiangqi';
const VARIANT_INI = 'fortress-xiangqi.ini';

export const FORTRESS_XIANGQI_DEFAULT_ENGINE_ID = 'fairy-stockfish-fortress-xiangqi-strong';
// Engine BUILD version recorded per PvE game. Bump on any engine/config change
// (including edits to fortress-xiangqi.ini).
// 0.2.0: clock-aware per-move budgeting (shared budgetForMove allocator) + raise
//        the Strongest movetime CEILING 2000->6000 so the 800k node budget binds
//        on the slow prod vCPU (~2.4s) instead of being cut short at 2s.
export const FORTRESS_XIANGQI_ENGINE_VERSION = '0.2.0';

export type FortressXiangqiEngineTier = {
  id: string;
  name: string;
  skill: number;
  nodes: number;
  movetimeMs: number;
};

// Tiers mirror Drop Mini Xiangqi: Skill Level weakens CPU-independently, the NODE
// budget pins top-tier strength reproducibly across the slow prod vCPU, and the
// `movetimeMs` is now the CEILING handed to the shared clock-aware allocator
// (budgetForMove) — NOT a fixed think. It must be generous enough that the node
// budget binds on prod (measured ~333k nps on the 7x8 board: 800k nodes ≈ 2.4s),
// so Strongest is 6000ms; the allocator shrinks below it under time pressure.
// Amateur/Strong caps are left low because their small node budgets (6k/60k) bind
// in well under those caps regardless.
const FORTRESS_XIANGQI_ENGINE_TIERS = [
  {
    id: 'fairy-stockfish-fortress-xiangqi-amateur',
    name: 'Fairy Stockfish - Amateur',
    skill: 1,
    nodes: 6_000,
    movetimeMs: 300,
  },
  {
    id: FORTRESS_XIANGQI_DEFAULT_ENGINE_ID,
    name: 'Fairy Stockfish - Strong',
    skill: 8,
    nodes: 60_000,
    movetimeMs: 800,
  },
  {
    id: 'fairy-stockfish-fortress-xiangqi-very-strong',
    name: 'Fairy Stockfish - Strongest',
    skill: 20,
    nodes: 800_000,
    // Ceiling, not fixed think: gives the 800k node budget room to bind on prod
    // (~2.4s) instead of the old 2s cap cutting the search short.
    movetimeMs: 6_000,
  },
] as const satisfies readonly FortressXiangqiEngineTier[];

export const FORTRESS_XIANGQI_PLAYABLE_ENGINES: readonly FortressXiangqiEngineTier[] =
  FORTRESS_XIANGQI_ENGINE_TIERS;

const FORTRESS_XIANGQI_ENGINE_BY_ID: ReadonlyMap<string, FortressXiangqiEngineTier> = new Map(
  FORTRESS_XIANGQI_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

// Small FSF slot pool, separate from the other variants. Promote to a shared
// pool only under real concurrent load.
const fsfPool = new UciEnginePool({
  name: 'fortress-xiangqi-fsf',
  maxProcessesEnvVar: 'MISTBOARD_FORTRESS_XIANGQI_FSF_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_FORTRESS_XIANGQI_FSF_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'fsf concurrency queue timed out',
});

// Dedicated ANALYSIS pool (the xiangqi #168 pattern): a whole-game sweep holds
// one persistent engine process for its full duration. On the shared live pool
// that would pin a live-move slot for minutes and queue live bot moves into the
// queue timeout; a separate pool makes the isolation structural. One slot by
// default (analysis is a batch workload) and a generous queue timeout so queued
// sweep jobs wait instead of shedding.
const analysisPool = new UciEnginePool({
  name: 'fortress-xiangqi-fsf-analysis',
  maxProcessesEnvVar: 'MISTBOARD_FORTRESS_XIANGQI_FSF_ANALYSIS_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_FORTRESS_XIANGQI_FSF_ANALYSIS_QUEUE_TIMEOUT_MS',
  defaultMaxProcesses: 1,
  defaultQueueTimeoutMs: 30_000,
  queueTimeoutMessage: 'fortress-xiangqi analysis queue timed out',
});

export function fortressXiangqiEngineTierFor(
  engineId: string | undefined,
): FortressXiangqiEngineTier | null {
  if (!engineId) return null;
  return FORTRESS_XIANGQI_ENGINE_BY_ID.get(engineId) ?? null;
}

export function fortressXiangqiEngineDisplayName(engineId: string): string {
  return fortressXiangqiEngineTierFor(engineId)?.name ?? engineId;
}

export function isFortressXiangqiEngineClientId(clientId: string | undefined): boolean {
  return fortressXiangqiEngineTierFor(clientId) !== null;
}

export function fortressXiangqiEngineVersion(clientId: string | undefined): string | null {
  return isFortressXiangqiEngineClientId(clientId) ? FORTRESS_XIANGQI_ENGINE_VERSION : null;
}

// fortress-xiangqi.ini lives in src/; tsc does not copy it to dist/, so look in
// both the tsx-dev (src) and built (dist -> ../src) locations.
export function fortressXiangqiVariantIniPath(): string {
  return resolveFsfVariantIniPath(VARIANT_INI);
}

export type FortressXiangqiEngineRequestOptions = {
  movetimeMs?: number;
  skill?: number;
  nodes?: number;
};

/**
 * Resolve the engine tier, take a concurrency slot, and ask FSF for a move given
 * the UCI move history from the start position. Returns the UCI move (board move
 * "b1b3" or drop "Q@d4") or null when there is no move.
 */
export async function fortressXiangqiLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = fortressXiangqiEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Fortress Xiangqi engine: ${engineId}`);
  const release = await fsfPool.acquire();
  try {
    return await fortressXiangqiEngineMove(moves, {
      skill: tier.skill,
      nodes: tier.nodes,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
    });
  } finally {
    release();
  }
}

export function fortressXiangqiEngineMove(
  moves: string[],
  opts: FortressXiangqiEngineRequestOptions = {},
): Promise<string | null> {
  return fairyStockfishBestmove({
    moves,
    variant: VARIANT,
    iniPath: fortressXiangqiVariantIniPath(),
    skill: opts.skill,
    nodes: opts.nodes,
    movetimeMs: opts.movetimeMs ?? 800,
  });
}

// ── Whole-game analysis (fixed-depth eval, NOT the playable tier) ─────────────

/** Fixed-depth analysis eval, Red POV. Distinct from the playable move provider:
 *  full strength (no Skill Level / node cap), `go depth N`, and read the score. */
export const FORTRESS_XIANGQI_ANALYSIS_DEPTH = 12;

// The cache engine_id for the analysis sweep. Deliberately NOT a playable tier id
// (those key on strength, which is irrelevant to a fixed-depth eval); version-
// suffixed so an engine/.ini change invalidates the cached evals.
export const FORTRESS_XIANGQI_ANALYSIS_ENGINE_ID = `fairy-stockfish-fortress-xiangqi-analysis@${FORTRESS_XIANGQI_ENGINE_VERSION}`;

export type FortressXiangqiPositionEval = {
  /** Centipawns from RED's POV (positive = Red better); null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from RED's POV; null otherwise. */
  mate: number | null;
  /** Best move in FSF UCI (already fortress coords; may be a drop like `Q@d4`). */
  best: string | null;
  depth: number;
};

// Normalize a side-to-move UCI eval to RED's POV. Red moves first, so Black is
// to move after an odd number of plies; flip the sign then. `mate 0` (side-to-
// move already mated) can't carry a sign, so encode it as a decisive cp for the
// other side.
function redPovEval(evaluation: UciEval, plyCount: number): FortressXiangqiPositionEval {
  const sign = plyCount % 2 === 0 ? 1 : -1;
  if (evaluation.mate === 0) {
    return { cp: sign * -30000, mate: null, best: evaluation.best, depth: evaluation.depth };
  }
  return {
    cp: evaluation.cp == null ? null : evaluation.cp * sign,
    mate: evaluation.mate == null ? null : evaluation.mate * sign,
    best: evaluation.best,
    depth: evaluation.depth,
  };
}

function positionCommand(moves: readonly string[]): string {
  return moves.length > 0 ? `position startpos moves ${moves.join(' ')}` : 'position startpos';
}

/**
 * Evaluate the fortress position after `moves` (FSF UCI) at a fixed depth, returning
 * the score from RED's POV. Mirrors evaluateXiangqiPosition (Pikafish) but drives
 * Fairy-Stockfish's custom fortressxiangqi variant. One spawn per call — fine for a
 * single position; whole-game sweeps must use withFortressXiangqiAnalysisSession
 * instead. Gated through fsfPool.
 */
export async function evaluateFortressXiangqiPosition(
  moves: string[],
  opts: { depth?: number } = {},
): Promise<FortressXiangqiPositionEval> {
  const depth = Math.max(1, Math.floor(opts.depth ?? FORTRESS_XIANGQI_ANALYSIS_DEPTH));
  const commands = [
    'uci',
    `setoption name VariantPath value ${fortressXiangqiVariantIniPath()}`,
    `setoption name UCI_Variant value ${VARIANT}`,
    'ucinewgame',
    'isready',
    positionCommand(moves),
    `go depth ${depth}`,
  ];
  const release = await fsfPool.acquire();
  try {
    const evaluation = await runUciEval({
      bin: fairyStockfishPath(),
      commands,
      timeoutMs: 20_000,
      timeoutMessage: 'fortress-xiangqi eval timed out',
    });
    return redPovEval(evaluation, moves.length);
  } finally {
    release();
  }
}

/**
 * Run `fn` with a position evaluator backed by ONE persistent Fairy-Stockfish
 * process (the xiangqi #168 pattern): binary spawn + variant/ini setup happen once
 * for the whole sweep, then each position is an incremental `position startpos
 * moves …` + `go depth N` round-trip — the EXACT go command the per-spawn path
 * used, so the eval semantics (and the versioned analysis engine id) are
 * unchanged. The evaluator normalises to RED's POV (same math as
 * evaluateFortressXiangqiPosition). Holds one DEDICATED analysis-pool slot for
 * the duration, so a sweep never competes with live PvE moves; the session is
 * always killed on the way out.
 */
export async function withFortressXiangqiAnalysisSession<T>(
  fn: (evaluate: (moves: string[]) => Promise<FortressXiangqiPositionEval>) => Promise<T>,
  opts: { depth?: number } = {},
): Promise<T> {
  const depth = Math.max(1, Math.floor(opts.depth ?? FORTRESS_XIANGQI_ANALYSIS_DEPTH));
  const release = await analysisPool.acquire();
  const session = new UciEngineSession({
    bin: fairyStockfishPath(),
    name: 'fortress-xiangqi-fsf-analysis',
    initCommands: [
      'uci',
      `setoption name VariantPath value ${fortressXiangqiVariantIniPath()}`,
      `setoption name UCI_Variant value ${VARIANT}`,
      'ucinewgame',
      'isready',
    ],
  });
  try {
    await session.ready();
    return await fn(async (moves) => {
      const evaluation = await session.evalPosition({
        positionCommand: positionCommand(moves),
        goCommand: `go depth ${depth}`,
        timeoutMs: 20_000,
        timeoutMessage: 'fortress-xiangqi analysis eval timed out',
      });
      return redPovEval(evaluation, moves.length);
    });
  } finally {
    session.close();
    release();
  }
}
