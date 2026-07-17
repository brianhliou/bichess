// Reveal Chess (chess-jieqi) — standard chess with hidden piece IDENTITIES.
//
// Jieqi's identity-hiding primitives ported onto an 8x8 chess board. Pitch:
// "Fischer Random, except the arrangement is hidden from both players and
// revealed piece-by-piece as pieces move." The rules this kernel implements:
//   - Both kings start FACE-UP on e1 / e8 and are never shuffled, so check and
//     checkmate are real (no king-capture variant). Each side's other 15 pieces
//     (Q, R, R, B, B, N, N, 8x P) are dealt FACE-DOWN onto the 15 non-king home
//     squares. The army multiset is public; the assignment is hidden, even from
//     the owner.
//   - A face-down piece moves by the ORIGIN ROLE of the square it sits on
//     (a/h = rook, b/g = knight, c/f = bishop, d = queen, rank 2/7 = pawn). The
//     moment it moves it reveals to BOTH players and plays by its true identity.
//     Threats from an unmoved face-down piece use the origin role (you can be
//     forced to answer a "check" from a piece that is truly a pawn — the kept
//     jieqi tension); a MOVING face-down piece reveals on arrival, so any check
//     from its destination uses the revealed identity.
//   - Capturer-only reveal: if a face-down piece is captured, only the capturer
//     learns its identity (the owner never knew it).
//   - Pawns: one-square advance toward the far rank + diagonal capture, plus a
//     two-square advance available ONLY to a still-face-down piece on its home
//     pawn rank (2/7) — face-down means unmoved, so the rule stays unambiguous
//     under the shuffle. NO en passant (the two-square move's standard
//     corrective is deliberately omitted for v1). A pawn promotes the instant it
//     occupies its far rank, whether it arrived by advance OR by reveal (owner
//     picks; defaults to queen).
//   - Castling: legal when the king is unmoved on its home square and the corner
//     holds a face-down piece (origin role rook). The castle is that piece's
//     first move: it resolves as a rook castle, then reveals on d/f (may flip to
//     a non-rook; the castle still stands). Standard no-castling-out-of/through/
//     into-check restrictions, attacks computed under origin role.
//   - Draws: no-progress clock (reset on capture, pawn move, or reveal) +
//     threefold repetition on the PUBLIC position (face-down pieces masked).
//
// This module owns canonical state (it knows every true identity). Hidden-info
// masking lives entirely in getRevealChessPlayerView; the server renders that
// view and never ships the canonical board to a client.

import type { AbortReason, Color, PieceRole, Square } from './types.js';

export type RevealChessColor = Color; // 'white' | 'black'
export type RevealChessPieceRole = PieceRole; // king | queen | rook | bishop | knight | pawn
export type RevealChessSquare = Square;
export type RevealChessPromotionRole = Exclude<RevealChessPieceRole, 'king' | 'pawn'>;

// `role` is always the TRUE identity, even while face-down. Kings are always
// { role: 'king', faceDown: false }.
export type RevealChessPiece = {
  color: RevealChessColor;
  role: RevealChessPieceRole;
  faceDown: boolean;
};

export type RevealChessBoard = Partial<Record<RevealChessSquare, RevealChessPiece>>;

export type RevealChessMove = {
  from: RevealChessSquare;
  to: RevealChessSquare;
  // Consumed iff this move lands a pawn on its far rank (by advance OR reveal).
  // Defaults to queen when omitted.
  promotion?: RevealChessPromotionRole;
};

// Per-side deal of the 15 hidden roles, in home-square order
// (revealChessHomeSquares). Defaults to the standard chess arrangement.
export type RevealChessDeal = {
  white: RevealChessPieceRole[];
  black: RevealChessPieceRole[];
};

export type RevealChessGameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'no-progress-clock'
  | 'threefold-repetition'
  | 'timeout'
  | 'resignation'
  | 'abandonment';

export type RevealChessGameStatus =
  | { type: 'playing'; turn: RevealChessColor }
  | { type: 'finished'; winner: RevealChessColor | null; reason: RevealChessGameEndReason }
  | { type: 'aborted'; reason: AbortReason };

