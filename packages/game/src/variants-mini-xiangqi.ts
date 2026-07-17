// Dark Mini Xiangqi — pure rules + fog kernel.
//
// This module intentionally stays parallel to the chess Variant interface and
// the full Xiangqi spike. Mini Xiangqi has its own 7x7 board geometry and a
// smaller piece set, so forcing it through either existing shape would hide
// important rules and privacy boundaries.

import type { AbortReason } from './types.js';
import {
  cannonVisionInto,
  emptyVision,
  horseVisionInto,
  type VisionAccum as KernelVisionAccum,
  ORTHOGONAL_STEPS,
  slideVisionInto,
  type VisionProbe,
} from './xiangqi-vision-kernel.js';

export type MiniXiangqiColor = 'red' | 'black';

export type MiniXiangqiPieceRole = 'general' | 'horse' | 'cannon' | 'chariot' | 'soldier';

export type MiniXiangqiPiece = {
  color: MiniXiangqiColor;
  role: MiniXiangqiPieceRole;
};

export type MiniXiangqiCoord = { file: number; rank: number };

export type MiniXiangqiSquare =
  | 'a1'
  | 'b1'
  | 'c1'
  | 'd1'
  | 'e1'
  | 'f1'
  | 'g1'
  | 'a2'
  | 'b2'
  | 'c2'
  | 'd2'
  | 'e2'
  | 'f2'
  | 'g2'
  | 'a3'
  | 'b3'
  | 'c3'
  | 'd3'
  | 'e3'
  | 'f3'
  | 'g3'
  | 'a4'
  | 'b4'
  | 'c4'
  | 'd4'
  | 'e4'
  | 'f4'
  | 'g4'
  | 'a5'
  | 'b5'
  | 'c5'
  | 'd5'
  | 'e5'
  | 'f5'
  | 'g5'
  | 'a6'
  | 'b6'
  | 'c6'
  | 'd6'
  | 'e6'
  | 'f6'
  | 'g6'
  | 'a7'
  | 'b7'
  | 'c7'
  | 'd7'
  | 'e7'
  | 'f7'
  | 'g7';

export type MiniXiangqiBoard = Partial<Record<MiniXiangqiSquare, MiniXiangqiPiece>>;

export type MiniXiangqiMove = {
  from: MiniXiangqiSquare;
  to: MiniXiangqiSquare;
};

export type MiniXiangqiVisibleBoardEntry =
  | { piece: MiniXiangqiPiece; shrouded: false }
  | { color: MiniXiangqiColor; shrouded: true };

export type MiniXiangqiPlayerBoard = Partial<
  Record<MiniXiangqiSquare, MiniXiangqiVisibleBoardEntry>
>;

export type MiniXiangqiPlayerView = {
  id: string;
  perspective: MiniXiangqiColor;
  board: MiniXiangqiPlayerBoard;
  visibleSquares: MiniXiangqiSquare[];
  legalMoves: MiniXiangqiMove[];
  status: MiniXiangqiGameStatus;
  moveNumber: number;
  lastMove?: MiniXiangqiMove;
};

export type MiniXiangqiGameEndReason =
  | 'general-captured'
  | 'checkmate'
  | 'stalemate'
  | 'timeout'
  | 'resignation'
  | 'abandonment'
  | 'repetition'
  | 'progress-clock';

export type MiniXiangqiGameStatus =
  | { type: 'playing'; turn: MiniXiangqiColor }
  | { type: 'finished'; winner: MiniXiangqiColor | null; reason: MiniXiangqiGameEndReason }
  | { type: 'aborted'; reason: AbortReason };

export type MiniXiangqiGameState = {
  id: string;
  board: MiniXiangqiBoard;
  status: MiniXiangqiGameStatus;
  moveNumber: number;
  progressClock: number;
  lastMove?: MiniXiangqiMove;
  positionCounts: Record<string, number>;
};

// The cannon/horse/slide walks, emptyVision, and the VisionAccum shape live in
// the shared xiangqi-vision-kernel; this alias binds the square type.
type VisionAccum = KernelVisionAccum<MiniXiangqiSquare>;

