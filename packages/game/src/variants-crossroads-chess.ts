// Crossroads Chess (中西象棋) — pure rules + fog kernel.
//
// A 6x8 chess x xiangqi fusion. Like the Mini Xiangqi module, this stays
// deliberately PARALLEL to the chess Variant interface and the xiangqi spikes:
// it owns its own color / coord / piece / move / view types. Forcing a 6x8
// board with cannons, horses and soldiers through the 8x8 chess shape (or the
// xiangqi shape) would hide rules and privacy boundaries. The only thing shared
// with the rest of packages/game is `AbortReason`.
//
// Two referees share one pseudo-legal move generator:
//   - DARK mode (king-capture): check is unenforceable under fog, so the win is
//     capturing the King, plus the racing "Try". See applyCrossroadsChessMove.
//   - PERFECT-INFORMATION mode (checkmate): real chess legality (you may not
//     leave your own King attacked); the win is checkmate or a safe Try; a side
//     with no legal move loses (stalemate is a loss). See applyCrossroadsChessOpenMove.
// Both are cross-checked against Fairy-Stockfish self-play in the replay test.
// See docs-private/crossroads-chess-track.md.
//
// Pieces: King, Queen (promoted pawn only), Bishop, Knight (free leaper), Pawn
// (chess) + Chariot (=rook), Cannon (screen-capture), Horse (blockable leaper),
// Soldier (forward-only, gains sideways after the river) (xiangqi).

import type { AbortReason } from './types.js';
import {
  cannonVisionInto,
  emptyVision,
  horseVisionInto,
  type VisionAccum as KernelVisionAccum,
  slideVisionInto,
  type VisionProbe,
} from './xiangqi-vision-kernel.js';

export type CrossroadsChessColor = 'white' | 'red';

export type CrossroadsChessPieceRole =
  | 'king'
  | 'queen'
  | 'bishop'
  | 'knight'
  | 'pawn'
  | 'chariot'
  | 'cannon'
  | 'horse'
  | 'soldier';

export type CrossroadsChessPiece = {
  color: CrossroadsChessColor;
  role: CrossroadsChessPieceRole;
};

export type CrossroadsChessCoord = { file: number; rank: number };

// 6 files (a..f) x 8 ranks (1..8) = 48 squares.
export type CrossroadsChessFile = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
export type CrossroadsChessRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type CrossroadsChessSquare = `${CrossroadsChessFile}${CrossroadsChessRank}`;

export type CrossroadsChessBoard = Partial<Record<CrossroadsChessSquare, CrossroadsChessPiece>>;

export type CrossroadsChessMove = {
  from: CrossroadsChessSquare;
  to: CrossroadsChessSquare;
  // Only a Queen promotion exists in this variant (pawns cannot underpromote).
  promotion?: 'queen';
};

export type CrossroadsChessVisibleBoardEntry =
  | { piece: CrossroadsChessPiece; shrouded: false }
  | { color: CrossroadsChessColor; shrouded: true };

export type CrossroadsChessPlayerBoard = Partial<
  Record<CrossroadsChessSquare, CrossroadsChessVisibleBoardEntry>
>;

export type CrossroadsChessGameEndReason =
  | 'king-captured' // dark mode: the King is captured (check is unenforceable)
  | 'checkmate' // perfect-info mode: the King is attacked with no legal reply
  | 'race'
  | 'stalemate'
  | 'repetition'
  | 'progress-clock'
  | 'timeout'
  | 'resignation'
  | 'abandonment';

export type CrossroadsChessGameStatus =
  | { type: 'playing'; turn: CrossroadsChessColor }
  | { type: 'finished'; winner: CrossroadsChessColor | null; reason: CrossroadsChessGameEndReason }
  | { type: 'aborted'; reason: AbortReason };

export type CrossroadsChessGameState = {
  id: string;
  board: CrossroadsChessBoard;
  status: CrossroadsChessGameStatus;
  moveNumber: number;
  progressClock: number;
  lastMove?: CrossroadsChessMove;
  positionCounts: Record<string, number>;
  // Dark-mode "pending Try": a King reached the enemy far rank and is awaiting
  // the opponent's single reply. Set to the racing side. On the opponent's next
  // move it resolves — they capture the King (king-capture win) or they cannot,
  // and the racer wins by Race. Only ever set for one ply; absent in open mode.
  pendingTry?: CrossroadsChessColor;
};

