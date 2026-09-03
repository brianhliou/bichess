import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { banqiHiddenPool, jieqiHiddenPool, jungleFlipHiddenPool } from './hidden-pool.js';
import {
  applyBanqiMove,
  type BanqiGameState,
  createBanqiDeal,
  createInitialBanqiState,
  getBanqiLegalMoves,
  getBanqiPlayerView,
} from './variants-banqi.js';
import {
  applyJieqiMove,
  createInitialJieqiState,
  createJieqiDeal,
  getJieqiLegalMoves,
  getJieqiPlayerView,
  type JieqiColor,
  type JieqiGameState,
} from './variants-jieqi.js';
import {
  applyJungleFlipMove,
  createInitialJungleFlipState,
  createJungleFlipDeal,
  getJungleFlipLegalMoves,
  getJungleFlipPlayerView,
  type JungleFlipGameState,
} from './variants-jungle-flip.js';

// The pool is derived from the MASKED view; these tests check it against the
// truth state at every ply of seeded random playouts. The invariant: for each
// ink, the derived multiset equals the face-down pieces of that ink still on the
// truth board, plus (jieqi only) the captures of that ink whose role this viewer
// was never told. Sampling real playouts rather than hand-built positions means
// flips, captures, cannon screens, mutual destruction and dark captures all get
// exercised without a fixture that encodes the helper's own assumption.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function multiset(roles: readonly string[]): string {
  return [...roles].sort().join(',');
}

function poolRoles(entries: readonly { role: string; count: number }[]): string[] {
  return entries.flatMap((e) => Array.from({ length: e.count }, () => e.role));
}

function faceDownRoles(
  board: Partial<Record<string, { color: 'red' | 'black'; role: string; faceDown: boolean }>>,
  ink: 'red' | 'black',
): string[] {
  return Object.values(board)
    .filter((p): p is { color: 'red' | 'black'; role: string; faceDown: boolean } =>
      Boolean(p && p.faceDown && p.color === ink),
    )
    .map((p) => p.role);
}

const SEEDS = [1, 2, 3, 5, 8, 13];
const MAX_PLIES = 160;
const INKS = ['red', 'black'] as const;

describe('banqiHiddenPool', () => {
  it('starts as the full 16-per-ink multiset with nothing revealed', () => {
    const state = createInitialBanqiState('b0');
    const pool = banqiHiddenPool(getBanqiPlayerView(state, 'red'));
    assert.equal(pool.red.total, 16);
    assert.equal(pool.black.total, 16);
    assert.deepEqual(
      pool.red.entries.map((e) => e.role),
      ['general', 'advisor', 'elephant', 'chariot', 'horse', 'cannon', 'soldier'],
    );
    assert.equal(pool.red.entries.find((e) => e.role === 'soldier')?.count, 5);
    assert.equal(pool.red.unknownCaptured, 0);
  });

  it('matches the truth face-down multiset at every ply of a random playout, for both seats', () => {
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      let state: BanqiGameState = createInitialBanqiState(`b${seed}`, createBanqiDeal(rng));
      let sawCapture = false;
      for (let ply = 0; ply < MAX_PLIES && state.status.type === 'playing'; ply += 1) {
        for (const seat of INKS) {
          const pool = banqiHiddenPool(getBanqiPlayerView(state, seat));
          for (const ink of INKS) {
            assert.equal(
              multiset(poolRoles(pool[ink].entries)),
              multiset(faceDownRoles(state.board, ink)),
              `seed ${seed} ply ${ply} seat ${seat} ink ${ink}`,
            );
            assert.equal(pool[ink].unknownCaptured, 0);
          }
        }
        const next = applyBanqiMove(state, pick(getBanqiLegalMoves(state), rng));
        if (next.captures.length > state.captures.length) sawCapture = true;
        state = next;
      }
      assert.ok(sawCapture, `seed ${seed} never captured`);
    }
  });
});

