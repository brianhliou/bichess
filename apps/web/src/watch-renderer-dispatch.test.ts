import { describe, expect, it, vi } from 'vitest';
import type { FeaturedGame } from './game-display.js';

// Identity-mock the dispatch resolver + variant normalizer so the test asserts
// the KEYING (which id the watch dispatcher feeds in), not the tenant registry
// (which is not populated in this jsdom env). Mirrors showcase-cycler.test.ts.
vi.mock('./showcase-dispatch.js', () => ({
  showcaseRendererKindForSpec: (specId: string | null) => specId ?? 'chess',
  specIdForShowcaseVariant: (variant: string) => variant,
}));

const { watchRendererKindForGame } = await import('./watch-route.js');

function game(roomId: string, variant: string): FeaturedGame {
  return {
    roomId,
    variant,
    mode: 'eve',
    result: 'white-wins',
    termination: 'king-captured',
    plyCount: 20,
    whiteName: null,
    blackName: null,
    corpusId: null,
  };
}

function feed(channelGameSpecIds: string[], unlocked: FeaturedGame[]) {
  return {
    activeChannel: 'engines',
    channels: [
      {
        family: 'chess',
        gameSpecIds: channelGameSpecIds,
        id: 'engines',
        label: 'Engines',
        sealedCount: 0,
        unlockedCount: unlocked.length,
      },
    ],
    now: '2026-07-11T00:00:00.000Z',
    unlockLimit: 64,
    sealedCount: 0,
    unlocked,
  };
}

describe('watchRendererKindForGame', () => {
  it('keys on the SELECTED GAME variant, not the channel (cross-variant Engines channel)', () => {
    // The Engines channel carries no per-channel spec; two EvE games of different
    // variants must resolve to different renderers.
    const cross = feed([], [game('r1', 'dark-chess'), game('r2', 'xiangqi')]);
    expect(watchRendererKindForGame(cross, 'r1')).toBe('dark-chess');
    expect(watchRendererKindForGame(cross, 'r2')).toBe('xiangqi');
  });

  it('ignores the channel spec when a game matches (game wins over channel)', () => {
    // Even if the channel advertised a spec, the game's own variant decides.
    const mixed = feed(['dark-chess'], [game('r2', 'xiangqi')]);
    expect(watchRendererKindForGame(mixed, 'r2')).toBe('xiangqi');
  });

  it('falls back to the channel primary spec when the roomId is absent', () => {
    const withSpec = feed(['jungle'], [game('r1', 'dark-chess')]);
    expect(watchRendererKindForGame(withSpec, 'missing')).toBe('jungle');
    const noSpec = feed([], [game('r1', 'dark-chess')]);
    expect(watchRendererKindForGame(noSpec, 'missing')).toBe('chess');
  });
});
