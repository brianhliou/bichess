import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitBoardWidth, mountEmbedGame } from './embed-game-page.js';
import { embedGameRouteFromPath, embedPlyFromSearch, embedRouteFromPath } from './embed-route.js';

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('embedGameRouteFromPath', () => {
  it('matches a game path by room id and nothing else', () => {
    expect(embedGameRouteFromPath('/embed/game/abc-123_X')).toEqual({ roomId: 'abc-123_X' });
    expect(embedGameRouteFromPath('/embed/game/abc/')).not.toBeNull();
    for (const bad of ['/embed/game', '/embed/game/a/b', '/game/abc', '/embed/study/a/b']) {
      expect(embedGameRouteFromPath(bad), bad).toBeNull();
    }
  });

  it('refuses ids that are not id-shaped', () => {
    // Frameable by anyone, so the input is hostile by default.
    expect(embedGameRouteFromPath('/embed/game/../../account')).toBeNull();
    expect(embedGameRouteFromPath('/embed/game/a b')).toBeNull();
    expect(embedGameRouteFromPath(`/embed/game/${'a'.repeat(65)}`)).toBeNull();
  });
});

describe('embedRouteFromPath', () => {
  it('discriminates the embed kinds', () => {
    expect(embedRouteFromPath('/embed/study/s/c')).toEqual({
      kind: 'study',
      route: { studyId: 's', chapterId: 'c' },
    });
    expect(embedRouteFromPath('/embed/game/r')).toEqual({ kind: 'game', route: { roomId: 'r' } });
    expect(embedRouteFromPath('/embed')).toBeNull();
    expect(embedRouteFromPath('/')).toBeNull();
  });
});

describe('embedPlyFromSearch', () => {
  it('reads a non-negative integer and nothing else', () => {
    expect(embedPlyFromSearch('?ply=12')).toBe(12);
    expect(embedPlyFromSearch('?ply=0')).toBe(0);
    expect(embedPlyFromSearch('')).toBeNull();
    expect(embedPlyFromSearch('?ply=-1')).toBeNull();
    expect(embedPlyFromSearch('?ply=abc')).toBeNull();
    expect(embedPlyFromSearch('?ply=1e3')).toBeNull();
  });
});

describe('fitBoardWidth', () => {
  it('is bounded by the room beside the rail in the wide layout', () => {
    // 760 wide: the rail takes 178, leaving 582; the height allows more.
    expect(fitBoardWidth({ width: 760, height: 900 }, 0.9, false)).toBe(582);
  });

  it('is bounded by the height when the frame is short', () => {
    // 700 tall minus the seat rows = 644, times a 9:10 board = 579.
    expect(fitBoardWidth({ width: 1200, height: 700 }, 0.9, false)).toBe(579);
  });

  it('keeps room for the move list when stacked', () => {
    const wide = fitBoardWidth({ width: 400, height: 700 }, 1, false);
    const stacked = fitBoardWidth({ width: 400, height: 700 }, 1, true);
    expect(stacked).toBeLessThanOrEqual(400);
    expect(stacked).toBeLessThan(wide + 200);
  });

  it('never collapses to nothing', () => {
    expect(fitBoardWidth({ width: 100, height: 100 }, 1, false)).toBe(120);
  });
});

describe('mountEmbedGame', () => {
  it('says an unfinished or missing game is unavailable rather than looking broken', async () => {
    stubFetch(404, { error: 'not_found' });
    const root = document.createElement('div');
    await mountEmbedGame(root, { roomId: 'nope' });
    expect(root.textContent).toContain('not available');
    expect(document.documentElement.dataset.embed).toBe('game');
  });

  it('treats a private game as unavailable even when the summary answers', async () => {
    stubFetch(200, { game: { roomId: 'r', variant: 'xiangqi', visibility: 'private' } });
    const root = document.createElement('div');
    await mountEmbedGame(root, { roomId: 'r' });
    expect(root.textContent).toContain('not available');
  });

  it('does not throw when the network fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    const root = document.createElement('div');
    await mountEmbedGame(root, { roomId: 'r' });
    expect(root.textContent).toContain('could not be loaded');
  });
});
