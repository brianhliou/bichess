// Sound policy for Reveal Chess (chess with hidden identities).
//
// Positions are public; only piece IDENTITY hides (every piece face-down but the
// king). A piece reveals (flips face-up) when it MOVES, which is public; a
// face-down piece that is CAPTURED reveals only to the capturer (the captured
// piece leaves the board, so a board diff never carries its identity to the
// victim). The classifier drives the flip off public board signals only, so a
// private capture-reveal lands as a plain `captured` and never leaks through
// audio. (jieqi's pattern, with chess pieces and an always-face-up king.)

import type {
  RevealChessColor,
  RevealChessGameStatus,
  RevealChessMove,
  RevealChessPieceRole,
  RevealChessSquare,
} from '@mistboard/game';
import { playSound, playTerminalPlan } from './live-sound.js';
import type { SoundKind } from './live-state.js';

// Mirrors the client's redacted RevealChessWireView: a face-down entry carries
// colour but no role.
type RevealSoundEntry =
  | { color: RevealChessColor; role: RevealChessPieceRole; faceDown: false }
  | { color: RevealChessColor; faceDown: true };
type RevealSoundView = {
  board: Partial<Record<RevealChessSquare, RevealSoundEntry>>;
  perspective: RevealChessColor;
  status: RevealChessGameStatus;
  moveNumber: number;
  lastMove?: RevealChessMove;
};

type Seat = RevealChessColor | 'spectator' | null;

let lastView: RevealSoundView | null = null;
let lastTerminalKey: string | null = null;

export function resetRevealChessSoundState(): void {
  lastView = null;
  lastTerminalKey = null;
}

// Capturing the (always face-up) enemy king wins -> king-capture; any other
// capture is a capture. With no capture, moving one of your own face-down pieces
// reveals it -> flip.
export function soundForOwnRevealChessMove(
  view: RevealSoundView | null,
  move: RevealChessMove,
): SoundKind {
  if (!view) return 'move';
  const mover = view.board[move.from];
  const target = view.board[move.to];
  if (target && target.color !== view.perspective) {
    if (!target.faceDown && target.role === 'king') return 'king-capture';
    return 'capture';
  }
  if (mover?.faceDown) return 'flip';
  return 'move';
}

export function maybePlayRevealChessSnapshotSound(view: RevealSoundView | null, seat: Seat): void {
  if (lastView === null) {
    lastView = view;
    lastTerminalKey = revealChessTerminalSoundKey(view, seat);
    return;
  }

  const terminal = revealChessTerminalSoundKey(view, seat);
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

  const kind = classifyRevealChessOpponentSound(lastView, view, seat);
  if (kind) playSound(kind);
  lastView = view;
}

export function revealChessTerminalSoundKey(
  view: RevealSoundView | null,
  seat: Seat,
): string | null {
  if (view?.status.type !== 'finished') return null;
  if (seat !== 'white' && seat !== 'black') return null;
  if (view.status.winner === null) return `draw:${view.moveNumber}`;
  return view.status.winner === seat ? `win:${view.moveNumber}` : `lose:${view.moveNumber}`;
}

export function classifyRevealChessOpponentSound(
  prev: RevealSoundView | null,
  next: RevealSoundView | null,
  seat: Seat,
): SoundKind | null {
  if (seat !== 'white' && seat !== 'black') return null;
  if (!prev || !next) return null;
  if (prev.status.type !== 'playing') return null;
  if (prev.status.turn === seat) return null;
  if (next.status.type === 'playing' && next.status.turn !== seat) return null;
  if (ownPieceCount(next, seat) < ownPieceCount(prev, seat)) return 'captured';
  const revealedFrom = next.lastMove?.from;
  if (revealedFrom && prev.board[revealedFrom]?.faceDown) return 'flip';
  return 'move';
}

function ownPieceCount(view: RevealSoundView, color: RevealChessColor): number {
  let count = 0;
  for (const entry of Object.values(view.board)) {
    if (entry && entry.color === color) count += 1;
  }
  return count;
}
