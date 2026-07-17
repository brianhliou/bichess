import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FortressXiangqiMove } from '@mistboard/game';
import { type SweepPlyEval, VacuousAnalysisError } from './../game-analysis-sweep.js';
import {
  analyzeFortressXiangqiPostgame,
  type FortressXiangqiAnalysisCache,
  resolveFortressXiangqiAnalysis,
} from './fortress-xiangqi-games.js';

// In-memory cache double + an analyze spy, so the resolver's cache/coalesce logic is
// exercised without Postgres or a real Fairy-Stockfish process.
function memoryCache(): FortressXiangqiAnalysisCache & { saved: number } {
  const store = new Map<string, SweepPlyEval[]>();
  const cache = {
    saved: 0,
    get: async (roomId: string, engineId: string, depth: number) =>
      store.get(`${roomId}:${engineId}:${depth}`) ?? null,
    save: async (roomId: string, engineId: string, depth: number, plies: SweepPlyEval[]) => {
      cache.saved += 1;
      store.set(`${roomId}:${engineId}:${depth}`, plies);
    },
  };
  return cache;
}

const onePly = async (moves: string[]): Promise<SweepPlyEval[]> =>
  moves.map((_, i) => ({ ply: i + 1, cp: 0, mate: null, best: null }));

const oneMovePayload: { timeline: { type: string; move?: FortressXiangqiMove }[] } = {
  timeline: [{ type: 'move-played', move: { from: 'a2', to: 'a3' } }],
};

test('analyzeFortressXiangqiPostgame extracts board + drop moves as FSF UCI (no rewrite)', async () => {
  let seen: string[] = [];
  const result = await analyzeFortressXiangqiPostgame(
    {
      timeline: [
        { type: 'move-played', move: { from: 'a2', to: 'a3' } },
        { type: 'seat-resigned' }, // non-move terminal, skipped
        { type: 'move-played', move: { drop: 'treasure', to: 'd4' } }, // crazyhouse drop
      ],
    },
    async (moves) => {
      seen = moves;
      // `best` passes straight through — fortress FSF UCI is already our notation.
      return moves.map((_, i) => ({ ply: i + 1, cp: 0, mate: null, best: 'a2a3' }));
    },
  );
  // Board move → from+to; treasure drop → the FSF 'Q@<sq>' form. Terminal dropped.
  assert.deepEqual(seen, ['a2a3', 'Q@d4']);
  assert.equal(result.plies.length, 2);
  assert.equal(result.plies[0]?.best, 'a2a3');
  assert.equal(result.engineId.length > 0, true);
  assert.equal(result.depth, 12);
});

test('resolveFortressXiangqiAnalysis serves a cache hit without touching the engine', async () => {
  const cache = memoryCache();
  const seeded = await resolveFortressXiangqiAnalysis('room-hit', oneMovePayload, cache, onePly);
  let analyzed = false;
  const result = await resolveFortressXiangqiAnalysis(
    'room-hit',
    oneMovePayload,
    cache,
    async (moves) => {
      analyzed = true;
      return onePly(moves);
    },
  );
  assert.equal(analyzed, false, 'cache hit must not run the engine');
  assert.ok(seeded && result);
  assert.deepEqual(result.plies, seeded.plies);
});

test('resolveFortressXiangqiAnalysis computes + persists on a cache miss', async () => {
  const cache = memoryCache();
  const result = await resolveFortressXiangqiAnalysis('room-miss', oneMovePayload, cache, onePly);
  assert.ok(result);
  assert.equal(result.plies.length, 1);
  assert.equal(cache.saved, 1, 'a miss persists exactly once');
  await resolveFortressXiangqiAnalysis('room-miss', oneMovePayload, cache, onePly);
  assert.equal(cache.saved, 1, 'the second call is a cache hit');
});

test('resolveFortressXiangqiAnalysis with computeIfMissing=false is a pure cache read', async () => {
  const cache = memoryCache();
  let analyzed = false;
  const spy = async (moves: string[]) => {
    analyzed = true;
    return onePly(moves);
  };
  const miss = await resolveFortressXiangqiAnalysis('room-ro', oneMovePayload, cache, spy, false);
  assert.equal(miss, null, 'cache-only read returns null on a miss');
  assert.equal(analyzed, false, 'cache-only read never runs the engine');
  await resolveFortressXiangqiAnalysis('room-ro', oneMovePayload, cache, onePly);
  const hit = await resolveFortressXiangqiAnalysis('room-ro', oneMovePayload, cache, spy, false);
  assert.ok(hit);
  assert.equal(hit.plies.length, 1);
});

test('resolveFortressXiangqiAnalysis never caches a scoreless (vacuous) sweep', async () => {
  const cache = memoryCache();
  // Engine produced a series but no eval on ANY ply — a broken/score-less binary
  // that would otherwise cache as a flat, mistake-free game. Fail closed.
  const vacuous = async (moves: string[]): Promise<SweepPlyEval[]> =>
    moves.map((_, i) => ({ ply: i + 1, cp: null, mate: null, best: null }));
  await assert.rejects(
    resolveFortressXiangqiAnalysis('room-vacuous', oneMovePayload, cache, vacuous),
    VacuousAnalysisError,
  );
  assert.equal(cache.saved, 0, 'a vacuous sweep is never persisted');
  // A fixed engine can recompute later: the next call computes fresh + caches.
  const fixed = await resolveFortressXiangqiAnalysis('room-vacuous', oneMovePayload, cache, onePly);
  assert.ok(fixed);
  assert.equal(cache.saved, 1);
});

test('resolveFortressXiangqiAnalysis coalesces concurrent misses into one compute', async () => {
  const cache = memoryCache();
  let computes = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slowAnalyze = async (moves: string[]): Promise<SweepPlyEval[]> => {
    computes += 1;
    await gate;
    return onePly(moves);
  };
  const a = resolveFortressXiangqiAnalysis('room-coalesce', oneMovePayload, cache, slowAnalyze);
  const b = resolveFortressXiangqiAnalysis('room-coalesce', oneMovePayload, cache, slowAnalyze);
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(computes, 1, 'concurrent callers share one engine pass');
  assert.equal(cache.saved, 1, 'and one save');
  assert.ok(ra && rb);
  assert.deepEqual(ra.plies, rb.plies);
});
