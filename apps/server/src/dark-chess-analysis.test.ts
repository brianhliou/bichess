import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analysisFromDocument,
  DARK_CHESS_ANALYSIS_ENGINE_ID,
  type DarkChessAnalysisCache,
  type DarkChessAnalysisPublication,
  type DarkChessGameAnalysis,
  type MistyAnalysisDocument,
  parseMistyAnalysisDocument,
  resolveDarkChessAnalysis,
  type StoredDarkChessAnalysis,
} from './dark-chess-analysis.js';
import { VacuousAnalysisError } from './game-analysis-sweep.js';

const doc: MistyAnalysisDocument = {
  schema_version: 'misty-analysis/1',
  game_id: 'room-1',
  sf_depth: 18,
  mistake_cp: 300,
  evals: [
    { ply: 0, cp: 20, mate: null, best: 'e2e4' },
    { ply: 1, cp: -15, mate: null, best: 'e7e5' },
    { ply: 2, cp: null, mate: null, best: null },
  ],
  seats: {
    white: {
      rows: [{ ply: 1, color: 'white', uci: 'e2e4', verdict: 'sample_error' }],
      budget: { mistakes: 1, error_budget: { sample_error: 1 } },
    },
  },
};

const publication: DarkChessAnalysisPublication = {
  schema_version: 'route/1',
  game_id: 'room-1',
  variant: 'fog-of-war',
  plies: [{ ply: 1, mover: 'white', uci: 'e2e4' }],
};

test('parse rejects wrong schema, accepts the real one', () => {
  assert.throws(() => parseMistyAnalysisDocument({ schema_version: 'nope' }));
  assert.equal(parseMistyAnalysisDocument(doc).sf_depth, 18);
});

test('analysisFromDocument maps evals to sweep plies and keeps the fog layer', () => {
  const analysis = analysisFromDocument(doc);
  assert.equal(analysis.engineId, DARK_CHESS_ANALYSIS_ENGINE_ID);
  assert.deepEqual(analysis.plies[0], { ply: 0, cp: 20, mate: null, best: 'e2e4' });
  assert.equal(analysis.plies.length, 3);
  assert.equal(analysis.seats.white?.rows.length, 1);
});

test('an all-null eval track is vacuous and never cached', async () => {
  // Asserted through the resolver, not through analysisFromDocument. The mapper
  // is pure by design and the rejection runs as the kernel's `validate` hook, so
  // testing the mapper would pin an implementation detail. What has to hold is
  // the contract: a vacuous sweep must not reach the cache, or the game serves an
  // empty analysis forever with no path to recompute.
  const store = new Map<string, StoredDarkChessAnalysis>();
  const cache = {
    get: async (roomId: string, engineId: string, depth: number) =>
      store.get(`${roomId}|${engineId}|${depth}`) ?? null,
    save: async (
      roomId: string,
      engineId: string,
      depth: number,
      payload: StoredDarkChessAnalysis,
    ) => {
      store.set(`${roomId}|${engineId}|${depth}`, payload);
    },
  };
  const vacuous: MistyAnalysisDocument = {
    ...doc,
    evals: doc.evals.map((e) => ({ ...e, cp: null, mate: null })),
  };
  await assert.rejects(
    () =>
      resolveDarkChessAnalysis('room-3', publication, cache, async () =>
        analysisFromDocument(vacuous),
      ),
    VacuousAnalysisError,
  );
  assert.equal(store.size, 0, 'a vacuous sweep must never be cached');
});

test('resolver caches the eval track and the fog row, then serves from cache', async () => {
  const store = new Map<string, StoredDarkChessAnalysis>();
  const cache = {
    get: async (roomId: string, engineId: string, depth: number) =>
      store.get(`${roomId}|${engineId}|${depth}`) ?? null,
    save: async (
      roomId: string,
      engineId: string,
      depth: number,
      payload: StoredDarkChessAnalysis,
    ) => {
      store.set(`${roomId}|${engineId}|${depth}`, payload);
    },
  };
  let computes = 0;
  const compute = async (): Promise<DarkChessGameAnalysis> => {
    computes += 1;
    return analysisFromDocument(doc);
  };

  const first = await resolveDarkChessAnalysis('room-1', publication, cache, compute);
  assert.equal(computes, 1);
  assert.equal(first?.plies.length, 3);
  assert.equal(first?.seats.white?.rows.length, 1);

  const second = await resolveDarkChessAnalysis('room-1', publication, cache, compute);
  assert.equal(computes, 1, 'second resolve must come from cache');
  assert.equal(second?.seats.white?.rows.length, 1, 'fog row survives the cache round-trip');
});

test('computeIfMissing=false is a pure cache read', async () => {
  const cache: DarkChessAnalysisCache = {
    get: async () => null,
    save: async () => undefined,
  };
  let computes = 0;
  const compute = async (): Promise<DarkChessGameAnalysis> => {
    computes += 1;
    return analysisFromDocument(doc);
  };
  const result = await resolveDarkChessAnalysis('room-2', publication, cache, compute, false);
  assert.equal(result, null);
  assert.equal(computes, 0);
});
