import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createInitialJungleFlipState,
  type JungleFlipBoard,
  type JungleFlipGameState,
  type JungleFlipMove,
} from '@mistboard/game';
import { buildJungleFlipPositionCommand, jungleFlipTieSeed } from './jungle-flip-engine.js';
import {
  engineUciToJungleFlipMove,
  jungleFlipMoveToEngineUci,
  jungleFlipRepSeedFens,
  jungleFlipRepSignature,
  jungleFlipSquareToEngineUci,
  jungleFlipStateToEngineFen,
} from './jungle-flip-fen.js';

// These golden FENs are byte-shared with the engine's fen_vectors.json
// (mistboard-engine/jungle-flip-engine). The redaction boundary: a face-down tile is
// always 'X' (no ink, no role); the pool carries only public per-(ink,role) counts.

const BASE: Omit<
  JungleFlipGameState,
  'board' | 'firstColor' | 'ply' | 'moveNumber' | 'noProgressClock'
> = {
  id: 'test',
  status: { type: 'playing', turn: 'red' },
  repCounts: {},
  captures: [],
};

test('jungle-flip FEN: opening is all face-down, unbound turn, full pool', () => {
  const state = createInitialJungleFlipState('g1');
  assert.equal(
    jungleFlipStateToEngineFen(state),
    'XXXX/XXXX/XXXX/XXXX - R1C1D1W1P1T1L1E1r1c1d1w1p1t1l1e1 0 1',
  );
});

test('jungle-flip FEN: revealed pieces use ink casing; no face-down, empty pool', () => {
  // Engine golden vector: red lion a1, black cat a2, red to move, no pool.
  const state: JungleFlipGameState = {
    ...BASE,
    board: {
      a1: { color: 'red', role: 'lion', faceDown: false },
      a2: { color: 'black', role: 'cat', faceDown: false },
    },
    firstColor: 'red',
    ply: 2,
    moveNumber: 0,
    noProgressClock: 0,
  };
  assert.equal(jungleFlipStateToEngineFen(state), '4/4/c3/L3 r - 0 0');
});

test('jungle-flip FEN: face-down tiles emit X; pool is the hidden multiset (red then black)', () => {
  // Engine golden vector: red lion a1, black tiger b1 revealed; face-down at c2 and d4;
  // pool = red rat + black cat; red to move; clock 5; movenum 10.
  const state: JungleFlipGameState = {
    ...BASE,
    board: {
      a1: { color: 'red', role: 'lion', faceDown: false },
      b1: { color: 'black', role: 'tiger', faceDown: false },
      c2: { color: 'red', role: 'rat', faceDown: true },
      d4: { color: 'black', role: 'cat', faceDown: true },
    },
    firstColor: 'red',
    ply: 10,
    moveNumber: 10,
    noProgressClock: 5,
  };
  assert.equal(jungleFlipStateToEngineFen(state), '3X/4/2X1/Lt2 r R1c1 5 10');
});

test('jungle-flip FEN: a black-ink mover binds turn to b', () => {
  const state: JungleFlipGameState = {
    ...BASE,
    board: { a1: { color: 'black', role: 'rat', faceDown: false } },
    firstColor: 'red',
    ply: 1, // odd → black seat to move; with firstColor red, black seat owns black ink
    moveNumber: 3,
    noProgressClock: 1,
  };
  assert.equal(jungleFlipStateToEngineFen(state), '4/4/4/r3 b - 1 3');
});

test('jungle-flip UCI: square mapping is file + (rank-1)', () => {
  assert.equal(jungleFlipSquareToEngineUci('a1'), 'a0');
  assert.equal(jungleFlipSquareToEngineUci('d4'), 'd3');
  assert.equal(jungleFlipSquareToEngineUci('b3'), 'b2');
});

test('jungle-flip UCI: move <-> engine coord round-trips, flip is from==to', () => {
  const cases: JungleFlipMove[] = [
    { from: 'a1', to: 'a1' }, // flip
    { from: 'a1', to: 'b1' },
    { from: 'd4', to: 'd3' },
    { from: 'c2', to: 'c3' },
  ];
  for (const move of cases) {
    const uci = jungleFlipMoveToEngineUci(move);
    assert.deepEqual(engineUciToJungleFlipMove(uci), move);
  }
  assert.equal(jungleFlipMoveToEngineUci({ from: 'a1', to: 'a1' }), 'a0a0');
  assert.equal(jungleFlipMoveToEngineUci({ from: 'a1', to: 'b1' }), 'a0b0');
});