// A captured piece, recorded with full truth. getRevealChessPlayerView redacts
// the role per viewer: visible to the capturer, or if it was already revealed
// when captured; hidden from the former owner of a still-face-down piece.
export type RevealChessCapture = {
  owner: RevealChessColor;
  role: RevealChessPieceRole;
  revealedAtCapture: boolean;
};

export type RevealChessGameState = {
  id: string;
  board: RevealChessBoard;
  status: RevealChessGameStatus;
  moveNumber: number;
  // Plies since the last capture, pawn move, or reveal. Powers the no-progress draw.
  noProgressClock: number;
  // Public-position repetition counts (face-down pieces masked). Threefold = draw.
  positionCounts: Record<string, number>;
  // Corner squares (a1/h1/a8/h8) still castle-eligible. Cleared when the king or
  // the corner piece moves, or the corner is captured (standard chess logic).
  castlingRights: RevealChessSquare[];
  captures: RevealChessCapture[];
  lastMove?: RevealChessMove;
};

// ── Player view (hidden-info boundary) ──────────────────────────────────────

export type RevealChessVisibleBoardEntry =
  | { color: RevealChessColor; role: RevealChessPieceRole; faceDown: false }
  | { color: RevealChessColor; faceDown: true };

export type RevealChessPlayerBoard = Partial<
  Record<RevealChessSquare, RevealChessVisibleBoardEntry>
>;

// `role: null` => identity unknown to this viewer (a face-down piece they did
// not capture).
export type RevealChessCapturedView = {
  owner: RevealChessColor;
  role: RevealChessPieceRole | null;
};

export type RevealChessPlayerView = {
  id: string;
  perspective: RevealChessColor;
  board: RevealChessPlayerBoard;
  legalMoves: RevealChessMove[];
  captured: RevealChessCapturedView[];
  inCheck: boolean;
  status: RevealChessGameStatus;
  moveNumber: number;
  lastMove?: RevealChessMove;
};

// ── Geometry ────────────────────────────────────────────────────────────────

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

type Coord = { file: number; rank: number };

function coordOf(square: RevealChessSquare): Coord {
  return { file: FILES.indexOf(square[0] as (typeof FILES)[number]), rank: Number(square[1]) };
}

function inBounds(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 1 && rank <= 8;
}

function sqAt(file: number, rank: number): RevealChessSquare | undefined {
  return inBounds(file, rank) ? (`${FILES[file]}${rank}` as RevealChessSquare) : undefined;
}

type Step = readonly [number, number];

