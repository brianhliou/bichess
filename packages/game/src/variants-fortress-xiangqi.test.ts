import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  type FortressXiangqiBoard,
  type FortressXiangqiColor,
  type FortressXiangqiGameState,
  type FortressXiangqiHands,
  type FortressXiangqiMove,
  type FortressXiangqiSquare,
  fortressXiangqiCrossedRiver,
  fortressXiangqiEngineFen,
  fortressXiangqiInOwnHalf,
  fortressXiangqiInPalace,
  fortressXiangqiPerpetualCheckLoser,
  fortressXiangqiPositionRepetitionKey,
  getFortressXiangqiLegalMoves,
  isFortressXiangqiDropMove,
  isFortressXiangqiLegalMove,
} from './variants-fortress-xiangqi.js';

function stateWith(
  board: FortressXiangqiBoard,
  turn: FortressXiangqiColor = 'red',
  hands: FortressXiangqiHands = { red: {}, black: {} },
): FortressXiangqiGameState {
  const base: FortressXiangqiGameState = {
    id: 'test',
    board,
    hands,
    status: { type: 'playing', turn },
    moveNumber: 1,
    positionCounts: {},
  };
  return { ...base, positionCounts: { [fortressXiangqiPositionRepetitionKey(base)]: 1 } };
}

// Both generals present in their own palaces so board-move legality (no self-
// check) behaves normally without interfering with the piece under test.
function withGenerals(extra: FortressXiangqiBoard): FortressXiangqiBoard {
  return {
    b1: { color: 'red', role: 'general' },
    f8: { color: 'black', role: 'general' },
    ...extra,
  };
}

function boardDestsFrom(state: FortressXiangqiGameState, from: FortressXiangqiSquare): Set<string> {
  const dests = new Set<string>();
  for (const m of getFortressXiangqiLegalMoves(state)) {
    if (!isFortressXiangqiDropMove(m) && m.from === from) dests.add(m.to);
  }
  return dests;
}

function dropDestsFor(state: FortressXiangqiGameState, role: string): Set<string> {
  const dests = new Set<string>();
  for (const m of getFortressXiangqiLegalMoves(state)) {
    if (isFortressXiangqiDropMove(m) && m.drop === role) dests.add(m.to);
  }
  return dests;
}

// ── Geometry ────────────────────────────────────────────────────────────────

test('opposite-corner palaces', () => {
  assert.ok(fortressXiangqiInPalace('red', 0, 1)); // a1
  assert.ok(fortressXiangqiInPalace('red', 2, 3)); // c3
  assert.ok(!fortressXiangqiInPalace('red', 3, 1)); // d1 outside
  assert.ok(fortressXiangqiInPalace('black', 4, 6)); // e6
  assert.ok(fortressXiangqiInPalace('black', 6, 8)); // g8
  assert.ok(!fortressXiangqiInPalace('black', 3, 8)); // d8 outside
  // Palaces share no file, so the flying-general rule can never fire.
  const redFiles = new Set([0, 1, 2]);
  const blackFiles = new Set([4, 5, 6]);
  for (const f of redFiles) assert.ok(!blackFiles.has(f));
});

test('river halves and soldier crossing', () => {
  assert.ok(fortressXiangqiInOwnHalf('red', 4));
  assert.ok(!fortressXiangqiInOwnHalf('red', 5));
  assert.ok(fortressXiangqiInOwnHalf('black', 5));
  assert.ok(!fortressXiangqiInOwnHalf('black', 4));
  assert.ok(!fortressXiangqiCrossedRiver('red', 4));
  assert.ok(fortressXiangqiCrossedRiver('red', 5));
  assert.ok(!fortressXiangqiCrossedRiver('black', 5));
  assert.ok(fortressXiangqiCrossedRiver('black', 4));
});

// ── Initial position ────────────────────────────────────────────────────────

test('initial position matches the flagship start FEN', () => {
  const s = createInitialFortressXiangqiState('g');
  assert.deepEqual(s.board.a1, { color: 'red', role: 'treasure' });
  assert.deepEqual(s.board.b1, { color: 'red', role: 'general' });
  assert.deepEqual(s.board.c1, { color: 'red', role: 'advisor' });
  assert.deepEqual(s.board.d1, { color: 'red', role: 'elephant' });
  assert.deepEqual(s.board.e1, { color: 'red', role: 'cannon' });
  assert.deepEqual(s.board.f1, { color: 'red', role: 'horse' });
  assert.deepEqual(s.board.g1, { color: 'red', role: 'chariot' });
  assert.deepEqual(s.board.g8, { color: 'black', role: 'treasure' });
  assert.deepEqual(s.board.f8, { color: 'black', role: 'general' });
  assert.deepEqual(s.board.a8, { color: 'black', role: 'chariot' });
  // Five soldiers a side, gaps at c and e.
  for (const sq of ['a2', 'b2', 'd2', 'f2', 'g2'] as const) {
    assert.equal(s.board[sq]?.role, 'soldier');
  }
  assert.equal(s.board.c2, undefined);
  assert.equal(s.board.e2, undefined);
  const pieces = Object.values(s.board);
  assert.equal(pieces.filter((p) => p?.color === 'red').length, 12);
  assert.equal(pieces.filter((p) => p?.color === 'black').length, 12);
  // No drops available with empty hands.
  assert.ok(getFortressXiangqiLegalMoves(s).every((m) => 'from' in m));
});