const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
const BOARD_SIZE = 7;
const DEFAULT_PROGRESS_CLOCK_LIMIT = 60;
const ROLE_REPETITION_CODES: Record<MiniXiangqiPieceRole, string> = {
  general: 'g',
  horse: 'h',
  cannon: 'n',
  chariot: 'r',
  soldier: 's',
};
const ALL_MINI_XIANGQI_SQUARES: readonly MiniXiangqiSquare[] = (() => {
  const squares: MiniXiangqiSquare[] = [];
  for (let rank = 1; rank <= BOARD_SIZE; rank += 1) {
    for (let file = 0; file < BOARD_SIZE; file += 1) {
      squares.push(miniXiangqiSquareOf(file, rank));
    }
  }
  return squares;
})();

export type MiniXiangqiApplyMoveOptions = {
  progressClockLimit?: number;
};

export function miniXiangqiSquareOf(file: number, rank: number): MiniXiangqiSquare {
  if (!miniXiangqiInBounds(file, rank)) {
    throw new RangeError(`mini xiangqi coord out of range: file=${file} rank=${rank}`);
  }
  return `${FILE_CHARS[file]}${rank}` as MiniXiangqiSquare;
}

export function miniXiangqiCoordOf(square: MiniXiangqiSquare): MiniXiangqiCoord {
  const file = FILE_CHARS.indexOf(square[0] as (typeof FILE_CHARS)[number]);
  const rank = Number(square.slice(1));
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > BOARD_SIZE) {
    throw new RangeError(`invalid mini xiangqi square: ${square}`);
  }
  return { file, rank };
}

export function miniXiangqiInBounds(file: number, rank: number): boolean {
  return file >= 0 && file < BOARD_SIZE && rank >= 1 && rank <= BOARD_SIZE;
}

export function miniXiangqiInPalace(color: MiniXiangqiColor, file: number, rank: number): boolean {
  if (file < 2 || file > 4) return false;
  return color === 'red' ? rank <= 3 : rank >= 5;
}

export function createInitialMiniXiangqiBoard(): MiniXiangqiBoard {
  const board: MiniXiangqiBoard = {};
  const backRank: MiniXiangqiPieceRole[] = [
    'chariot',
    'cannon',
    'horse',
    'general',
    'horse',
    'cannon',
    'chariot',
  ];
  for (let f = 0; f < BOARD_SIZE; f += 1) {
    board[miniXiangqiSquareOf(f, 1)] = { color: 'red', role: backRank[f] };
    board[miniXiangqiSquareOf(f, 7)] = { color: 'black', role: backRank[f] };
  }
  for (const f of [0, 2, 3, 4, 6]) {
    board[miniXiangqiSquareOf(f, 2)] = { color: 'red', role: 'soldier' };
    board[miniXiangqiSquareOf(f, 6)] = { color: 'black', role: 'soldier' };
  }
  return board;
}

export function createInitialMiniXiangqiState(gameId: string): MiniXiangqiGameState {
  const base: MiniXiangqiGameState = {
    id: gameId,
    board: createInitialMiniXiangqiBoard(),
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  return {
    ...base,
    positionCounts: { [miniXiangqiPositionRepetitionKey(base)]: 1 },
  };
}

export function oppositeMiniXiangqiColor(color: MiniXiangqiColor): MiniXiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

export function allMiniXiangqiSquares(): readonly MiniXiangqiSquare[] {
  return ALL_MINI_XIANGQI_SQUARES;
}

export function getMiniXiangqiLegalMoves(state: MiniXiangqiGameState): MiniXiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const moves: MiniXiangqiMove[] = [];
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== state.status.turn) continue;
    moves.push(...getMiniXiangqiLegalMovesFrom(state, sq as MiniXiangqiSquare));
  }
  return moves;
}

