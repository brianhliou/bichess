// Whole-game "Computer analysis" for Jungle (Dou Shou Qi): a fixed-strength eval of
// every ply, normalized to Red's POV, cached + coalesced. Mirrors the fortress analysis
// flow (routes/fortress-xiangqi-games.ts), but jungle is FEN-driven rather than
// `position startpos moves …`, so we reconstruct the board at each ply and evaluate the
// position directly.
//
// The backend is the strong `jungle-engine` Rust binary ONLY (no in-process fallback):
// we read its `info … score` via evaluateJungleFenNodes. There is deliberately no silent
// degradation to the TS PvE engine — if the binary is missing the caller fails closed and
// alerts (routes/jungle-games.ts), so a broken deploy surfaces instead of quietly serving
// a weaker eval. See jungleEngineBinaryAvailable() for the presence check.

import {
  applyJungleMove,
  createInitialJungleState,
  type JungleColor,
  type JungleGameState,
  type JungleMove,
} from '@mistboard/game';
import {
  isVacuousAnalysis,
  type SweepPlyEval,
  VacuousAnalysisError,
} from './game-analysis-sweep.js';
import { evaluateJungleFenNodes, JUNGLE_RUST_ENGINE_VERSION } from './jungle-engine.js';
import { jungleStateToEngineFen } from './jungle-fen.js';
import * as persistence from './persistence.js';

// Rust-path search budget. Node budget = CPU-independent strength, so the eval is
// reproducible across boxes (which keeps the cached series stable) and bounded in time
// and memory (the memory-crash guard: an analysis sweep can't run away).
const JUNGLE_ANALYSIS_NODES = 500_000;
const JUNGLE_ANALYSIS_MOVETIME_CAP_MS = 4_000;

// Nominal cache dimension. Jungle's real strength dial is nodes (Rust) / depth (TS),
// encoded in the engine id below; `depth` only has to be STABLE for the
// (room, engine, depth) cache key. Kept at the family default (12) for consistency.
export const JUNGLE_ANALYSIS_DEPTH = 12;

// Red-POV cp for a decisive finished position (no engine query is made there).
const TERMINAL_CP = 30_000;

// Cache engine id. Version-suffixed so an engine or config change invalidates stored
// evals. A single id: analysis is served only by the Rust engine (no fallback backend).
export const JUNGLE_ANALYSIS_ENGINE_ID = `misty-jungle-analysis@${JUNGLE_RUST_ENGINE_VERSION}`;

export type JunglePositionEval = {
  /** Centipawns from RED's POV (positive = Red better); null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from RED's POV; null otherwise. */
  mate: number | null;
  /** Best move in engine UCI ("d8d9"); already our coords (jungle has no promotions). */
  best: string | null;
};

/**
 * Evaluate a single PLAYING jungle position with the Rust engine, normalized to RED's
 * POV. The engine reports the score from the side-to-move POV; we flip it to Red when
 * Black is to move. Throws (via jungleEnginePath) when the binary is absent — callers
 * pre-check availability and fail closed.
 */
export async function evaluateJunglePosition(state: JungleGameState): Promise<JunglePositionEval> {
  const mover: JungleColor = state.status.type === 'playing' ? state.status.turn : 'red';
  const sign = mover === 'red' ? 1 : -1;
  const evaluation = await evaluateJungleFenNodes(jungleStateToEngineFen(state), {
    nodes: JUNGLE_ANALYSIS_NODES,
    movetimeCapMs: JUNGLE_ANALYSIS_MOVETIME_CAP_MS,
  });
  return {
    cp: evaluation.cp == null ? null : evaluation.cp * sign,
    mate: evaluation.mate == null ? null : evaluation.mate * sign,
    best: evaluation.best,
  };
}

// Red-POV decisive eval for a finished position: the game is over, so the winner is
// known and no engine is queried (jungle's FEN builder + engines are only defined for
// live positions).
function terminalPlyEval(ply: number, state: JungleGameState): SweepPlyEval {
  if (state.status.type !== 'finished') return { ply, cp: 0, mate: null, best: null };
  const winner = state.status.winner;
  const cp = winner === 'red' ? TERMINAL_CP : winner === 'black' ? -TERMINAL_CP : 0;
  return { ply, cp, mate: null, best: null };
}

