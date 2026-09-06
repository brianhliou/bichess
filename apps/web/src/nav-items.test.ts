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
      'Current games',
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
      'Current games',
      'Broadcasts',
      'Streamers',
      'Video library',
    ]);
    expect(items.find((item) => item.label === 'Streamers')?.href).toBe('/streamer');
  });
});

// The dev/test environment has practiceEnabled() true (import.meta.env.DEV), so
// the shipped nav in every other test carries Practice. This is the only place
// the PARKED shape is exercised, and without it the prod nav is untested: the
// suite would stay green with the entry still linking a route that 404s.
describe('learn nav', () => {
  it('drops Practice while the surface is parked (#363)', async () => {
    vi.resetModules();
    vi.doMock('./feature-flags.js', async () => ({
      ...(await vi.importActual<typeof import('./feature-flags.js')>('./feature-flags.js')),
      practiceEnabled: () => false,
    }));
    const { learnNavItems } = await import('./nav-items.js');

    expect(learnNavItems().map((item) => item.label)).toEqual([
      'Rules',
      'Xiangqi Basics',
      'Study',
      'Coaches',
    ]);
    vi.doUnmock('./feature-flags.js');
  });

  it('restores Practice between the course and studies once unparked', async () => {
    vi.resetModules();
    vi.doMock('./feature-flags.js', async () => ({
      ...(await vi.importActual<typeof import('./feature-flags.js')>('./feature-flags.js')),
      practiceEnabled: () => true,
    }));
    const { learnNavItems } = await import('./nav-items.js');

    const items = learnNavItems();
    expect(items.map((item) => item.label)).toEqual([
      'Rules',
      'Xiangqi Basics',
      'Practice',
      'Study',
      'Coaches',
    ]);
    expect(items.find((item) => item.label === 'Practice')?.href).toBe('/practice');
    vi.doUnmock('./feature-flags.js');
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
  // is HERE (at /games/search) and not in Watch. A one-sided check would pass
  // with it in both. Watch carries /games, which is now the current-games page.
  it('carries the games database at /games/search, and Watch carries current games at /games', async () => {
    const { toolsNavItems, watchNavItems } = await import('./nav-items.js');
    const search = toolsNavItems().find((item) => item.href === '/games/search');
    expect(search?.label).toBe('Advanced search');
    expect(search?.labelKey).toBe('nav.gamesSearch');
    expect(toolsNavItems().some((item) => item.href === '/games')).toBe(false);
    const current = watchNavItems().find((item) => item.href === '/games');
    expect(current?.label).toBe('Current games');
    expect(current?.labelKey).toBe('nav.currentGames');
    expect(watchNavItems().some((item) => item.href === '/games/search')).toBe(false);
  });

  it('offers the import door, which is otherwise reachable only by URL', async () => {
    const { toolsNavItems } = await import('./nav-items.js');
    const imported = toolsNavItems().find((item) => item.href === '/import');
    expect(imported?.label).toBe('Import game');
    expect(imported?.labelKey).toBe('nav.import');
  });
});