export function getMiniXiangqiLegalMovesFrom(
  state: MiniXiangqiGameState,
  from: MiniXiangqiSquare,
): MiniXiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn) return [];
  const { file, rank } = miniXiangqiCoordOf(from);
  const moves: MiniXiangqiMove[] = [];
  const addStep = (f: number, r: number): void => {
    if (!miniXiangqiInBounds(f, r)) return;
    const to = miniXiangqiSquareOf(f, r);
    if (state.board[to]?.color === piece.color) return;
    moves.push({ from, to });
  };

  switch (piece.role) {
    case 'general':
      for (const [df, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const f = file + df;
        const r = rank + dr;
        if (miniXiangqiInPalace(piece.color, f, r)) addStep(f, r);
      }
      {
        const facing = miniXiangqiFacingGeneralCaptureTarget(state.board, from, piece);
        if (facing && !moves.some((move) => move.to === facing)) moves.push({ from, to: facing });
      }
      break;
    case 'horse':
      for (const [df, dr, legDf, legDr] of [
        [1, 2, 0, 1],
        [1, -2, 0, -1],
        [-1, 2, 0, 1],
        [-1, -2, 0, -1],
        [2, 1, 1, 0],
        [2, -1, 1, 0],
        [-2, 1, -1, 0],
        [-2, -1, -1, 0],
      ] as const) {
        if (miniXiangqiIsOccupied(state.board, file + legDf, rank + legDr)) continue;
        addStep(file + df, rank + dr);
      }
      break;
    case 'chariot':
      rayMovesInto(moves, state.board, from, piece.color, file, rank, false);
      break;
    case 'cannon':
      rayMovesInto(moves, state.board, from, piece.color, file, rank, true);
      break;
    case 'soldier':
      {
        const forward = piece.color === 'red' ? 1 : -1;
        addStep(file, rank + forward);
        addStep(file - 1, rank);
        addStep(file + 1, rank);
      }
      break;
  }
  return moves;
}

export function isMiniXiangqiLegalMove(
  state: MiniXiangqiGameState,
  move: MiniXiangqiMove,
): boolean {
  return getMiniXiangqiLegalMovesFrom(state, move.from).some((m) => m.to === move.to);
}

export function applyMiniXiangqiMove(
  state: MiniXiangqiGameState,
  move: MiniXiangqiMove,
  opts: MiniXiangqiApplyMoveOptions = {},
): MiniXiangqiGameState {
  if (state.status.type !== 'playing') return state;
  if (!isMiniXiangqiLegalMove(state, move)) return state;

  const movingPiece = state.board[move.from];
  if (!movingPiece) return state;
  const capturedPiece = state.board[move.to];
  const nextTurn = oppositeMiniXiangqiColor(state.status.turn);
  const newBoard: MiniXiangqiBoard = { ...state.board };
  delete newBoard[move.from];
  newBoard[move.to] = movingPiece;
  const wasCapture = capturedPiece !== undefined;
  const newProgressClock = wasCapture ? 0 : state.progressClock + 1;
  const newMoveNumber = state.status.turn === 'black' ? state.moveNumber + 1 : state.moveNumber;

  const nextStateForKey: MiniXiangqiGameState = {
    ...state,
    board: newBoard,
    status: { type: 'playing', turn: nextTurn },
    moveNumber: newMoveNumber,
    progressClock: newProgressClock,
    lastMove: move,
  };
  const repKey = miniXiangqiPositionRepetitionKey(nextStateForKey);
  const newPositionCounts = { ...state.positionCounts };
  newPositionCounts[repKey] = (newPositionCounts[repKey] ?? 0) + 1;

  let nextStatus: MiniXiangqiGameStatus = { type: 'playing', turn: nextTurn };
  if (capturedPiece?.role === 'general') {
    nextStatus = { type: 'finished', winner: movingPiece.color, reason: 'general-captured' };
  } else if (!hasMiniXiangqiLegalMove(newBoard, nextTurn)) {
    nextStatus = { type: 'finished', winner: movingPiece.color, reason: 'stalemate' };
  } else if ((newPositionCounts[repKey] ?? 0) >= 3) {
    nextStatus = { type: 'finished', winner: null, reason: 'repetition' };
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

export function getMiniXiangqiOpenLegalMoves(
  state: MiniXiangqiGameState,
  color?: MiniXiangqiColor,
): MiniXiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const turn = color ?? state.status.turn;
  const pseudoMoves = getMiniXiangqiLegalMoves({
    ...state,
    status: { type: 'playing', turn },
  });
  return pseudoMoves.filter((move) => isMiniXiangqiOpenBoardMoveLegal(state.board, move, turn));
}

export function getMiniXiangqiOpenLegalMovesFrom(
  state: MiniXiangqiGameState,
  from: MiniXiangqiSquare,
  color?: MiniXiangqiColor,
): MiniXiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const turn = color ?? state.status.turn;
  const pseudoMoves = getMiniXiangqiLegalMovesFrom(
    { ...state, status: { type: 'playing', turn } },
    from,
  );
  return pseudoMoves.filter((move) => isMiniXiangqiOpenBoardMoveLegal(state.board, move, turn));
}

