// Sound policy for Drop Mini Xiangqi.
//
// Drop Mini Xiangqi is PERFECT-INFORMATION (no fog, no shrouding): both seats see
// the full board, so every move can be sounded precisely. A piece placed from hand
// is a `drop`; board moves are cannon-capture / king-capture (the general) / capture
// / move. The opponent classifier diffs the visible board: a captured own piece is
// 'captured', a freshly dropped enemy piece is 'drop', anything else is a plain
// 'move'. It only ever reads piece counts, never an identity the seat is not shown.

import type {
  DropMiniXiangqiMove,
  DropMiniXiangqiPlayerView,
  MiniXiangqiColor,
} from '@mistboard/game';
import { playSound, playTerminalPlan } from './live-sound.js';
import type { SoundKind } from './live-state.js';

type Seat = MiniXiangqiColor | 'spectator' | null;

let lastView: DropMiniXiangqiPlayerView | null = null;
let lastTerminalKey: string | null = null;

export function resetDropMiniXiangqiSoundState(): void {
  lastView = null;
  lastTerminalKey = null;
}

function isDropMove(
  move: DropMiniXiangqiMove,
): move is Extract<DropMiniXiangqiMove, { drop: unknown }> {
  return 'drop' in move;
}

// The seated player's own move. A drop from hand is a `drop`; a board move reads the
// (fully visible) target: the enemy general is the terminal king-capture, a capturing
// cannon gets its slam-the-board boom, any other enemy is a plain capture.
export function soundForOwnDropMiniXiangqiMove(
  view: DropMiniXiangqiPlayerView | null,
  move: DropMiniXiangqiMove,
): SoundKind {
  if (isDropMove(move)) return 'drop';
  if (!view) return 'move';
  const target = view.board[move.to];
  if (!target) return 'move';
  const mover = view.board[move.from];
  const moverColor = mover ? mover.color : view.perspective;
  if (target.color === moverColor) return 'move';
  if (target.role === 'general') return 'king-capture';
  return mover?.role === 'cannon' ? 'cannon-capture' : 'capture';
}

// Snapshot observer, called once per applied server frame (snapshot/event-appended)
// from the socket layer.
export function maybePlayDropMiniXiangqiSnapshotSound(
  view: DropMiniXiangqiPlayerView | null,
  seat: Seat,
): void {
  if (lastView === null) {
    lastView = view;
    lastTerminalKey = dropMiniXiangqiTerminalSoundKey(view, seat);
    return;
  }

  const terminal = dropMiniXiangqiTerminalSoundKey(view, seat);
  if (terminal && terminal !== lastTerminalKey) {
    lastTerminalKey = terminal;
    const result = terminal.startsWith('win')
      ? 'win'
      : terminal.startsWith('draw')
        ? 'draw'
        : 'lose';
    // A captured general ('general-captured') becomes the king-fall sting for the
    // loser; the winner already heard the king-capture arpeggio at submit time.
    const reason = view?.status.type === 'finished' ? view.status.reason : null;
    playTerminalPlan(result, reason);
    lastView = view;
    return;
  }

  const kind = classifyDropMiniXiangqiOpponentSound(lastView, view, seat);
  if (kind) playSound(kind);
  lastView = view;
}

export function dropMiniXiangqiTerminalSoundKey(
  view: DropMiniXiangqiPlayerView | null,
  seat: Seat,
): string | null {
  if (view?.status.type !== 'finished') return null;
  if (seat !== 'red' && seat !== 'black') return null;
  if (view.status.winner === null) return `draw:${view.moveNumber}`;
  return view.status.winner === seat ? `win:${view.moveNumber}` : `lose:${view.moveNumber}`;
}

// Classify the opponent's just-completed action from the visible board delta. Fires
// only for a completed opponent move (it was the opponent's turn, now it is ours or
// the game ended). A drop in our own piece count is 'captured'; a rise in the
// opponent's piece count is a 'drop' from hand (only a drop adds a piece); otherwise
// a plain 'move'. Counts only, so no hidden identity is read. Exported pure for tests.
export function classifyDropMiniXiangqiOpponentSound(
  prev: DropMiniXiangqiPlayerView | null,
  next: DropMiniXiangqiPlayerView | null,
  seat: Seat,
): SoundKind | null {
  if (seat !== 'red' && seat !== 'black') return null;
  if (!prev || !next) return null;
  if (prev.status.type !== 'playing') return null;
  if (prev.status.turn === seat) return null;
  if (next.status.type === 'playing' && next.status.turn !== seat) return null;
  const opponent: MiniXiangqiColor = seat === 'red' ? 'black' : 'red';
  if (pieceCount(next, seat) < pieceCount(prev, seat)) return 'captured';
  if (pieceCount(next, opponent) > pieceCount(prev, opponent)) return 'drop';
  return 'move';
}

function pieceCount(view: DropMiniXiangqiPlayerView, color: MiniXiangqiColor): number {
  let count = 0;
  for (const piece of Object.values(view.board)) {
    if (piece && piece.color === color) count += 1;
  }
  return count;
}
