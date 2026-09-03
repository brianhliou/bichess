import { describe, expect, it } from 'vitest';
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
  type JieqiPieceRole,
} from './variants-jieqi.js';
import type { JunglePieceRole } from './variants-jungle.js';
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

describe('banqiHiddenPool', () => {
  it('starts as the full 16-per-ink multiset with nothing revealed', () => {
    const state = createInitialBanqiState('b0');
    const pool = banqiHiddenPool(getBanqiPlayerView(state, 'red'));
    expect(pool.red.total).toBe(16);
    expect(pool.black.total).toBe(16);
    expect(pool.red.entries.map((e) => e.role)).toEqual([
      'general',
      'advisor',
      'elephant',
      'chariot',
      'horse',
      'cannon',
      'soldier',
    ]);
    expect(pool.red.entries.find((e) => e.role === 'soldier')?.count).toBe(5);
    expect(pool.red.unknownCaptured).toBe(0);
  });

  it('matches the truth face-down multiset at every ply of a random playout, for both seats', () => {
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      let state: BanqiGameState = createInitialBanqiState(`b${seed}`, createBanqiDeal(rng));
      let sawCapture = false;
      for (let ply = 0; ply < MAX_PLIES && state.status.type === 'playing'; ply += 1) {
        for (const seat of ['red', 'black'] as const) {
          const pool = banqiHiddenPool(getBanqiPlayerView(state, seat));
          for (const ink of ['red', 'black'] as const) {
            expect(multiset(poolRoles(pool[ink].entries))).toBe(
              multiset(faceDownRoles(state.board, ink)),
            );
            expect(pool[ink].unknownCaptured).toBe(0);
          }
        }
        const moves = getBanqiLegalMoves(state);
        const next = applyBanqiMove(state, pick(moves, rng));
        if (next.captures.length > state.captures.length) sawCapture = true;
        state = next;
      }
      expect(sawCapture).toBe(true);
    }
  });
});

describe('jungleFlipHiddenPool', () => {
  it('starts as one of each animal per ink, strongest first', () => {
    const state = createInitialJungleFlipState('j0');
    const pool = jungleFlipHiddenPool(getJungleFlipPlayerView(state, 'red'));
    expect(pool.red.entries.map((e) => e.role)).toEqual<JunglePieceRole[]>([
      'elephant',
      'lion',
      'tiger',
      'leopard',
      'wolf',
      'dog',
      'cat',
      'rat',
    ]);
    expect(pool.black.total).toBe(8);
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
        for (const seat of ['red', 'black'] as const) {
          const pool = jungleFlipHiddenPool(getJungleFlipPlayerView(state, seat));
          for (const ink of ['red', 'black'] as const) {
            expect(multiset(poolRoles(pool[ink].entries))).toBe(
              multiset(faceDownRoles(state.board, ink)),
            );
            expect(pool[ink].unknownCaptured).toBe(0);
          }
        }
        const moves = getJungleFlipLegalMoves(state);
        const next = applyJungleFlipMove(state, pick(moves, rng));
        if (next.captures.length - state.captures.length === 2) sawTrade = true;
        state = next;
      }
    }
    expect(sawTrade).toBe(true);
  });
});

describe('jieqiHiddenPool', () => {
  it('starts as the 15 dark pieces per side, general excluded', () => {
    const state = createInitialJieqiState('q0');
    const pool = jieqiHiddenPool(getJieqiPlayerView(state, 'red'));
    expect(pool.red.total).toBe(15);
    expect(pool.black.total).toBe(15);
    expect(pool.red.entries.map((e) => e.role)).toEqual<JieqiPieceRole[]>([
      'chariot',
      'cannon',
      'horse',
      'elephant',
      'advisor',
      'soldier',
    ]);
    expect(pool.red.entries.find((e) => e.role === 'soldier')?.count).toBe(5);
  });

  it('is exact for the opponent and carries the unseen captures of your own ink', () => {
    let sawDarkCapture = false;
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      let state: JieqiGameState = createInitialJieqiState(`q${seed}`, createJieqiDeal(rng));
      for (let ply = 0; ply < MAX_PLIES && state.status.type === 'playing'; ply += 1) {
        for (const viewer of ['red', 'black'] as const) {
          const view = getJieqiPlayerView(state, viewer);
          const pool = jieqiHiddenPool(view);
          for (const ink of ['red', 'black'] as const) {
            // What this viewer was never told: captures of `ink` still dark when
            // taken by the other side (the viewer is the owner, not the capturer).
            const unseen = state.captures.filter(
              (c) => c.owner === ink && !c.revealedAtCapture && c.owner === viewer,
            );
            const expected = [...faceDownRoles(state.board, ink), ...unseen.map((c) => c.role)];
            expect(multiset(poolRoles(pool[ink].entries))).toBe(multiset(expected));
            expect(pool[ink].unknownCaptured).toBe(unseen.length);
            expect(pool[ink].total - pool[ink].unknownCaptured).toBe(
              faceDownRoles(state.board, ink).length,
            );
            if (unseen.length > 0) sawDarkCapture = true;
          }
          // The pool never names a general.
          for (const ink of ['red', 'black'] as const) {
            expect(pool[ink].entries.some((e) => e.role === 'general')).toBe(false);
          }
        }
        const moves = getJieqiLegalMoves(state);
        state = applyJieqiMove(state, pick(moves, rng));
      }
    }
    expect(sawDarkCapture).toBe(true);
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
    expect(capture).toBeDefined();
    const owner = capture!.owner as JieqiColor;
    const capturer: JieqiColor = owner === 'red' ? 'black' : 'red';
    const asCapturer = jieqiHiddenPool(getJieqiPlayerView(state, capturer))[owner];
    const asOwner = jieqiHiddenPool(getJieqiPlayerView(state, owner))[owner];
    expect(asCapturer.unknownCaptured).toBe(0);
    expect(asOwner.unknownCaptured).toBeGreaterThan(0);
    expect(asOwner.total).toBe(asCapturer.total + asOwner.unknownCaptured);
  });
});