export function isMiniXiangqiOpenLegalMove(
  state: MiniXiangqiGameState,
  move: MiniXiangqiMove,
): boolean {
  if (state.status.type !== 'playing') return false;
  return getMiniXiangqiOpenLegalMovesFrom(state, move.from, state.status.turn).some(
    (candidate) => candidate.to === move.to,
  );
}

export function applyMiniXiangqiOpenMove(
  state: MiniXiangqiGameState,
  move: MiniXiangqiMove,
  opts: MiniXiangqiApplyMoveOptions = {},
): MiniXiangqiGameState {
  if (state.status.type !== 'playing') return state;
  if (!isMiniXiangqiOpenLegalMove(state, move)) return state;

  const movingColor = state.status.turn;
  const movingPiece = state.board[move.from];
  if (!movingPiece) return state;
  const capturedPiece = state.board[move.to];
  const nextTurn = oppositeMiniXiangqiColor(movingColor);
  const board = miniXiangqiBoardAfterMove(state.board, move);
  const progressClock = capturedPiece ? 0 : state.progressClock + 1;
  const moveNumber = movingColor === 'black' ? state.moveNumber + 1 : state.moveNumber;
  const nextStateForKey: MiniXiangqiGameState = {
    ...state,
    board,
    status: { type: 'playing', turn: nextTurn },
    moveNumber,
    progressClock,
    lastMove: move,
  };
  const repKey = miniXiangqiPositionRepetitionKey(nextStateForKey);
  const positionCounts = { ...state.positionCounts };
  positionCounts[repKey] = (positionCounts[repKey] ?? 0) + 1;

  let status: MiniXiangqiGameStatus = { type: 'playing', turn: nextTurn };
  if (!hasMiniXiangqiOpenLegalMove(board, nextTurn)) {
    status = {
      type: 'finished',
      winner: movingColor,
      reason: isMiniXiangqiGeneralInCheckOnBoard(board, nextTurn) ? 'checkmate' : 'stalemate',
    };
  } else if ((positionCounts[repKey] ?? 0) >= 3) {
    status = { type: 'finished', winner: null, reason: 'repetition' };
  } else if (progressClock >= (opts.progressClockLimit ?? DEFAULT_PROGRESS_CLOCK_LIMIT)) {
    status = { type: 'finished', winner: null, reason: 'progress-clock' };
  }

  return {
    ...state,
    board,
    status,
    moveNumber,
    progressClock,
    lastMove: move,
    positionCounts,
  };
}

