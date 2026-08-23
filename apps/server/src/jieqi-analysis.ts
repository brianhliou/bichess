// Whole-game "Computer analysis" for Jieqi (揭棋): a fixed-strength eval of
// every ply, normalized to the RED SEAT's POV, cached + coalesced. Mirrors banqi-analysis.ts,
// with two jieqi-specific wrinkles:
//
//   1. Jieqi hides face-down piece IDENTITIES (positions are public), so reconstruction needs
//      the per-game DEAL (from the room-created event) to rebuild each position, and the engine
//      is fed the REDACTED (as-played info-state) FEN — jieqi-fen.ts emits `X`/`x` for a
//      face-down piece, so the engine never learns a hidden id, exactly as during live play.
//   2. A REVEAL is coupled to a normal move (a face-down piece reveals its identity WHEN it
//      moves — there is no separate from===to flip as in banqi). So a "chance" ply is a move
//      whose source piece was face-down beforehand; jieqiChancePlies() detects those by replay.
//
// The backend is the PikaJieQi (Pikafish jieqi_old) binary ONLY (no in-process fallback): we
// read its `info … score` via evaluateJieqiFen. Unlike the 3 custom engines, Pikafish already
// emits a score, so no engine change was needed — jieqi was analysis-ready. A missing binary
// fails closed at the route (503), and an all-null sweep throws VacuousAnalysisError (never
// cached) — so a broken or score-less engine can't cache a flat, mistake-free game.

import {
  applyJieqiMove,
  createInitialJieqiState,
  type JieqiColor,
  type JieqiDeal,
  type JieqiGameState,
  type JieqiMove,
  type JieqiPieceRole,
  winPercent,
} from '@mistboard/game';
import {
  type AnalysisProgressStore,
  liveAnalysisProgressStore,
  mapWithConcurrency,
  resolveCachedComputation,
} from './game-analysis-kernel.js';
import {
  isVacuousAnalysis,
  type SweepPlyEval,
  VacuousAnalysisError,
} from './game-analysis-sweep.js';
import {
  evaluateJieqiFen,
  evaluateJieqiMultiPv,
  JIEQI_ANALYSIS_ENGINE_VERSION,
  withJieqiAnalysisSession,
} from './jieqi-engine.js';
import {
  jieqiMoveToPikafishUci,
  jieqiStateToPikafishFen,
  pikafishUciToJieqiMove,
} from './jieqi-fen.js';
import * as persistence from './persistence.js';
import type { UciMultiPvLine } from './uci-engine-harness.js';

// Search budget. A fixed DEPTH is CPU-independent in RESULT (the eval at a given depth is the
// same tree on any box), so the cached analysis stays stable; the movetime cap only bounds
// per-ply latency on a slow box. Depth 12 is a touch deeper than the "strong" PvE tier (10),
// which is appropriate for a one-shot review pass.
const JIEQI_ANALYSIS_DEPTH_SEARCH = 12;
const JIEQI_ANALYSIS_MOVETIME_CAP_MS = 4_000;

// Nominal cache dimension: `depth` only has to be STABLE for the (room, engine, depth) cache
// key. Kept at the family default (banqi/jungle use 12 too).
export const JIEQI_ANALYSIS_DEPTH = 12;

// Red-SEAT-POV cp for a decisive finished position (no engine query is made there).
const TERMINAL_CP = 30_000;

// The history suffix invalidates earlier FEN-only cached sweeps.
export const JIEQI_ANALYSIS_ENGINE_ID = `pikafish-jieqi-analysis@${JIEQI_ANALYSIS_ENGINE_VERSION}+history1`;

export type JieqiRepetitionWindow = {
  fen: string;
  moves: readonly string[];
};

export type JieqiPositionEval = {
  /** Centipawns from the RED SEAT's POV (positive = Red better); null when mate is set. */
  cp: number | null;
  /** Signed moves-to-mate from the RED SEAT's POV; null otherwise. */
  mate: number | null;
  /** Best move in Pikafish UCI (rank 0..9, e.g. "e7a7"); the engine's own dialect. */
  best: string | null;
};

