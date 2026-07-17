// Sound policy for Dark Shogi.
//
// Dark Shogi is a field-of-fire fog variant (no silhouettes -- off-vision pieces
// are simply absent from the board). A piece placed from hand is a `drop`; board
// moves are capture / king-capture / move. The opponent classifier diffs the
// visible-piece count, so it never reads an off-vision square.

import type { ShogiColor, ShogiPlayerView, ShogiSquare } from '@mistboard/game';
import { playSound, playTerminalPlan } from './live-sound.js';
import type { SoundKind } from './live-state.js';

type Seat = ShogiColor | 'spectator' | null;

let lastView: ShogiPlayerView | null = null;
let lastTerminalKey: string | null = null;

export function resetDarkShogiSoundState(): void {
  lastView = null;
  lastTerminalKey = null;
}

// The wire encodes a drop as `from: '*<piece>'`. Board moves classify against the
// view; your own pieces are always visible, so reading the target is leak-safe.
export function soundForOwnDarkShogiMove(
  view: ShogiPlayerView | null,
  move: { from: string; to: ShogiSquare },
): SoundKind {
  if (move.from.startsWith('*')) return 'drop';
  if (!view) return 'move';
  const target = view.board[move.to];
  if (!target) return 'move';
  const mover = view.board[move.from as ShogiSquare];
  const moverColor = mover ? mover.color : view.perspective;
  if (target.color === moverColor) return 'move';
  return target.role === 'K' ? 'king-capture' : 'capture';
}

export function maybePlayDarkShogiSnapshotSound(view: ShogiPlayerView | null, seat: Seat): void {
  if (lastView === null) {
    lastView = view;
    lastTerminalKey = darkShogiTerminalSoundKey(view, seat);
    return;
  }

  const terminal = darkShogiTerminalSoundKey(view, seat);
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

  const kind = classifyDarkShogiOpponentSound(lastView, view, seat);
  if (kind) playSound(kind);
  lastView = view;
}

export function darkShogiTerminalSoundKey(view: ShogiPlayerView | null, seat: Seat): string | null {
  if (view?.status.type !== 'finished') return null;
  if (seat !== 'black' && seat !== 'white') return null;
  if (view.status.winner === null) return `draw:${view.moveNumber}`;
  return view.status.winner === seat ? `win:${view.moveNumber}` : `lose:${view.moveNumber}`;
}

export function classifyDarkShogiOpponentSound(
  prev: ShogiPlayerView | null,
  next: ShogiPlayerView | null,
  seat: Seat,
): SoundKind | null {
  if (seat !== 'black' && seat !== 'white') return null;
  if (!prev || !next) return null;
  if (prev.status.type !== 'playing') return null;
  if (prev.status.turn === seat) return null;
  if (next.status.type === 'playing' && next.status.turn !== seat) return null;
  return ownPieceCount(next, seat) < ownPieceCount(prev, seat) ? 'captured' : 'move';
}

function ownPieceCount(view: ShogiPlayerView, color: ShogiColor): number {
  let count = 0;
  for (const piece of Object.values(view.board)) {
    if (piece && piece.color === color) count += 1;
  }
  return count;
}
