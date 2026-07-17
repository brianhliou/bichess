// Sound policy for Crossroads Chess.
//
// Crossroads uses its own live client and open/xiangqi-style PlayerView shape,
// so it cannot call the chess PlayerView helpers in live-sound.ts directly. This
// module keeps the variant-specific classification small and reuses the shared
// SoundController through playSound().

import type {
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessPlayerView,
} from '@mistboard/game';
import { playSound, playTerminalPlan } from './live-sound.js';
import type { SoundKind } from './live-state.js';

let lastView: CrossroadsChessPlayerView | null = null;
let lastTerminalKey: string | null = null;

export function resetCrossroadsChessSoundState(): void {
  lastView = null;
  lastTerminalKey = null;
}

export function soundForOwnCrossroadsChessMove(
  view: CrossroadsChessPlayerView | null,
  move: CrossroadsChessMove,
): SoundKind {
  if (!view) return 'move';
  const target = view.board[move.to];
  if (!target) return 'move';
  const fromEntry = view.board[move.from];
  // Your own pieces are never shrouded in your own view, so a capturing
  // cannon's boom is leak-safe: it only describes your own piece.
  const moverIsCannon = fromEntry && !fromEntry.shrouded && fromEntry.piece.role === 'cannon';
  const mover = fromEntry && !fromEntry.shrouded ? fromEntry.piece.color : view.perspective;
  if (target.shrouded) return moverIsCannon ? 'cannon-capture' : 'capture';
  if (target.piece.color === mover) return 'move';
  if (target.piece.role === 'king') return 'king-capture';
  return moverIsCannon ? 'cannon-capture' : 'capture';
}

export function maybePlayCrossroadsChessSnapshotSound(
  view: CrossroadsChessPlayerView | null,
  seat: CrossroadsChessColor | 'spectator' | null,
): void {
  if (lastView === null) {
    lastView = view;
    lastTerminalKey = crossroadsChessTerminalSoundKey(view, seat);
    return;
  }

  const terminal = crossroadsChessTerminalSoundKey(view, seat);
  if (terminal && terminal !== lastTerminalKey) {
    lastTerminalKey = terminal;
    const result = terminal.startsWith('win')
      ? 'win'
      : terminal.startsWith('draw')
        ? 'draw'
        : 'lose';
    const reason = view?.status.type === 'finished' ? view.status.reason : null;
    playTerminalPlan(result, reason);
    lastView = view;
    return;
  }

  const opponentKind = classifyCrossroadsChessOpponentSound(lastView, view, seat);
  if (opponentKind) playSound(opponentKind);
  lastView = view;
}

export function crossroadsChessTerminalSoundKey(
  view: CrossroadsChessPlayerView | null,
  seat: CrossroadsChessColor | 'spectator' | null,
): string | null {
  if (view?.status.type !== 'finished') return null;
  if (seat !== 'white' && seat !== 'red') return null;
  if (view.status.winner === null) return `draw:${view.moveNumber}`;
  return view.status.winner === seat ? `win:${view.moveNumber}` : `lose:${view.moveNumber}`;
}

export function classifyCrossroadsChessOpponentSound(
  prev: CrossroadsChessPlayerView | null,
  next: CrossroadsChessPlayerView | null,
  seat: CrossroadsChessColor | 'spectator' | null,
): SoundKind | null {
  if (seat !== 'white' && seat !== 'red') return null;
  if (!prev || !next) return null;
  if (prev.status.type !== 'playing') return null;
  if (prev.status.turn === seat) return null;
  if (next.status.type === 'playing' && next.status.turn !== seat) return null;
  return ownVisiblePieceCount(next, seat) < ownVisiblePieceCount(prev, seat) ? 'captured' : 'move';
}

function ownVisiblePieceCount(
  view: CrossroadsChessPlayerView,
  color: CrossroadsChessColor,
): number {
  let count = 0;
  for (const entry of Object.values(view.board)) {
    if (entry && !entry.shrouded && entry.piece.color === color) count += 1;
  }
  return count;
}