describe('jungleFlipHiddenPool', () => {
  it('starts as one of each animal per ink, strongest first', () => {
    const state = createInitialJungleFlipState('j0');
    const pool = jungleFlipHiddenPool(getJungleFlipPlayerView(state, 'red'));
    assert.deepEqual(
      pool.red.entries.map((e) => e.role),
      ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'rat'],
    );
    assert.equal(pool.black.total, 8);
  });

  it('matches the truth face-down multiset at every ply of a random playout, including trades', () => {
    let sawTrade = false;
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      let state: JungleFlipGameState = createInitialJungleFlipState(
        `j${seed}`,
        createJungleFlipDeal(rng),
      );
      for (let ply = 0; ply < MAX_PLIES && state.status.type === 'playing'; ply += 1) {
        for (const seat of INKS) {
          const pool = jungleFlipHiddenPool(getJungleFlipPlayerView(state, seat));
          for (const ink of INKS) {
            assert.equal(
              multiset(poolRoles(pool[ink].entries)),
              multiset(faceDownRoles(state.board, ink)),
              `seed ${seed} ply ${ply} seat ${seat} ink ${ink}`,
            );
            assert.equal(pool[ink].unknownCaptured, 0);
          }
        }
        const next = applyJungleFlipMove(state, pick(getJungleFlipLegalMoves(state), rng));
        if (next.captures.length - state.captures.length === 2) sawTrade = true;
        state = next;
      }
    }
    assert.ok(sawTrade, 'no playout produced a mutual-destruction trade');
  });
});

describe('jieqiHiddenPool', () => {
  it('starts as the 15 dark pieces per side, general excluded', () => {
    const state = createInitialJieqiState('q0');
    const pool = jieqiHiddenPool(getJieqiPlayerView(state, 'red'));
    assert.equal(pool.red.total, 15);
    assert.equal(pool.black.total, 15);
    assert.deepEqual(
      pool.red.entries.map((e) => e.role),
      ['chariot', 'cannon', 'horse', 'elephant', 'advisor', 'soldier'],
    );
    assert.equal(pool.red.entries.find((e) => e.role === 'soldier')?.count, 5);
  });

  it('is exact for the opponent and carries the unseen captures of your own ink', () => {
    let sawDarkCapture = false;
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      let state: JieqiGameState = createInitialJieqiState(`q${seed}`, createJieqiDeal(rng));
      for (let ply = 0; ply < MAX_PLIES && state.status.type === 'playing'; ply += 1) {
        for (const viewer of INKS) {
          const pool = jieqiHiddenPool(getJieqiPlayerView(state, viewer));
          for (const ink of INKS) {
            // What this viewer was never told: captures of `ink` still dark when
            // taken by the other side (the viewer is the owner, not the capturer).
            const unseen = state.captures.filter(
              (c) => c.owner === ink && !c.revealedAtCapture && c.owner === viewer,
            );
            const expected = [...faceDownRoles(state.board, ink), ...unseen.map((c) => c.role)];
            assert.equal(
              multiset(poolRoles(pool[ink].entries)),
              multiset(expected),
              `seed ${seed} ply ${ply} viewer ${viewer} ink ${ink}`,
            );
            assert.equal(pool[ink].unknownCaptured, unseen.length);
            assert.equal(
              pool[ink].total - pool[ink].unknownCaptured,
              faceDownRoles(state.board, ink).length,
            );
            assert.ok(!pool[ink].entries.some((e) => e.role === 'general'));
            if (unseen.length > 0) sawDarkCapture = true;
          }
        }
        state = applyJieqiMove(state, pick(getJieqiLegalMoves(state), rng));
      }
    }
    assert.ok(sawDarkCapture, 'no playout produced a dark capture');
  });

  it('a capturer sees the opponent pool shrink; the owner still counts the piece', () => {
    // Drive a playout until a dark capture happens, then compare the two views.
    const rng = mulberry32(21);
    let state: JieqiGameState = createInitialJieqiState('q-dark', createJieqiDeal(rng));
    let capture: (typeof state.captures)[number] | undefined;
    for (let ply = 0; ply < 400 && state.status.type === 'playing' && !capture; ply += 1) {
      const next = applyJieqiMove(state, pick(getJieqiLegalMoves(state), rng));
      capture = next.captures.find((c) => !c.revealedAtCapture);
      state = next;
    }
    assert.ok(capture, 'no dark capture within 400 plies');
    const owner = capture.owner as JieqiColor;
    const capturer: JieqiColor = owner === 'red' ? 'black' : 'red';
    const asCapturer = jieqiHiddenPool(getJieqiPlayerView(state, capturer))[owner];
    const asOwner = jieqiHiddenPool(getJieqiPlayerView(state, owner))[owner];
    assert.equal(asCapturer.unknownCaptured, 0);
    assert.ok(asOwner.unknownCaptured > 0);
    assert.equal(asOwner.total, asCapturer.total + asOwner.unknownCaptured);
  });
});
