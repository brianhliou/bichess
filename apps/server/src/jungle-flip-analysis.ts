// Whole-game "Computer analysis" for Flip Jungle (兽棋 / 翻翻棋): a fixed-strength eval of
// every ply, normalized to the RED SEAT's POV, cached + coalesced. Mirrors banqi-analysis.ts
// (both are symmetric hidden-deal variants): reconstruction needs the per-game DEAL (from the
// room-created event) to rebuild each position, and the engine is fed the REDACTED (as-played
// info-state) FEN — jungle-flip-fen.ts emits `X` for a face-down tile (hiding role AND ink),
// so the engine never learns a hidden id, exactly as during live play.
//
// The backend is the MistyJungleFlip Rust binary ONLY (no fallback): we read its `info …
// score` via evaluateJungleFlipFenNodes. A missing binary fails closed at the route (503),
// and an all-null sweep throws VacuousAnalysisError (never cached).

import {
  applyJungleFlipMove,
  createInitialJungleFlipState,
  type JungleFlipColor,
  type JungleFlipDeal,
  type JungleFlipGameState,
  type JungleFlipMove,
  type JungleFlipPieceRole,
  type JungleFlipSeat,
  winPercent,
} from '@mistboard/game';
import {
  isVacuousAnalysis,
  type SweepPlyEval,
  VacuousAnalysisError,
} from './game-analysis-sweep.js';
import { evaluateJungleFlipFenNodes, JUNGLE_FLIP_ENGINE_VERSION } from './jungle-flip-engine.js';
import {
  engineUciToJungleFlipMove,
  jungleFlipMoveToEngineUci,
  jungleFlipStateToEngineFen,
} from './jungle-flip-fen.js';
import * as persistence from './persistence.js';

// Search budget. Node budget = CPU-independent strength, so the eval is reproducible across
// boxes (stable cache) and bounded in time and memory (an analysis sweep can't run away).
const JUNGLE_FLIP_ANALYSIS_NODES = 512_000;
const JUNGLE_FLIP_ANALYSIS_MOVETIME_CAP_MS = 4_000;

// Nominal cache dimension: `depth` only has to be STABLE for the (room, engine, depth) cache
// key (the real dial is nodes, encoded in the engine id). Kept at the family default.
export const JUNGLE_FLIP_ANALYSIS_DEPTH = 12;

// Red-SEAT-POV cp for a decisive finished position (no engine query is made there).
const TERMINAL_CP = 30_000;

// Cache engine id, version-suffixed so an engine/config change invalidates stored evals.
export const JUNGLE_FLIP_ANALYSIS_ENGINE_ID = `misty-jungle-flip-analysis@${JUNGLE_FLIP_ENGINE_VERSION}`;

export type JungleFlipPositionEval = {
  /** Centipawns from the RED SEAT's POV (positive = Red better); null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from the RED SEAT's POV; null otherwise. */
  mate: number | null;
  /** Best move in engine UCI ("a0b0", flip "a0a0"); already our coords. */
  best: string | null;
};

/**
 * Evaluate a single PLAYING flip-jungle position with the MistyJungleFlip engine, normalized
 * to the RED SEAT's POV. The engine reports the score from the side-to-move POV, and
 * side-to-move IS the mover seat, so we flip the sign when Black is to move. Throws (via
 * jungleFlipEnginePath) when the binary is absent; callers pre-check and fail closed.
 */
export async function evaluateJungleFlipPosition(
  state: JungleFlipGameState,
): Promise<JungleFlipPositionEval> {
  const mover: JungleFlipSeat = state.status.type === 'playing' ? state.status.turn : 'red';
  const sign = mover === 'red' ? 1 : -1;
  const evaluation = await evaluateJungleFlipFenNodes(jungleFlipStateToEngineFen(state), {
    nodes: JUNGLE_FLIP_ANALYSIS_NODES,
    movetimeCapMs: JUNGLE_FLIP_ANALYSIS_MOVETIME_CAP_MS,
  });
  return {
    cp: evaluation.cp == null ? null : evaluation.cp * sign,
    mate: evaluation.mate == null ? null : evaluation.mate * sign,
    best: evaluation.best,
  };
}

// Red-SEAT-POV decisive eval for a finished position: the winner seat is known and no engine
// is queried. `winner` is a SEAT (red = first mover), already in the sweep's red-seat POV.
function terminalPlyEval(ply: number, state: JungleFlipGameState): SweepPlyEval {
  if (state.status.type !== 'finished') return { ply, cp: 0, mate: null, best: null };
  const winner = state.status.winner;
  const cp = winner === 'red' ? TERMINAL_CP : winner === 'black' ? -TERMINAL_CP : 0;
  return { ply, cp, mate: null, best: null };
}