export type CrossroadsChessPlayerView = {
  id: string;
  perspective: CrossroadsChessColor;
  board: CrossroadsChessPlayerBoard;
  visibleSquares: CrossroadsChessSquare[];
  legalMoves: CrossroadsChessMove[];
  status: CrossroadsChessGameStatus;
  moveNumber: number;
  lastMove?: CrossroadsChessMove;
  // Present only when it equals the viewer's own color: the viewer has a pending
  // Try (their King reached the far rank, awaiting the opponent's reply). It is
  // redacted for the opponent so fog never reveals an out-of-vision racing King.
  pendingTry?: CrossroadsChessColor;
};

// The cannon/horse/slide walks, emptyVision, and the VisionAccum shape live in
// the shared xiangqi-vision-kernel; this alias binds the square type.
type VisionAccum = KernelVisionAccum<CrossroadsChessSquare>;

const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const FILE_COUNT = 6;
const RANK_COUNT = 8;
const DEFAULT_PROGRESS_CLOCK_LIMIT = 100;

const ROLE_REPETITION_CODES: Record<CrossroadsChessPieceRole, string> = {
  king: 'k',
  queen: 'q',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
  chariot: 'v',
  cannon: 'c',
  horse: 'h',
  soldier: 'o',
};

const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ALL_DIRECTIONS: readonly (readonly [number, number])[] = [...ORTHOGONAL, ...DIAGONAL];

// [df, dr] for the eight L-jumps shared by Knight (unblockable) and Horse.
const KNIGHT_JUMPS: readonly (readonly [number, number])[] = [
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
];

// [df, dr, legDf, legDr] — the Horse's leg is the orthogonal square it steps
// through toward the leap; if occupied, that leap is blocked.
const HORSE_JUMPS: readonly (readonly [number, number, number, number])[] = [
  [1, 2, 0, 1],
  [1, -2, 0, -1],
  [-1, 2, 0, 1],
  [-1, -2, 0, -1],
  [2, 1, 1, 0],
  [2, -1, 1, 0],
  [-2, 1, -1, 0],
  [-2, -1, -1, 0],
];

export type CrossroadsChessApplyMoveOptions = {
  progressClockLimit?: number;
};

// ── Coordinate helpers ──────────────────────────────────────────────────────

export function crossroadsChessSquareOf(file: number, rank: number): CrossroadsChessSquare {
  if (!crossroadsChessInBounds(file, rank)) {
    throw new RangeError(`crossroads chess coord out of range: file=${file} rank=${rank}`);
  }
  return `${FILE_CHARS[file]}${rank as CrossroadsChessRank}` as CrossroadsChessSquare;
}

export function crossroadsChessCoordOf(square: CrossroadsChessSquare): CrossroadsChessCoord {
  const file = FILE_CHARS.indexOf(square[0] as (typeof FILE_CHARS)[number]);
  const rank = Number(square.slice(1));
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > RANK_COUNT) {
    throw new RangeError(`invalid crossroads chess square: ${square}`);
  }
  return { file, rank };
}

export function crossroadsChessInBounds(file: number, rank: number): boolean {
  return file >= 0 && file < FILE_COUNT && rank >= 1 && rank <= RANK_COUNT;
}

function crossroadsChessIsOccupied(
  board: CrossroadsChessBoard,
  file: number,
  rank: number,
): boolean {
  return (
    crossroadsChessInBounds(file, rank) && board[crossroadsChessSquareOf(file, rank)] !== undefined
  );
}

function rankOf(square: CrossroadsChessSquare): number {
  return crossroadsChessCoordOf(square).rank;
}

export function oppositeCrossroadsChessColor(color: CrossroadsChessColor): CrossroadsChessColor {
  return color === 'white' ? 'red' : 'white';
}

// White advances toward rank 8, Red toward rank 1.
function forwardDir(color: CrossroadsChessColor): number {
  return color === 'white' ? 1 : -1;
}

function pawnStartRank(color: CrossroadsChessColor): number {
  return color === 'white' ? 2 : 7;
}

// Pawns promote (to Queen, mandatory) and the King "Tries" (races) on this rank.
function farRank(color: CrossroadsChessColor): number {
  return color === 'white' ? RANK_COUNT : 1;
}

// The river runs between ranks 4 and 5. A Soldier gains sideways movement once it
// has crossed into the enemy half.
export function soldierCrossedRiver(color: CrossroadsChessColor, rank: number): boolean {
  return color === 'white' ? rank >= 5 : rank <= 4;
}

// ── Initial state ───────────────────────────────────────────────────────────

