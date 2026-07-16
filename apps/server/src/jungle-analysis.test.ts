import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyJungleMove,
  createInitialJungleState,
  getJungleLegalMoves,
  type JungleMove,
} from '@mistboard/game';
import type { SweepPlyEval } from './game-analysis-sweep.js';
import {
  analyzeJunglePostgame,
  isVacuousAnalysis,
  JUNGLE_ANALYSIS_ENGINE_ID,
  type JungleAnalysisCache,
  type JungleGameAnalysis,
  resolveJungleAnalysis,
  VacuousAnalysisError,
} from './jungle-analysis.js';

// A few real legal moves, taken from the kernel so they are always valid (jungle has
// no 2-move win, so this stays in the playing phase — exactly what we want to exercise
// the per-ply evaluate path).
function openingMoves(count: number): JungleMove[] {
  let state = createInitialJungleState('t');
  const moves: JungleMove[] = [];
  for (let i = 0; i < count; i += 1) {
    const move = getJungleLegalMoves(state)[0]!;
    moves.push(move);
    state = applyJungleMove(state, move);
  }
  return moves;
}

function memoryCache(): JungleAnalysisCache & { saves: number } {
  const store = new Map<string, SweepPlyEval[]>();
  const cache = {
    saves: 0,
    async get(roomId: string, engineId: string, depth: number) {
      return store.get(`${roomId}:${engineId}:${depth}`) ?? null;
    },
    async save(roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]) {
      cache.saves += 1;
      store.set(`${roomId}:${engineId}:${depth}`, plies);
    },
  };
  return cache;
}

test('analyzeJunglePostgame reconstructs N+1 plies and evaluates each playing position', async () => {
  const moves = openingMoves(4);
  const seenTurns: string[] = [];
  // Injected evaluator: the sweep is exercised without spawning the engine binary.
  const analysis = await analyzeJunglePostgame(moves, async (state) => {
    assert.equal(state.status.type, 'playing');
    seenTurns.push(state.status.type === 'playing' ? state.status.turn : 'x');
    return { cp: 42, mate: null, best: 'z' };
  });

  // Ply 0 (initial) .. ply N (after the last move): N+1 contiguous points.
  assert.equal(analysis.plies.length, moves.length + 1);
  analysis.plies.forEach((ply, i) => {
    assert.equal(ply.ply, i);
  });
  // Reconstruction walked the true move history, red moving first, alternating.
  assert.deepEqual(seenTurns, ['red', 'black', 'red', 'black', 'red']);
  assert.ok(analysis.plies.every((ply) => ply.cp === 42));
  assert.equal(analysis.engineId, JUNGLE_ANALYSIS_ENGINE_ID);
});

test('resolveJungleAnalysis: pure cache read misses without computing', async () => {
  const cache = memoryCache();
  let computes = 0;
  const analyze = async (): Promise<JungleGameAnalysis> => {
    computes += 1;
    return { engineId: JUNGLE_ANALYSIS_ENGINE_ID, depth: 12, plies: [] };
  };
  const result = await resolveJungleAnalysis('room-a', [], cache, analyze, false);
  assert.equal(result, null);
  assert.equal(computes, 0);
  assert.equal(cache.saves, 0);
});

test('resolveJungleAnalysis computes once, persists, then serves from cache', async () => {
  const cache = memoryCache();
  let computes = 0;
  const analyze = async (): Promise<JungleGameAnalysis> => {
    computes += 1;
    return {
      engineId: JUNGLE_ANALYSIS_ENGINE_ID,
      depth: 12,
      plies: [{ ply: 0, cp: 0, mate: null, best: null }],
    };
  };
  const first = await resolveJungleAnalysis('room-b', [], cache, analyze, true);
  assert.ok(first);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);

  // Second viewer: served from cache, no recompute.
  const second = await resolveJungleAnalysis('room-b', [], cache, analyze, true);
  assert.ok(second);
  assert.equal(computes, 1);
  assert.deepEqual(second!.plies, first!.plies);
});

test('resolveJungleAnalysis coalesces concurrent viewers into one compute', async () => {
  const cache = memoryCache();
  let computes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const analyze = async (): Promise<JungleGameAnalysis> => {
    computes += 1;
    await gate;
    return { engineId: JUNGLE_ANALYSIS_ENGINE_ID, depth: 12, plies: [] };
  };
  const a = resolveJungleAnalysis('room-c', [], cache, analyze, true);
  const b = resolveJungleAnalysis('room-c', [], cache, analyze, true);
  release();
  await Promise.all([a, b]);
  assert.equal(computes, 1);
  assert.equal(cache.saves, 1);
});

test('isVacuousAnalysis flags an all-null sweep but not a scored or empty one', () => {
  assert.equal(
    isVacuousAnalysis([
      { ply: 0, cp: null, mate: null, best: 'a1b1' },
      { ply: 1, cp: null, mate: null, best: 'c7d7' },
    ]),
    true,
  );
  // One real score anywhere → not vacuous.
  assert.equal(
    isVacuousAnalysis([
      { ply: 0, cp: null, mate: null, best: 'a1b1' },
      { ply: 1, cp: 3, mate: null, best: 'c7d7' },
    ]),
    false,
  );
  // A mate-only ply still counts as scored.
  assert.equal(isVacuousAnalysis([{ ply: 0, cp: null, mate: 2, best: null }]), false);
  // Empty is "nothing to judge", not "engine broken".
  assert.equal(isVacuousAnalysis([]), false);
});

test('resolveJungleAnalysis fails closed on a scoreless sweep: throws and caches nothing', async () => {
  const cache = memoryCache();
  const analyze = async (): Promise<JungleGameAnalysis> => ({
    engineId: JUNGLE_ANALYSIS_ENGINE_ID,
    depth: 12,
    // Engine emitted moves but no evals — the broken-binary signature.
    plies: [
      { ply: 0, cp: null, mate: null, best: 'a1b1' },
      { ply: 1, cp: null, mate: null, best: 'c7d7' },
    ],
  });
  await assert.rejects(
    resolveJungleAnalysis('room-vacuous', [], cache, analyze, true),
    VacuousAnalysisError,
  );
  // Nothing persisted, so a fixed engine can recompute later.
  assert.equal(cache.saves, 0);
  // And the in-flight key was cleared (a retry re-runs rather than wedging).
  await assert.rejects(
    resolveJungleAnalysis('room-vacuous', [], cache, analyze, true),
    VacuousAnalysisError,
  );
});

test('JUNGLE_ANALYSIS_ENGINE_ID is a stable, version-tagged identifier', () => {
  assert.match(JUNGLE_ANALYSIS_ENGINE_ID, /^misty-jungle-analysis@/);
});