const KNIGHT_STEPS: readonly Step[] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const KING_STEPS: readonly Step[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
const ROOK_DIRS: readonly Step[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const BISHOP_DIRS: readonly Step[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export const REVEAL_CHESS_NO_PROGRESS_PLY_LIMIT = 100; // 50 full moves without progress

// ── Home squares, origin roles, deal ────────────────────────────────────────

// The origin role of a back-rank file, used by a face-down piece sitting there.
const BACK_RANK_ROLE: Record<string, RevealChessPieceRole> = {
  a: 'rook',
  b: 'knight',
  c: 'bishop',
  d: 'queen',
  e: 'king',
  f: 'bishop',
  g: 'knight',
  h: 'rook',
};

function kingSquare(color: RevealChessColor): RevealChessSquare {
  return color === 'white' ? 'e1' : 'e8';
}

function backRank(color: RevealChessColor): number {
  return color === 'white' ? 1 : 8;
}

function pawnRank(color: RevealChessColor): number {
  return color === 'white' ? 2 : 7;
}

function farRank(color: RevealChessColor): number {
  return color === 'white' ? 8 : 1;
}

function forwardDir(color: RevealChessColor): number {
  return color === 'white' ? 1 : -1;
}

function computeHomeSquares(color: RevealChessColor): RevealChessSquare[] {
  const back = backRank(color);
  const pawn = pawnRank(color);
  const squares: RevealChessSquare[] = [];
  // Rank order then file order (back rank minus the king's file, then pawn rank).
  for (let f = 0; f < 8; f += 1) {
    if (FILES[f] !== 'e') squares.push(`${FILES[f]}${back}` as RevealChessSquare);
  }
  for (let f = 0; f < 8; f += 1) squares.push(`${FILES[f]}${pawn}` as RevealChessSquare);
  return squares;
}

const WHITE_HOME = computeHomeSquares('white');
const BLACK_HOME = computeHomeSquares('black');

// Move-rule role a face-down piece uses on each home square.
const STARTING_ROLE: Partial<Record<RevealChessSquare, RevealChessPieceRole>> = {};
for (const color of ['white', 'black'] as const) {
  for (const sq of computeHomeSquares(color)) {
    const { rank } = coordOf(sq);
    STARTING_ROLE[sq] = rank === pawnRank(color) ? 'pawn' : BACK_RANK_ROLE[sq[0]];
  }
}

/** The 15 non-king home squares for a side, in canonical deal order. */
export function revealChessHomeSquares(color: RevealChessColor): RevealChessSquare[] {
  return [...(color === 'white' ? WHITE_HOME : BLACK_HOME)];
}

/** The move-rule role a piece uses while it sits, face-down, on `square`. */
export function revealChessStartingRole(
  square: RevealChessSquare,
): RevealChessPieceRole | undefined {
  return STARTING_ROLE[square];
}

/** The standard chess arrangement expressed as a deal (each piece on home). */
export const STANDARD_REVEAL_CHESS_DEAL: RevealChessDeal = {
  white: WHITE_HOME.map((sq) => STARTING_ROLE[sq] as RevealChessPieceRole),
  black: BLACK_HOME.map((sq) => STARTING_ROLE[sq] as RevealChessPieceRole),
};

function roleMultiset(roles: RevealChessPieceRole[]): string {
  return [...roles].sort().join(',');
}

const STANDARD_WHITE_MULTISET = roleMultiset(STANDARD_REVEAL_CHESS_DEAL.white);
const STANDARD_BLACK_MULTISET = roleMultiset(STANDARD_REVEAL_CHESS_DEAL.black);

/** Throws if `deal` is not a permutation of the standard 15-piece multiset. */
export function assertValidRevealChessDeal(deal: RevealChessDeal): void {
  if (deal.white.length !== WHITE_HOME.length || deal.black.length !== BLACK_HOME.length) {
    throw new Error(
      `invalid reveal-chess deal: expected ${WHITE_HOME.length} roles per side, ` +
        `got white=${deal.white.length} black=${deal.black.length}`,
    );
  }
  if (roleMultiset(deal.white) !== STANDARD_WHITE_MULTISET) {
    throw new Error('invalid reveal-chess deal: white roles are not the standard multiset');
  }
  if (roleMultiset(deal.black) !== STANDARD_BLACK_MULTISET) {
    throw new Error('invalid reveal-chess deal: black roles are not the standard multiset');
  }
}

function shuffleRoles(roles: RevealChessPieceRole[], rng: () => number): RevealChessPieceRole[] {
  const out = [...roles];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build a valid random deal by shuffling the standard 15-piece multiset for each
 * side. `rng` returns a float in [0, 1); the server supplies a crypto-backed one
 * (the deal is a hidden-information secret), tests supply a seeded one.
 */
export function createRevealChessDeal(rng: () => number): RevealChessDeal {
  return {
    white: shuffleRoles(STANDARD_REVEAL_CHESS_DEAL.white, rng),
    black: shuffleRoles(STANDARD_REVEAL_CHESS_DEAL.black, rng),
  };
}

export function oppositeRevealChessColor(color: RevealChessColor): RevealChessColor {
  return color === 'white' ? 'black' : 'white';
}

const ALL_CORNERS: readonly RevealChessSquare[] = ['a1', 'h1', 'a8', 'h8'];

export function createInitialRevealChessState(
  gameId: string,
  deal: RevealChessDeal = STANDARD_REVEAL_CHESS_DEAL,
): RevealChessGameState {
  assertValidRevealChessDeal(deal);
  const board: RevealChessBoard = {};
  board[kingSquare('white')] = { color: 'white', role: 'king', faceDown: false };
  board[kingSquare('black')] = { color: 'black', role: 'king', faceDown: false };
  WHITE_HOME.forEach((sq, i) => {
    board[sq] = { color: 'white', role: deal.white[i], faceDown: true };
  });
  BLACK_HOME.forEach((sq, i) => {
    board[sq] = { color: 'black', role: deal.black[i], faceDown: true };
  });
  const castlingRights = [...ALL_CORNERS];
  const initialKey = positionKey(board, 'white', castlingRights);
  return {
    id: gameId,
    board,
    status: { type: 'playing', turn: 'white' },
    moveNumber: 1,
    noProgressClock: 0,
    positionCounts: { [initialKey]: 1 },
    castlingRights,
    captures: [],
  };
}

// ── Move generation ─────────────────────────────────────────────────────────

/** The role a face-down piece moves by (origin role), or its true identity. */
function effectiveRole(piece: RevealChessPiece, square: RevealChessSquare): RevealChessPieceRole {
  return piece.faceDown ? (STARTING_ROLE[square] as RevealChessPieceRole) : piece.role;
}

/** Squares a piece could move/capture to (geometry + blocking; NOT castling). */
function pseudoDests(board: RevealChessBoard, from: RevealChessSquare): RevealChessSquare[] {
  const piece = board[from];
  if (!piece) return [];
  const { file, rank } = coordOf(from);
  const role = effectiveRole(piece, from);
  const color = piece.color;
  const dests: RevealChessSquare[] = [];

  const tryStep = (f: number, r: number): void => {
    const to = sqAt(f, r);
    if (!to) return;
    const target = board[to];
    if (target && target.color === color) return;
    dests.push(to);
  };

  const slide = (dirs: readonly Step[]): void => {
    for (const [df, dr] of dirs) {
      let f = file + df;
      let r = rank + dr;
      while (inBounds(f, r)) {
        const to = sqAt(f, r) as RevealChessSquare;
        const target = board[to];
        if (!target) {
          dests.push(to);
        } else {
          if (target.color !== color) dests.push(to);
          break;
        }
        f += df;
        r += dr;
      }
    }
  };

  switch (role) {
    case 'king':
      for (const [df, dr] of KING_STEPS) tryStep(file + df, rank + dr);
      break;
    case 'knight':
      for (const [df, dr] of KNIGHT_STEPS) tryStep(file + df, rank + dr);
      break;
    case 'rook':
      slide(ROOK_DIRS);
      break;
    case 'bishop':
      slide(BISHOP_DIRS);
      break;
    case 'queen':
      slide(ROOK_DIRS);
      slide(BISHOP_DIRS);
      break;
    case 'pawn': {
      const dir = forwardDir(color);
      const ahead = sqAt(file, rank + dir);
      if (ahead && !board[ahead]) {
        dests.push(ahead); // one-square advance
        // Two-square advance: only a still-face-down piece on its home pawn rank
        // (2 for white, 7 for black) is eligible. face-down => unmoved, which
        // keeps the rule unambiguous under the shuffle: a revealed pawn that slid
        // onto its home rank is NOT face-down, so it never qualifies. Both the
        // intervening and target squares must be empty.
        if (piece.faceDown && rank === pawnRank(color)) {
          const twoAhead = sqAt(file, rank + 2 * dir);
          if (twoAhead && !board[twoAhead]) dests.push(twoAhead);
        }
      }
      for (const df of [-1, 1]) {
        const to = sqAt(file + df, rank + dir);
        if (!to) continue;
        const target = board[to];
        if (target && target.color !== color) dests.push(to); // diagonal capture
      }
      break;
    }
  }
  return dests;
}

export function findRevealChessKing(
  board: RevealChessBoard,
  color: RevealChessColor,
): RevealChessSquare | undefined {
  for (const [sq, piece] of Object.entries(board)) {
    if (piece && piece.color === color && piece.role === 'king') return sq as RevealChessSquare;
  }
  return undefined;
}

/** Is `target` attacked by any `byColor` piece? Pawns attack diagonally. */
function isSquareAttacked(
  board: RevealChessBoard,
  byColor: RevealChessColor,
  target: RevealChessSquare,
): boolean {
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.color !== byColor) continue;
    const from = sq as RevealChessSquare;
    const role = effectiveRole(piece, from);
    if (role === 'pawn') {
      const { file, rank } = coordOf(from);
      const dir = forwardDir(byColor);
      if (sqAt(file - 1, rank + dir) === target || sqAt(file + 1, rank + dir) === target) {
        return true;
      }
    } else if (pseudoDests(board, from).includes(target)) {
      return true;
    }
  }
  return false;
}

function isKingInCheck(board: RevealChessBoard, color: RevealChessColor): boolean {
  const king = findRevealChessKing(board, color);
  return king ? isSquareAttacked(board, oppositeRevealChessColor(color), king) : false;
}

/** Apply a non-castling move to a bare board, revealing a moved face-down piece. */
function simulateBoard(
  board: RevealChessBoard,
  from: RevealChessSquare,
  to: RevealChessSquare,
): RevealChessBoard {
  const next: RevealChessBoard = { ...board };
  const piece = next[from];
  if (!piece) return next;
  delete next[from];
  next[to] = piece.faceDown ? { ...piece, faceDown: false } : piece;
  return next;
}

type CastleSide = {
  corner: RevealChessSquare;
  kingTo: RevealChessSquare;
  rookTo: RevealChessSquare;
};

function castleSidesFor(color: RevealChessColor): CastleSide[] {
  const r = backRank(color);
  return [
    {
      corner: `a${r}` as RevealChessSquare,
      kingTo: `c${r}` as RevealChessSquare,
      rookTo: `d${r}` as RevealChessSquare,
    },
    {
      corner: `h${r}` as RevealChessSquare,
      kingTo: `g${r}` as RevealChessSquare,
      rookTo: `f${r}` as RevealChessSquare,
    },
  ];
}

function squaresBetweenOnRank(a: RevealChessSquare, b: RevealChessSquare): RevealChessSquare[] {
  const ca = coordOf(a);
  const cb = coordOf(b);
  const out: RevealChessSquare[] = [];
  const step = cb.file > ca.file ? 1 : -1;
  for (let f = ca.file + step; f !== cb.file; f += step) {
    out.push(sqAt(f, ca.rank) as RevealChessSquare);
  }
  return out;
}

function kingPathSquares(from: RevealChessSquare, kingTo: RevealChessSquare): RevealChessSquare[] {
  const cf = coordOf(from);
  const ct = coordOf(kingTo);
  const out: RevealChessSquare[] = [];
  const step = ct.file > cf.file ? 1 : -1;
  for (let f = cf.file; f !== ct.file + step; f += step)
    out.push(sqAt(f, cf.rank) as RevealChessSquare);
  return out; // includes from and kingTo
}

/** Legal castling moves for `color`, encoded king-to-corner (e1->a1 etc.). */
function castlingMoves(
  board: RevealChessBoard,
  color: RevealChessColor,
  castlingRights: readonly RevealChessSquare[],
): RevealChessMove[] {
  const from = kingSquare(color);
  const king = board[from];
  if (king?.role !== 'king' || king.color !== color || king.faceDown) return [];
  const enemy = oppositeRevealChessColor(color);
  if (isSquareAttacked(board, enemy, from)) return []; // cannot castle out of check
  const moves: RevealChessMove[] = [];
  for (const side of castleSidesFor(color)) {
    if (!castlingRights.includes(side.corner)) continue;
    const cornerPiece = board[side.corner];
    if (!cornerPiece || cornerPiece.color !== color || !cornerPiece.faceDown) continue; // origin-role rook
    if (squaresBetweenOnRank(from, side.corner).some((sq) => board[sq])) continue; // path empty
    // King must not pass through or land on an attacked square.
    if (kingPathSquares(from, side.kingTo).some((sq) => isSquareAttacked(board, enemy, sq)))
      continue;
    moves.push({ from, to: side.corner });
  }
  return moves;
}

function isCastleMove(board: RevealChessBoard, move: RevealChessMove): CastleSide | null {
  const piece = board[move.from];
  if (piece?.role !== 'king' || piece.faceDown) return null;
  if (move.from !== kingSquare(piece.color)) return null;
  return castleSidesFor(piece.color).find((s) => s.corner === move.to) ?? null;
}

function legalMovesOnBoard(
  board: RevealChessBoard,
  color: RevealChessColor,
  castlingRights: readonly RevealChessSquare[],
): RevealChessMove[] {
  const moves: RevealChessMove[] = [];
  const enemy = oppositeRevealChessColor(color);
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.color !== color) continue;
    const from = sq as RevealChessSquare;
    for (const to of pseudoDests(board, from)) {
      const next = simulateBoard(board, from, to);
      const king = findRevealChessKing(next, color);
      if (king && isSquareAttacked(next, enemy, king)) continue;
      moves.push({ from, to });
    }
  }
  moves.push(...castlingMoves(board, color, castlingRights));
  return moves;
}