// FEN bknhcv/pppooo/6/6/6/6/OOOPPP/VCHNKB w - - 0 1 (uppercase = White).
export function createInitialCrossroadsChessBoard(): CrossroadsChessBoard {
  const board: CrossroadsChessBoard = {};
  const whiteBack: CrossroadsChessPieceRole[] = [
    'chariot',
    'cannon',
    'horse',
    'knight',
    'king',
    'bishop',
  ];
  const whiteFront: CrossroadsChessPieceRole[] = [
    'soldier',
    'soldier',
    'soldier',
    'pawn',
    'pawn',
    'pawn',
  ];
  for (let f = 0; f < FILE_COUNT; f += 1) {
    board[crossroadsChessSquareOf(f, 1)] = { color: 'white', role: whiteBack[f] };
    board[crossroadsChessSquareOf(f, 2)] = { color: 'white', role: whiteFront[f] };
    // Red is the 180-degree rotation of White.
    board[crossroadsChessSquareOf(FILE_COUNT - 1 - f, 8)] = { color: 'red', role: whiteBack[f] };
    board[crossroadsChessSquareOf(FILE_COUNT - 1 - f, 7)] = { color: 'red', role: whiteFront[f] };
  }
  return board;
}

export function createInitialCrossroadsChessState(gameId: string): CrossroadsChessGameState {
  const base: CrossroadsChessGameState = {
    id: gameId,
    board: createInitialCrossroadsChessBoard(),
    status: { type: 'playing', turn: 'white' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  return {
    ...base,
    positionCounts: { [crossroadsChessPositionRepetitionKey(base)]: 1 },
  };
}

// ── Move generation ─────────────────────────────────────────────────────────

export function getCrossroadsChessLegalMoves(
  state: CrossroadsChessGameState,
): CrossroadsChessMove[] {
  if (state.status.type !== 'playing') return [];
  const moves: CrossroadsChessMove[] = [];
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== state.status.turn) continue;
    moves.push(...getCrossroadsChessLegalMovesFrom(state, sq as CrossroadsChessSquare));
  }
  return moves;
}

export function getCrossroadsChessLegalMovesFrom(
  state: CrossroadsChessGameState,
  from: CrossroadsChessSquare,
): CrossroadsChessMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn) return [];
  return pseudoLegalMovesFrom(state.board, from, piece);
}

function pseudoLegalMovesFrom(
  board: CrossroadsChessBoard,
  from: CrossroadsChessSquare,
  piece: CrossroadsChessPiece,
): CrossroadsChessMove[] {
  const { file, rank } = crossroadsChessCoordOf(from);
  const moves: CrossroadsChessMove[] = [];
  const addStep = (f: number, r: number): void => {
    if (!crossroadsChessInBounds(f, r)) return;
    const to = crossroadsChessSquareOf(f, r);
    if (board[to]?.color === piece.color) return;
    moves.push({ from, to });
  };

  switch (piece.role) {
    case 'king':
      for (const [df, dr] of ALL_DIRECTIONS) addStep(file + df, rank + dr);
      break;
    case 'knight':
      for (const [df, dr] of KNIGHT_JUMPS) addStep(file + df, rank + dr);
      break;
    case 'horse':
      for (const [df, dr, legDf, legDr] of HORSE_JUMPS) {
        if (crossroadsChessIsOccupied(board, file + legDf, rank + legDr)) continue;
        addStep(file + df, rank + dr);
      }
      break;
    case 'bishop':
      slideMovesInto(moves, board, from, piece.color, file, rank, DIAGONAL);
      break;
    case 'chariot':
      slideMovesInto(moves, board, from, piece.color, file, rank, ORTHOGONAL);
      break;
    case 'queen':
      slideMovesInto(moves, board, from, piece.color, file, rank, ALL_DIRECTIONS);
      break;
    case 'cannon':
      cannonMovesInto(moves, board, from, piece.color, file, rank);
      break;
    case 'pawn':
      pawnMovesInto(moves, board, from, piece.color, file, rank);
      break;
    case 'soldier':
      soldierMovesInto(addStep, piece.color, file, rank);
      break;
  }
  return moves;
}

function slideMovesInto(
  moves: CrossroadsChessMove[],
  board: CrossroadsChessBoard,
  from: CrossroadsChessSquare,
  color: CrossroadsChessColor,
  file: number,
  rank: number,
  directions: readonly (readonly [number, number])[],
): void {
  for (const [df, dr] of directions) {
    let f = file + df;
    let r = rank + dr;
    while (crossroadsChessInBounds(f, r)) {
      const to = crossroadsChessSquareOf(f, r);
      const target = board[to];
      if (!target) {
        moves.push({ from, to });
      } else {
        if (target.color !== color) moves.push({ from, to });
        break;
      }
      f += df;
      r += dr;
    }
  }
}

