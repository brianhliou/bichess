import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  standardXiangqiEngineFen,
  standardXiangqiFen,
  standardXiangqiPlacementKey,
  standardXiangqiPositionKey,
} from './index.js';

test('standardXiangqiPlacementKey serializes the initial xiangqi board top-to-bottom', () => {
  const state = createInitialXiangqiState('position-key');
  assert.equal(
    standardXiangqiPlacementKey(state),
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR',
  );
});

test('standardXiangqiPositionKey includes the side to move', () => {
  const state = createInitialXiangqiState('position-key');
  assert.equal(
    standardXiangqiPositionKey(state),
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r',
  );
  const next = applyStandardXiangqiMove(state, { from: 'h3', to: 'e3' });
  assert.match(standardXiangqiPositionKey(next), / b$/);
});

test('standardXiangqiFen includes progress clock and move number', () => {
  const state = createInitialXiangqiState('position-key');
  assert.equal(
    standardXiangqiFen(state),
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r - - 0 1',
  );
});

test('standardXiangqiEngineFen writes the engine-dialect turn token (w/b)', () => {
  const state = createInitialXiangqiState('engine-fen');
  // Red to move is 'w' (not the position key's 'r'); this is the canonical
  // Fairy-Stockfish / Pikafish xiangqi start FEN.
  assert.equal(
    standardXiangqiEngineFen(state),
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
  );
  const next = applyStandardXiangqiMove(state, { from: 'h3', to: 'e3' });
  assert.match(standardXiangqiEngineFen(next), / b - - /);
});