test('jungle-flip UCI: out-of-board coords reject', () => {
  assert.equal(engineUciToJungleFlipMove('e0a0'), null); // file e is off a 4-wide board
  assert.equal(engineUciToJungleFlipMove('a4a0'), null); // rank digit 4 is off (0..3)
  assert.equal(engineUciToJungleFlipMove('garbage'), null);
});

// ── Repetition seeding (threefold awareness for the engine) ──────────────────────────

const REP_BASE: Omit<
  JungleFlipGameState,
  'board' | 'firstColor' | 'ply' | 'moveNumber' | 'noProgressClock'
> = { id: 'rep', status: { type: 'playing', turn: 'red' }, repCounts: {}, captures: [] };

function repState(
  board: JungleFlipBoard,
  ply: number,
  moveNumber: number,
  clock: number,
): JungleFlipGameState {
  return { ...REP_BASE, board, firstColor: 'red', ply, moveNumber, noProgressClock: clock };
}

const lion = (color: 'red' | 'black') => ({ color, role: 'lion', faceDown: false }) as const;
const BOARD_A: JungleFlipBoard = { a1: lion('red'), c3: lion('black') };
const BOARD_B: JungleFlipBoard = { a2: lion('red'), c3: lion('black') }; // red lion shifted

test('jungle-flip rep signature ignores the no-progress clock and absolute move number', () => {
  // Same board + mover + pool, different clock and a different but same-parity move number.
  const s1 = repState(BOARD_A, 2, 2, 0);
  const s2 = repState(BOARD_A, 2, 4, 9);
  assert.equal(jungleFlipRepSignature(s1), jungleFlipRepSignature(s2));
  // A moved piece is a different position.
  assert.notEqual(jungleFlipRepSignature(s1), jungleFlipRepSignature(repState(BOARD_B, 2, 2, 0)));
});

test('jungle-flip rep seed = positions seen twice (3rd visit is the threefold draw)', () => {
  const states: JungleFlipGameState[] = [
    repState(BOARD_A, 2, 2, 0), // A #1
    repState(BOARD_B, 2, 4, 1), // B #1
    repState(BOARD_A, 2, 6, 2), // A #2
    repState(BOARD_B, 2, 8, 3), // B #2
    repState(BOARD_A, 2, 10, 4), // A #3
    repState({ d4: lion('red') }, 2, 2, 0), // singleton
  ];
  const seed = jungleFlipRepSeedFens(states);
  // A (3x) and B (2x) qualify; the singleton (1x) does not.
  assert.equal(seed.length, 2);
  // The representative FEN is the FIRST occurrence of each repeated signature.
  assert.ok(seed.includes(jungleFlipStateToEngineFen(states[0])), 'A seeded via its first FEN');
  assert.ok(seed.includes(jungleFlipStateToEngineFen(states[1])), 'B seeded via its first FEN');
});

test('jungle-flip position command appends a ;-delimited reps seed, omits it when empty', () => {
  assert.equal(
    buildJungleFlipPositionCommand('XXXX/XXXX/XXXX/XXXX - - 0 1'),
    'position fen XXXX/XXXX/XXXX/XXXX - - 0 1',
  );
  assert.equal(
    buildJungleFlipPositionCommand('B r - 0 1', ['A r - 0 1', 'C b - 2 2']),
    'position fen B r - 0 1 reps A r - 0 1;C b - 2 2',
  );
});

test('jungle-flip tie seed: stable per room, varies across rooms, never the "off" sentinel', () => {
  const a = jungleFlipTieSeed('room-abc');
  // Deterministic: the same room replays identically.
  assert.equal(a, jungleFlipTieSeed('room-abc'));
  // Distinct rooms get distinct seeds (variety across games).
  assert.notEqual(a, jungleFlipTieSeed('room-abd'));
  // Always a decimal u64 string, and never "0" (0 = the engine's legacy-deterministic off).
  for (const id of ['', '0', 'room-abc', 'x'.repeat(64)]) {
    const s = jungleFlipTieSeed(id);
    assert.match(s, /^[0-9]+$/);
    assert.notEqual(s, '0');
    assert.ok(BigInt(s) <= 0xffffffffffffffffn);
  }
});