export function getRevealChessLegalMoves(state: RevealChessGameState): RevealChessMove[] {
  if (state.status.type !== 'playing') return [];
  return legalMovesOnBoard(state.board, state.status.turn, state.castlingRights);
}

export function getRevealChessLegalMovesFrom(
  state: RevealChessGameState,
  from: RevealChessSquare,
): RevealChessMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn) return [];
  return getRevealChessLegalMoves(state).filter((move) => move.from === from);
}

export function isRevealChessLegalMove(
  state: RevealChessGameState,
  move: RevealChessMove,
): boolean {
  return getRevealChessLegalMovesFrom(state, move.from).some((m) => m.to === move.to);
}

// ── Repetition key (public position) ────────────────────────────────────────

const ROLE_CHAR: Record<RevealChessPieceRole, string> = {
  king: 'k',
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
};

// The position as both players see it: face-down pieces masked to '?'. Repetition
// is adjudicated on this public position (private captured-pool knowledge may
// differ between recurrences but does not affect the draw).
function positionKey(
  board: RevealChessBoard,
  turn: RevealChessColor,
  castlingRights: readonly RevealChessSquare[],
): string {
  const cells = Object.keys(board)
    .sort()
    .map((sq) => {
      const p = board[sq as RevealChessSquare] as RevealChessPiece;
      return `${sq}${p.color[0]}${p.faceDown ? '?' : ROLE_CHAR[p.role]}`;
    });
  return `${cells.join(',')}|${turn}|${[...castlingRights].sort().join('')}`;
}