// Cannon moves like a Chariot over empties, but captures by jumping exactly one
// screen (any color) and landing on the enemy beyond it.
function cannonMovesInto(
  moves: CrossroadsChessMove[],
  board: CrossroadsChessBoard,
  from: CrossroadsChessSquare,
  color: CrossroadsChessColor,
  file: number,
  rank: number,
): void {
  for (const [df, dr] of ORTHOGONAL) {
    let f = file + df;
    let r = rank + dr;
    while (crossroadsChessInBounds(f, r) && !crossroadsChessIsOccupied(board, f, r)) {
      moves.push({ from, to: crossroadsChessSquareOf(f, r) });
      f += df;
      r += dr;
    }
    if (!crossroadsChessInBounds(f, r)) continue;
    // f,r is the screen. Skip past it and look for the first piece beyond.
    f += df;
    r += dr;
    while (crossroadsChessInBounds(f, r) && !crossroadsChessIsOccupied(board, f, r)) {
      f += df;
      r += dr;
    }
    if (!crossroadsChessInBounds(f, r)) continue;
    const to = crossroadsChessSquareOf(f, r);
    if (board[to]?.color !== color) moves.push({ from, to });
  }
}

function pawnMovesInto(
  moves: CrossroadsChessMove[],
  board: CrossroadsChessBoard,
  from: CrossroadsChessSquare,
  color: CrossroadsChessColor,
  file: number,
  rank: number,
): void {
  const dir = forwardDir(color);
  const promote = rank + dir === farRank(color);
  const push = (to: CrossroadsChessSquare): void => {
    if (promote) moves.push({ from, to, promotion: 'queen' });
    else moves.push({ from, to });
  };

  // Forward push (and double-step from the start rank), only into empty squares.
  if (
    crossroadsChessInBounds(file, rank + dir) &&
    !crossroadsChessIsOccupied(board, file, rank + dir)
  ) {
    push(crossroadsChessSquareOf(file, rank + dir));
    if (rank === pawnStartRank(color) && !crossroadsChessIsOccupied(board, file, rank + dir * 2)) {
      moves.push({ from, to: crossroadsChessSquareOf(file, rank + dir * 2) });
    }
  }

  // Diagonal captures (no en passant in this variant).
  for (const df of [-1, 1]) {
    const f = file + df;
    const r = rank + dir;
    if (!crossroadsChessInBounds(f, r)) continue;
    const target = board[crossroadsChessSquareOf(f, r)];
    if (target && target.color !== color) push(crossroadsChessSquareOf(f, r));
  }
}

function soldierMovesInto(
  addStep: (f: number, r: number) => void,
  color: CrossroadsChessColor,
  file: number,
  rank: number,
): void {
  addStep(file, rank + forwardDir(color));
  if (soldierCrossedRiver(color, rank)) {
    addStep(file - 1, rank);
    addStep(file + 1, rank);
  }
}

export function isCrossroadsChessLegalMove(
  state: CrossroadsChessGameState,
  move: CrossroadsChessMove,
): boolean {
  return getCrossroadsChessLegalMovesFrom(state, move.from).some((m) => m.to === move.to);
}

// ── Apply move ──────────────────────────────────────────────────────────────

