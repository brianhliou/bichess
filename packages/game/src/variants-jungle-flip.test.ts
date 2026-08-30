import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_JUNGLE_FLIP_SQUARES,
  applyJungleFlipMove,
  assertValidJungleFlipDeal,
  createInitialJungleFlipState,
  createJungleFlipDeal,
  getJungleFlipLegalMovesFrom,
  type JungleFlipBoard,
  type JungleFlipColor,
  type JungleFlipGameState,
  type JungleFlipPiece,
  type JungleFlipPieceRole,
  jungleFlipLastMoverInk,
  jungleFlipResolveCapture,
  STANDARD_JUNGLE_FLIP_DEAL,
} from './variants-jungle-flip.js';

function up(color: JungleFlipColor, role: JungleFlipPieceRole): JungleFlipPiece {
  return { color, role, faceDown: false };
}

// A mid-game state where the 'red' seat (to move at ply 0) owns `moverInk`.
function playing(board: JungleFlipBoard, moverInk: JungleFlipColor = 'red'): JungleFlipGameState {
  return {
    id: 'test',
    board,
    status: { type: 'playing', turn: 'red' },
    ply: 0,
    firstColor: moverInk,
    moveNumber: 1,
    noProgressClock: 0,
    repCounts: {},
    captures: [],
  };
}

function dests(state: JungleFlipGameState, from: string): string[] {
  return getJungleFlipLegalMovesFrom(state, from as never)
    .map((m) => m.to)
    .sort();
}

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ── Deal + setup ──────────────────────────────────────────────────────────────

test('the deal is 16 pieces (one of each animal per colour), all face-down at start', () => {
  assert.equal(ALL_JUNGLE_FLIP_SQUARES.length, 16);
  assertValidJungleFlipDeal(STANDARD_JUNGLE_FLIP_DEAL);
  assertValidJungleFlipDeal(createJungleFlipDeal(seededRng(7)));
  const s = createInitialJungleFlipState('g');
  const pieces = Object.values(s.board).filter(Boolean);
  assert.equal(pieces.length, 16);
  assert.ok(
    pieces.every((p) => p?.faceDown),
    'all face-down',
  );
});

// ── Flip + first-colour binding ───────────────────────────────────────────────

test('pre-binding only flips are legal; the first flip binds the red seat ink', () => {
  const s = createInitialJungleFlipState('g'); // standard deal: a1 = red rat
  // No board moves before a flip binds an ink — every legal move is a self-move flip.
  assert.ok(dests(s, 'a1').includes('a1'));
  const next = applyJungleFlipMove(s, { from: 'a1', to: 'a1' });
  assert.equal(next.firstColor, 'red');
  assert.deepEqual(next.board.a1, up('red', 'rat'));
});

// ── Capture resolution (the 同归于尽 rule) ────────────────────────────────────

test('resolveCapture: higher=capture, equal=trade, rat<->elephant wrap one-way', () => {
  assert.equal(jungleFlipResolveCapture('lion', 'wolf'), 'capture');
  assert.equal(jungleFlipResolveCapture('wolf', 'lion'), 'blocked');
  assert.equal(jungleFlipResolveCapture('tiger', 'tiger'), 'trade'); // 同归于尽
  assert.equal(jungleFlipResolveCapture('rat', 'elephant'), 'capture'); // the wrap
  assert.equal(jungleFlipResolveCapture('elephant', 'rat'), 'blocked'); // one-directional
});

test('a higher-rank capture moves the attacker onto the square', () => {
  const s = playing({ a1: up('red', 'lion'), a2: up('black', 'wolf'), d4: up('black', 'cat') });
  assert.ok(dests(s, 'a1').includes('a2'));
  const next = applyJungleFlipMove(s, { from: 'a1', to: 'a2' });
  assert.deepEqual(next.board.a2, up('red', 'lion'));
  assert.equal(next.board.a1, undefined);
  assert.deepEqual(next.captures, [{ owner: 'black', role: 'wolf' }]);
});

test('equal rank is 同归于尽: BOTH pieces are removed and the attacker does not advance', () => {
  const s = playing({
    a1: up('red', 'rat'),
    a2: up('black', 'rat'),
    c4: up('red', 'dog'),
    d4: up('black', 'cat'),
  });
  assert.ok(dests(s, 'a1').includes('a2'));
  // Isolate the trade mechanic from dead-position adjudication: the leftover dog-vs-cat
  // is itself a dead draw, which is exercised separately in the dead-position test.
  const next = applyJungleFlipMove(s, { from: 'a1', to: 'a2' }, { adjudicateDeadPosition: false });
  assert.equal(next.board.a1, undefined, 'attacker square emptied');
  assert.equal(next.board.a2, undefined, 'target square emptied');
  assert.deepEqual(next.captures, [
    { owner: 'black', role: 'rat' },
    { owner: 'red', role: 'rat' },
  ]);
  assert.equal(next.status.type, 'playing'); // each side still has a piece
});

test('the rat takes the elephant on land but the elephant cannot take the rat', () => {
  const ratTakes = playing({
    a1: up('red', 'rat'),
    a2: up('black', 'elephant'),
    d4: up('black', 'cat'),
  });
  assert.ok(dests(ratTakes, 'a1').includes('a2'));
  const blocked = playing({
    a1: up('red', 'elephant'),
    a2: up('black', 'rat'),
    d4: up('black', 'cat'),
  });
  assert.ok(!dests(blocked, 'a1').includes('a2'));
});

// ── Win by elimination ────────────────────────────────────────────────────────

test('capturing the opponent’s last piece (no tiles left) wins by elimination', () => {
  const s = playing({ a1: up('red', 'rat'), a2: up('black', 'elephant') });
  const next = applyJungleFlipMove(s, { from: 'a1', to: 'a2' });
  assert.deepEqual(next.status, { type: 'finished', winner: 'red', reason: 'stalemate' });
});

test('a 同归于尽 trade that removes BOTH last pieces is a DRAW, not a win for the mover', () => {
  const s = playing({ a1: up('red', 'rat'), a2: up('black', 'rat') });
  const next = applyJungleFlipMove(s, { from: 'a1', to: 'a2' });
  assert.equal(next.board.a1, undefined);
  assert.equal(next.board.a2, undefined);
  assert.deepEqual(next.status, { type: 'finished', winner: null, reason: 'stalemate' });
});

test('jungleFlipLastMoverInk is null before anything has been played', () => {
  assert.equal(jungleFlipLastMoverInk({ ply: 0, firstColor: null }), null);
  assert.equal(jungleFlipLastMoverInk({ ply: 0, firstColor: 'red' }), null);
});

test('jungleFlipLastMoverInk alternates with ply, one behind the side to move', () => {
  // The red SEAT acts on even ply, so the action at ply - 1 was its when ply is odd.
  assert.equal(jungleFlipLastMoverInk({ ply: 1, firstColor: 'red' }), 'red');
  assert.equal(jungleFlipLastMoverInk({ ply: 2, firstColor: 'red' }), 'black');
  assert.equal(jungleFlipLastMoverInk({ ply: 3, firstColor: 'red' }), 'red');
});

test('jungleFlipLastMoverInk follows the bound ink, not the seat name', () => {
  // firstColor 'black' means the red SEAT plays BLACK ink. A renderer comparing a
  // seat to a piece colour would tint every mark backwards.
  assert.equal(jungleFlipLastMoverInk({ ply: 1, firstColor: 'black' }), 'black');
  assert.equal(jungleFlipLastMoverInk({ ply: 2, firstColor: 'black' }), 'red');
});
