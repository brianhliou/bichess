/**
 * Fog-of-war chess (dark chess) computer analysis — the web-side resolver.
 *
 * Compute runs on the engine-worker: the misty engine repo's
 * `scripts/analyze_job.py` consumes a publication-shaped move list for a
 * FINISHED game and emits one `misty-analysis/1` document containing
 *
 *   - `evals`: the standard white-POV eval track per ply cursor
 *     (Stockfish-on-truth at fixed depth) — same shape every other
 *     variant's analysis feeds the advantage chart with, and
 *   - `seats.white/.black`: the fog layer — per-ply belief context,
 *     engine-solve context, and a verdict per mistake (belief_lost_truth /
 *     sample_error / decision_error), plus the seat's error budget.
 *
 * Redaction note: analysis sees the true board ONLY because the game is
 * finished and analysis is built from the full event log server-side. The
 * live engine path never gains a full-information request type — this
 * module never touches live state.
 *
 * Caching: ONE row in the variant-agnostic game_analysis table, holding the
 * whole `{plies, seats}` document as a blob. Two rows (eval track + fog
 * sibling) would be two non-atomic writes into a store whose rows are
 * immutable per (room, engineId, depth): a crash between them would leave a
 * permanent cache hit with the fog layer missing and no way to recompute.
 * Nothing outside this module reads the eval track by engine id, so there is
 * no reason to split it out.
 */

import { resolveCachedComputation } from './game-analysis-kernel.js';
import { type SweepPlyEval, VacuousAnalysisError } from './game-analysis-sweep.js';
import { requestInternalEngineAnalysis } from './internal-engine-client.js';
import * as persistence from './persistence.js';

// Version every strength-relevant knob into the id so cached rows invalidate
// when the analyzer, the engine, or the grading depth changes.
const DARK_CHESS_ANALYSIS_ENGINE_BASE = 'misty-analysis@0.2.0+sf18';
const DEFAULT_DARK_CHESS_ANALYSIS_DEPTH = 18;
/**
 * Root worlds sampled per solve — the belief-coverage knob, and the one that
 * decides whether a fog verdict is real. At 8 the analyzer's own sample missed
 * the truth on 20 of 52 plies of the reference game and blamed the player for it
 * (5 phantom `sample_error`s); at 200 it misses on none. Live play runs 32 under
 * a clock; offline has no clock, so it samples wide. Versioned into the engine id
 * below, because a row computed at 8 roots is a different (weaker) answer.
 */
const DARK_CHESS_ANALYSIS_I_SAMPLE = envInt('MISTBOARD_FOG_ANALYSIS_I_SAMPLE') ?? 200;

/**
 * Local-dev cost knobs. A production-grade pass is depth 18 with the per-ply
 * belief solve on, which is minutes per game; that is too slow to iterate
 * against. Both overrides are folded into the ENGINE ID (depth rides the
 * cache key already), so a cheap locally-computed row can never be served as
 * though it were the real thing, and flipping back recomputes rather than
 * reusing a downgraded cache hit.
 */
function envInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const DARK_CHESS_ANALYSIS_DEPTH =
  envInt('MISTBOARD_FOG_ANALYSIS_SF_DEPTH') ?? DEFAULT_DARK_CHESS_ANALYSIS_DEPTH;

/** Per-ply belief solve. Off = belief + Stockfish grading only (much faster,
 *  and the fog verdicts degrade to the ones grading alone can support). */
const DARK_CHESS_ANALYSIS_SEARCH = process.env.MISTBOARD_FOG_ANALYSIS_NO_SEARCH !== '1';
const DARK_CHESS_ANALYSIS_ITERATIONS = envInt('MISTBOARD_FOG_ANALYSIS_ITERATIONS');

export const DARK_CHESS_ANALYSIS_ENGINE_ID = [
  DARK_CHESS_ANALYSIS_ENGINE_BASE,
  `+i${DARK_CHESS_ANALYSIS_I_SAMPLE}`,
  DARK_CHESS_ANALYSIS_SEARCH ? '' : '+nosearch',
  DARK_CHESS_ANALYSIS_ITERATIONS ? `+it${DARK_CHESS_ANALYSIS_ITERATIONS}` : '',
].join('');

/** Minimal publication payload the analysis job consumes. */
export type DarkChessAnalysisPublication = {
  schema_version: string;
  game_id: string;
  variant: string;
  plies: Array<{ ply: number; mover: 'white' | 'black'; uci: string }>;
};

export type MistySeatAnalysis = {
  rows: Array<Record<string, unknown>>;
  budget: Record<string, unknown>;
};

/** The `misty-analysis/1` document the job emits (validated shape). */
export type MistyAnalysisDocument = {
  schema_version: string;
  game_id: string | null;
  sf_depth: number;
  mistake_cp: number;
  evals: Array<{ ply: number; cp: number | null; mate: number | null; best: string | null }>;
  seats: { white?: MistySeatAnalysis; black?: MistySeatAnalysis };
};