export function applyCrossroadsChessMove(
  state: CrossroadsChessGameState,
  move: CrossroadsChessMove,
  opts: CrossroadsChessApplyMoveOptions = {},
): CrossroadsChessGameState {
  if (state.status.type !== 'playing') return state;
  if (!isCrossroadsChessLegalMove(state, move)) return state;

  const placement = placeCrossroadsChessMoveOnBoard(state.board, move);
  if (!placement) return state;
  const { board: newBoard, moved: movingPiece, captured: capturedPiece } = placement;
  const nextTurn = oppositeCrossroadsChessColor(state.status.turn);

  // Soldiers and Pawns are irreversible; a capture resets the no-progress clock.
  const wasCapture = capturedPiece !== undefined;
  const isProgressMove =
    wasCapture || movingPiece.role === 'pawn' || movingPiece.role === 'soldier';
  const newProgressClock = isProgressMove ? 0 : state.progressClock + 1;
  const newMoveNumber = state.status.turn === 'red' ? state.moveNumber + 1 : state.moveNumber;

  const nextStateForKey: CrossroadsChessGameState = {
    ...state,
    board: newBoard,
    status: { type: 'playing', turn: nextTurn },
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
  };
  const repKey = crossroadsChessPositionRepetitionKey(nextStateForKey);
  const newPositionCounts = { ...state.positionCounts };
  newPositionCounts[repKey] = (newPositionCounts[repKey] ?? 0) + 1;

  let nextStatus: CrossroadsChessGameStatus = { type: 'playing', turn: nextTurn };
  let nextPendingTry: CrossroadsChessColor | undefined;
  if (capturedPiece?.role === 'king') {
    // King capture: the dark-mode win (check is unenforceable under fog). This
    // also resolves a pending Try the other way — the opponent took the racing
    // King on their reply.
    nextStatus = { type: 'finished', winner: movingPiece.color, reason: 'king-captured' };
  } else if (state.pendingTry !== undefined) {
    // A Try was pending (armed last ply by THIS mover's opponent) and this reply
    // did NOT capture the racing King (the branch above). The Try succeeds — the
    // racer wins by Race. Checked before a fresh arm so a counter-Try reply does
    // not pre-empt the racer's standing Try.
    nextStatus = { type: 'finished', winner: state.pendingTry, reason: 'race' };
  } else if (movingPiece.role === 'king' && rankOf(move.to) === farRank(movingPiece.color)) {
    // The Race ("Try"): the King reached the enemy far rank. Instead of winning
    // outright we ARM the Try and hand the opponent exactly ONE reply. If they
    // can capture the King — which under fog they can do iff a piece already
    // bears on it — they win by king-capture; otherwise the Try resolves as a
    // Race win next ply. (The open mode keeps the instant win: its king moves
    // are self-check filtered, so an arrival is always safe and unanswerable.)
    if (hasCrossroadsChessLegalMove(newBoard, nextTurn)) {
      nextStatus = { type: 'playing', turn: nextTurn };
      nextPendingTry = movingPiece.color;
    } else {
      // The opponent has no reply at all, so the Try cannot be answered.
      nextStatus = { type: 'finished', winner: movingPiece.color, reason: 'race' };
    }
  } else if (!hasCrossroadsChessLegalMove(newBoard, nextTurn)) {
    // Stalemate is a LOSS for the side with no legal move (anti-draw design).
    nextStatus = { type: 'finished', winner: movingPiece.color, reason: 'stalemate' };
  } else if ((newPositionCounts[repKey] ?? 0) >= 3) {
    // Threefold repetition is a DRAW under fog. Open Crossroads makes it a LOSS
    // for the repeater (see applyCrossroadsChessOpenMove), but that rule needs
    // perfect information to be fair: it punishes a player who, seeing the whole
    // board, chooses to repeat. Under fog neither side can see the canonical
    // position recur, so the side that happens to complete the third occurrence
    // could not perceive or avoid it. Drawing matches dark chess and the rest of
    // the fog family; the progress clock below still carries the anti-draw
    // pressure against genuine stalling.
    nextStatus = { type: 'finished', winner: null, reason: 'repetition' };
  } else if (newProgressClock >= (opts.progressClockLimit ?? DEFAULT_PROGRESS_CLOCK_LIMIT)) {
    // The only real draw: 50-move-style no-progress rule.
    nextStatus = { type: 'finished', winner: null, reason: 'progress-clock' };
  }

  return {
    ...state,
    board: newBoard,
    status: nextStatus,
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
    positionCounts: newPositionCounts,
    pendingTry: nextPendingTry,
  };
}

export function crossroadsChessPositionRepetitionKey(state: CrossroadsChessGameState): string {
  const turn = state.status.type === 'playing' ? state.status.turn : '-';
  const board = Object.entries(state.board)
    .filter(([, piece]) => piece)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sq, p]) => `${sq}${p!.color[0]}${ROLE_REPETITION_CODES[p!.role]}`)
    .join(',');
  return `${turn}|${board}`;
}

function hasCrossroadsChessLegalMove(
  board: CrossroadsChessBoard,
  color: CrossroadsChessColor,
): boolean {
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.color !== color) continue;
    if (pseudoLegalMovesFrom(board, sq as CrossroadsChessSquare, piece).length > 0) return true;
  }
  return false;
}

type PlacedMove = {
  board: CrossroadsChessBoard;
  moved: CrossroadsChessPiece;
  captured: CrossroadsChessPiece | undefined;
};

// Apply a move to a board (with mandatory Queen promotion derived from the
// destination rank) without any terminal/turn logic. Shared by both referees.
function placeCrossroadsChessMoveOnBoard(
  board: CrossroadsChessBoard,
  move: CrossroadsChessMove,
): PlacedMove | null {
  const moved = board[move.from];
  if (!moved) return null;
  const captured = board[move.to];
  const becomesQueen = moved.role === 'pawn' && rankOf(move.to) === farRank(moved.color);
  const placed: CrossroadsChessPiece = becomesQueen ? { color: moved.color, role: 'queen' } : moved;
  const next: CrossroadsChessBoard = { ...board };
  delete next[move.from];
  next[move.to] = placed;
  return { board: next, moved, captured };
}