export type JungleFlipGameAnalysis = {
  engineId: string;
  depth: number;
  plies: SweepPlyEval[];
};

/**
 * Reconstruct every ply from the per-game DEAL + move list and evaluate it (red-seat POV).
 * Ply 0 is the initial position; ply k is the position after k moves. Reconstruction uses the
 * SAME kernel the live game did (createInitialJungleFlipState(deal) + applyJungleFlipMove), so
 * flip-reveals reproduce exactly (a flip is a move with from === to). `evaluate` is injectable
 * so tests drive the sweep without an engine.
 */
export async function analyzeJungleFlipPostgame(
  moves: readonly JungleFlipMove[],
  deal: JungleFlipDeal,
  evaluate: (
    state: JungleFlipGameState,
  ) => Promise<JungleFlipPositionEval> = evaluateJungleFlipPosition,
): Promise<JungleFlipGameAnalysis> {
  let state = createInitialJungleFlipState('analysis', deal);
  const states: JungleFlipGameState[] = [state];
  for (const move of moves) {
    state = applyJungleFlipMove(state, move);
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
  return {
    engineId: JUNGLE_FLIP_ANALYSIS_ENGINE_ID,
    depth: JUNGLE_FLIP_ANALYSIS_DEPTH,
    plies,
  };
}

// ── Cache-first, coalesced resolution (mirrors resolveBanqiAnalysis) ───────────────

export type JungleFlipAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<SweepPlyEval[] | null>;
  save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]): Promise<void>;
};

const liveAnalysisCache: JungleFlipAnalysisCache = {
  get: (roomId, engineId, depth) => persistence.getGameAnalysis(roomId, engineId, depth),
  save: (roomId, engineId, depth, plies) =>
    persistence.saveGameAnalysis(roomId, engineId, depth, plies),
};

const inflightAnalysis = new Map<string, Promise<JungleFlipGameAnalysis>>();

/**
 * Cache-first, coalesced whole-game analysis. A finished game's eval series is immutable given
 * (room, engine, depth): serve a stored result immediately, else compute once (sharing one
 * in-flight promise), persist it, and return. `computeIfMissing = false` makes it a pure cache
 * read (204-on-miss for GET). A scoreless (all-null) sweep throws VacuousAnalysisError and is
 * never cached, so a fixed engine can recompute later.
 */
