// Sound policy for Dark Mini Xiangqi.
//
// The shared live-sound.ts helpers assume the chess PlayerView board shape
// ({ role, color }) and call the chess-only replayGameEvents, so the xiangqi
// runtime cannot route through maybePlaySnapshotSound directly. This module owns
// the variant-specific policy (which sound for which event) and reuses the shared
// SoundController via playSound(); only classification differs.
//
// The DMX view lives in liveState.state (cast), exactly as currentMiniView() reads
// it in the room module. Own moves are sounded optimistically at submit time; the
// snapshot observer handles opponent moves (fog-sanitized) and terminal win/lose.

import type { MiniXiangqiMove, MiniXiangqiPlayerView } from '@mistboard/game';
import { playSound, playTerminalPlan } from './live-sound.js';
import { liveState, type Seat, type SoundKind } from './live-state.js';

let lastView: MiniXiangqiPlayerView | null = null;
let lastTerminalKey: string | null = null;

export function resetDarkMiniXiangqiSoundState(): void {
  lastView = null;
  lastTerminalKey = null;
}

function currentMiniSoundView(): MiniXiangqiPlayerView | null {
  return liveState.state as unknown as MiniXiangqiPlayerView | null;
}

// Own-move sound, played at submit time before the snapshot round-trips. Reads the
// pre-move view: a destination occupied by an opponent piece is a capture (a hidden
// shrouded target has an unknown role, so it sounds as a plain capture; a visible
// general is the terminal capture).
export function soundForOwnMiniXiangqiMove(
  view: MiniXiangqiPlayerView | null,
  move: MiniXiangqiMove,
): SoundKind {
  if (!view) return 'move';
  const target = view.board[move.to];
  if (!target) return 'move';
  const fromEntry = view.board[move.from];
  // Your own pieces are never shrouded in your own view, so the mover's role
  // is always known: a capturing cannon gets its slam-the-board boom. This is
  // leak-safe because it only ever describes your own piece.
  const moverIsCannon = fromEntry && !fromEntry.shrouded && fromEntry.piece.role === 'cannon';
  if (target.shrouded) return moverIsCannon ? 'cannon-capture' : 'capture';
  const mover = fromEntry && !fromEntry.shrouded ? fromEntry.piece.color : view.perspective;
  if (target.piece.color === mover) return 'move';
  if (target.piece.role === 'general') return 'king-capture';
  return moverIsCannon ? 'cannon-capture' : 'capture';
}

// Snapshot observer, called once per applied server frame (hello/snapshot/
// event-appended) from the socket layer.
export function maybePlayDarkMiniXiangqiSnapshotSound(): void {
  const view = currentMiniSoundView();
  const seat = liveState.seat;

  if (lastView === null) {
    lastView = view;
    lastTerminalKey = miniXiangqiTerminalSoundKey(view, seat);
    return;
  }

  const terminal = miniXiangqiTerminalSoundKey(view, seat);
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

  const opponentKind = classifyMiniXiangqiOpponentSound(lastView, view, seat);
  if (opponentKind) playSound(opponentKind);
  lastView = view;
}

// No game-start sound here yet: the DMX view carries no clock (it lives in
// room-level state), so the waiting->playing transition is not visible to
// this observer. Unify with the chess room's game-start when the
// verticalization refactor merges the room state shapes.

// A win/lose/draw key, or null when the game is not finished or the viewer is
// a spectator. The moveNumber suffix lets the observer fire exactly once per
// distinct terminal. Exported pure for tests.
export function miniXiangqiTerminalSoundKey(
  view: MiniXiangqiPlayerView | null,
  seat: Seat,
): string | null {
  if (view?.status.type !== 'finished') return null;
  if (seat !== 'red' && seat !== 'black') return null;
  if (view.status.winner === null) return `draw:${view.moveNumber}`;
  return view.status.winner === seat ? `win:${view.moveNumber}` : `lose:${view.moveNumber}`;
}

// The fog-sanitized opponent-move sound: fires only for a completed opponent move
// (it was the opponent's turn before, and now it is ours or the game ended). A drop
// in our own visible piece count means a piece of ours was taken ('captured');
// otherwise a plain 'move'. Returns null when nothing should play (our own move,
// no completed opponent move yet, spectator). Exported pure for tests.
export function classifyMiniXiangqiOpponentSound(
  prev: MiniXiangqiPlayerView | null,
  next: MiniXiangqiPlayerView | null,
  seat: Seat,
): SoundKind | null {
  if (seat !== 'red' && seat !== 'black') return null;
  if (!prev || !next) return null;
  if (prev.status.type !== 'playing') return null;
  if (prev.status.turn === seat) return null;
  if (next.status.type === 'playing' && next.status.turn !== seat) return null;
  return ownVisiblePieceCount(next, seat) < ownVisiblePieceCount(prev, seat) ? 'captured' : 'move';
}

function ownVisiblePieceCount(view: MiniXiangqiPlayerView, color: 'red' | 'black'): number {
  let count = 0;
  for (const entry of Object.values(view.board)) {
    if (entry && !entry.shrouded && entry.piece.color === color) count += 1;
  }
  return count;
}
