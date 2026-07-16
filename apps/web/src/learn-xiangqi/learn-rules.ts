// Xiangqi Learn — rules facade over the two kernels.
//
// 'relaxed' mode drives the FoW kernel's pseudo-legal path (geometry only:
// tolerates general-less teaching fragments, permits self-check) — the xiangqi
// analog of lila learn abusing Antichess movegen for kingless positions.
// 'strict' mode drives the check-aware standard kernel (both generals present;
// flying-general enforced; checkmate/stalemate detected by apply).
//
// Everything here is pure and synchronous: the level runner and the CI level
// verifier share these functions.

import {
  applyStandardXiangqiMove,
  eoToRole,
  getLegalMoves as getRelaxedLegalMoves,
  getStandardXiangqiLegalMoves,
  type XiangqiBoard,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPieceRole,
  type XiangqiSquare,
} from '@mistboard/game';
import type { Square as EoSquare } from 'elephantops';
import { parseBoardFen } from 'elephantops/fen';
import { makeSquare } from 'elephantops/util';
import { arrow, type LearnRulesMode, type LearnShape } from './learn-types.js';

export function oppositeColor(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

// ── FEN → state ──────────────────────────────────────────────────────────────

/** Parse a learn-level FEN ('<placement> <w|b>') into a fresh playing state.
 *  Throws on malformed input — level FENs are static content, so a parse
 *  failure is an authoring bug the level verifier must surface loudly. */
export function makeLearnState(fen: string, id: string): XiangqiGameState {
  const [placement, turnToken] = fen.trim().split(/\s+/);
  if (!placement) throw new Error(`learn fen: empty placement in "${fen}"`);
  const parsed = parseBoardFen(placement);
  if (parsed.isErr) throw new Error(`learn fen: bad placement "${placement}"`);
  const eoBoard = parsed.unwrap();
  const board: XiangqiBoard = {};
  for (const [sqEo, piece] of eoBoard) {
    board[makeSquare(sqEo as EoSquare)] = { color: piece.color, role: eoToRole(piece.role) };
  }
  const turn: XiangqiColor = turnToken === 'b' ? 'black' : 'red';
  return {
    id,
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
}

// ── Movegen ──────────────────────────────────────────────────────────────────

export function learnLegalMoves(state: XiangqiGameState, mode: LearnRulesMode): XiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  return mode === 'strict' ? getStandardXiangqiLegalMoves(state) : getRelaxedLegalMoves(state);
}

export function isLearnLegalMove(
  state: XiangqiGameState,
  mode: LearnRulesMode,
  move: XiangqiMove,
): boolean {
  return learnLegalMoves(state, mode).some((m) => m.from === move.from && m.to === move.to);
}

// ── Apply ────────────────────────────────────────────────────────────────────

export interface LearnApplyOptions {
  /** Hand the turn straight back to the mover (apple levels: the student keeps
   *  moving; there is no opponent). Relaxed mode only. */
  keepTurn?: boolean;
}

/** Apply a move under the level's rules mode. Relaxed mode is a bare board
 *  edit (capture-by-displacement, optional keepTurn, never terminal). Strict
 *  mode delegates to the standard kernel, which flips the turn and detects
 *  checkmate / xiangqi-stalemate (mover wins both). */
export function applyLearnMove(
  state: XiangqiGameState,
  mode: LearnRulesMode,
  move: XiangqiMove,
  opts: LearnApplyOptions = {},
): XiangqiGameState {
  if (state.status.type !== 'playing') return state;
  if (mode === 'strict') {
    if (opts.keepTurn) throw new Error('learn rules: keepTurn is a relaxed-mode option');
    return applyStandardXiangqiMove(state, move);
  }
  const piece = state.board[move.from];
  if (!piece || piece.color !== state.status.turn) return state;
  const board: XiangqiBoard = { ...state.board };
  delete board[move.from];
  board[move.to] = piece;
  return {
    ...state,
    board,
    status: {
      type: 'playing',
      turn: opts.keepTurn ? state.status.turn : oppositeColor(state.status.turn),
    },
    moveNumber: state.moveNumber + 1,
    progressClock: 0,
    lastMove: move,
    positionCounts: {},
  };
}

// ── Attack scans (detectCapture / check asserts / failure arrows) ───────────

/** Squares from which `byColor` could capture the piece on `square` right now
 *  (geometry scan via the relaxed movegen with the turn forced; correct for
 *  cannons because the target square is occupied). Empty when `square` is. */
export function attackersOf(
  state: XiangqiGameState,
  square: XiangqiSquare,
  byColor: XiangqiColor,
): XiangqiSquare[] {
  if (state.board[square] === undefined) return [];
  const probe: XiangqiGameState = { ...state, status: { type: 'playing', turn: byColor } };
  const froms = new Set<XiangqiSquare>();
  for (const move of getRelaxedLegalMoves(probe)) {
    if (move.to === square) froms.add(move.from);
  }
  return [...froms];
}

/** Is `color`'s general in check (attacked on the truth board)? Works in both
 *  modes; general-less fragments are never in check. */
export function isCheckAgainst(state: XiangqiGameState, color: XiangqiColor): boolean {
  const generalSquare = findPiece(state.board, color, 'general');
  if (!generalSquare) return false;
  return attackersOf(state, generalSquare, oppositeColor(color)).length > 0;
}

/** Yellow arrows from every attacker to each general currently in check, both
 *  directions (a level can open with the player in check, and the player can
 *  give check). Drawn automatically by the runner so a delivered check is
 *  always SHOWN, lila-style, and kept in the final position. General-less
 *  teaching fragments produce no arrows. */
export function checkArrowShapes(state: XiangqiGameState): LearnShape[] {
  const shapes: LearnShape[] = [];
  for (const color of ['red', 'black'] as const) {
    const general = findPiece(state.board, color, 'general');
    if (!general) continue;
    for (const from of attackersOf(state, general, oppositeColor(color))) {
      shapes.push(arrow(from, general, 'yellow'));
    }
  }
  return shapes;
}

export function findPiece(
  board: XiangqiBoard,
  color: XiangqiColor,
  role: XiangqiPieceRole,
): XiangqiSquare | null {
  for (const [square, piece] of Object.entries(board)) {
    if (piece && piece.color === color && piece.role === role) return square as XiangqiSquare;
  }
  return null;
}

export function piecesOf(board: XiangqiBoard, color: XiangqiColor): XiangqiSquare[] {
  const squares: XiangqiSquare[] = [];
  for (const [square, piece] of Object.entries(board)) {
    if (piece && piece.color === color) squares.push(square as XiangqiSquare);
  }
  return squares;
}

// ── detectCapture (lila findCapture / findUnprotectedCapture parity) ────────

export interface CaptureThreat {
  move: XiangqiMove;
}

/** After the player's move, can the opponent capture one of the player's
 *  pieces? 'unprotected' restricts to captures the player could not answer by
 *  recapturing on the same point (lila's default failure heuristic for
 *  non-apple levels). Returns one threat (the first found) or null.
 *
 *  On strict levels the opponent's reply and the player's recapture are BOTH
 *  real legal moves (lila parity: chess.js movegen respects check). This is
 *  load-bearing for check stages: after the player gives check, the only
 *  legal punishments answer the check (usually by capturing the checker), so
 *  the refutation demonstrated on the board is always a legal reply. The
 *  relaxed geometry probe would happily "refute" a check by grabbing some
 *  unrelated piece while ignoring the check, an illegal move.
 *  Relaxed levels keep the geometry probe (general-less fragments). */
export function findCaptureThreat(
  state: XiangqiGameState,
  playerColor: XiangqiColor,
  mode: 'unprotected' | true,
  rules: LearnRulesMode,
): CaptureThreat | null {
  const opponent = oppositeColor(playerColor);
  const probe: XiangqiGameState = { ...state, status: { type: 'playing', turn: opponent } };
  for (const move of learnLegalMoves(probe, rules)) {
    const target = state.board[move.to];
    if (!target || target.color !== playerColor) continue;
    if (mode === true) return { move };
    // 'unprotected': play the capture, then ask whether the player could
    // legally recapture on that point.
    const after = applyLearnMove(probe, rules, move);
    if (rules === 'strict') {
      const recaptures =
        after.status.type === 'playing'
          ? getStandardXiangqiLegalMoves(after).filter((reply) => reply.to === move.to)
          : [];
      if (recaptures.length === 0) return { move };
    } else if (attackersOf(after, move.to, playerColor).length === 0) {
      return { move };
    }
  }
  return null;
}

// ── Piece values (showPieceValues levels) ────────────────────────────────────

/** Conventional xiangqi values ×10 (soldier 10/20 across the river is
 *  simplified to 10 for scoring — level design can weight crossed soldiers
 *  via nbMoves instead). */
export const XIANGQI_PIECE_VALUE: Record<XiangqiPieceRole, number> = {
  chariot: 90,
  cannon: 45,
  horse: 40,
  elephant: 20,
  advisor: 20,
  soldier: 10,
  general: 0,
};