// ── Apply move + terminal detection ─────────────────────────────────────────

export type RevealChessApplyMoveOptions = {
  noProgressClockLimit?: number;
};

export function applyRevealChessMove(
  state: RevealChessGameState,
  move: RevealChessMove,
  opts: RevealChessApplyMoveOptions = {},
): RevealChessGameState {
  if (state.status.type !== 'playing') return state;
  if (!isRevealChessLegalMove(state, move)) return state;

  const turn = state.status.turn;
  const castle = isCastleMove(state.board, move);

  let board: RevealChessBoard;
  let captured: RevealChessPiece | undefined;
  let revealed = false;
  let pawnInvolved = false;
  let castlingRights = state.castlingRights;

  if (castle) {
    // King + corner piece both move; the corner piece reveals on d/f (it may
    // flip to a non-rook — the castle still stands). Never a capture/promotion.
    board = { ...state.board };
    const king = board[move.from] as RevealChessPiece;
    const cornerPiece = board[castle.corner] as RevealChessPiece;
    delete board[move.from];
    delete board[castle.corner];
    board[castle.kingTo] = king;
    board[castle.rookTo] = { ...cornerPiece, faceDown: false };
    revealed = true; // the corner piece reveals
    castlingRights = state.castlingRights.filter((sq) => coordOf(sq).rank !== backRank(turn));
  } else {
    captured = state.board[move.to];
    const mover = state.board[move.from] as RevealChessPiece;
    revealed = mover.faceDown;
    board = simulateBoard(state.board, move.from, move.to);
    // Promotion: after reveal, a pawn on its far rank promotes immediately.
    const landed = board[move.to] as RevealChessPiece;
    if (landed.role === 'pawn' && coordOf(move.to).rank === farRank(turn)) {
      board[move.to] = { color: turn, role: move.promotion ?? 'queen', faceDown: false };
      pawnInvolved = true;
    } else if (landed.role === 'pawn') {
      pawnInvolved = true;
    }
    // Maintain castling rights: king move clears both; a corner square that is a
    // move endpoint (left or captured) loses eligibility.
    castlingRights = state.castlingRights.filter((sq) => {
      if (mover.role === 'king' && !mover.faceDown && coordOf(sq).rank === backRank(turn))
        return false;
      if (sq === move.from || sq === move.to) return false;
      return true;
    });
  }

  const wasCapture = captured !== undefined;
  const madeProgress = wasCapture || revealed || pawnInvolved;
  const noProgressClock = madeProgress ? 0 : state.noProgressClock + 1;
  const captures = wasCapture
    ? [
        ...state.captures,
        {
          owner: (captured as RevealChessPiece).color,
          role: (captured as RevealChessPiece).role,
          revealedAtCapture: !(captured as RevealChessPiece).faceDown,
        },
      ]
    : state.captures;

  const next = oppositeRevealChessColor(turn);
  const moveNumber = turn === 'black' ? state.moveNumber + 1 : state.moveNumber;
  const limit = opts.noProgressClockLimit ?? REVEAL_CHESS_NO_PROGRESS_PLY_LIMIT;

  const key = positionKey(board, next, castlingRights);
  const positionCounts = madeProgress
    ? { [key]: 1 } // irreversible progress resets the repetition history
    : { ...state.positionCounts, [key]: (state.positionCounts[key] ?? 0) + 1 };

  let status: RevealChessGameStatus = { type: 'playing', turn: next };
  if (captured?.role === 'king') {
    // Pathological under real check rules, but score it as a win for safety.
    status = { type: 'finished', winner: turn, reason: 'checkmate' };
  } else if (legalMovesOnBoard(board, next, castlingRights).length === 0) {
    status = isKingInCheck(board, next)
      ? { type: 'finished', winner: turn, reason: 'checkmate' }
      : { type: 'finished', winner: null, reason: 'stalemate' };
  } else if (noProgressClock >= limit) {
    status = { type: 'finished', winner: null, reason: 'no-progress-clock' };
  } else if ((positionCounts[key] ?? 0) >= 3) {
    status = { type: 'finished', winner: null, reason: 'threefold-repetition' };
  }

  return {
    ...state,
    board,
    status,
    moveNumber,
    noProgressClock,
    positionCounts,
    castlingRights,
    captures,
    lastMove: move,
  };
}