// ── Perfect-information referee ─────────────────────────────────────────────
//
// The perfect-information ("open") mode keeps real chess legality: you may not
// leave your own King attacked, the win is checkmate (King attacked with no
// legal reply) or the Race, and a side with no legal move loses (stalemate is a
// loss, not a draw, by design). The Race here is the "safe Try": a legal King
// move can never end on an attacked square, so reaching the far rank legally
// wins. This layer reuses the shared pseudo-legal generator; the dark referee
// (king-capture, above) is unchanged.

function findCrossroadsChessKing(
  board: CrossroadsChessBoard,
  color: CrossroadsChessColor,
): CrossroadsChessSquare | null {
  for (const [sq, piece] of Object.entries(board)) {
    if (piece && piece.color === color && piece.role === 'king') return sq as CrossroadsChessSquare;
  }
  return null;
}

// Is `color`'s King attacked? An enemy attacks the King's square iff one of its
// pseudo-legal moves can capture onto it (this naturally covers Cannon
// screen-captures, blockable-Horse legs and Pawn diagonals).
export function isCrossroadsChessKingAttacked(
  board: CrossroadsChessBoard,
  color: CrossroadsChessColor,
): boolean {
  const kingSquare = findCrossroadsChessKing(board, color);
  if (!kingSquare) return false;
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.color === color) continue;
    if (
      pseudoLegalMovesFrom(board, sq as CrossroadsChessSquare, piece).some(
        (m) => m.to === kingSquare,
      )
    ) {
      return true;
    }
  }
  return false;
}

function moveLeavesOwnKingAttacked(
  board: CrossroadsChessBoard,
  move: CrossroadsChessMove,
  color: CrossroadsChessColor,
): boolean {
  const placement = placeCrossroadsChessMoveOnBoard(board, move);
  if (!placement) return false;
  return isCrossroadsChessKingAttacked(placement.board, color);
}

export function getCrossroadsChessOpenLegalMovesFrom(
  state: CrossroadsChessGameState,
  from: CrossroadsChessSquare,
): CrossroadsChessMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn) return [];
  return pseudoLegalMovesFrom(state.board, from, piece).filter(
    (move) => !moveLeavesOwnKingAttacked(state.board, move, piece.color),
  );
}

export function getCrossroadsChessOpenLegalMoves(
  state: CrossroadsChessGameState,
): CrossroadsChessMove[] {
  if (state.status.type !== 'playing') return [];
  const moves: CrossroadsChessMove[] = [];
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== state.status.turn) continue;
    moves.push(...getCrossroadsChessOpenLegalMovesFrom(state, sq as CrossroadsChessSquare));
  }
  return moves;
}

export function isCrossroadsChessOpenLegalMove(
  state: CrossroadsChessGameState,
  move: CrossroadsChessMove,
): boolean {
  return getCrossroadsChessOpenLegalMovesFrom(state, move.from).some((m) => m.to === move.to);
}

function hasCrossroadsChessOpenLegalMove(
  board: CrossroadsChessBoard,
  color: CrossroadsChessColor,
): boolean {
  const probe: CrossroadsChessGameState = {
    id: 'probe',
    board,
    status: { type: 'playing', turn: color },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece || piece.color !== color) continue;
    if (getCrossroadsChessOpenLegalMovesFrom(probe, sq as CrossroadsChessSquare).length > 0)
      return true;
  }
  return false;
}