export type DarkChessGameAnalysis = {
  engineId: string;
  depth: number;
  plies: SweepPlyEval[];
  seats: { white?: MistySeatAnalysis; black?: MistySeatAnalysis };
};

/** What one cached row holds. `engineId`/`depth` are the key, not the value, so
 *  they are re-attached on read rather than stored. */
export type StoredDarkChessAnalysis = {
  plies: SweepPlyEval[];
  seats: { white?: MistySeatAnalysis; black?: MistySeatAnalysis };
};

export function parseMistyAnalysisDocument(value: unknown): MistyAnalysisDocument {
  const doc = value as MistyAnalysisDocument;
  if (!doc || typeof doc !== 'object' || doc.schema_version !== 'misty-analysis/1') {
    throw new Error('unexpected analysis document schema');
  }
  if (!Array.isArray(doc.evals) || typeof doc.seats !== 'object' || doc.seats === null) {
    throw new Error('analysis document missing evals/seats');
  }
  return doc;
}

/** Pure mapping. Rejecting a vacuous sweep is the kernel's `validate` hook
 *  (see resolveDarkChessAnalysis), which runs before the cache write. */
export function analysisFromDocument(doc: MistyAnalysisDocument): DarkChessGameAnalysis {
  const plies: SweepPlyEval[] = doc.evals.map((e) => ({
    ply: e.ply,
    cp: e.cp,
    mate: e.mate,
    best: e.best,
  }));
  return {
    engineId: DARK_CHESS_ANALYSIS_ENGINE_ID,
    depth: DARK_CHESS_ANALYSIS_DEPTH,
    plies,
    seats: doc.seats,
  };
}

/** All-null evals = the grader could not evaluate anything (or the job was
 *  misconfigured). Never cache a vacuous sweep — same contract as the other
 *  variants' analyzers. */
function rejectVacuous(analysis: DarkChessGameAnalysis): void {
  if (!analysis.plies.some((p) => p.cp !== null || p.mate !== null)) {
    throw new VacuousAnalysisError('dark_chess');
  }
}

export type DarkChessAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<StoredDarkChessAnalysis | null>;
  save(
    roomId: string,
    engineId: string,
    depth: number,
    payload: StoredDarkChessAnalysis,
  ): Promise<void>;
};

const liveCache: DarkChessAnalysisCache = {
  get: (roomId, engineId, depth) =>
    persistence.getGameAnalysisBlob<StoredDarkChessAnalysis>(roomId, engineId, depth),
  save: (roomId, engineId, depth, payload) =>
    persistence.saveGameAnalysisBlob(roomId, engineId, depth, payload),
};

async function computeViaEngineService(
  publication: DarkChessAnalysisPublication,
): Promise<DarkChessGameAnalysis> {
  const doc = await requestInternalEngineAnalysis({
    publication,
    options: {
      sfDepth: DARK_CHESS_ANALYSIS_DEPTH,
      iSample: DARK_CHESS_ANALYSIS_I_SAMPLE,
      search: DARK_CHESS_ANALYSIS_SEARCH,
      ...(DARK_CHESS_ANALYSIS_ITERATIONS ? { iterations: DARK_CHESS_ANALYSIS_ITERATIONS } : {}),
    },
  });
  return analysisFromDocument(parseMistyAnalysisDocument(doc));
}

/**
 * Cache-first, coalesced whole-game fog analysis (shared kernel skeleton).
 * One row per (room, engineId, depth) holding the whole document.
 */
export async function resolveDarkChessAnalysis(
  roomId: string,
  publication: DarkChessAnalysisPublication,
  cache: DarkChessAnalysisCache = liveCache,
  compute: (
    publication: DarkChessAnalysisPublication,
  ) => Promise<DarkChessGameAnalysis> = computeViaEngineService,
  computeIfMissing = true,
): Promise<DarkChessGameAnalysis | null> {
  const engineId = DARK_CHESS_ANALYSIS_ENGINE_ID;
  const depth = DARK_CHESS_ANALYSIS_DEPTH;
  return resolveCachedComputation<DarkChessGameAnalysis>({
    roomId,
    engineId,
    depth,
    computeIfMissing,
    cache: {
      get: async (room, engine, d) => {
        const stored = await cache.get(room, engine, d);
        if (!stored) return null;
        return { engineId: engine, depth: d, plies: stored.plies, seats: stored.seats ?? {} };
      },
      save: async (room, engine, d, value) => {
        await cache.save(room, engine, d, { plies: value.plies, seats: value.seats });
      },
    },
    validate: rejectVacuous,
    compute: () => compute(publication),
  });
}