/**
 * Evaluate a single PLAYING jieqi position with PikaJieQi, normalized to the RED SEAT's POV.
 * Pikafish reports the score from the side-to-move POV, and side-to-move IS the mover seat
 * (the FEN's stm field just encodes that seat), so we flip the sign when Black is to move —
 * exactly as banqi/jungle do. Throws (via pikaJieqiPath) when the binary is absent; callers
 * pre-check availability and fail closed. `evaluateFen` is the engine backend: the default
 * spawns one process per call; the sweep binds it to a persistent session
 * (withJieqiAnalysisSession) with the same depth/movetime, so the POV math lives here once.
 */
export async function evaluateJieqiPosition(
  state: JieqiGameState,
  evaluateFen: (
    fen: string,
    opts: { depth: number; movetimeMs: number; moves?: readonly string[] },
  ) => Promise<{ cp: number | null; mate: number | null; best: string | null }> = evaluateJieqiFen,
  repetitionWindow: JieqiRepetitionWindow = {
    fen: jieqiStateToPikafishFen(state),
    moves: [],
  },
): Promise<JieqiPositionEval> {
  const mover: JieqiColor = state.status.type === 'playing' ? state.status.turn : 'red';
  const sign = mover === 'red' ? 1 : -1;
  const evaluation = await evaluateFen(repetitionWindow.fen, {
    depth: JIEQI_ANALYSIS_DEPTH_SEARCH,
    movetimeMs: JIEQI_ANALYSIS_MOVETIME_CAP_MS,
    moves: repetitionWindow.moves,
  });
  return {
    cp: evaluation.cp == null ? null : evaluation.cp * sign,
    mate: evaluation.mate == null ? null : evaluation.mate * sign,
    best: evaluation.best,
  };
}

// Red-SEAT-POV decisive eval for a finished position: the game is over, so the winner seat is
// known and no engine is queried. `winner` is a SEAT (red = first mover), so this is already
// in the red-seat POV the sweep normalizes to. A drawn finish (no-capture clock) scores 0.
function terminalPlyEval(ply: number, state: JieqiGameState): SweepPlyEval {
  if (state.status.type !== 'finished') return { ply, cp: 0, mate: null, best: null };
  const winner = state.status.winner;
  const cp = winner === 'red' ? TERMINAL_CP : winner === 'black' ? -TERMINAL_CP : 0;
  return { ply, cp, mate: null, best: null };
}

export type JieqiGameAnalysis = {
  engineId: string;
  depth: number;
  plies: SweepPlyEval[];
};

export function jieqiAnalysisRepetitionWindows(
  moves: readonly JieqiMove[],
  deal: JieqiDeal,
): JieqiRepetitionWindow[] {
  let state = createInitialJieqiState('analysis-window', deal);
  let startState = state;
  let windowMoves: JieqiMove[] = [];
  const windows: JieqiRepetitionWindow[] = [
    { fen: jieqiStateToPikafishFen(startState), moves: [] },
  ];
  for (const move of moves) {
    const irreversible = state.board[move.from]?.faceDown === true || state.board[move.to] != null;
    state = applyJieqiMove(state, move);
    if (irreversible) {
      startState = state;
      windowMoves = [];
    } else {
      windowMoves.push(move);
    }
    windows.push({
      fen: jieqiStateToPikafishFen(startState),
      moves: windowMoves.map(jieqiMoveToPikafishUci),
    });
  }
  return windows;
}

