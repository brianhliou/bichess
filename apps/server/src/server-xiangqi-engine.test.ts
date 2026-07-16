import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XiangqiMove } from '@mistboard/game';
import { legalMoveForUci } from './server-xiangqi-engine.js';
import {
  xiangqiEngineVersion as catalogXiangqiEngineVersion,
  isXiangqiEngineClientId as isCatalogXiangqiEngineClientId,
  XIANGQI_PLAYABLE_ENGINES as XIANGQI_ENGINE_CATALOG,
  XIANGQI_DEFAULT_ENGINE_ID as XIANGQI_PUBLIC_DEFAULT_ENGINE_ID,
  XIANGQI_PUBLIC_ENGINES,
} from './xiangqi-engine-catalog.js';
import {
  isXiangqiEngineClientId,
  XIANGQI_DEFAULT_ENGINE_ID,
  XIANGQI_LEGACY_ENGINE_TIERS,
  XIANGQI_PLAYABLE_ENGINES,
  xiangqiEngineDisplayName,
  xiangqiEngineTierFor,
  xiangqiEngineVersion,
  xiangqiMoveToPikafishUci,
  xiangqiSquareToPikafish,
} from './xiangqi-pikafish-engine.js';

// Our XiangqiSquare is `${file a-i}${rank 1-10}` (red back rank = rank 1);
// Pikafish UCI uses rank 0-9 (red back rank = rank 0). The only translation is a
// rank-1 shift. Empirically validated end-to-end against the mainline binary in
// src/scripts/xiangqi-pikafish-validate.ts — these lock the contract as a unit.

test('xiangqiSquareToPikafish applies the rank-1 shift', () => {
  assert.equal(xiangqiSquareToPikafish('e1'), 'e0'); // red general
  assert.equal(xiangqiSquareToPikafish('a1'), 'a0');
  assert.equal(xiangqiSquareToPikafish('i10'), 'i9');
  assert.equal(xiangqiSquareToPikafish('e10'), 'e9'); // black general
  assert.equal(xiangqiSquareToPikafish('h3'), 'h2'); // red right cannon
});

test('xiangqiMoveToPikafishUci concatenates the shifted squares', () => {
  assert.equal(xiangqiMoveToPikafishUci({ from: 'h3', to: 'e3' }), 'h2e2'); // cannon to center
  assert.equal(xiangqiMoveToPikafishUci({ from: 'b1', to: 'c3' }), 'b0c2'); // horse
  assert.equal(xiangqiMoveToPikafishUci({ from: 'h10', to: 'g8' }), 'h9g7'); // black horse
});

test('legalMoveForUci matches a Pikafish bestmove against the legal set', () => {
  const legal: XiangqiMove[] = [
    { from: 'h3', to: 'e3' },
    { from: 'b1', to: 'c3' },
  ];
  assert.deepEqual(legalMoveForUci(legal, 'h2e2'), { from: 'h3', to: 'e3' });
  assert.deepEqual(legalMoveForUci(legal, 'b0c2'), { from: 'b1', to: 'c3' });
});

test('legalMoveForUci rejects moves outside the legal set and malformed uci', () => {
  const legal: XiangqiMove[] = [{ from: 'h3', to: 'e3' }];
  assert.equal(legalMoveForUci(legal, 'a0a1'), null); // legal-format, not in set
  assert.equal(legalMoveForUci(legal, 'h3e3'), null); // our coords, not Pikafish coords
  assert.equal(legalMoveForUci(legal, 'garbage'), null);
  assert.equal(legalMoveForUci(legal, ''), null);
});

// ── Ladder tier-table invariants ────────────────────────────────────────────

test('xiangqi ladder exposes exactly eight levels with unique level-N ids', () => {
  assert.equal(XIANGQI_PLAYABLE_ENGINES.length, 8);
  const ids = XIANGQI_PLAYABLE_ENGINES.map((tier) => tier.id);
  assert.equal(new Set(ids).size, ids.length, 'tier ids must be unique');
  ids.forEach((id, index) => {
    assert.equal(id, `pikafish-xiangqi-level-${index + 1}`);
  });
});