export function getMiniXiangqiOpenPlayerView(
  state: MiniXiangqiGameState,
  color: MiniXiangqiColor,
): MiniXiangqiPlayerView {
  return {
    id: state.id,
    perspective: color,
    board: Object.fromEntries(
      Object.entries(state.board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as MiniXiangqiPlayerBoard,
    visibleSquares: [...ALL_MINI_XIANGQI_SQUARES],
    legalMoves: getMiniXiangqiOpenLegalMoves(state, color),
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

export function isMiniXiangqiGeneralInCheck(
  state: MiniXiangqiGameState,
  color: MiniXiangqiColor,
): boolean {
  return isMiniXiangqiGeneralInCheckOnBoard(state.board, color);
}

export function miniXiangqiBoardAfterMove(
  board: MiniXiangqiBoard,
  move: MiniXiangqiMove,
): MiniXiangqiBoard {
  const movingPiece = board[move.from];
  if (!movingPiece) return { ...board };
  const next: MiniXiangqiBoard = { ...board };
  delete next[move.from];
  next[move.to] = movingPiece;
  return next;
}

export function miniXiangqiPositionRepetitionKey(state: MiniXiangqiGameState): string {
  const turn = state.status.type === 'playing' ? state.status.turn : '-';
  const board = Object.entries(state.board)
    .filter(([, piece]) => piece)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sq, p]) => `${sq}${p!.color[0]}${ROLE_REPETITION_CODES[p!.role]}`)
    .join(',');
  return `${turn}|${board}`;
}

export function computeMiniXiangqiVision(
  state: MiniXiangqiGameState,
  color: MiniXiangqiColor,
): VisionAccum {
  const accum = emptyVision<MiniXiangqiSquare>();
  const probe: VisionProbe<MiniXiangqiSquare> = {
    inBounds: miniXiangqiInBounds,
    squareOf: miniXiangqiSquareOf,
    isOccupied: (file, rank) => miniXiangqiIsOccupied(state.board, file, rank),
    isEnemyAt: (file, rank) => {
      const target = state.board[miniXiangqiSquareOf(file, rank)];
      return target !== undefined && target.color !== color;
    },
  };
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== color) continue;
    const square = sq as MiniXiangqiSquare;
    accum.directlyVisible.add(square);
    const { file, rank } = miniXiangqiCoordOf(square);
    switch (piece.role) {
      case 'general':
        generalVisionInto(accum.directlyVisible, color, state.board, file, rank);
        break;
      case 'horse':
        horseVisionInto(accum, probe, file, rank);
        break;
      case 'chariot':
        slideVisionInto(accum.directlyVisible, probe, ORTHOGONAL_STEPS, file, rank);
        break;
      case 'cannon':
        cannonVisionInto(accum, probe, file, rank);
        break;
      case 'soldier':
        soldierVisionInto(accum.directlyVisible, color, file, rank);
        break;
    }
  }
  return accum;
}

export function getMiniXiangqiVisibleSquares(
  state: MiniXiangqiGameState,
  color: MiniXiangqiColor,
): MiniXiangqiSquare[] {
  const vision = computeMiniXiangqiVision(state, color);
  return [
    ...new Set<MiniXiangqiSquare>([
      ...vision.directlyVisible,
      ...vision.shroudedBlockers,
      ...vision.cannonScreens,
      ...vision.cannonTargets,
    ]),
  ].sort();
}