/**
 * Reconstruct every ply from the per-game DEAL + move list and evaluate it (red-seat POV).
 * Ply 0 is the initial position; ply k is the position after k moves. Reconstruction uses the
 * SAME kernel the live game did (createInitialJieqiState(deal) + applyJieqiMove), so reveals
 * reproduce exactly (a face-down piece reveals its dealt identity the first time it moves).
 * `evaluate` is injectable so tests drive the sweep without an engine; the default path runs
 * the walk against ONE persistent PikaJieQi session (spawn + option setup once, then a
 * FEN-per-position round-trip at the same depth/movetime the per-spawn path used).
 */
export async function analyzeJieqiPostgame(
  moves: readonly JieqiMove[],
  deal: JieqiDeal,
  evaluate?: (state: JieqiGameState) => Promise<JieqiPositionEval>,
  progress?: AnalysisProgressStore<SweepPlyEval>,
): Promise<JieqiGameAnalysis> {
  let state = createInitialJieqiState('analysis', deal);
  const states: JieqiGameState[] = [state];
  for (const move of moves) {
    state = applyJieqiMove(state, move);
    states.push(state);
  }
  const repetitionWindows = jieqiAnalysisRepetitionWindows(moves, deal);
  // With a progress store the sweep checkpoints after every evaluated ply and
  // resumes from the last checkpoint (persist expensive output incrementally).
  const sweep = async (
    evaluatePosition: (
      state: JieqiGameState,
      repetitionWindow: JieqiRepetitionWindow,
    ) => Promise<JieqiPositionEval>,
  ): Promise<SweepPlyEval[]> => {
    const resumed = progress ? await progress.load() : null;
    const plies: SweepPlyEval[] = resumed ? [...resumed.items] : [];
    for (let ply = plies.length; ply < states.length; ply += 1) {
      const s = states[ply]!;
      if (s.status.type !== 'playing') {
        plies.push(terminalPlyEval(ply, s));
        continue;
      }
      const evaluation = await evaluatePosition(s, repetitionWindows[ply]!);
      plies.push({ ply, cp: evaluation.cp, mate: evaluation.mate, best: evaluation.best });
      if (progress) await progress.save({ nextIndex: ply + 1, items: plies });
    }
    return plies;
  };
  const plies = evaluate
    ? await sweep(evaluate)
    : await withJieqiAnalysisSession((evaluateFen) =>
        sweep((s, repetitionWindow) => evaluateJieqiPosition(s, evaluateFen, repetitionWindow)),
      );
  return { engineId: JIEQI_ANALYSIS_ENGINE_ID, depth: JIEQI_ANALYSIS_DEPTH, plies };
}

/**
 * The 1-based plies whose move REVEALED a face-down piece (a chance event). In jieqi a reveal
 * is coupled to a normal move — the moving piece turns face-up — so we detect it by replaying
 * the deal and checking whether the piece on the move's source square was face-down just before
 * the move. Those plies conflate the decision (which piece to activate, where) with the luck
 * (what it revealed to), so the client leaves them UNJUDGED until the decision-vs-luck
 * decomposition lands. Pure kernel replay (no engine), deterministic from (moves, deal).
 *
 * Note: capturing an opponent's dark piece is treated as a normal (graded) move here — only the
 * MOVER revealing its OWN piece is a chance ply, matching banqi (the flipper reveals its tile).
 */
export function jieqiChancePlies(moves: readonly JieqiMove[], deal: JieqiDeal): number[] {
  let state = createInitialJieqiState('analysis', deal);
  const chance: number[] = [];
  moves.forEach((move, i) => {
    const source = state.board[move.from];
    if (source?.faceDown) chance.push(i + 1);
    state = applyJieqiMove(state, move);
  });
  return chance;
}

// ── Cache-first, coalesced resolution (mirrors resolveBanqiAnalysis) ──────────────

// Cache read/write, injectable for tests. Live impl reads/writes the variant-agnostic
// game_analysis table (no-ops when persistence is disabled).
export type JieqiAnalysisCache = {
  get(roomId: string, engineId: string, depth: number): Promise<SweepPlyEval[] | null>;
  save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]): Promise<void>;
};