export async function resolveJungleFlipAnalysis(
  roomId: string,
  moves: readonly JungleFlipMove[],
  deal: JungleFlipDeal,
  cache: JungleFlipAnalysisCache = liveAnalysisCache,
  analyze?: (
    moves: readonly JungleFlipMove[],
    deal: JungleFlipDeal,
  ) => Promise<JungleFlipGameAnalysis>,
  computeIfMissing = true,
): Promise<JungleFlipGameAnalysis | null> {
  const engineId = JUNGLE_FLIP_ANALYSIS_ENGINE_ID;
  const depth = JUNGLE_FLIP_ANALYSIS_DEPTH;

  const cached = await cache.get(roomId, engineId, depth);
  if (cached) return { engineId, depth, plies: cached };
  if (!computeIfMissing) return null;

  const key = `${roomId}\0${engineId}\0${depth}`;
  const existing = inflightAnalysis.get(key);
  if (existing) return existing;

  const compute = (async () => {
    const analysis = analyze
      ? await analyze(moves, deal)
      : await analyzeJungleFlipPostgame(moves, deal);
    // Fail closed on a scoreless sweep: never cache a vacuous (all-null) series — it would
    // render as a flawless game forever. Throwing keeps the key uncached so a fixed engine
    // recomputes; the route maps this to 503 analysis_engine_unavailable.
    if (isVacuousAnalysis(analysis.plies)) throw new VacuousAnalysisError('jungle-flip');
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

// ── Decision-vs-luck decomposition (Layer 2) ──────────────────────────────────────
//
// A flip-jungle FLIP (the self-move from === to) bundles a decision (which tile to turn over)
// with a dice roll (what it reveals to). Grading the whole eval swing blames the player for
// variance. We split it into two honest, non-god-view numbers per flip ply, in WIN% (mover POV):
//
//   playedWin = the TRUE pool-mean EV of the played flip — the win% you'd expect AVERAGING over
//               every tile that face-down square could have been. The decision, pre-dice.
//   bestWin   = the same true pool-mean EV for the best available move — the decision ceiling.
//   realized  = the win% the flip ACTUALLY produced (the actual tile's term of that same mean).
//
//   decision loss = bestWin − playedWin   (skill; >= 0)
//   luck          = realized − playedWin   (variance; signed, 0 = the average tile in the bag)
//
// Same shape as banqi (both are symmetric flip variants): a tile is hidden from BOTH seats, so
// the pool spans EVERY still-face-down tile of EITHER ink, the counterfactual varies colour and
// role, and the ply-0 flip binds the first mover's ink (createInitialJungleFlipState +
// applyJungleFlipMove handle it per counterfactual). We average each fixed counterfactual
// ourselves (no chance node → clean per-branch eval → correct pool-average), so 0 luck is exactly
// "the average outcome" and realized is one term of the same mean.

// Search budget. Each candidate's baseline is a small fan of single-position evals (one per
// distinct hidden tile), all at this node budget so realized and the mean share one search.
// Lighter than the Layer-1 sweep since a flip fans out; one-time and cached.
const JUNGLE_FLIP_DECISION_NODES = 256_000;
const JUNGLE_FLIP_DECISION_MOVETIME_CAP_MS = 4_000;

/** One flip ply's decision-vs-luck numbers, all in WIN% from the MOVER's (seat's) POV. */
export type JungleFlipDecision = {
  /** The flip ply (1-based): move index i lands on ply i+1. */
  ply: number;
  mover: JungleFlipSeat;
  /** True pool-mean EV (win%) of the best available move — the decision ceiling. */
  bestWin: number;
  /** True pool-mean EV (win%) of the flip actually played — the decision, before the dice. */
  playedWin: number;
  /** Win% the flip ACTUALLY produced (the actual tile's term of the played flip's mean). */
  realizedWin: number;
  /** Rank of the played move among the candidates by true baseline (1 = it WAS the best). */
  playedRank: number | null;
};

export type JungleFlipDecisionDeps = {
  /** The engine's single best move (UCI) for a pre-move FEN — the ceiling candidate to true-
   *  baseline alongside the played move. We use rank-1 only for now (MistyJungleFlip's binary
   *  supports MultiPV, but the server wrapper does not expose it yet), which makes the ceiling
   *  conservative: it can only UNDER-report decision loss, never false-flag. MultiPV parity: #211. */
  bestMove: (fen: string) => Promise<string | null>;
  /** Single-position eval (side-to-move POV) at decision budget — the pool-mean's per-tile term. */
  evalPosition: (fen: string) => Promise<{ cp: number | null; mate: number | null }>;
};

const liveDecisionDeps: JungleFlipDecisionDeps = {
  bestMove: (fen) =>
    evaluateJungleFlipFenNodes(fen, {
      nodes: JUNGLE_FLIP_DECISION_NODES,
      movetimeCapMs: JUNGLE_FLIP_DECISION_MOVETIME_CAP_MS,
    }).then((e) => e.best),
  evalPosition: (fen) =>
    evaluateJungleFlipFenNodes(fen, {
      nodes: JUNGLE_FLIP_DECISION_NODES,
      movetimeCapMs: JUNGLE_FLIP_DECISION_MOVETIME_CAP_MS,
    }).then((e) => ({ cp: e.cp, mate: e.mate })),
};

// Win% for a POST-move position from the MOVER's (seat's) POV. Terminal positions score directly
// (no engine); otherwise the position has the OPPONENT to move, so the engine's side-to-move score
// is the opponent's — negate it for the mover.
async function moverWinAfter(
  post: JungleFlipGameState,
  mover: JungleFlipSeat,
  evalPosition: JungleFlipDecisionDeps['evalPosition'],
): Promise<number> {
  if (post.status.type === 'finished') {
    const winner = post.status.winner;
    return winner === mover ? 100 : winner === null ? 50 : 0;
  }
  const { cp, mate } = await evalPosition(jungleFlipStateToEngineFen(post));
  return winPercent(cp == null ? null : -cp, mate == null ? null : -mate);
}

// The TRUE pool-mean baseline (win%, mover POV) of `move` from a pre-move `state`, plus the
// realized win% (the actual tile's term). For a NON-flip move (from !== to) there is no chance
// node, so baseline === realized === a single eval. For a FLIP, the turned square is uniformly one
// of ALL remaining face-down tiles (either ink), so we average the post-move win% over that
// (colour, role) multiset (per-tile evals run concurrently; the shared engine pool throttles).
async function poolMeanWin(
  state: JungleFlipGameState,
  move: JungleFlipMove,
  mover: JungleFlipSeat,
  evalPosition: JungleFlipDecisionDeps['evalPosition'],
): Promise<{ baseline: number; realized: number }> {
  const source = state.board[move.from];
  const isFlip = move.from === move.to;
  if (!isFlip || !source?.faceDown) {
    const win = await moverWinAfter(applyJungleFlipMove(state, move), mover, evalPosition);
    return { baseline: win, realized: win };
  }
  type PoolEntry = { color: JungleFlipColor; role: JungleFlipPieceRole; count: number };
  const pool = new Map<string, PoolEntry>();
  for (const piece of Object.values(state.board)) {
    if (!piece?.faceDown) continue;
    const key = `${piece.color}-${piece.role}`;
    const entry = pool.get(key);
    if (entry) entry.count += 1;
    else pool.set(key, { color: piece.color, role: piece.role, count: 1 });
  }
  const entries = [...pool.values()];
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const wins = await Promise.all(
    entries.map((entry) => {
      // Counterfactual: the flipped square is (entry.color, entry.role) instead of its true tile.
      // The MULTISET of hidden pieces is FIXED — we only relocate which one lies under move.from —
      // so we SWAP move.from's identity with a donor face-down square that holds `entry`, moving
      // the true tile (`source`) there. Relabeling move.from ALONE would change the global counts
      // (an off-colour draw adds a phantom piece of that ink and drops a real one of the other),
      // which materially unbalances the position and inflates the pool-mean baseline. Mirrors banqi.
      const cf: JungleFlipGameState = {
        ...state,
        board: {
          ...state.board,
          [move.from]: { color: entry.color, role: entry.role, faceDown: true },
        },
      };
      if (entry.color !== source.color || entry.role !== source.role) {
        const donor = (Object.keys(state.board) as (keyof typeof state.board)[]).find(
          (sq) =>
            sq !== move.from &&
            state.board[sq]?.faceDown === true &&
            state.board[sq]?.color === entry.color &&
            state.board[sq]?.role === entry.role,
        );
        // `entry` is drawn from the hidden tiles OTHER than move.from (which holds `source` ≠
        // `entry`), so a donor always exists; guard defensively regardless.
        if (donor) cf.board[donor] = { color: source.color, role: source.role, faceDown: true };
      }
      return moverWinAfter(applyJungleFlipMove(cf, move), mover, evalPosition);
    }),
  );
  let baseline = 0;
  let realized = 50;
  entries.forEach((entry, idx) => {
    baseline += (entry.count / total) * wins[idx]!;
    if (entry.color === source.color && entry.role === source.role) realized = wins[idx]!;
  });
  return { baseline, realized };
}

/**
 * Compute the decision-vs-luck numbers for every FLIP ply. Reconstructs the game from the deal
 * (same kernel as the Layer-1 sweep). For each flip, the engine names one ceiling candidate (its
 * best move); we true-baseline the played flip plus that candidate (unclamped pool-mean win%), take
 * the max as `bestWin`, and read the played flip's actual-tile term as `realizedWin`. `deps` is
 * injectable so tests drive it without an engine. No dependency on the Layer-1 sweep — realized is
 * computed here, same-search as the mean it is compared against.
 */
export async function analyzeJungleFlipDecisions(
  moves: readonly JungleFlipMove[],
  deal: JungleFlipDeal,
  deps: JungleFlipDecisionDeps = liveDecisionDeps,
): Promise<JungleFlipDecision[]> {
  let state = createInitialJungleFlipState('analysis', deal);
  const decisions: JungleFlipDecision[] = [];
  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i]!;
    const source = state.board[move.from];
    const mover: JungleFlipSeat = state.status.type === 'playing' ? state.status.turn : 'red';
    const isFlip =
      move.from === move.to && source?.faceDown === true && state.status.type === 'playing';
    if (isFlip) {
      const fen = jungleFlipStateToEngineFen(state);
      const playedUci = jungleFlipMoveToEngineUci(move);
      const best = await deps.bestMove(fen);
      const candidateUcis = new Set<string>([playedUci]);
      if (best) candidateUcis.add(best);
      let playedWin = 50;
      let realizedWin = 50;
      const baselines: number[] = [];
      for (const uci of candidateUcis) {
        const candidate = uci === playedUci ? move : engineUciToJungleFlipMove(uci);
        if (!candidate) continue;
        const { baseline, realized } = await poolMeanWin(
          state,
          candidate,
          mover,
          deps.evalPosition,
        );
        baselines.push(baseline);
        if (uci === playedUci) {
          playedWin = baseline;
          realizedWin = realized;
        }
      }
      const bestWin = baselines.length ? Math.max(...baselines) : playedWin;
      const playedRank = 1 + baselines.filter((b) => b > playedWin + 1e-9).length;
      decisions.push({ ply: i + 1, mover, bestWin, playedWin, realizedWin, playedRank });
    }
    state = applyJungleFlipMove(state, move);
  }
  return decisions;
}

// Cache engine id for the decomposition blob — a DIFFERENT engine_id than the basic analysis, so
// both live in the same game_analysis table without collision.
// The `+dN` suffix versions the DECOMPOSITION ALGORITHM independently of the engine binary: bump it
// to invalidate cached decisions when the pool-mean math changes without an engine change. d2 =
// pool-rebalance fix (counterfactuals preserve the hidden multiset; earlier rows were luck-biased).
export const JUNGLE_FLIP_DECISIONS_ENGINE_ID = `misty-jungle-flip-decisions@${JUNGLE_FLIP_ENGINE_VERSION}+d2`;

export type JungleFlipDecisionsCache = {
  get(roomId: string, engineId: string, depth: number): Promise<JungleFlipDecision[] | null>;
  save(
    roomId: string,
    engineId: string,
    depth: number,
    decisions: JungleFlipDecision[],
  ): Promise<void>;
};

const liveDecisionsCache: JungleFlipDecisionsCache = {
  get: (roomId, engineId, depth) =>
    persistence.getGameAnalysisBlob<JungleFlipDecision[]>(roomId, engineId, depth),
  save: (roomId, engineId, depth, decisions) =>
    persistence.saveGameAnalysisBlob(roomId, engineId, depth, decisions),
};

const inflightDecisions = new Map<string, Promise<JungleFlipDecision[]>>();

export type JungleFlipDecisionsResult = {
  engineId: string;
  depth: number;
  decisions: JungleFlipDecision[];
};

/**
 * Cache-first, coalesced decision-vs-luck decomposition (the heavier, opt-in tier on top of the
 * basic eval sweep). Self-contained — it recomputes realized in the same search as the mean it is
 * compared against, so it needs no Layer-1 sweep input. A scoreless decomposition (flips exist but
 * every win% is the null-eval 50/50) fails closed like the basic sweep: throws, caches nothing. A
 * game with no flip plies caches an empty array. The `depth` cache dimension is the family nominal
 * (the real dial is the node budget, encoded in the engine id).
 */
export async function resolveJungleFlipDecisions(
  roomId: string,
  moves: readonly JungleFlipMove[],
  deal: JungleFlipDeal,
  cache: JungleFlipDecisionsCache = liveDecisionsCache,
  analyze?: (
    moves: readonly JungleFlipMove[],
    deal: JungleFlipDeal,
  ) => Promise<JungleFlipDecision[]>,
  computeIfMissing = true,
): Promise<JungleFlipDecisionsResult | null> {
  const engineId = JUNGLE_FLIP_DECISIONS_ENGINE_ID;
  const depth = JUNGLE_FLIP_ANALYSIS_DEPTH;

  const cached = await cache.get(roomId, engineId, depth);
  if (cached) return { engineId, depth, decisions: cached };
  if (!computeIfMissing) return null;

  const key = `${roomId}\0${engineId}\0${depth}`;
  const existing = inflightDecisions.get(key);
  if (existing) return existing.then((decisions) => ({ engineId, depth, decisions }));

  const compute = (async () => {
    const decisions = analyze
      ? await analyze(moves, deal)
      : await analyzeJungleFlipDecisions(moves, deal);
    // Fail closed on a scoreless decomposition: a scoreless engine makes every position eval null,
    // so every win% collapses to 50 (best === played === realized). Never cache that.
    if (
      decisions.length > 0 &&
      decisions.every((d) => d.bestWin === 50 && d.playedWin === 50 && d.realizedWin === 50)
    ) {
      throw new VacuousAnalysisError('jungle-flip');
    }
    await cache.save(roomId, engineId, depth, decisions);
    return decisions;
  })();
  inflightDecisions.set(key, compute);
  try {
    return { engineId, depth, decisions: await compute };
  } finally {
    inflightDecisions.delete(key);
  }
}