export function getMiniXiangqiPlayerView(
  state: MiniXiangqiGameState,
  color: MiniXiangqiColor,
): MiniXiangqiPlayerView {
  const vision = computeMiniXiangqiVision(state, color);
  const board: MiniXiangqiPlayerBoard = {};

  for (const sq of vision.directlyVisible) {
    const piece = state.board[sq];
    if (piece) mergeMiniXiangqiPlayerBoardEntry(board, sq, { piece, shrouded: false });
  }
  for (const sq of vision.shroudedBlockers) {
    const piece = state.board[sq];
    if (piece) {
      mergeMiniXiangqiPlayerBoardEntry(board, sq, { color: piece.color, shrouded: true });
    }
  }
  for (const sq of vision.cannonScreens) {
    const piece = state.board[sq];
    if (piece) {
      mergeMiniXiangqiPlayerBoardEntry(board, sq, { color: piece.color, shrouded: true });
    }
  }
  for (const sq of vision.cannonTargets) {
    const piece = state.board[sq];
    if (piece) mergeMiniXiangqiPlayerBoardEntry(board, sq, { piece, shrouded: false });
  }

  const visibleSquares = [
    ...new Set<MiniXiangqiSquare>([
      ...vision.directlyVisible,
      ...vision.shroudedBlockers,
      ...vision.cannonScreens,
      ...vision.cannonTargets,
    ]),
  ].sort();
  const legalMoves =
    state.status.type === 'playing'
      ? getMiniXiangqiLegalMoves({ ...state, status: { type: 'playing', turn: color } })
      : [];

  return {
    id: state.id,
    perspective: color,
    board,
    visibleSquares,
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function rayMovesInto(
  moves: MiniXiangqiMove[],
  board: MiniXiangqiBoard,
  from: MiniXiangqiSquare,
  color: MiniXiangqiColor,
  file: number,
  rank: number,
  cannon: boolean,
): void {
  for (const [df, dr] of orthogonalDirections()) {
    let f = file + df;
    let r = rank + dr;
    if (!cannon) {
      while (miniXiangqiInBounds(f, r)) {
        const to = miniXiangqiSquareOf(f, r);
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
      continue;
    }

    while (miniXiangqiInBounds(f, r) && !miniXiangqiIsOccupied(board, f, r)) {
      moves.push({ from, to: miniXiangqiSquareOf(f, r) });
      f += df;
      r += dr;
    }
    if (!miniXiangqiInBounds(f, r)) continue;
    f += df;
    r += dr;
    while (miniXiangqiInBounds(f, r) && !miniXiangqiIsOccupied(board, f, r)) {
      f += df;
      r += dr;
    }
    if (!miniXiangqiInBounds(f, r)) continue;
    const to = miniXiangqiSquareOf(f, r);
    if (board[to]?.color !== color) moves.push({ from, to });
  }
}

function hasMiniXiangqiLegalMove(board: MiniXiangqiBoard, color: MiniXiangqiColor): boolean {
  const state: MiniXiangqiGameState = {
    id: 'move-check',
    board,
    status: { type: 'playing', turn: color },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  return getMiniXiangqiLegalMoves(state).length > 0;
}

function hasMiniXiangqiOpenLegalMove(board: MiniXiangqiBoard, color: MiniXiangqiColor): boolean {
  const state: MiniXiangqiGameState = {
    id: 'open-move-check',
    board,
    status: { type: 'playing', turn: color },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  return getMiniXiangqiOpenLegalMoves(state).length > 0;
}

function isMiniXiangqiOpenBoardMoveLegal(
  board: MiniXiangqiBoard,
  move: MiniXiangqiMove,
  color: MiniXiangqiColor,
): boolean {
  if (board[move.to]?.role === 'general') return false;
  const next = miniXiangqiBoardAfterMove(board, move);
  return !isMiniXiangqiGeneralInCheckOnBoard(next, color);
}

export function isMiniXiangqiGeneralInCheckOnBoard(
  board: MiniXiangqiBoard,
  color: MiniXiangqiColor,
): boolean {
  const general = findMiniXiangqiGeneral(board, color);
  if (!general) return true;
  return isMiniXiangqiSquareAttacked(board, oppositeMiniXiangqiColor(color), general);
}

function isMiniXiangqiSquareAttacked(
  board: MiniXiangqiBoard,
  byColor: MiniXiangqiColor,
  target: MiniXiangqiSquare,
): boolean {
  const attackState: MiniXiangqiGameState = {
    id: 'mini-attack-check',
    board,
    status: { type: 'playing', turn: byColor },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  for (const [square, piece] of Object.entries(board)) {
    if (!piece || piece.color !== byColor || piece.role === 'general') continue;
    if (
      getMiniXiangqiLegalMovesFrom(attackState, square as MiniXiangqiSquare).some(
        (move) => move.to === target,
      )
    ) {
      return true;
    }
  }

  const enemyGeneral = findMiniXiangqiGeneral(board, byColor);
  if (!enemyGeneral) return false;
  const attacker = miniXiangqiCoordOf(enemyGeneral);
  const attacked = miniXiangqiCoordOf(target);
  if (attacker.file !== attacked.file || attacker.rank === attacked.rank) return false;
  const lo = Math.min(attacker.rank, attacked.rank);
  const hi = Math.max(attacker.rank, attacked.rank);
  for (let rank = lo + 1; rank < hi; rank += 1) {
    if (board[miniXiangqiSquareOf(attacker.file, rank)]) return false;
  }
  return true;
}

function findMiniXiangqiGeneral(
  board: MiniXiangqiBoard,
  color: MiniXiangqiColor,
): MiniXiangqiSquare | null {
  for (const [square, piece] of Object.entries(board)) {
    if (piece?.color === color && piece.role === 'general') return square as MiniXiangqiSquare;
  }
  return null;
}

function miniXiangqiFacingGeneralCaptureTarget(
  board: MiniXiangqiBoard,
  from: MiniXiangqiSquare,
  piece: MiniXiangqiPiece,
): MiniXiangqiSquare | null {
  if (piece.role !== 'general') return null;
  const origin = miniXiangqiCoordOf(from);
  for (const [sq, target] of Object.entries(board)) {
    if (target?.role !== 'general' || target.color === piece.color) continue;
    const enemy = miniXiangqiCoordOf(sq as MiniXiangqiSquare);
    if (enemy.file !== origin.file) continue;
    const minR = Math.min(origin.rank, enemy.rank);
    const maxR = Math.max(origin.rank, enemy.rank);
    let clear = true;
    for (let rank = minR + 1; rank < maxR; rank += 1) {
      if (miniXiangqiIsOccupied(board, origin.file, rank)) {
        clear = false;
        break;
      }
    }
    if (clear) return sq as MiniXiangqiSquare;
  }
  return null;
}

function generalVisionInto(
  set: Set<MiniXiangqiSquare>,
  color: MiniXiangqiColor,
  board: MiniXiangqiBoard,
  file: number,
  rank: number,
): void {
  // Confine the general's reach to the palace it currently occupies. During play
  // move-gen keeps the general in its own palace, so `palaceColor` is `color` and
  // this is identical to the original own-palace check. The enemy-palace branch
  // only fires after the game-ending fly-capture (status is then `finished`), so
  // the winner gains vision around where its general landed (e.g. e7 -> d7, e6)
  // instead of going dark. View-only: move generation and termination never call
  // this, so the change cannot affect game logic.
  const palaceColor = miniXiangqiInPalace(oppositeMiniXiangqiColor(color), file, rank)
    ? oppositeMiniXiangqiColor(color)
    : color;
  for (const [df, dr] of orthogonalDirections()) {
    const f = file + df;
    const r = rank + dr;
    if (miniXiangqiInPalace(palaceColor, f, r)) addIfMiniXiangqiOnBoard(set, f, r);
  }
  const own = miniXiangqiSquareOf(file, rank);
  const piece = board[own];
  const facing = piece ? miniXiangqiFacingGeneralCaptureTarget(board, own, piece) : null;
  if (facing) set.add(facing);
}

function soldierVisionInto(
  set: Set<MiniXiangqiSquare>,
  color: MiniXiangqiColor,
  file: number,
  rank: number,
): void {
  const forward = color === 'red' ? 1 : -1;
  addIfMiniXiangqiOnBoard(set, file, rank + forward);
  addIfMiniXiangqiOnBoard(set, file - 1, rank);
  addIfMiniXiangqiOnBoard(set, file + 1, rank);
}

function mergeMiniXiangqiPlayerBoardEntry(
  board: MiniXiangqiPlayerBoard,
  square: MiniXiangqiSquare,
  entry: MiniXiangqiVisibleBoardEntry,
): void {
  const existing = board[square];
  if (!existing || (existing.shrouded && !entry.shrouded)) {
    board[square] = entry;
  }
}

function miniXiangqiIsOccupied(board: MiniXiangqiBoard, file: number, rank: number): boolean {
  return miniXiangqiInBounds(file, rank) && board[miniXiangqiSquareOf(file, rank)] !== undefined;
}

function addIfMiniXiangqiOnBoard(set: Set<MiniXiangqiSquare>, file: number, rank: number): void {
  if (miniXiangqiInBounds(file, rank)) set.add(miniXiangqiSquareOf(file, rank));
}

function orthogonalDirections(): readonly (readonly [number, number])[] {
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
}
