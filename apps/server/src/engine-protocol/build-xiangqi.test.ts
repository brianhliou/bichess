import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialXiangqiState,
  getLegalMoves as getXiangqiLegalMoves,
  type XiangqiGameState,
} from '@mistboard/game';
import { buildXiangqiEngineTurnRequest, buildXiangqiObservationForPly } from './build-xiangqi.js';

test('DXQ request: geometry, color mapping, and variant tag', () => {
  const state = createInitialXiangqiState('dxq-geo');
  const req = buildXiangqiEngineTurnRequest({
    gameId: 'dxq-geo',
    engineId: 'python-fdx-v1.0',
    engineSecret: 'test-secret',
    engineColor: 'red',
    state,
    events: [],
    ply: 0,
    clockRemainingMs: 60_000,
    incrementMs: 1_000,
  });

  assert.equal(req.gameSpecId, 'dark-xiangqi');
  assert.equal(req.protocolVersion, '1');
  assert.equal(req.color, 'white');
  for (const obs of req.observationTranscript ?? []) {
    for (const [idx] of obs.visible_pieces)
      assert.ok(idx >= 0 && idx <= 89, `idx ${idx} out of 9x10`);
  }
  const expected = new Set(getXiangqiLegalMoves(state).map((m) => `${m.from}${m.to}`));
  assert.equal(req.legalMoves.length, expected.size);
  for (const m of req.legalMoves) assert.ok(expected.has(`${m.from}${m.to}`));
});

test('DXQ observation uses 9-wide indexing through i10 and a 90-bit mask', () => {
  const state: XiangqiGameState = {
    ...createInitialXiangqiState('dxq-i10'),
    board: {
      i1: { color: 'red', role: 'chariot' },
      i10: { color: 'black', role: 'chariot' },
      a10: { color: 'black', role: 'general' },
    },
    status: { type: 'playing', turn: 'red' },
  };
  const obs = buildXiangqiObservationForPly({
    prevState: null,
    nextState: state,
    move: null,
    perspective: 'red',
    ply: 0,
  });

  const visible = new Set(obs.visible_pieces.map(([idx]) => idx));
  assert.ok(visible.has(8), 'i1 should be idx 8');
  assert.ok(visible.has(89), 'i10 should be idx 89');
  assert.equal(visible.has(81), false, 'a10 should stay hidden off the i-file');
  const mask = BigInt(obs.visibility_mask);
  assert.equal((mask & (1n << 89n)) !== 0n, true);
  assert.equal((mask & (1n << 81n)) !== 0n, false);
});

test('DXQ shrouds cannon-screen identity to color-only when the flag is set', () => {
  const state: XiangqiGameState = {
    ...createInitialXiangqiState('dxq-shroud'),
    board: {
      e1: { color: 'red', role: 'cannon' }, // red cannon eyes up the e-file
      e5: { color: 'black', role: 'horse' }, // the SCREEN (idx 40)
      e8: { color: 'black', role: 'chariot' }, // the TARGET beyond it (idx 67)
    },
    status: { type: 'playing', turn: 'red' },
  };
  const build = () =>
    buildXiangqiObservationForPly({
      prevState: null,
      nextState: state,
      move: null,
      perspective: 'red',
      ply: 0,
    });

  // Flag OFF (default): the screen is fully identified (horse), nothing shrouded.
  delete process.env.MISTBOARD_XIANGQI_SHROUD_BLOCKERS;
  const off = build();
  assert.equal(off.shrouded, undefined);
  assert.equal(
    off.visible_pieces.find(([i]) => i === 40)?.[1].type,
    'N',
    'screen fully identified when off',
  );

  // Flag ON: the screen (e5) is color-only shrouded; the target (e8) stays revealed.
  process.env.MISTBOARD_XIANGQI_SHROUD_BLOCKERS = '1';
  try {
    const on = build();
    const shrouded = new Map((on.shrouded ?? []).map(([i, c]) => [i, c]));
    assert.equal(shrouded.get(40), 'black', 'e5 screen shrouded color-only');
    assert.equal(
      on.visible_pieces.some(([i]) => i === 40),
      false,
      'e5 screen not fully identified',
    );
    assert.equal(
      on.visible_pieces.find(([i]) => i === 67)?.[1].type,
      'R',
      'e8 target still revealed',
    );
  } finally {
    delete process.env.MISTBOARD_XIANGQI_SHROUD_BLOCKERS;
  }
});