const liveAnalysisCache: JieqiAnalysisCache = {
  get: (roomId, engineId, depth) => persistence.getGameAnalysis(roomId, engineId, depth),
  save: (roomId, engineId, depth, plies) =>
    persistence.saveGameAnalysis(roomId, engineId, depth, plies),
};

/**
 * Cache-first, coalesced whole-game analysis (shared skeleton: game-analysis-kernel).
 * A finished game's eval series is immutable given (room, engine, depth): serve a stored
 * result immediately, else compute once (sharing one in-flight promise), persist it, and
 * return. `computeIfMissing = false` makes it a pure cache read (204-on-miss for the GET
 * path). A scoreless (all-null) sweep throws VacuousAnalysisError and is never cached, so
 * a fixed engine can recompute later; the route maps it to 503 analysis_engine_unavailable.
 */
export async function resolveJieqiAnalysis(
  roomId: string,
  moves: readonly JieqiMove[],
  deal: JieqiDeal,
  cache: JieqiAnalysisCache = liveAnalysisCache,
  analyze?: (moves: readonly JieqiMove[], deal: JieqiDeal) => Promise<JieqiGameAnalysis>,
  computeIfMissing = true,
): Promise<JieqiGameAnalysis | null> {
  const engineId = JIEQI_ANALYSIS_ENGINE_ID;
  const depth = JIEQI_ANALYSIS_DEPTH;
  // Incremental checkpoints only on the real (default-analyzer) path; injected
  // analyzers (tests) keep the plain contract.
  const progress = analyze
    ? null
    : liveAnalysisProgressStore<SweepPlyEval>(roomId, engineId, depth);
  const plies = await resolveCachedComputation<SweepPlyEval[]>({
    roomId,
    engineId,
    depth,
    cache,
    computeIfMissing,
    compute: async () => {
      const analysis = analyze
        ? await analyze(moves, deal)
        : await analyzeJieqiPostgame(moves, deal, undefined, progress ?? undefined);
      return analysis.plies;
    },
    validate: (series) => {
      if (isVacuousAnalysis(series)) throw new VacuousAnalysisError('jieqi');
    },
    afterSave: progress ? () => progress.clear() : undefined,
  });
  return plies ? { engineId, depth, plies } : null;
}

// ── Decision-vs-luck decomposition (Layer 2) ──────────────────────────────────────
//
// A jieqi REVEAL move bundles a decision (which dark piece to activate, and where) with a dice
// roll (what it reveals to). Grading the whole eval swing blames the player for variance. We
// split it into two honest, non-god-view numbers per reveal ply, everything in WIN% (mover POV):
//
//   playedWin = the TRUE pool-mean EV of the played move — the win% you'd expect AVERAGING over
//               every piece that dark piece could have been. This is the decision, before the dice.
//   bestWin   = the same true pool-mean EV for the best available move — the decision ceiling.
//   realized  = the win% the reveal ACTUALLY produced (the actual role's term of that same mean).
//
//   decision loss = bestWin − playedWin   (skill; >= 0)
//   luck          = realized − playedWin   (variance; signed, 0 = the average piece in the bag)
//
// Why the TRUE pool-mean and not the engine's own EV: Pikafish's chance-node value has a
// downside/pessimism clamp (risk-averse play — it deliberately reports below the true mean so the
// search never leans on a lucky reveal). Great for strength, wrong for measuring luck: it would
// make "0" pessimistic, so an average reveal reads as positive luck. So we compute the baseline
// ourselves as an explicit, UNCLAMPED probability-weighted mean over the mover's remaining hidden
// pool — then 0 luck is exactly "the average outcome". realized is one term of that same mean, so
// luck is a clean, same-search, mean-zero-in-expectation quantity (no cross-depth noise).