export type JungleGameAnalysis = {
  engineId: string;
  depth: number;
  plies: SweepPlyEval[];
};

// The vacuous-sweep guard is shared across variants; re-export so existing importers
// (jungle-analysis.test.ts, routes/jungle-games.ts) keep resolving it from here.
export { isVacuousAnalysis, VacuousAnalysisError };

/**
 * Reconstruct every ply from the move list and evaluate it (Red POV). Ply 0 is the
 * initial position; ply k is the position after k moves. `evaluate` is injectable so
 * tests can drive the sweep without an engine. Reconstruction uses the same kernel
 * (createInitialJungleState + applyJungleMove) the live game did, so states — including
 * repetition/no-progress terminals — reproduce exactly.
 */
export async function analyzeJunglePostgame(
  moves: readonly JungleMove[],
  evaluate: (state: JungleGameState) => Promise<JunglePositionEval> = evaluateJunglePosition,
): Promise<JungleGameAnalysis> {
  let state = createInitialJungleState('analysis');
  const states: JungleGameState[] = [state];
  for (const move of moves) {
    state = applyJungleMove(state, move);
    states.push(state);
  }
  const plies: SweepPlyEval[] = [];
  for (let ply = 0; ply < states.length; ply += 1) {
    const s = states[ply]!;
    if (s.status.type !== 'playing') {
      plies.push(terminalPlyEval(ply, s));
      continue;
    }
    const evaluation = await evaluate(s);
    plies.push({ ply, cp: evaluation.cp, mate: evaluation.mate, best: evaluation.best });
  }
  return { engineId: JUNGLE_ANALYSIS_ENGINE_ID, depth: JUNGLE_ANALYSIS_DEPTH, plies };
}

// ── Cache-first, coalesced resolution (mirrors resolveFortressXiangqiAnalysis) ─────

// Cache read/write, injectable for tests. Live impl reads/writes the variant-agnostic
// game_analysis table (no-ops when persistence is disabled).
export type JungleAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<SweepPlyEval[] | null>;
  save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]): Promise<void>;
};

const liveAnalysisCache: JungleAnalysisCache = {
  get: (roomId, engineId, depth) => persistence.getGameAnalysis(roomId, engineId, depth),
  save: (roomId, engineId, depth, plies) =>
    persistence.saveGameAnalysis(roomId, engineId, depth, plies),
};

// One in-flight compute per (room, engine, depth) so concurrent viewers don't run the
// whole-game sweep twice; cleared in `finally` so a failed compute never wedges the key.
const inflightAnalysis = new Map<string, Promise<JungleGameAnalysis>>();

/**
 * Cache-first, coalesced whole-game analysis. A finished game's eval series is immutable
 * given (room, engine, depth): serve a stored result immediately, else compute once
 * (sharing one in-flight promise), persist it, and return. `computeIfMissing = false`
 * makes it a pure cache read (204-on-miss for the GET path).
 */
export async function resolveJungleAnalysis(
  roomId: string,
  moves: readonly JungleMove[],
  cache: JungleAnalysisCache = liveAnalysisCache,
  analyze?: (moves: readonly JungleMove[]) => Promise<JungleGameAnalysis>,
  computeIfMissing = true,
): Promise<JungleGameAnalysis | null> {
  const engineId = JUNGLE_ANALYSIS_ENGINE_ID;
  const depth = JUNGLE_ANALYSIS_DEPTH;

  const cached = await cache.get(roomId, engineId, depth);
  if (cached) return { engineId, depth, plies: cached };
  if (!computeIfMissing) return null;

  const key = `${roomId}\0${engineId}\0${depth}`;
  const existing = inflightAnalysis.get(key);
  if (existing) return existing;

  const compute = (async () => {
    const analysis = analyze ? await analyze(moves) : await analyzeJunglePostgame(moves);
    // Fail closed on a scoreless sweep: never cache a vacuous (all-null) series — it would
    // render as a flawless game forever. Throwing keeps the key uncached so a fixed engine
    // recomputes; the route maps this to 503 analysis_engine_unavailable.
    if (isVacuousAnalysis(analysis.plies)) throw new VacuousAnalysisError();
    await cache.save(roomId, engineId, depth, analysis.plies);
    return analysis;
  })();
  inflightAnalysis.set(key, compute);
  try {
    return await compute;
  } finally {
    inflightAnalysis.delete(key);
  }
}