// ── Piece movement ──────────────────────────────────────────────────────────

test('chariot slides orthogonally any distance', () => {
  const s = stateWith(withGenerals({ d4: { color: 'red', role: 'chariot' } }));
  const dests = boardDestsFrom(s, 'd4');
  for (const sq of ['d1', 'd8', 'a4', 'g4', 'd5', 'e4'] as const) assert.ok(dests.has(sq), sq);
  assert.ok(!dests.has('e5')); // not a diagonal
});

test('cannon captures only by hopping one screen', () => {
  const s = stateWith(
    withGenerals({
      d1: { color: 'red', role: 'cannon' },
      d4: { color: 'red', role: 'soldier' }, // screen
      d6: { color: 'black', role: 'soldier' }, // target beyond the screen
    }),
  );
  const dests = boardDestsFrom(s, 'd1');
  assert.ok(dests.has('d2'));
  assert.ok(dests.has('d3'));
  assert.ok(!dests.has('d4')); // own screen, not a capture
  assert.ok(!dests.has('d5')); // empty beyond the screen — cannon does not stop there
  assert.ok(dests.has('d6')); // hop the screen to capture
});

test('horse is hobbled by its leg', () => {
  const s = stateWith(
    withGenerals({
      d4: { color: 'red', role: 'horse' },
      d5: { color: 'black', role: 'soldier' }, // blocks the two upward knight moves
    }),
  );
  const dests = boardDestsFrom(s, 'd4');
  assert.ok(!dests.has('c6'));
  assert.ok(!dests.has('e6'));
  for (const sq of ['f5', 'f3', 'b5', 'b3', 'c2', 'e2'] as const) assert.ok(dests.has(sq), sq);
});

test('elephant moves two diagonally, eye-blocked, river-locked', () => {
  const open = stateWith(withGenerals({ c3: { color: 'red', role: 'elephant' } }));
  const dests = boardDestsFrom(open, 'c3');
  assert.ok(dests.has('a1'));
  assert.ok(dests.has('e1'));
  assert.ok(!dests.has('a5')); // would cross the river
  assert.ok(!dests.has('e5')); // would cross the river
  const blocked = stateWith(
    withGenerals({
      c3: { color: 'red', role: 'elephant' },
      d2: { color: 'red', role: 'soldier' }, // blocks the eye toward e1
    }),
  );
  assert.ok(!boardDestsFrom(blocked, 'c3').has('e1'));
});

test('advisor stays on palace diagonals', () => {
  const s = stateWith(withGenerals({ b2: { color: 'red', role: 'advisor' } }));
  assert.deepEqual(boardDestsFrom(s, 'b2'), new Set(['a1', 'c1', 'a3', 'c3']));
});

test('general steps one orthogonally within the palace', () => {
  const s = stateWith({
    b2: { color: 'red', role: 'general' },
    f8: { color: 'black', role: 'general' },
  });
  assert.deepEqual(boardDestsFrom(s, 'b2'), new Set(['a2', 'c2', 'b1', 'b3']));
});

test('soldier (veteran): forward + sideways everywhere, never back', () => {
  // Veteran soldiers move forward and sideways from move one (no river gate), but
  // still never step backward. See docs-private/fortress-soldier-study.
  const redHome = stateWith(withGenerals({ d2: { color: 'red', role: 'soldier' } }));
  assert.deepEqual(boardDestsFrom(redHome, 'd2'), new Set(['d3', 'c2', 'e2']));
  const redCrossed = stateWith(withGenerals({ d5: { color: 'red', role: 'soldier' } }));
  assert.deepEqual(boardDestsFrom(redCrossed, 'd5'), new Set(['d6', 'c5', 'e5']));
  // Black on its own half now gets the sideways step too (impossible pre-veteran).
  const blackHome = stateWith(withGenerals({ d7: { color: 'black', role: 'soldier' } }), 'black');
  assert.deepEqual(boardDestsFrom(blackHome, 'd7'), new Set(['d6', 'c7', 'e7']));
  const blackCrossed = stateWith(
    withGenerals({ d4: { color: 'black', role: 'soldier' } }),
    'black',
  );
  assert.deepEqual(boardDestsFrom(blackCrossed, 'd4'), new Set(['d3', 'c4', 'e4']));
});