// Budget. Each candidate move's baseline is a small fan of single-position evals (one per distinct
// hidden role), all at this depth so realized and the mean share one search. MultiPV only picks
// the candidate ceiling moves; its clamped scores never reach the output. ~ a few evals per
// reveal → a couple of minutes for a whole game, one-time and cached.
const JIEQI_DECISION_DEPTH = 10;
const JIEQI_DECISION_MOVETIME_CAP_MS = 4_000;
// Matches the pikajieqi-analysis engine pool's slot count: with launch
// concurrency == pool slots, no fan-out eval ever waits in the pool queue.
const JIEQI_DECISION_EVAL_CONCURRENCY = 2;
const JIEQI_DECISION_MULTIPV = 12;
// How many of the engine's top moves to true-baseline as the decision ceiling (plus the played
// move). The engine's own ranking is unreliable under the clamp, so we re-score a few and take the
// max true-mean rather than trusting rank 1.
const JIEQI_DECISION_CANDIDATES = 3;

/** One reveal ply's decision-vs-luck numbers, all in WIN% from the MOVER's POV. */
export type JieqiDecision = {
  /** The reveal ply (1-based): move index i lands on ply i+1. */
  ply: number;
  mover: JieqiColor;
  /** True pool-mean EV (win%) of the best available move — the decision ceiling. */
  bestWin: number;
  /** True pool-mean EV (win%) of the move actually played — the decision, before the dice. */
  playedWin: number;
  /** Win% the reveal ACTUALLY produced (the actual role's term of the played move's mean). */
  realizedWin: number;
  /** Rank of the played move among the candidates by true baseline (1 = it WAS the best). */
  playedRank: number | null;
  /** The candidates that were true-baselined, best first. Every one of these was already
   *  computed to derive bestWin and playedRank — they used to be thrown away, which left the
   *  review page able to say "you ranked 3rd" without being able to say what the first two
   *  were. Absent on rows cached before this existed; the UI degrades to the rank alone. */
  candidates?: JieqiDecisionCandidate[];
};

/** One true-baselined alternative at a reveal ply, in the same WIN% units as bestWin. */
export type JieqiDecisionCandidate = {
  /** Engine UCI of the candidate's root move. */
  move: string;
  /** True pool-mean EV (win%) of this move, mover POV — luck stripped. */
  win: number;
  /** True when this is the move actually played. */
  played?: boolean;
};

export type JieqiDecisionDeps = {
  /** Top candidate moves (engine ranking) for a pre-move FEN — used only to pick which moves to
   *  true-baseline as the ceiling; the returned scores are not used in the output. */
  multiPv: (fen: string, repetitionWindow?: JieqiRepetitionWindow) => Promise<UciMultiPvLine[]>;
  /** Single-position eval (side-to-move POV) at decision depth — the pool-mean's per-role term. */
  evalPosition: (
    fen: string,
    repetitionWindow?: JieqiRepetitionWindow,
  ) => Promise<{ cp: number | null; mate: number | null }>;
};

const liveDecisionDeps: JieqiDecisionDeps = {
  multiPv: (fen, repetitionWindow) =>
    evaluateJieqiMultiPv(repetitionWindow?.fen ?? fen, {
      depth: JIEQI_DECISION_DEPTH,
      movetimeMs: JIEQI_DECISION_MOVETIME_CAP_MS,
      multiPv: JIEQI_DECISION_MULTIPV,
      moves: repetitionWindow?.moves,
    }),
  evalPosition: (fen, repetitionWindow) =>
    evaluateJieqiFen(repetitionWindow?.fen ?? fen, {
      depth: JIEQI_DECISION_DEPTH,
      movetimeMs: JIEQI_DECISION_MOVETIME_CAP_MS,
      moves: repetitionWindow?.moves,
    }).then((e) => ({ cp: e.cp, mate: e.mate })),
};

