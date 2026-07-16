import {
  coordOf,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiPieceRole,
  type XiangqiSquare,
} from './variants-xiangqi.js';

const ROLE_TO_FEN: Record<XiangqiPieceRole, string> = {
  general: 'k',
  advisor: 'a',
  elephant: 'b',
  horse: 'n',
  chariot: 'r',
  cannon: 'c',
  soldier: 'p',
};

function fenPiece(role: XiangqiPieceRole, color: XiangqiColor): string {
  const code = ROLE_TO_FEN[role];
  return color === 'red' ? code.toUpperCase() : code;
}

function turnForKey(state: XiangqiGameState): XiangqiColor | '-' {
  return state.status.type === 'playing' ? state.status.turn : '-';
}

function turnFen(color: XiangqiColor | '-'): 'r' | 'b' | '-' {
  if (color === '-') return '-';
  return color === 'red' ? 'r' : 'b';
}

function squareAt(file: number, rank: number): XiangqiSquare {
  const fileChar = String.fromCharCode(97 + file);
  return `${fileChar}${rank}` as XiangqiSquare;
}

export function standardXiangqiPlacementKey(state: XiangqiGameState): string {
  const rows: string[] = [];
  for (let rank = 10; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 9; file += 1) {
      const piece = state.board[squareAt(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += fenPiece(piece.role, piece.color);
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

export function standardXiangqiPositionKey(state: XiangqiGameState): string {
  return `${standardXiangqiPlacementKey(state)} ${turnFen(turnForKey(state))}`;
}

export function standardXiangqiFen(state: XiangqiGameState): string {
  return `${standardXiangqiPositionKey(state)} - - ${state.progressClock} ${state.moveNumber}`;
}

// FEN a Fairy-Stockfish / Pikafish xiangqi engine will accept as `position fen`.
// This is DISTINCT from standardXiangqiFen (a dedup/repetition position KEY):
// the engine's xiangqi dialect writes the side-to-move as 'w' (red) / 'b'
// (black), where the position key uses 'r'/'b'. Placement (ranks 10..1, files
// a..i, uppercase = red) already matches the engine, so only the turn token and
// its always-present clock fields differ. A finished position has no side to
// move; default to 'w' since callers only analyse playable positions.
export function standardXiangqiEngineFen(state: XiangqiGameState): string {
  const turn = turnForKey(state);
  const turnToken = turn === 'black' ? 'b' : 'w';
  return `${standardXiangqiPlacementKey(state)} ${turnToken} - - ${state.progressClock} ${state.moveNumber}`;
}

export function standardXiangqiMoveUci(move: { from: XiangqiSquare; to: XiangqiSquare }): string {
  return `${move.from}${move.to}`;
}

export function compareXiangqiSquares(a: XiangqiSquare, b: XiangqiSquare): number {
  const ca = coordOf(a);
  const cb = coordOf(b);
  return ca.rank === cb.rank ? ca.file - cb.file : ca.rank - cb.rank;
}