export function applyCrossroadsChessOpenMove(
  state: CrossroadsChessGameState,
  move: CrossroadsChessMove,
  opts: CrossroadsChessApplyMoveOptions = {},
): CrossroadsChessGameState {
  if (state.status.type !== 'playing') return state;
  if (!isCrossroadsChessOpenLegalMove(state, move)) return state;

  const placement = placeCrossroadsChessMoveOnBoard(state.board, move);
  if (!placement) return state;
  const { board: newBoard, moved, captured } = placement;
  const nextTurn = oppositeCrossroadsChessColor(state.status.turn);

  const isProgressMove =
    captured !== undefined || moved.role === 'pawn' || moved.role === 'soldier';
  const newProgressClock = isProgressMove ? 0 : state.progressClock + 1;
  const newMoveNumber = state.status.turn === 'red' ? state.moveNumber + 1 : state.moveNumber;

  const nextStateForKey: CrossroadsChessGameState = {
    ...state,
    board: newBoard,
    status: { type: 'playing', turn: nextTurn },
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
  };
  const repKey = crossroadsChessPositionRepetitionKey(nextStateForKey);
  const newPositionCounts = { ...state.positionCounts };
  newPositionCounts[repKey] = (newPositionCounts[repKey] ?? 0) + 1;

  let nextStatus: CrossroadsChessGameStatus = { type: 'playing', turn: nextTurn };
  if (moved.role === 'king' && rankOf(move.to) === farRank(moved.color)) {
    nextStatus = { type: 'finished', winner: moved.color, reason: 'race' };
  } else if (!hasCrossroadsChessOpenLegalMove(newBoard, nextTurn)) {
    const reason = isCrossroadsChessKingAttacked(newBoard, nextTurn) ? 'checkmate' : 'stalemate';
    nextStatus = { type: 'finished', winner: moved.color, reason };
  } else if ((newPositionCounts[repKey] ?? 0) >= 3) {
    nextStatus = { type: 'finished', winner: nextTurn, reason: 'repetition' };
  } else if (newProgressClock >= (opts.progressClockLimit ?? DEFAULT_PROGRESS_CLOCK_LIMIT)) {
    nextStatus = { type: 'finished', winner: null, reason: 'progress-clock' };
  }

  return {
    ...state,
    board: newBoard,
    status: nextStatus,
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
    positionCounts: newPositionCounts,
  };
}

// ── Fog visibility ──────────────────────────────────────────────────────────
//
// Vision is "field of fire" (feedback_fow_vision_field_of_fire): a pure function
// of piece placement, defined even for finished states so post-game replay does
// not collapse the loser's view. Chess pieces resolve entirely into
// `directlyVisible`; only the Cannon (screens/targets) and Horse (blocked leg)
// produce shrouded silhouettes, exactly as in Mini Xiangqi.

export function computeCrossroadsChessVision(
  state: CrossroadsChessGameState,
  color: CrossroadsChessColor,
): VisionAccum {
  const accum = emptyVision<CrossroadsChessSquare>();
  const probe: VisionProbe<CrossroadsChessSquare> = {
    inBounds: crossroadsChessInBounds,
    squareOf: crossroadsChessSquareOf,
    isOccupied: (file, rank) => crossroadsChessIsOccupied(state.board, file, rank),
    isEnemyAt: (file, rank) => {
      const target = state.board[crossroadsChessSquareOf(file, rank)];
      return target !== undefined && target.color !== color;
    },
  };
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== color) continue;
    const square = sq as CrossroadsChessSquare;
    accum.directlyVisible.add(square);
    const { file, rank } = crossroadsChessCoordOf(square);
    switch (piece.role) {
      case 'king':
        for (const [df, dr] of ALL_DIRECTIONS)
          addIfOnBoard(accum.directlyVisible, file + df, rank + dr);
        break;
      case 'knight':
        for (const [df, dr] of KNIGHT_JUMPS)
          addIfOnBoard(accum.directlyVisible, file + df, rank + dr);
        break;
      case 'horse':
        horseVisionInto(accum, probe, file, rank);
        break;
      case 'bishop':
        slideVisionInto(accum.directlyVisible, probe, DIAGONAL, file, rank);
        break;
      case 'chariot':
        slideVisionInto(accum.directlyVisible, probe, ORTHOGONAL, file, rank);
        break;
      case 'queen':
        slideVisionInto(accum.directlyVisible, probe, ALL_DIRECTIONS, file, rank);
        break;
      case 'cannon':
        cannonVisionInto(accum, probe, file, rank);
        break;
      case 'pawn':
        pawnVisionInto(accum.directlyVisible, state.board, color, file, rank);
        break;
      case 'soldier':
        soldierVisionInto(accum.directlyVisible, color, file, rank);
        break;
    }
  }
  return accum;
}

export function getCrossroadsChessVisibleSquares(
  state: CrossroadsChessGameState,
  color: CrossroadsChessColor,
): CrossroadsChessSquare[] {
  const vision = computeCrossroadsChessVision(state, color);
  return [
    ...new Set<CrossroadsChessSquare>([
      ...vision.directlyVisible,
      ...vision.shroudedBlockers,
      ...vision.cannonScreens,
      ...vision.cannonTargets,
    ]),
  ].sort();
}