test('treasure steps one in any of eight directions', () => {
  const s = stateWith(withGenerals({ d4: { color: 'red', role: 'treasure' } }));
  assert.deepEqual(
    boardDestsFrom(s, 'd4'),
    new Set(['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5']),
  );
});

// ── Drops ───────────────────────────────────────────────────────────────────

test('capturing a piece puts it in the captor hand', () => {
  const s = stateWith(
    withGenerals({
      d4: { color: 'red', role: 'chariot' },
      d6: { color: 'black', role: 'soldier' },
    }),
  );
  const next = applyFortressXiangqiMove(s, { from: 'd4', to: 'd6' });
  assert.equal(next.board.d6?.color, 'red');
  assert.equal(next.hands.red.soldier, 1);
});

test('attacker drops land anywhere including the enemy half', () => {
  const s = stateWith(withGenerals({}), 'red', { red: { chariot: 1 }, black: {} });
  const dests = dropDestsFor(s, 'chariot');
  assert.ok(dests.has('d7')); // deep in the black half
  assert.ok(dests.has('a4'));
  assert.ok(!dests.has('b1')); // occupied by the red general
});

test('defender drops are region-restricted', () => {
  const advisor = stateWith(withGenerals({}), 'red', { red: { advisor: 1 }, black: {} });
  const aDests = dropDestsFor(advisor, 'advisor');
  assert.ok(aDests.has('a1')); // red palace
  assert.ok(aDests.has('c3'));
  assert.ok(!aDests.has('d4')); // outside any palace
  assert.ok(!aDests.has('e6')); // black palace
  const elephant = stateWith(withGenerals({}), 'red', { red: { elephant: 1 }, black: {} });
  const eDests = dropDestsFor(elephant, 'elephant');
  assert.ok(eDests.has('d3')); // red half
  assert.ok(!eDests.has('d6')); // black half
});

test('a drop must resolve check, and drop-check is allowed', () => {
  // Red general b1 in check from a black chariot down the b-file; red holds a
  // chariot. Only a drop that blocks the check is legal.
  const s = stateWith(
    {
      b1: { color: 'red', role: 'general' },
      b6: { color: 'black', role: 'chariot' },
      f8: { color: 'black', role: 'general' },
    },
    'red',
    { red: { chariot: 1 }, black: {} },
  );
  const dests = dropDestsFor(s, 'chariot');
  for (const blocker of ['b2', 'b3', 'b4', 'b5'] as const) assert.ok(dests.has(blocker), blocker);
  assert.ok(!dests.has('a4')); // does not block the check
  // Drop-check allowed: red drops a chariot giving check to the black general.
  const s2 = stateWith(withGenerals({}), 'red', { red: { chariot: 1 }, black: {} });
  assert.ok(isFortressXiangqiLegalMove(s2, { drop: 'chariot', to: 'f5' })); // checks f8 down the f-file
});

// ── Endings ─────────────────────────────────────────────────────────────────

test('a dropped chariot can deliver checkmate (the signature finish)', () => {
  // Red chariot on f1 covers f7/f8; red drops a chariot on the g-file to check
  // g8 with no escape, block, or capture. Drop-mate = the variant's signature.
  const s = stateWith(
    {
      b1: { color: 'red', role: 'general' },
      f1: { color: 'red', role: 'chariot' },
      g8: { color: 'black', role: 'general' },
    },
    'red',
    { red: { chariot: 1 }, black: {} },
  );
  const next = applyFortressXiangqiMove(s, { drop: 'chariot', to: 'g5' });
  assert.deepEqual(next.status, { type: 'finished', winner: 'red', reason: 'checkmate' });
});

test('stalemate is a loss for the stuck side', () => {
  const s = stateWith({
    b1: { color: 'red', role: 'general' },
    a6: { color: 'red', role: 'chariot' },
    f1: { color: 'red', role: 'chariot' },
    g8: { color: 'black', role: 'general' },
  });
  const next = applyFortressXiangqiMove(s, { from: 'a6', to: 'a7' }); // covers g7/f7; g8 not attacked
  assert.deepEqual(next.status, { type: 'finished', winner: 'red', reason: 'stalemate' });
});

test('threefold repetition is a draw', () => {
  let s = stateWith(
    withGenerals({
      d4: { color: 'red', role: 'treasure' },
      d6: { color: 'black', role: 'treasure' },
    }),
  );
  const cycle: FortressXiangqiMove[] = [
    { from: 'd4', to: 'c4' },
    { from: 'd6', to: 'c6' },
    { from: 'c4', to: 'd4' },
    { from: 'c6', to: 'd6' },
  ];
  for (let i = 0; i < 8; i += 1) {
    s = applyFortressXiangqiMove(s, cycle[i % 4]);
  }
  assert.deepEqual(s.status, { type: 'finished', winner: null, reason: 'repetition' });
});

