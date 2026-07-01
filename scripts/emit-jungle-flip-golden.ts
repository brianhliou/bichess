// Golden-vector emitter for the Flip Jungle engine parity test.
//
// Runs seeded random playouts of the CANONICAL ruleset (variants-jungle-flip.ts) and
// records, per ply: the masked board, mover INK, no-progress clock, terminal status,
// and the sorted legal-move set — plus the chosen move (with the revealed piece on a
// flip, so the engine can replay). The Python engine (`fow_chess.jungle_flip`) asserts
// byte-identical movegen / apply / terminal against this. The shared cross-repo
// artifact is THIS JSON, not code.
//
// Inks (not seats) are emitted throughout to dodge the seat↔ink confusion. Repetition
// is disabled (huge repetitionDrawCount) so terminals are only elimination / no-move /
// no-progress — matching the engine, which handles repetition via search-time cycle
// detection, not state-encoded rep counts.
//
// Run:  npx tsx scripts/emit-jungle-flip-golden.ts > /path/to/jungle_flip_golden.json

import {
  ALL_JUNGLE_FLIP_SQUARES,
  applyJungleFlipMove,
  createInitialJungleFlipState,
  createJungleFlipDeal,
  getJungleFlipLegalMoves,
  type JungleFlipGameState,
  type JungleFlipMove,
  jungleFlipInkForSeat,
  jungleFlipMoverInk,
} from '../packages/game/src/variants-jungle-flip.js';

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const ROLE_LETTER: Record<string, string> = {
  rat: 'R',
  cat: 'C',
  dog: 'D',
  wolf: 'W',
  leopard: 'P',
  tiger: 'T',
  lion: 'L',
  elephant: 'E',
};

// 16-char masked board in canonical index order (a1=0 … d4=15): '.' empty, 'x'
// face-down, letter upper=red / lower=black for a revealed piece. Matches the engine.
function maskString(state: JungleFlipGameState): string {
  return ALL_JUNGLE_FLIP_SQUARES.map((sq) => {
    const p = state.board[sq];
    if (!p) return '.';
    if (p.faceDown) return 'x';
    const l = ROLE_LETTER[p.role];
    return p.color === 'red' ? l : l.toLowerCase();
  }).join('');
}

function moveTag(m: JungleFlipMove): string {
  return `${m.from}${m.to}`;
}

// Terminal status as the engine reports it: 'playing' | 'draw' | winner INK.
function statusTag(state: JungleFlipGameState): string {
  const st = state.status;
  if (st.type === 'playing') return 'playing';
  if (st.type === 'finished') {
    if (st.winner === null) return 'draw';
    const ink = jungleFlipInkForSeat(state, st.winner);
    return ink ?? 'draw';
  }
  return 'aborted';
}

const APPLY_OPTS = {
  noProgressClockLimit: 40,
  repetitionDrawCount: 1_000_000,
  // Dead-position adjudication is a server-side draw rule the engine doesn't model,
  // so keep it off here or terminals would diverge from the engine's.
  adjudicateDeadPosition: false,
};
const MAX_PLIES = 300;

function playGame(seed: number) {
  const state0 = createInitialJungleFlipState(`g${seed}`, createJungleFlipDeal(seededRng(seed)));
  const rng = seededRng(seed ^ 0x9e3779b9);
  const frames: unknown[] = [];
  const moves: unknown[] = [];

  let state = state0;
  for (let ply = 0; ply < MAX_PLIES; ply += 1) {
    const legal = getJungleFlipLegalMoves(state);
    frames.push({
      mask: maskString(state),
      mover: jungleFlipMoverInk(state) ?? '?',
      noProgress: state.noProgressClock,
      status: statusTag(state),
      legalMoves: legal.map(moveTag).sort(),
    });
    if (state.status.type !== 'playing' || legal.length === 0) break;

    const mv = legal[Math.floor(rng() * legal.length)]!;
    // On a flip the revealed identity is the (face-down) piece already on that square.
    const flipped = mv.from === mv.to ? state.board[mv.from] : undefined;
    moves.push({
      from: mv.from,
      to: mv.to,
      revealed: flipped ? { color: flipped.color, role: flipped.role } : null,
    });
    state = applyJungleFlipMove(state, mv, APPLY_OPTS);
  }
  return { seed, frames, moves };
}

const SEEDS = [1, 2, 3, 7, 13, 42, 99, 123, 777, 2026, 31337, 55555];
const games = SEEDS.map(playGame);
process.stdout.write(JSON.stringify({ version: 1, noProgressLimit: 40, games }, null, 0));
