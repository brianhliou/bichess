import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createInitialXiangqiState,
  getStandardXiangqiLegalMoves,
  xiangqiMoveToPikafishUci,
} from '@mistboard/game';
import { loadEngine } from './engines/registry.js';
import { xiangqiEngineTierFor, xiangqiEngineVersion } from './xiangqi-engine-catalog.js';
import {
  isXiangqiRandomEngine,
  XIANGQI_RANDOM_ENGINE_ID,
  XIANGQI_RANDOM_ENGINE_VERSION,
  xiangqiRandomEngineTierFor,
  xiangqiRandomMoveUci,
} from './xiangqi-random-engine.js';

const LEGAL = getStandardXiangqiLegalMoves(createInitialXiangqiState('t'));

test('picks the rng-indexed legal move as Pikafish UCI', () => {
  assert.equal(
    xiangqiRandomMoveUci(LEGAL, () => 0),
    xiangqiMoveToPikafishUci(LEGAL[0]!),
  );
  assert.equal(
    xiangqiRandomMoveUci(LEGAL, () => 0.999999),
    xiangqiMoveToPikafishUci(LEGAL[LEGAL.length - 1]!),
  );
});

test('always returns one of the legal moves', () => {
  const uciSet = new Set(LEGAL.map((m) => xiangqiMoveToPikafishUci(m)));
  for (let i = 0; i < 30; i++) {
    const uci = xiangqiRandomMoveUci(LEGAL, () => i / 30);
    assert.ok(uci && uciSet.has(uci));
  }
});

test('returns null with no legal moves', () => {
  assert.equal(
    xiangqiRandomMoveUci([], () => 0),
    null,
  );
});

test('is recognized + resolves a tier, but stays out of the UCI dispatch', () => {
  assert.ok(isXiangqiRandomEngine(XIANGQI_RANDOM_ENGINE_ID));
  assert.ok(!isXiangqiRandomEngine('fairy-stockfish-xiangqi-level-1'));
  assert.equal(xiangqiRandomEngineTierFor(XIANGQI_RANDOM_ENGINE_ID)?.movetimeMs, 0);
  // The catalog resolves it (so the runner's requiredTier() passes)...
  assert.equal(xiangqiEngineTierFor(XIANGQI_RANDOM_ENGINE_ID)?.id, XIANGQI_RANDOM_ENGINE_ID);
  assert.equal(xiangqiEngineVersion(XIANGQI_RANDOM_ENGINE_ID), XIANGQI_RANDOM_ENGINE_VERSION);
});

test('is loadable as an engine-version subject (persistence + participants)', () => {
  const engine = loadEngine(XIANGQI_RANDOM_ENGINE_ID);
  assert.equal(engine.gameSpecId, 'xiangqi');
  assert.equal(engine.kind, 'builtin');
});