function jieqiRepetitionWindowAfterMove(
  state: JieqiGameState,
  move: JieqiMove,
  post: JieqiGameState,
  repetitionWindow: JieqiRepetitionWindow,
): JieqiRepetitionWindow {
  const irreversible = state.board[move.from]?.faceDown === true || state.board[move.to] != null;
  return irreversible
    ? { fen: jieqiStateToPikafishFen(post), moves: [] }
    : {
        fen: repetitionWindow.fen,
        moves: [...repetitionWindow.moves, jieqiMoveToPikafishUci(move)],
      };
}

// Win% for a POST-move position from the MOVER's POV. Terminal positions score directly (no
// engine); otherwise the position has the OPPONENT to move, so the engine's side-to-move score is
// the opponent's — negate it for the mover.
async function moverWinAfter(
  post: JieqiGameState,
  mover: JieqiColor,
  evalPosition: JieqiDecisionDeps['evalPosition'],
  repetitionWindow: JieqiRepetitionWindow,
): Promise<number> {
  if (post.status.type === 'finished') {
    const winner = post.status.winner;
    return winner === mover ? 100 : winner === null ? 50 : 0;
  }
  const { cp, mate } = await evalPosition(jieqiStateToPikafishFen(post), repetitionWindow);
  return winPercent(cp == null ? null : -cp, mate == null ? null : -mate);
}

// The TRUE pool-mean baseline (win%, mover POV) of `move` from a pre-move `state`, plus the
// realized win% (the actual role's term). For a NON-reveal move (a known piece) there is no chance
// node, so baseline === realized === a single eval. For a reveal, the moved dark square is
// uniformly one of the mover's remaining hidden pieces, so we average the post-move win% over that
// role multiset (per-role evals run concurrently; the shared engine pool throttles them).
async function poolMeanWin(
  state: JieqiGameState,
  move: JieqiMove,
  mover: JieqiColor,
  evalPosition: JieqiDecisionDeps['evalPosition'],
  repetitionWindow: JieqiRepetitionWindow,
): Promise<{ baseline: number; realized: number }> {
  const source = state.board[move.from];
  if (!source?.faceDown) {
    const post = applyJieqiMove(state, move);
    const win = await moverWinAfter(
      post,
      mover,
      evalPosition,
      jieqiRepetitionWindowAfterMove(state, move, post, repetitionWindow),
    );
    return { baseline: win, realized: win };
  }
  const pool = new Map<JieqiPieceRole, number>();
  for (const piece of Object.values(state.board)) {
    if (piece?.color === mover && piece.faceDown) {
      pool.set(piece.role, (pool.get(piece.role) ?? 0) + 1);
    }
  }
  const total = [...pool.values()].reduce((a, b) => a + b, 0);
  const roles = [...pool.keys()];
  // Bounded fan-out (mirrors banqi): launch concurrency == the analysis pool's
  // slot count, so no counterfactual eval ever waits in the pool queue and one
  // queue timeout can no longer detonate the whole batch.
  const wins = await mapWithConcurrency(roles, JIEQI_DECISION_EVAL_CONCURRENCY, (role) => {
    // Counterfactual: this dark square is `role` instead of its true role. The MULTISET of the
    // mover's remaining hidden roles is FIXED — we only relocate which one lies under move.from —
    // so we SWAP move.from's role with a donor dark tile of the mover that holds `role`, moving
    // the true role (`source.role`) there. Relabeling move.from ALONE would change the hidden-role
    // counts (adding a phantom `role` and dropping a real `source.role`), skewing the baseline.
    const cf: JieqiGameState = {
      ...state,
      board: { ...state.board, [move.from]: { color: mover, role, faceDown: true } },
    };
    if (role !== source.role) {
      const donor = (Object.keys(state.board) as (keyof typeof state.board)[]).find(
        (sq) =>
          sq !== move.from &&
          state.board[sq]?.faceDown === true &&
          state.board[sq]?.color === mover &&
          state.board[sq]?.role === role,
      );
      // `role` is drawn from the mover's hidden tiles OTHER than move.from (which holds
      // `source.role` ≠ `role`), so a donor always exists; guard defensively regardless.
      if (donor) cf.board[donor] = { color: mover, role: source.role, faceDown: true };
    }
    const post = applyJieqiMove(cf, move);
    return moverWinAfter(
      post,
      mover,
      evalPosition,
      jieqiRepetitionWindowAfterMove(cf, move, post, repetitionWindow),
    );
  });
  let baseline = 0;
  let realized = 50;
  roles.forEach((role, idx) => {
    baseline += ((pool.get(role) ?? 0) / total) * wins[idx]!;
    if (role === source.role) realized = wins[idx]!;
  });
  return { baseline, realized };
}

