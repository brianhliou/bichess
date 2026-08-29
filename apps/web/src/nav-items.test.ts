import { afterEach, describe, expect, it, vi } from 'vitest';

// The Streamers nav link is derived from the curated directory, so these tests
// drive nav-items.ts against a mocked list rather than the shipped (empty) one.
afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./streamers-data.js');
});

describe('watch nav', () => {
  it('hides Streamers while nobody is listed', async () => {
    vi.doMock('./streamers-data.js', () => ({ STREAMERS: [] }));
    const { watchNavItems } = await import('./nav-items.js');

    expect(watchNavItems().map((item) => item.label)).toEqual([
      'Mistboard TV',
      'Broadcasts',
      'Video library',
    ]);
  });

  it('shows Streamers as soon as the directory has someone in it', async () => {
    vi.resetModules();
    vi.doMock('./streamers-data.js', () => ({
      STREAMERS: [
        {
          name: 'Riverbank',
          platform: 'twitch',
          url: 'https://twitch.tv/riverbank',
          blurb: 'Xiangqi for chess players.',
          language: 'English',
          addedAt: '2026-08-27',
        },
      ],
    }));
    const { watchNavItems } = await import('./nav-items.js');

    const items = watchNavItems();
    expect(items.map((item) => item.label)).toEqual([
      'Mistboard TV',
      'Broadcasts',
      'Streamers',
      'Video library',
    ]);
    expect(items.find((item) => item.label === 'Streamers')?.href).toBe('/streamer');
  });
});

describe('tools nav', () => {
  it('lists the analysis board first and the board editor beside it', async () => {
    const { toolsNavItems } = await import('./nav-items.js');
    const items = toolsNavItems();
    expect(items.slice(0, 2).map((item) => item.label)).toEqual(['Analysis board', 'Board editor']);
    expect(items[0]?.href).toBe('/analysis/xiangqi');
    expect(items[1]?.href).toBe('/editor/xiangqi');
    expect(items[1]?.labelKey).toBe('nav.editor');
  });

  // The games database is the one nav entry that has moved menus, so assert it
  // is HERE and not in Watch. A one-sided check would pass with it in both.
  it('carries the games database, and Watch no longer does', async () => {
    const { toolsNavItems, watchNavItems } = await import('./nav-items.js');
    const games = toolsNavItems().find((item) => item.href === '/games');
    expect(games?.label).toBe('Games');
    expect(games?.labelKey).toBe('nav.games');
    expect(watchNavItems().some((item) => item.href === '/games')).toBe(false);
  });
});
