// Sound policy for Dark Crazyhouse.
//
// Crazyhouse is a field-of-fire fog variant whose board IS a chess board, plus a
// hand. A piece placed from hand is a `drop`; board moves reuse the shared chess
// classifier (capture / castle / king-capture / move). The opponent classifier
// diffs the visible-piece count, so it never reads a fogged square; an opponent's
// drop into the fog simply reads as a plain `move`.

import type {
  Color,
  CrazyhousePlayerView,
  Move,
  PieceRole,
  PlayerView,
  Square,
} from '@mistboard/game';
import { playSound, playTerminalPlan, soundForOwnMove } from './live-sound.js';
import type { SoundKind } from './live-state.js';

type Seat = Color | 'spectator' | null;

let lastView: CrazyhousePlayerView | null = null;
let lastTerminalKey: string | null = null;

export function resetDarkCrazyhouseSoundState(): void {
  lastView = null;
  lastTerminalKey = null;
}

// The wire encodes a drop as `from: '*<role-letter>'`; board moves carry a real
// square. Board moves reuse soundForOwnMove, which reads only `.board` — the
// chess board crazyhouse inherits — so passing the view through is safe.
export function soundForOwnDarkCrazyhouseMove(
  view: CrazyhousePlayerView | null,
  move: { from: string; to: Square; promotion?: PieceRole },
): SoundKind {
  if (move.from.startsWith('*')) return 'drop';
  return soundForOwnMove(view as unknown as PlayerView | null, move as Move);
}

export function maybePlayDarkCrazyhouseSnapshotSound(
  view: CrazyhousePlayerView | null,
  seat: Seat,
): void {
  if (lastView === null) {
    lastView = view;
    lastTerminalKey = darkCrazyhouseTerminalSoundKey(view, seat);
    return;
  }

  const terminal = darkCrazyhouseTerminalSoundKey(view, seat);
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

  const kind = classifyDarkCrazyhouseOpponentSound(lastView, view, seat);
  if (kind) playSound(kind);
  lastView = view;
}

export function darkCrazyhouseTerminalSoundKey(
  view: CrazyhousePlayerView | null,
  seat: Seat,
): string | null {
  if (view?.status.type !== 'finished') return null;
  if (seat !== 'white' && seat !== 'black') return null;
  if (view.status.winner === null) return `draw:${view.moveNumber}`;
  return view.status.winner === seat ? `win:${view.moveNumber}` : `lose:${view.moveNumber}`;
}

export function classifyDarkCrazyhouseOpponentSound(
  prev: CrazyhousePlayerView | null,
  next: CrazyhousePlayerView | null,
  seat: Seat,
): SoundKind | null {
  if (seat !== 'white' && seat !== 'black') return null;
  if (!prev || !next) return null;
  if (prev.status.type !== 'playing') return null;
  if (prev.status.turn === seat) return null;
  if (next.status.type === 'playing' && next.status.turn !== seat) return null;
  return ownPieceCount(next, seat) < ownPieceCount(prev, seat) ? 'captured' : 'move';
}

function ownPieceCount(view: CrazyhousePlayerView, color: Color): number {
  let count = 0;
  for (const piece of Object.values(view.board)) {
    if (piece && piece.color === color) count += 1;
  }
  return count;
}