/**
 * Compute the decision-vs-luck numbers for every REVEAL ply. Reconstructs the game from the deal
 * (same kernel as the Layer-1 sweep). For each reveal, MultiPV names a few candidate ceiling
 * moves; we true-baseline the played move plus those candidates (unclamped pool-mean win%), take
 * the max as `bestWin`, and read the played move's actual-role term as `realizedWin`. `deps` is
 * injectable so tests drive it without an engine. No dependency on the Layer-1 sweep — realized is
 * computed here, same-search as the mean it is compared against.
 */
export async function analyzeJieqiDecisions(
  moves: readonly JieqiMove[],
  deal: JieqiDeal,
  deps: JieqiDecisionDeps = liveDecisionDeps,
  progress?: AnalysisProgressStore<JieqiDecision>,
): Promise<JieqiDecision[]> {
  let state = createInitialJieqiState('analysis', deal);
  let repetitionWindow: JieqiRepetitionWindow = {
    fen: jieqiStateToPikafishFen(state),
    moves: [],
  };
  // With a progress store, checkpoint after every graded reveal and resume from
  // the saved move cursor (quiet moves before it just re-advance the state —
  // kernel replay is free; the engine fan-outs are what we refuse to redo).
  const resumed = progress ? await progress.load() : null;
  const decisions: JieqiDecision[] = resumed ? [...resumed.items] : [];
  const startIndex = resumed?.nextIndex ?? 0;
  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i]!;
    if (i < startIndex) {
      const post = applyJieqiMove(state, move);
      repetitionWindow = jieqiRepetitionWindowAfterMove(state, move, post, repetitionWindow);
      state = post;
      continue;
    }
    const source = state.board[move.from];
    const mover: JieqiColor = state.status.type === 'playing' ? state.status.turn : 'red';
    const isReveal = source?.faceDown === true && state.status.type === 'playing';
    if (isReveal) {
      const fen = jieqiStateToPikafishFen(state);
      const playedUci = jieqiMoveToPikafishUci(move);
      const table = await deps.multiPv(fen, repetitionWindow);
      // Candidate ceiling moves: the engine's top-N plus the played move (deduped).
      const candidateUcis = new Set<string>([
        ...table.slice(0, JIEQI_DECISION_CANDIDATES).map((row) => row.move),
        playedUci,
      ]);
      let playedWin = 50;
      let realizedWin = 50;
      const scored: JieqiDecisionCandidate[] = [];
      for (const uci of candidateUcis) {
        const candidate = uci === playedUci ? move : pikafishUciToJieqiMove(uci);
        if (!candidate) continue;
        const { baseline, realized } = await poolMeanWin(
          state,
          candidate,
          mover,
          deps.evalPosition,
          repetitionWindow,
        );
        scored.push({ move: uci, win: baseline, ...(uci === playedUci ? { played: true } : {}) });
        if (uci === playedUci) {
          playedWin = baseline;
          realizedWin = realized;
        }
      }
      const baselines = scored.map((c) => c.win);
      const bestWin = baselines.length ? Math.max(...baselines) : playedWin;
      // Rank by true baseline: 1 + how many candidates strictly beat the played move.
      const playedRank = 1 + baselines.filter((b) => b > playedWin + 1e-9).length;
      const candidates = [...scored].sort((a, b) => b.win - a.win);
      decisions.push({
        ply: i + 1,
        mover,
        bestWin,
        playedWin,
        realizedWin,
        playedRank,
        ...(candidates.length ? { candidates } : {}),
      });
      if (progress) await progress.save({ nextIndex: i + 1, items: decisions });
    }
    const post = applyJieqiMove(state, move);
    repetitionWindow = jieqiRepetitionWindowAfterMove(state, move, post, repetitionWindow);
    state = post;
  }
  return decisions;
}

