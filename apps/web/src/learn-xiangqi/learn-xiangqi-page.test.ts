// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../live-sound.js', () => ({
  initLiveSound: vi.fn(),
  playSound: vi.fn(),
}));

vi.mock('../site-shell.js', () => ({
  buildNav: () => document.createElement('nav'),
}));

// The page asks who is signed in twice: a synchronous hint for the first paint,
// then /api/auth/me to settle it. Both are stubbed per test.
const signedInHint = vi.fn(() => false);
const resolvedUser = vi.fn(() => Promise.resolve<unknown>(null));

vi.mock('../signed-in-state.js', () => ({
  isLikelySignedIn: () => signedInHint(),
}));

vi.mock('../account-nav.js', () => ({
  loadCachedCurrentUser: () => resolvedUser(),
}));

vi.mock('../xiangqi-board.js', () => ({
  createXiangqiInteractiveBoard: () => ({
    render: vi.fn(),
    setArrows: vi.fn(),
    setMarkers: vi.fn(),
  }),
}));

import { mountLearnXiangqi } from './learn-xiangqi-page.js';

const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
};

describe('Learn Xiangqi chrome', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.location.hash = '';
    document.body.replaceChildren();
    signedInHint.mockReturnValue(false);
    resolvedUser.mockResolvedValue(null);
  });

  const registerTile = (root: HTMLElement): HTMLAnchorElement | null =>
    [...root.querySelectorAll<HTMLAnchorElement>('.learn-xq-what-next .learn-xq-tile')].find(
      (tile) => tile.querySelector('h3')?.textContent === 'Register',
    ) ?? null;

  it('leaves Register as an open call to action when signed out', () => {
    const root = document.createElement('div');
    document.body.append(root);
    mountLearnXiangqi(root);

    const tile = registerTile(root);
    expect(tile?.classList.contains('learn-xq-tile--link')).toBe(true);
    expect(tile?.querySelector('.learn-xq-ribbon')).toBeNull();
  });

  it('marks Register done for a signed-in visitor, with a finished stage anatomy', () => {
    signedInHint.mockReturnValue(true);
    const root = document.createElement('div');
    document.body.append(root);
    mountLearnXiangqi(root);

    const tile = registerTile(root);
    expect(tile?.classList.contains('learn-xq-tile--done')).toBe(true);
    const ribbon = tile?.querySelector('.learn-xq-ribbon-wrap > .learn-xq-ribbon');
    expect(ribbon?.classList.contains('learn-xq-ribbon--done')).toBe(true);
    expect(ribbon?.getAttribute('aria-label')).toBe('Completed');

    // Only Register completes. The rest are places to go, not things to finish.
    const others = [...root.querySelectorAll('.learn-xq-what-next .learn-xq-tile')].filter(
      (other) => other !== tile,
    );
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) expect(other.querySelector('.learn-xq-ribbon')).toBeNull();
  });

  // The hint is localStorage and can be stale: signed out in another tab, or
  // never set because this is a fresh browser. Whichever way it is wrong, the
  // tile has to end up matching the server.
  it('corrects a wrong hint once auth settles, in both directions', async () => {
    signedInHint.mockReturnValue(true);
    resolvedUser.mockResolvedValue(null);
    const staleRoot = document.createElement('div');
    document.body.append(staleRoot);
    mountLearnXiangqi(staleRoot);
    expect(registerTile(staleRoot)?.classList.contains('learn-xq-tile--done')).toBe(true);
    await vi.waitFor(() =>
      expect(registerTile(staleRoot)?.classList.contains('learn-xq-tile--link')).toBe(true),
    );

    signedInHint.mockReturnValue(false);
    resolvedUser.mockResolvedValue({ id: 'u1' });
    const coldRoot = document.createElement('div');
    document.body.append(coldRoot);
    mountLearnXiangqi(coldRoot);
    expect(registerTile(coldRoot)?.classList.contains('learn-xq-tile--link')).toBe(true);
    await vi.waitFor(() =>
      expect(registerTile(coldRoot)?.classList.contains('learn-xq-tile--done')).toBe(true),
    );
  });

  // Rebuilding the page under a player who is mid-level would discard the board
  // the runner owns, to restyle a tile that is not even on screen.
  it('does not re-render a level in progress when auth settles', async () => {
    signedInHint.mockReturnValue(false);
    resolvedUser.mockResolvedValue({ id: 'u1' });
    const root = document.createElement('div');
    document.body.append(root);
    mountLearnXiangqi(root);

    window.location.hash = '#/chariot';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    const run = root.querySelector('.learn-xq--run');
    expect(run).not.toBeNull();
    const board = run?.firstElementChild ?? null;
    expect(board).not.toBeNull();

    // Let the auth promise and its .then chain drain.
    for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();

    // Still the run screen, and still the very same nodes: a re-render here
    // would have replaced them and taken the level's board state with it.
    expect(root.querySelector('.learn-xq--run')).toBe(run);
    expect(run?.firstElementChild).toBe(board);
    expect(registerTile(root)).toBeNull();
  });

  it('renders clipped corner ribbons and focuses the run menu on one category', () => {
    const root = document.createElement('div');
    document.body.append(root);
    mountLearnXiangqi(root);

    const firstTile = root.querySelector('.learn-xq-tile--ongoing');
    expect(firstTile?.querySelector('.learn-xq-ribbon-wrap > .learn-xq-ribbon')).not.toBeNull();
    expect(root.querySelector('.learn-xq-tile--future .learn-xq-ribbon-wrap')).toBeNull();

    window.location.hash = '#/chariot';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    const categories = [...root.querySelectorAll<HTMLElement>('.learn-xq-side-category')];
    expect(categories).toHaveLength(4);
    expect(categories.map((category) => category.classList.contains('expanded'))).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(root.querySelector('.learn-xq-side-stage.active')?.getAttribute('aria-current')).toBe(
      'step',
    );

    const fundamentalsToggle = categories[1]?.querySelector<HTMLButtonElement>(
      '.learn-xq-side-category-toggle',
    );
    fundamentalsToggle?.click();
    expect(categories.map((category) => category.classList.contains('expanded'))).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(fundamentalsToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(
      categories[0]?.querySelector<HTMLElement>('.learn-xq-side-category-stages')?.hidden,
    ).toBe(true);
  });
});