test('xiangqi ladder parameters are within range and monotonic', () => {
  for (const tier of XIANGQI_PLAYABLE_ENGINES) {
    assert.ok(tier.nodes >= 1, `${tier.id}: node budget must be positive`);
    assert.ok(tier.movetimeMs >= 1, `${tier.id}: movetime must be positive`);
  }
  for (let i = 1; i < XIANGQI_PLAYABLE_ENGINES.length; i++) {
    const prev = XIANGQI_PLAYABLE_ENGINES[i - 1]!;
    const next = XIANGQI_PLAYABLE_ENGINES[i]!;
    // Nodes are Pikafish's only configured strength control; movetime never regresses.
    assert.ok(next.nodes > prev.nodes, `${next.id}: nodes must exceed ${prev.id}`);
    assert.ok(
      next.movetimeMs >= prev.movetimeMs,
      `${next.id}: movetime must not regress from ${prev.id}`,
    );
  }
});

test('xiangqi default engine is the playable 100k-node level', () => {
  const tier = XIANGQI_PLAYABLE_ENGINES.find((entry) => entry.id === XIANGQI_DEFAULT_ENGINE_ID);
  assert.ok(tier, 'default engine id must be in XIANGQI_PLAYABLE_ENGINES');
  assert.equal(tier.nodes, 100_000);
});

test('xiangqi engine catalog exposes the honest FSF human ladder', () => {
  const fsf = XIANGQI_ENGINE_CATALOG.find(
    (entry) => entry.id === 'fairy-stockfish-xiangqi-level-1',
  );
  assert.deepEqual(fsf, {
    id: 'fairy-stockfish-xiangqi-level-1',
    name: 'Fairy-Stockfish - Level 1',
    skill: -9,
    depth: 5,
    movetimeMs: 50,
  });
  assert.equal(isCatalogXiangqiEngineClientId(fsf?.id), true);
  assert.equal(catalogXiangqiEngineVersion(fsf?.id), '0.1.0');
  assert.equal(
    XIANGQI_ENGINE_CATALOG.filter((entry) => entry.id.startsWith('fairy-stockfish-xiangqi-level-'))
      .length,
    8,
  );
});

test('xiangqi public catalog exposes the FSF ladder plus one elite Pikafish challenge', () => {
  assert.deepEqual(
    XIANGQI_PUBLIC_ENGINES.map(({ id, name }) => ({ id, name })),
    [
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `fairy-stockfish-xiangqi-level-${index + 1}`,
        name: `Fairy-Stockfish - Level ${index + 1}`,
      })),
      { id: 'pikafish-xiangqi-level-8', name: 'Pikafish' },
    ],
  );
  assert.equal(XIANGQI_PUBLIC_DEFAULT_ENGINE_ID, 'fairy-stockfish-xiangqi-level-4');
  assert.ok(
    XIANGQI_PUBLIC_ENGINES.some((engine) => engine.id === XIANGQI_PUBLIC_DEFAULT_ENGINE_ID),
  );
  for (let level = 1; level < 8; level += 1) {
    const hiddenId = `pikafish-xiangqi-level-${level}`;
    assert.equal(
      XIANGQI_PUBLIC_ENGINES.some((engine) => engine.id === hiddenId),
      false,
    );
    assert.equal(isCatalogXiangqiEngineClientId(hiddenId), true);
  }
});

// ── Retired-tier back-compat ────────────────────────────────────────────────
// Finished prod PvE games, replays, and bot-profile attribution reference the
// pre-ladder ids. They must resolve (with their original parameters) without
// being offered in the picker.

test('retired xiangqi engine ids stay resolvable with their original parameters', () => {
  const expected = [
    { id: 'pikafish-xiangqi-amateur', nodes: 20_000, movetimeMs: 400 },
    { id: 'pikafish-xiangqi-strong', nodes: 300_000, movetimeMs: 1_500 },
    { id: 'pikafish-xiangqi-strongest', nodes: 3_000_000, movetimeMs: 4_000 },
  ];
  assert.deepEqual(
    XIANGQI_LEGACY_ENGINE_TIERS.map(({ id, nodes, movetimeMs }) => ({
      id,
      nodes,
      movetimeMs,
    })),
    expected,
  );
  for (const legacy of expected) {
    const tier = xiangqiEngineTierFor(legacy.id);
    assert.ok(tier, `${legacy.id} must resolve via xiangqiEngineTierFor`);
    assert.equal(tier.nodes, legacy.nodes);
    assert.equal(tier.movetimeMs, legacy.movetimeMs);
    assert.equal(isXiangqiEngineClientId(legacy.id), true);
    assert.equal(typeof xiangqiEngineVersion(legacy.id), 'string');
    assert.notEqual(xiangqiEngineDisplayName(legacy.id), legacy.id, 'display name must resolve');
    assert.ok(
      !XIANGQI_PLAYABLE_ENGINES.some((entry) => entry.id === legacy.id),
      `${legacy.id} must not be offered as a playable engine`,
    );
  }
});