// Cache engine id for the decomposition blob — a DIFFERENT engine_id than the basic analysis, so
// both live in the same game_analysis table without collision (see persistence-game-analysis).
// The `+dN` suffix versions the DECOMPOSITION ALGORITHM independently of the engine binary: bump it
// to invalidate cached decisions when the algorithm changes without an engine change. d3 adds
// the live repetition window; d2 fixed counterfactual hidden-role-multiset preservation.
export const JIEQI_DECISIONS_ENGINE_ID = `pikafish-jieqi-decisions@${JIEQI_ANALYSIS_ENGINE_VERSION}+d3`;

export type JieqiDecisionsCache = {
  get(roomId: string, engineId: string, depth: number): Promise<JieqiDecision[] | null>;
  save(roomId: string, engineId: string, depth: number, decisions: JieqiDecision[]): Promise<void>;
};

const liveDecisionsCache: JieqiDecisionsCache = {
  get: (roomId, engineId, depth) =>
    persistence.getGameAnalysisBlob<JieqiDecision[]>(roomId, engineId, depth),
  save: (roomId, engineId, depth, decisions) =>
    persistence.saveGameAnalysisBlob(roomId, engineId, depth, decisions),
};

export type JieqiDecisionsResult = { engineId: string; depth: number; decisions: JieqiDecision[] };

/**
 * Cache-first, coalesced decision-vs-luck decomposition (the heavier, opt-in tier on top of the
 * basic eval sweep; shared skeleton: game-analysis-kernel). Self-contained — it recomputes
 * realized in the same search as the mean it is compared against, so it needs no Layer-1 sweep
 * input. A scoreless decomposition (reveals exist but every win% is the null-eval 50/50) fails
 * closed like the basic sweep: throws, caches nothing; the route maps it to 503. A game with no
 * reveal plies caches an empty array (a valid, terminal result).
 */
export async function resolveJieqiDecisions(
  roomId: string,
  moves: readonly JieqiMove[],
  deal: JieqiDeal,
  cache: JieqiDecisionsCache = liveDecisionsCache,
  analyze?: (moves: readonly JieqiMove[], deal: JieqiDeal) => Promise<JieqiDecision[]>,
  computeIfMissing = true,
): Promise<JieqiDecisionsResult | null> {
  const engineId = JIEQI_DECISIONS_ENGINE_ID;
  const depth = JIEQI_DECISION_DEPTH;
  const progress = analyze
    ? null
    : liveAnalysisProgressStore<JieqiDecision>(roomId, engineId, depth);
  const decisions = await resolveCachedComputation<JieqiDecision[]>({
    roomId,
    engineId,
    depth,
    cache,
    computeIfMissing,
    compute: () =>
      analyze
        ? analyze(moves, deal)
        : analyzeJieqiDecisions(moves, deal, undefined, progress ?? undefined),
    validate: (series) => {
      // A scoreless engine makes every position eval null, so every win% collapses to 50
      // (best === played === realized). Never cache that; a fixed engine recomputes.
      if (
        series.length > 0 &&
        series.every((d) => d.bestWin === 50 && d.playedWin === 50 && d.realizedWin === 50)
      ) {
        throw new VacuousAnalysisError('jieqi');
      }
    },
    afterSave: progress ? () => progress.clear() : undefined,
  });
  return decisions ? { engineId, depth, decisions } : null;
}
