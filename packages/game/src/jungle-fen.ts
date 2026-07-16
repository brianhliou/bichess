// FEN bridge between canonical Jungle (Dou Shou Qi) state and the `jungle-engine`
// Rust UCI binary (jungle_rust::engine).
//
// Jungle is PERFECT-INFORMATION, so — unlike banqi/jieqi — there is no redaction:
// the full board is handed to the engine. The binary's FEN is
//   "<board> <turn> <progressClock> <moveNumber>"
// with ranks emitted HIGH→LOW (rank 9 first), files a..g left→right, run-length
// digits for empty squares, and '/' between ranks. Red pieces are UPPERCASE, black
// lowercase; role letters are R C D W P T L E (P = leoPard so L stays Lion) — the
// SAME mapping as JUNGLE_ROLE_LETTER, which keeps the kernel and the engine in
// lockstep. Parity against the binary is pinned by jungle-fen.test.ts.
//
// Lives in @mistboard/game (not apps/server) so the in-browser client engine
// (jungle-wasm) builds the identical FEN the server does — one encoder, both sides.

import {
  JUNGLE_HEIGHT,
  JUNGLE_ROLE_LETTER,
  JUNGLE_WIDTH,
  type JungleGameState,
  type JungleMove,
  type JungleSquare,
  jungleSquareOf,
} from './variants-jungle.js';

// Canonical state → the FEN the binary parses. Matches jungle_rust::engine::to_fen
// byte-for-byte (verified in jungle-fen.test.ts against binary-produced goldens).
export function jungleStateToEngineFen(state: JungleGameState): string {
  const rows: string[] = [];
  for (let rank = JUNGLE_HEIGHT; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < JUNGLE_WIDTH; file += 1) {
      const piece = state.board[jungleSquareOf(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      const letter = JUNGLE_ROLE_LETTER[piece.role];
      row += piece.color === 'red' ? letter : letter.toLowerCase();
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  // The engine is only queried mid-game, so turn is always defined; default to red
  // for type totality (a finished/aborted state is never sent to the engine).
  const turn = state.status.type === 'playing' ? state.status.turn : 'red';
  const turnChar = turn === 'red' ? 'r' : 'b';
  return `${rows.join('/')} ${turnChar} ${state.progressClock} ${state.moveNumber}`;
}

// The binary speaks "<from><to>" in the SAME algebraic coords as the kernel
// (files a..g, ranks 1..9), e.g. "d8d9". Jungle has no promotions/flips, so there
// is never a suffix.
export function jungleMoveToEngineUci(move: JungleMove): string {
  return `${move.from}${move.to}`;
}

const ENGINE_UCI_RE = /^([a-g][1-9])([a-g][1-9])$/;

export function engineUciToJungleMove(uci: string | null | undefined): JungleMove | null {
  if (!uci) return null;
  const match = ENGINE_UCI_RE.exec(uci.trim());
  if (!match) return null;
  return { from: match[1] as JungleSquare, to: match[2] as JungleSquare };
}