test('repetition key distinguishes hands', () => {
  const board = withGenerals({});
  const a = stateWith(board, 'red', { red: {}, black: {} });
  const b = stateWith(board, 'red', { red: { soldier: 1 }, black: {} });
  assert.notEqual(fortressXiangqiPositionRepetitionKey(a), fortressXiangqiPositionRepetitionKey(b));
});

// ── Perpetual-check adjudication ────────────────────────────────────────────

function movesFromUci(ucis: readonly string[]): FortressXiangqiMove[] {
  return ucis.map((uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) }) as FortressXiangqiMove);
}

test('perpetual check by red is a loss for red', () => {
  const start = stateWith({
    a1: { color: 'red', role: 'general' },
    g1: { color: 'red', role: 'chariot' },
    f7: { color: 'black', role: 'general' },
  });
  // Red chariot chases the black general with checks; black shuffles f7<->e7.
  const moves = movesFromUci([
    'g1f1',
    'f7e7',
    'f1e1',
    'e7f7',
    'e1f1',
    'f7e7',
    'f1e1',
    'e7f7',
    'e1f1',
  ]);
  assert.equal(fortressXiangqiPerpetualCheckLoser(moves, start), 'red');
});

test('perpetual check by black is a loss for black', () => {
  const start = stateWith(
    {
      b2: { color: 'red', role: 'general' },
      g8: { color: 'black', role: 'general' },
      a8: { color: 'black', role: 'chariot' },
    },
    'black',
  );
  const moves = movesFromUci([
    'a8b8',
    'b2a2',
    'b8a8',
    'a2b2',
    'a8b8',
    'b2a2',
    'b8a8',
    'a2b2',
    'a8b8',
  ]);
  assert.equal(fortressXiangqiPerpetualCheckLoser(moves, start), 'black');
});

test('an honest (check-free) repetition stays a draw', () => {
  const start = stateWith(
    withGenerals({
      d4: { color: 'red', role: 'treasure' },
      d6: { color: 'black', role: 'treasure' },
    }),
  );
  const moves = movesFromUci(['d4c4', 'd6c6', 'c4d4', 'c6d6', 'd4c4', 'd6c6', 'c4d4', 'c6d6']);
  assert.equal(fortressXiangqiPerpetualCheckLoser(moves, start), null);
});

test('state.moveLog accumulates the history and feeds the adjudicator', () => {
  const start = stateWith({
    a1: { color: 'red', role: 'general' },
    g1: { color: 'red', role: 'chariot' },
    f7: { color: 'black', role: 'general' },
  });
  const moves = movesFromUci([
    'g1f1',
    'f7e7',
    'f1e1',
    'e7f7',
    'e1f1',
    'f7e7',
    'f1e1',
    'e7f7',
    'e1f1',
  ]);
  let s = start;
  for (const move of moves) s = applyFortressXiangqiMove(s, move);
  // The kernel core stays a draw; the chasing upgrade lives in the tenant.
  assert.ok(s.status.type === 'finished' && s.status.reason === 'repetition');
  // moveLog is the exact history, and rerunning the adjudicator over it (as the
  // tenant does) recovers the perpetual checker.
  assert.deepEqual([...(s.moveLog ?? [])], moves);
  assert.equal(fortressXiangqiPerpetualCheckLoser(s.moveLog ?? [], start), 'red');
});

test('fortressXiangqiEngineFen matches the FSF variant startFen at the initial position', () => {
  const s = createInitialFortressXiangqiState('fen');
  // Byte-identical to `startFen` in apps/server/src/fortress-xiangqi.ini — the same
  // position the server FSF engine (and client ceval) treats as `startpos`.
  assert.equal(fortressXiangqiEngineFen(s), 'rnceakq/pp1p1pp/7/7/7/7/PP1P1PP/QKAECNR w - - 0 1');
});

test('fortressXiangqiEngineFen encodes side-to-move and the captured-in-hand pocket', () => {
  const s = createInitialFortressXiangqiState('fen');
  // Black to move: the turn token flips to 'b'.
  const blackToMove: FortressXiangqiGameState = {
    ...s,
    status: { type: 'playing', turn: 'black' },
  };
  assert.match(fortressXiangqiEngineFen(blackToMove), / b - - 0 1$/);

  // A crazyhouse pocket renders in brackets after the placement: red holds a
  // chariot + two soldiers, black a horse → `[RPPn]` (uppercase = red, in the fixed
  // chariot/horse/cannon/elephant/advisor/treasure/soldier order).
  const withHands: FortressXiangqiGameState = {
    ...s,
    hands: { red: { chariot: 1, soldier: 2 }, black: { horse: 1 } },
  };
  assert.ok(fortressXiangqiEngineFen(withHands).includes('[RPPn]'));
});
