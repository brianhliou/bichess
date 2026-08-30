// Golden-vector emitter for the vanilla Jungle engine parity test.
//
// Runs seeded random playouts of the CANONICAL ruleset (variants-jungle.ts) and records,
// per ply: the position as the engine's FEN (see jungle-engine-build-scope-2026-06-25.md §2),
// the terminal status, and the sorted legal-move set — plus the chosen move. The Rust engine
// (`jungle_rust`) asserts byte-identical movegen / apply / terminal against this. The shared
// cross-repo artifact is THIS JSON, not code.
//
// Repetition is disabled (huge repetitionDrawCount) so terminals are only den-entry /
// capture-all / stalemate / no-progress — matching the engine, which handles repetition via
// search-time cycle detection, not state-encoded rep counts.
//
// The no-progress limit is TAKEN FROM THE KERNEL, not restated here. It used to be pinned to a
// literal 100 "to match the engine's hardcoded threshold", which meant raising the rule left
// this emitter quietly generating fixtures under the old one, and the parity gate then failed
// against goldens that no kernel actually produces.
//
// Run:  cd ~/projects/mistboard && node_modules/.bin/tsx scripts/emit-jungle-golden.ts \
//          > ~/projects/mistboard-engine/tests/fixtures/jungle_golden.json

import {
  applyJungleMove,
  createInitialJungleState,
  DEFAULT_JUNGLE_PROGRESS_CLOCK_LIMIT,
  getJungleLegalMoves,
  JUNGLE_ROLE_LETTER,
  type JungleColor,
  type JungleGameState,
  type JungleMove,
  oppositeJungleColor,
} from '../packages/game/src/variants-jungle.js';

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const FILES = 'abcdefg';

// Engine FEN: "<board> <turn> <progressClock> <moveNumber>"; ranks 9→1, files a→g; piece
// letter upper=red / lower=black; run-length digits for empties; '/' between ranks.
function jungleToFen(state: JungleGameState, turn: JungleColor): string {
  let board = '';
  for (let rank = 9; rank >= 1; rank -= 1) {
    let empties = 0;
    for (let file = 0; file < 7; file += 1) {
      const sq = `${FILES[file]}${rank}` as keyof typeof state.board;
      const p = state.board[sq];
      if (!p) {
        empties += 1;
      } else {
        if (empties > 0) {
          board += empties;
          empties = 0;
        }
        const l = JUNGLE_ROLE_LETTER[p.role];
        board += p.color === 'red' ? l : l.toLowerCase();
      }
    }
    if (empties > 0) board += empties;
    if (rank > 1) board += '/';
  }
  return `${board} ${turn === 'red' ? 'r' : 'b'} ${state.progressClock} ${state.moveNumber}`;
}

function moveTag(m: JungleMove): string {
  return `${m.from}${m.to}`;
}

// Terminal status as the engine reports it: 'playing' | 'draw' | winner colour.
function statusTag(state: JungleGameState): string {
  const st = state.status;
  if (st.type === 'playing') return 'playing';
  if (st.type === 'finished') return st.winner === null ? 'draw' : st.winner;
  return 'aborted';
}

const APPLY_OPTS = {
  progressClockLimit: DEFAULT_JUNGLE_PROGRESS_CLOCK_LIMIT,
  repetitionDrawCount: 1_000_000,
};
// Playouts are random, so the no-progress clock is what ends most of them. The cap has to
// leave room for a game to reach that clock and emit its terminal frame; at 600 against a
// 200-ply clock some games were still running when the cap hit, and the fixture then held a
// final frame with no successor, which the parity test reads as a malformed game.
const MAX_PLIES = DEFAULT_JUNGLE_PROGRESS_CLOCK_LIMIT * 8;

function playGame(seed: number) {
  let state = createInitialJungleState(`g${seed}`);
  const rng = seededRng(seed ^ 0x9e3779b9);
  const frames: unknown[] = [];
  const moves: string[] = [];

  let turn: JungleColor = 'red';
  for (let ply = 0; ply < MAX_PLIES; ply += 1) {
    const legal = getJungleLegalMoves(state);
    frames.push({
      fen: jungleToFen(state, turn),
      status: statusTag(state),
      legalMoves: legal.map(moveTag).sort(),
    });
    if (state.status.type !== 'playing' || legal.length === 0) break;

    const mv = legal[Math.floor(rng() * legal.length)]!;
    moves.push(moveTag(mv));
    state = applyJungleMove(state, mv, APPLY_OPTS);
    turn = oppositeJungleColor(turn);
  }
  return { seed, frames, moves };
}

const SEEDS = [1, 2, 3, 7, 13, 42, 99, 123, 777, 2026, 31337, 55555];
const games = SEEDS.map(playGame);
process.stdout.write(
  JSON.stringify(
    { version: 1, progressLimit: DEFAULT_JUNGLE_PROGRESS_CLOCK_LIMIT, games },
    null,
    0,
  ),
);