// ── Player view (redaction) ─────────────────────────────────────────────────

// Full-information "truth" view for postgame review (nothing redacted). Never
// ship this to a live client — it is the postgame-only counterpart to the
// per-color views.
export function revealChessTruthView(state: RevealChessGameState): RevealChessPlayerView {
  const board: RevealChessPlayerBoard = {};
  for (const [square, piece] of Object.entries(state.board)) {
    if (piece)
      board[square as RevealChessSquare] = {
        color: piece.color,
        role: piece.role,
        faceDown: false,
      };
  }
  return {
    id: state.id,
    perspective: 'white',
    board,
    legalMoves: [],
    captured: state.captures.map((c) => ({ owner: c.owner, role: c.role })),
    inCheck: false,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

export function getRevealChessPlayerView(
  state: RevealChessGameState,
  color: RevealChessColor,
): RevealChessPlayerView {
  const board: RevealChessPlayerBoard = {};
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece) continue;
    board[sq as RevealChessSquare] = piece.faceDown
      ? { color: piece.color, faceDown: true }
      : { color: piece.color, role: piece.role, faceDown: false };
  }

  // Capturer-only reveal: a captured role is known to the capturer, or if it was
  // already face-up when captured. The former owner of a still-face-down piece
  // never learns it (they never knew it).
  const captured: RevealChessCapturedView[] = state.captures.map((c) => {
    const capturer = oppositeRevealChessColor(c.owner);
    const known = c.revealedAtCapture || capturer === color;
    return { owner: c.owner, role: known ? c.role : null };
  });

  const legalMoves =
    state.status.type === 'playing'
      ? getRevealChessLegalMoves({ ...state, status: { type: 'playing', turn: color } })
      : [];

  const inCheck = state.status.type === 'playing' ? isKingInCheck(state.board, color) : false;

  return {
    id: state.id,
    perspective: color,
    board,
    legalMoves,
    captured,
    inCheck,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}