export function getCrossroadsChessPlayerView(
  state: CrossroadsChessGameState,
  color: CrossroadsChessColor,
): CrossroadsChessPlayerView {
  const vision = computeCrossroadsChessVision(state, color);
  const board: CrossroadsChessPlayerBoard = {};

  for (const sq of vision.directlyVisible) {
    const piece = state.board[sq];
    if (piece) mergePlayerBoardEntry(board, sq, { piece, shrouded: false });
  }
  for (const sq of vision.shroudedBlockers) {
    const piece = state.board[sq];
    if (piece) mergePlayerBoardEntry(board, sq, { color: piece.color, shrouded: true });
  }
  for (const sq of vision.cannonScreens) {
    const piece = state.board[sq];
    if (piece) mergePlayerBoardEntry(board, sq, { color: piece.color, shrouded: true });
  }
  for (const sq of vision.cannonTargets) {
    const piece = state.board[sq];
    if (piece) mergePlayerBoardEntry(board, sq, { piece, shrouded: false });
  }

  const legalMoves =
    state.status.type === 'playing'
      ? getCrossroadsChessLegalMoves({ ...state, status: { type: 'playing', turn: color } })
      : [];

  return {
    id: state.id,
    perspective: color,
    board,
    visibleSquares: getCrossroadsChessVisibleSquares(state, color),
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
    // Only the racing side learns its Try is pending; the opponent's view stays
    // fogged (a defender sees the racing King via field-of-fire iff it can
    // capture, which needs no extra signal).
    pendingTry: state.pendingTry === color ? state.pendingTry : undefined,
  };
}

// Perfect-information view: the whole board is visible to both players.
export function getCrossroadsChessOpenView(
  state: CrossroadsChessGameState,
  color: CrossroadsChessColor,
): CrossroadsChessPlayerView {
  const board: CrossroadsChessPlayerBoard = {};
  const visibleSquares: CrossroadsChessSquare[] = [];
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece) continue;
    board[sq as CrossroadsChessSquare] = { piece, shrouded: false };
    visibleSquares.push(sq as CrossroadsChessSquare);
  }
  // Perfect-information legality: self-check-filtered moves (you may not leave
  // your own King attacked).
  const legalMoves =
    state.status.type === 'playing' && state.status.turn === color
      ? getCrossroadsChessOpenLegalMoves(state)
      : [];
  return {
    id: state.id,
    perspective: color,
    board,
    visibleSquares: visibleSquares.sort(),
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
    // Open mode never arms a pending Try (its king moves are self-check filtered,
    // so a far-rank arrival wins outright); carried for view-shape parity.
    pendingTry: state.pendingTry,
  };
}

// ── Per-piece vision ────────────────────────────────────────────────────────

function pawnVisionInto(
  set: Set<CrossroadsChessSquare>,
  board: CrossroadsChessBoard,
  color: CrossroadsChessColor,
  file: number,
  rank: number,
): void {
  const dir = forwardDir(color);
  // Forward push is revealed only into empty squares (matches dark-chess: a pawn
  // does not "see" a piece blocking it head-on, only enemies it can capture).
  if (
    crossroadsChessInBounds(file, rank + dir) &&
    !crossroadsChessIsOccupied(board, file, rank + dir)
  ) {
    set.add(crossroadsChessSquareOf(file, rank + dir));
    if (rank === pawnStartRank(color) && !crossroadsChessIsOccupied(board, file, rank + dir * 2)) {
      set.add(crossroadsChessSquareOf(file, rank + dir * 2));
    }
  }
  for (const df of [-1, 1]) {
    const f = file + df;
    const r = rank + dir;
    if (!crossroadsChessInBounds(f, r)) continue;
    const target = board[crossroadsChessSquareOf(f, r)];
    if (target && target.color !== color) set.add(crossroadsChessSquareOf(f, r));
  }
}

function soldierVisionInto(
  set: Set<CrossroadsChessSquare>,
  color: CrossroadsChessColor,
  file: number,
  rank: number,
): void {
  addIfOnBoard(set, file, rank + forwardDir(color));
  if (soldierCrossedRiver(color, rank)) {
    addIfOnBoard(set, file - 1, rank);
    addIfOnBoard(set, file + 1, rank);
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function mergePlayerBoardEntry(
  board: CrossroadsChessPlayerBoard,
  square: CrossroadsChessSquare,
  entry: CrossroadsChessVisibleBoardEntry,
): void {
  const existing = board[square];
  if (!existing || (existing.shrouded && !entry.shrouded)) {
    board[square] = entry;
  }
}

function addIfOnBoard(set: Set<CrossroadsChessSquare>, file: number, rank: number): void {
  if (crossroadsChessInBounds(file, rank)) set.add(crossroadsChessSquareOf(file, rank));
}
