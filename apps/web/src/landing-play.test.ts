import { canonicalVariantOrderIndex, type GameSpecId } from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLandingPlayPanel, maybeOpenPlayDeepLink, setRoomNavigator } from './landing-play.js';
import { setRatedModeEnabled } from './rated-flag.js';
import { setResolvedSignedIn } from './signed-in-state.js';

const BASELINE_PICKER_SPECS = [
  'dark-chess',
  'mini-xiangqi',
  'dark-mini-xiangqi',
  'drop-mini-xiangqi',
  'dark-xiangqi',
  'jieqi',
  'banqi',
  'reveal-chess',
  'crossroads-chess',
  'dark-crossroads-chess',
  'dark-shogi',
  'dark-crazyhouse',
  'kriegspiel',
];

describe('landing play panel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    setRatedModeEnabled(false);
    setResolvedSignedIn(undefined);
    setRoomNavigator(null);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('shows integrated variants in production without client launch flags', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openPlaySetup(panel, 'Challenge a friend');

    expect(variantPickerSpecs()).toEqual(BASELINE_PICKER_SPECS);
  });

  it('shows the Misty brand placeholder, not a built-in engine name, before the roster loads', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    // Empty roster → the panel falls back to the loading placeholder. It must read
    // as the real product, never the old "Random Legal v1" built-in name.
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    const engineButton = [...panel.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes('Play the engine'),
    );

    engineButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const overlay = document.querySelector('.landing-setup-overlay');

    expect(overlay?.textContent).toContain('Misty');
    expect(overlay?.textContent).not.toContain('Random Legal');
  });

  it('shows mini-board markers for the baseline picker variants', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_JIEQI_ENABLED', 'false');
    vi.stubEnv('VITE_BANQI_ENABLED', 'false');
    vi.stubEnv('VITE_REVEAL_CHESS_ENABLED', 'false');
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_CROSSROADS_CHESS_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_CRAZYHOUSE_ENABLED', 'false');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');

    expect(variantPickerPresent()).toBe(true);
    expect(variantPickerSpecs()).toEqual(BASELINE_PICKER_SPECS);
    expect(
      document.querySelector(
        '.landing-variant-card[data-game-spec="dark-chess"] svg[data-mini-id="dark-chess"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '.landing-variant-card[data-game-spec="mini-xiangqi"] svg[data-mini-id="mini-xiangqi"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '.landing-variant-card[data-game-spec="dark-shogi"] svg[data-mini-id="dark-shogi"]',
      ),
    ).not.toBeNull();
  });

  it('starts setup on Game group and filters variants by family', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');

    expect(activeSetupSection()).toBe('gameGroup');
    expect(setupSummaryValue('gameGroup')).toBe('Chess');
    expect(visibleVariantPickerSpecs()).toEqual([
      'dark-chess',
      'reveal-chess',
      'crossroads-chess',
      'dark-crossroads-chess',
      'dark-crazyhouse',
      'kriegspiel',
    ]);

    clickModalGameGroup('Xiangqi');

    expect(activeSetupSection()).toBe('variant');
    expect(setupSummaryValue('gameGroup')).toBe('Xiangqi');
    expect(selectedVariantSpec()).toBe('mini-xiangqi');
    expect(visibleVariantPickerSpecs()).toEqual([
      'mini-xiangqi',
      'dark-mini-xiangqi',
      'drop-mini-xiangqi',
      'dark-xiangqi',
      'jieqi',
      'banqi',
    ]);

    selectModalVariant('dark-mini-xiangqi');
    expect(activeSetupSection()).toBe('time');
  });

  it('omits engine-mode game groups with no playable engine variants', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');

    expect(modalGameGroups()).toContain('Chess');
    expect(modalGameGroups()).toContain('Xiangqi');
    expect(modalGameGroups()).not.toContain('Crossroads');
    expect(modalGameGroups()).not.toContain('Shogi');
  });

  it('creates dark chess rooms with a canonical game spec id behind the Variant UI', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dark_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    const challengeButton = [...panel.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Challenge a friend',
    );

    challengeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const createButton = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Create room',
    );
    createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const roomCall = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(roomCall).toBeDefined();
    expect(JSON.parse(String(roomCall?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'dark-chess',
      hiddenDraft960: false,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      rated: false,
      preferredColor: 'random',
    });
    expect(window.location.pathname).toBe('/room/dark_home');
  });

  it('remembers start setup separately for engine, friend, and lobby entry points', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/sticky' });
      if (String(input) === '/api/lobby' && init?.method === 'POST') {
        return jsonResponse({ status: 'waiting', ticketId: 'sticky-ticket', pollAfterMs: 60_000 });
      }
      return jsonResponse({ requests: [] });
    });
    vi.stubGlobal('fetch', fetchSpy);
    setRoomNavigator(() => {});
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    clickModalButton('1 + 1');
    clickModalColor('Black');
    clickModalButton('Start game');
    await flushPromises();
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Challenge a friend');
    expect(selectedModalTimeControl()).toBe('3 + 2');
    expect(selectedModalColor()).toBe('Random');
    clickModalColor('White');
    clickModalButton('Create room');
    await flushPromises();
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Find opponent');
    expect(selectedModalTimeControl()).toBe('3 + 2');
    expect(document.querySelector('.landing-color-label')).toBeNull();
    clickModalButton('1 + 1');
    clickModalButton('Find opponent');
    await flushPromises();
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Play the engine');
    expect(selectedModalTimeControl()).toBe('1 + 1');
    expect(selectedModalColor()).toBe('Black');
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Challenge a friend');
    expect(selectedModalTimeControl()).toBe('3 + 2');
    expect(selectedModalColor()).toBe('White');
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Find opponent');
    expect(selectedModalTimeControl()).toBe('1 + 1');
  });

  it('creates a timed Dark Mini Xiangqi room from the flagged challenge variant', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxq_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    const challengeButton = [...panel.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Challenge a friend',
    );

    challengeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(variantPickerPresent()).toBe(true);
    expect(variantPickerSpecs()).toContain('dark-mini-xiangqi');
    selectModalVariant('dark-mini-xiangqi');
    expect(document.body.textContent).toContain('Red');
    // Mini is timed: the time-control section is shown like the other variants.
    const timeSection = document
      .querySelector('.landing-time-presets')
      ?.closest('.landing-setup-section') as HTMLElement | null;
    expect(timeSection?.hidden).toBe(false);
    clickModalButton('1 + 1');
    const createButton = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Create room',
    );
    createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const roomCall = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(roomCall).toBeDefined();
    expect(JSON.parse(String(roomCall?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'dark-mini-xiangqi',
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
      rated: false,
      preferredColor: 'random',
    });
    expect(window.location.pathname).toBe('/room/dmxq_home');
  });

  it('creates a casual Mini Xiangqi room from the flagged challenge variant', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/mxq_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    expect(variantPickerPresent()).toBe(true);
    expect(variantPickerSpecs()).toContain('mini-xiangqi');
    selectModalVariant('mini-xiangqi');
    expect(modalColorOptions()).toEqual([
      { label: 'Red', glyph: '帥', classes: 'landing-color-glyph red xiangqi' },
      { label: 'Random', glyph: '帥將', classes: 'landing-color-glyph random xiangqi' },
      { label: 'Black', glyph: '將', classes: 'landing-color-glyph black xiangqi' },
    ]);
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2', '5 + 5']);
    expect(document.body.textContent).toContain('Ratedcoming soon');
    clickModalButton('5 + 5');
    clickModalColor('Red');
    clickModalButton('Create room');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toEqual({
      mode: 'pvp',
      gameSpecId: 'mini-xiangqi',
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      rated: false,
      preferredColor: 'red',
    });
    expect(window.location.pathname).toBe('/room/mxq_home');
  });

  it('creates a timed Crossroads Chess room from the flagged challenge variant', async () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dchess_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    expect(variantPickerPresent()).toBe(true);
    expect(variantPickerSpecs()).toContain('crossroads-chess');
    selectModalVariant('crossroads-chess');
    expect(modalColorOptions()).toEqual([
      { label: 'White', glyph: '♚', classes: 'landing-color-glyph white' },
      { label: 'Random', glyph: '♚♚', classes: 'landing-color-glyph random' },
      { label: 'Black', glyph: '♚', classes: 'landing-color-glyph black' },
    ]);
    expect(document.body.textContent).toContain('Black');
    expect(document.body.textContent).not.toContain('Red');
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2', '5 + 5']);
    clickModalButton('5 + 5');
    clickModalColor('Black');
    clickModalButton('Create room');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toEqual({
      mode: 'pvp',
      gameSpecId: 'crossroads-chess',
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      rated: false,
      preferredColor: 'black',
    });
    expect(window.location.pathname).toBe('/room/dchess_home');
  });

  it('creates a Reveal Chess room (not dark chess) from the flagged challenge variant', async () => {
    // Regression: roomCreationGameSpecId once lacked a reveal-chess case, so the
    // create POST silently fell back to dark-chess despite the picker selection.
    // Each menu-offered variant must round-trip its own gameSpecId into the body.
    vi.stubEnv('VITE_REVEAL_CHESS_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/rc_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    expect(variantPickerSpecs()).toContain('reveal-chess');
    selectModalVariant('reveal-chess');
    // White/black (standard chess colors), casual-only, no draft960 axis.
    expect(modalColorOptions()).toEqual([
      { label: 'White', glyph: '♚', classes: 'landing-color-glyph white' },
      { label: 'Random', glyph: '♚♚', classes: 'landing-color-glyph random' },
      { label: 'Black', glyph: '♚', classes: 'landing-color-glyph black' },
    ]);
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2', '5 + 5']);
    clickModalButton('5 + 5');
    clickModalColor('White');
    clickModalButton('Create room');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toEqual({
      mode: 'pvp',
      gameSpecId: 'reveal-chess',
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      rated: false,
      preferredColor: 'white',
    });
    expect(window.location.pathname).toBe('/room/rc_home');
  });

  it('shows Banqi first and second move-order choices in the setup modal', async () => {
    vi.stubEnv('VITE_BANQI_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/bq_home' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    selectModalVariant('banqi');

    const picker = document
      .querySelector('.landing-color-option')
      ?.closest<HTMLElement>('.landing-start-options');
    expect(picker?.getAttribute('aria-label')).toBe('Move order');
    expect(modalColorOptions()).toEqual([
      { label: 'First', glyph: '1', classes: 'landing-color-glyph banqi-seat' },
      { label: 'Random', glyph: '12', classes: 'landing-color-glyph random banqi-seat' },
      { label: 'Second', glyph: '2', classes: 'landing-color-glyph banqi-seat' },
    ]);

    clickModalColor('Second');
    clickModalButton('Create room');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toEqual({
      mode: 'pvp',
      gameSpecId: 'banqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'black',
    });
    expect(window.location.pathname).toBe('/room/bq_home');
  });

  it('creates a Crossroads Chess engine room with the selected Fairy-Stockfish tier', async () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dchess_engine' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([
      { id: 'python-v2-v1.0', name: 'Misty', familyName: 'Misty', kind: 'fog-chess' },
    ]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('crossroads-chess');
    const engineSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Engine"]');
    expect(engineSelect).not.toBeNull();
    // Strongest-first ordering: toughest opponent sits at the top of the picker.
    expect([...engineSelect!.options].map((option) => [option.value, option.textContent])).toEqual([
      ['fairy-stockfish-crossroads-very-strong', 'Fairy Stockfish - Strongest'],
      ['fairy-stockfish-crossroads-strong', 'Fairy Stockfish - Strong'],
      ['fairy-stockfish-crossroads-amateur', 'Fairy Stockfish - Amateur'],
    ]);
    expect(engineSelect!.value).toBe('fairy-stockfish-crossroads-strong');
    selectModalEngine('fairy-stockfish-crossroads-very-strong');
    clickModalColor('Black');
    clickModalButton('Start game');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toEqual({
      mode: 'pve',
      gameSpecId: 'crossroads-chess',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      rated: false,
      preferredColor: 'black',
      engineId: 'fairy-stockfish-crossroads-very-strong',
    });
    expect(window.location.pathname).toBe('/room/dchess_engine');
  });

  it('creates a Drop Mini Xiangqi engine room with the selected built-in tier', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxqd_engine' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('drop-mini-xiangqi');
    const engineSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Engine"]');
    expect(engineSelect).not.toBeNull();
    expect([...engineSelect!.options].map((option) => [option.value, option.textContent])).toEqual([
      ['misty-drop-mini-level-1', 'Misty Drop Mini level 1'],
      ['misty-drop-mini-level-2', 'Misty Drop Mini level 2'],
      ['misty-drop-mini-level-3', 'Misty Drop Mini level 3'],
    ]);
    expect(engineSelect!.value).toBe('misty-drop-mini-level-2');
    selectModalEngine('misty-drop-mini-level-1');
    clickModalColor('Black');
    clickModalButton('Start game');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toEqual({
      mode: 'pve',
      gameSpecId: 'drop-mini-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'black',
      engineId: 'misty-drop-mini-level-1',
    });
    expect(window.location.pathname).toBe('/room/dmxqd_engine');
  });

  it('remembers each variant engine pick independently (no cross-variant clobber)', () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubEnv('VITE_JIEQI_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    // Pick the strongest Crossroads engine (the default is the middle tier)...
    selectModalVariant('crossroads-chess');
    selectModalEngine('fairy-stockfish-crossroads-very-strong');
    // ...then visit Jieqi (which resolves to its own engine)...
    selectModalVariant('jieqi');
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Engine"]')!.value).toBe(
      'pikafish-jieqi-strong',
    );
    // ...and back to Crossroads: the earlier pick must survive the round-trip.
    selectModalVariant('crossroads-chess');
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Engine"]')!.value).toBe(
      'fairy-stockfish-crossroads-very-strong',
    );
  });

  it('makes the last-played engine sticky across reopening the setup dialog', async () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dchess_engine' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('crossroads-chess');
    selectModalEngine('fairy-stockfish-crossroads-very-strong');
    clickModalColor('Black');
    clickModalButton('Start game');
    await flushPromises();

    // Reopen: the strongest tier (a non-default pick) should be preselected.
    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('crossroads-chess');
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Engine"]')!.value).toBe(
      'fairy-stockfish-crossroads-very-strong',
    );
  });

  it('shows a specific error when Crossroads room creation is disabled server-side', async () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') {
        return jsonResponse({ error: 'crossroads_chess_disabled' }, { status: 404 });
      }
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    selectModalVariant('crossroads-chess');
    clickModalButton('Create room');
    await flushPromises();

    expect(document.querySelector('.landing-setup-status')?.textContent).toBe(
      'Crossroads Chess live rooms are not enabled on this server.',
    );
  });

  it('keeps Crossroads Chess inside the friend-room variant picker, not as a hub link', () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );

    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    expect(panel.querySelector<HTMLAnchorElement>('.landing-play-action-crossroads')).toBeNull();

    openPlaySetup(panel, 'Challenge a friend');
    expect(variantPickerSpecs()).toContain('crossroads-chess');
  });

  it('keeps 5+5 hidden for fog variants in the setup modal', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2']);

    selectModalVariant('dark-mini-xiangqi');
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2']);
  });

  it('offers correspondence days for casual dark chess in both friend challenge and find opponent', () => {
    vi.stubEnv('VITE_CORRESPONDENCE_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    // Challenge a friend, dark chess: the Real time / Correspondence segmented
    // toggle is offered, and flipping to Correspondence reveals the day chips.
    openPlaySetup(panel, 'Challenge a friend');
    selectModalVariant('dark-chess');
    expect(correspondenceToggleVisible()).toBe(true);
    expect(visibleCorrespondenceOptions()).toEqual([]); // hidden until the segment is active
    clickModalButton('Correspondence');
    expect(visibleCorrespondenceOptions()).toEqual(['1 day', '3 days', '7 days']);

    // Other fog variants (DMX) don't carry correspondence yet — dark chess only —
    // so the toggle disappears and the picker falls back to real time.
    selectModalVariant('dark-mini-xiangqi');
    expect(correspondenceToggleVisible()).toBe(false);
    expect(visibleCorrespondenceOptions()).toEqual([]);

    // Find opponent offers it too (submitting posts an open seek to the board).
    openPlaySetup(panel, 'Find opponent');
    selectModalVariant('dark-chess');
    expect(correspondenceToggleVisible()).toBe(true);
    clickModalButton('Correspondence');
    expect(visibleCorrespondenceOptions()).toEqual(['1 day', '3 days', '7 days']);
  });

  it('limits rated setup time controls to 3+2', () => {
    setRatedModeEnabled(true);
    setResolvedSignedIn(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Find opponent');
    expect(visibleModalTimeControls()).toEqual(['3 + 2']);

    clickModalButton('Casual');
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2']);

    clickModalButton('Rated');
    expect(visibleModalTimeControls()).toEqual(['3 + 2']);
  });

  it('keeps rated setup disabled for signed-out players', () => {
    setRatedModeEnabled(true);
    setResolvedSignedIn(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Find opponent');

    expect(document.body.textContent).toContain('Ratedcoming soon');
    expect(visibleModalTimeControls()).toEqual(['1 + 1', '3 + 2']);
  });

  it('offers Crossroads Chess for engine and lobby play', () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    expect(variantPickerSpecs()).toContain('crossroads-chess');
    document.querySelector('.landing-setup-overlay')?.remove();

    openPlaySetup(panel, 'Find opponent');
    expect(variantPickerSpecs()).toContain('crossroads-chess');
  });

  it('keeps Dark Mini Xiangqi in public entry when the old public-entry flag is off', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'false');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    [...panel.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === 'Challenge a friend')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(variantPickerSpecs()).toContain('dark-mini-xiangqi');
  });

  it('uses gameSpecId, not variant, to deep-link the challenge variant projection', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    window.history.replaceState(null, '', '/?play=friend&gameSpecId=dark-mini-xiangqi');

    maybeOpenPlayDeepLink([]);

    expect(selectedVariantSpec()).toBe('dark-mini-xiangqi');
    expect(window.location.search).toBe('');
  });

  it('uses gameSpecId to deep-link Dark Mini Xiangqi engine play', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxq_engine' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    setRoomNavigator(() => {});
    window.history.replaceState(null, '', '/?play=computer&gameSpecId=dark-mini-xiangqi');

    maybeOpenPlayDeepLink([
      { id: 'python-v2-v1.0', name: 'Misty', familyName: 'Misty', kind: 'fog-chess' },
    ]);
    expect(selectedVariantSpec()).toBe('dark-mini-xiangqi');
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toMatchObject({
      mode: 'pve',
      gameSpecId: 'dark-mini-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      preferredColor: 'random',
    });
    expect(window.location.search).toBe('');
  });

  it('sends selected Dark Mini Xiangqi engine colors from the setup modal', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxq_color' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    setRoomNavigator(() => {});
    const panel = buildLandingPlayPanel([
      { id: 'python-v2-v1.0', name: 'Misty', familyName: 'Misty', kind: 'fog-chess' },
    ]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('dark-mini-xiangqi');
    expect(document.querySelector('.landing-variant-control')?.textContent).toBe('Misty DMX 1.0');
    clickModalColor('Black');
    clickModalButton('Start game');
    await flushPromises();
    expect(roomPostBody(fetchSpy)).toMatchObject({
      mode: 'pve',
      gameSpecId: 'dark-mini-xiangqi',
      preferredColor: 'black',
    });

    document.querySelector('.landing-setup-overlay')?.remove();
    fetchSpy.mockClear();

    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('dark-mini-xiangqi');
    clickModalColor('Random');
    clickModalButton('Start game');
    await flushPromises();
    expect(roomPostBody(fetchSpy)).toMatchObject({
      mode: 'pve',
      gameSpecId: 'dark-mini-xiangqi',
      preferredColor: 'random',
    });
  });

  it('creates a Dark Xiangqi engine room with server-defaulted bot and selected color', async () => {
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dxq_engine' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    setRoomNavigator(() => {});
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Play the engine');
    selectModalVariant('dark-xiangqi');
    expect(document.querySelector('.landing-variant-control')?.textContent).toBe('Misty DXQ 1.0');
    clickModalColor('Black');
    clickModalButton('Start game');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toMatchObject({
      mode: 'pve',
      gameSpecId: 'dark-xiangqi',
      preferredColor: 'black',
    });
    expect(roomPostBody(fetchSpy)).not.toHaveProperty('engineId');
  });

  it('keeps the old engine deep-link alias working', () => {
    window.history.replaceState(null, '', '/?play=engine');

    maybeOpenPlayDeepLink([]);

    expect(document.querySelector('.landing-setup-dialog')?.textContent).toContain(
      'Play the engine',
    );
    expect(window.location.search).toBe('');
  });

  it('selects a Dark Mini Xiangqi deep link from the baseline picker', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'false');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dmxq_soft' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    window.history.replaceState(null, '', '/?play=friend&gameSpecId=dark-mini-xiangqi');

    maybeOpenPlayDeepLink([]);
    expect(variantPickerPresent()).toBe(true);
    expect(selectedVariantSpec()).toBe('dark-mini-xiangqi');
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const roomCall = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/rooms');
    expect(JSON.parse(String(roomCall?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'dark-mini-xiangqi',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      rated: false,
      preferredColor: 'random',
    });
  });

  it('shows the Kriegspiel mini-board marker in the variant grid', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_KRIEGSPIEL_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    window.history.replaceState(null, '', '/?play=friend&gameSpecId=kriegspiel');

    maybeOpenPlayDeepLink([]);

    const card = document.querySelector<HTMLElement>(
      '.landing-variant-card[data-game-spec="kriegspiel"]',
    );
    expect(variantPickerPresent()).toBe(true);
    expect(card?.textContent).toContain('Kriegspiel');
    expect(card?.querySelector('svg[data-mini-id="kriegspiel"]')).not.toBeNull();
  });

  it('selects a rated Dark Mini Xiangqi lobby deep link from the baseline picker', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'false');
    setRatedModeEnabled(true);
    setResolvedSignedIn(true);
    const fetchSpy = lobbyFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    window.history.replaceState(null, '', '/?play=lobby&gameSpecId=dark-mini-xiangqi');

    maybeOpenPlayDeepLink([]);
    expect(variantPickerPresent()).toBe(true);
    expect(selectedVariantSpec()).toBe('dark-mini-xiangqi');
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(lobbyPostBody(fetchSpy)).toMatchObject({
      gameSpecId: 'dark-mini-xiangqi',
      rated: true,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
  });

  it('offers Dark Xiangqi (9x10) in the play menu', () => {
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    [...panel.querySelectorAll('button')]
      .find((b) => b.textContent === 'Challenge a friend')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(variantPickerSpecs()).toContain('dark-xiangqi');
  });

  it('keeps Dark Xiangqi in the play menu when the old flag is off', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    [...panel.querySelectorAll('button')]
      .find((b) => b.textContent === 'Challenge a friend')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(variantPickerSpecs()).toContain('dark-xiangqi');
  });

  it('keeps Dark Xiangqi and DMX selectable in the Play-the-engine flow', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openPlaySetup(panel, 'Play the engine');

    const dxq = document.querySelector<HTMLButtonElement>(
      '.landing-variant-card[data-game-spec="dark-xiangqi"]',
    );
    expect(dxq?.disabled).toBe(false);
    expect(dxq?.classList.contains('landing-variant-card-disabled')).toBe(false);
    expect(dxq?.textContent).not.toContain('Soon');
    // Xiangqi fog engines default server-side, so both stay selectable.
    const dmx = document.querySelector<HTMLButtonElement>(
      '.landing-variant-card[data-game-spec="dark-mini-xiangqi"]',
    );
    expect(dmx?.disabled).toBe(false);
  });

  it('keeps Mini Xiangqi selectable in the Play-the-engine flow (Fairy-Stockfish bot)', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openPlaySetup(panel, 'Play the engine');

    const mini = document.querySelector<HTMLButtonElement>(
      '.landing-variant-card[data-game-spec="mini-xiangqi"]',
    );
    expect(mini?.disabled).toBe(false);
    expect(mini?.classList.contains('landing-variant-card-disabled')).toBe(false);
    expect(mini?.textContent).not.toContain('Soon');
  });

  it('shows the Dark Crossroads marker even when the engine card is disabled', () => {
    vi.stubEnv('VITE_DARK_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openPlaySetup(panel, 'Play the engine');

    const card = document.querySelector<HTMLButtonElement>(
      '.landing-variant-card[data-game-spec="dark-crossroads-chess"]',
    );
    expect(card?.disabled).toBe(true);
    expect(card?.textContent).toContain('Soon');
    expect(card?.querySelector('svg[data-mini-id="dark-crossroads"]')).not.toBeNull();
  });

  it('shows the Dark Crazyhouse entry with the shared Crazyhouse image', () => {
    vi.stubEnv('VITE_DARK_CRAZYHOUSE_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openPlaySetup(panel, 'Play the engine');

    const card = document.querySelector<HTMLButtonElement>(
      '.landing-variant-card[data-game-spec="dark-crazyhouse"]',
    );
    expect(card?.disabled).toBe(true);
    expect(card?.textContent).toContain('Soon');
    expect(card?.querySelector('svg[data-mini-id="dark-crazyhouse"]')).not.toBeNull();
  });

  it('shows Dark Shogi sente and gote color choices in the setup modal', async () => {
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'true');
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
      if (String(input) === '/api/rooms') return jsonResponse({ url: '/room/dsg_color' });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    setRoomNavigator(() => {});
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);

    openPlaySetup(panel, 'Challenge a friend');
    selectModalVariant('dark-shogi');

    expect(modalColorOptions()).toEqual([
      { label: 'Sente', glyph: '☗', classes: 'landing-color-glyph black shogi' },
      { label: 'Random', glyph: '☗☖', classes: 'landing-color-glyph random shogi' },
      { label: 'Gote', glyph: '☖', classes: 'landing-color-glyph white shogi' },
    ]);

    clickModalColor('Gote');
    clickModalButton('Create room');
    await flushPromises();

    expect(roomPostBody(fetchSpy)).toMatchObject({
      mode: 'pvp',
      gameSpecId: 'dark-shogi',
      preferredColor: 'white',
    });
  });

  it('orders the variant picker by the shared canonical variant order', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_JIEQI_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ playing: 0, online: 0 })),
    );
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openPlaySetup(panel, 'Challenge a friend');

    const specs = variantPickerSpecs();
    const canonical = [...specs].sort(
      (a, b) =>
        canonicalVariantOrderIndex(a as GameSpecId) - canonicalVariantOrderIndex(b as GameSpecId),
    );
    expect(specs).toEqual(canonical);
    expect(specs.indexOf('mini-xiangqi')).toBeLessThan(specs.indexOf('dark-mini-xiangqi'));
    // DMX precedes full Dark Xiangqi (the picker used to list dark-xiangqi 2nd).
    expect(specs.indexOf('dark-mini-xiangqi')).toBeLessThan(specs.indexOf('dark-xiangqi'));
  });

  it('sends the chess game spec id when finding a chess opponent', async () => {
    const fetchSpy = lobbyFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openLobbySetup(panel);
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(lobbyPostBody(fetchSpy).gameSpecId).toBe('dark-chess');
  });

  it('sends the Dark Mini Xiangqi game spec id when finding a DMX opponent', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');
    const fetchSpy = lobbyFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openLobbySetup(panel);
    selectModalVariant('dark-mini-xiangqi');
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(lobbyPostBody(fetchSpy).gameSpecId).toBe('dark-mini-xiangqi');
  });

  it('sends the Mini Xiangqi game spec id as a casual lobby seek', async () => {
    setRatedModeEnabled(true);
    setResolvedSignedIn(true);
    const fetchSpy = lobbyFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openLobbySetup(panel);
    selectModalVariant('mini-xiangqi');
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(lobbyPostBody(fetchSpy)).toMatchObject({
      gameSpecId: 'mini-xiangqi',
      rated: false,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
  });

  it('sends the Crossroads Chess game spec id and rapid time control when finding an opponent', async () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    const fetchSpy = lobbyFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    const panel = buildLandingPlayPanel([]);
    document.body.append(panel);
    openLobbySetup(panel);
    selectModalVariant('crossroads-chess');
    clickModalTimeControl('5 + 5');
    document
      .querySelector<HTMLButtonElement>('.landing-setup-start')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(lobbyPostBody(fetchSpy)).toMatchObject({
      gameSpecId: 'crossroads-chess',
      rated: false,
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
    });
  });
});

// Resolve the lobby "Find opponent" → setup screen. The first matching button is
// the landing action; clicking it opens the setup whose start button is
// `.landing-setup-start`.
function openLobbySetup(panel: HTMLElement): void {
  [...panel.querySelectorAll('button')]
    .find((button) => button.textContent === 'Find opponent')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function openPlaySetup(panel: HTMLElement, label: string): void {
  [...panel.querySelectorAll('button')]
    .find((button) => button.textContent === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickModalButton(label: string): void {
  [...document.querySelectorAll<HTMLButtonElement>('.landing-setup-dialog button')]
    .find((button) => button.textContent === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickModalGameGroup(label: string): void {
  [...document.querySelectorAll<HTMLButtonElement>('.landing-game-group-card')]
    .find((button) => button.querySelector('.landing-game-group-name')?.textContent === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function modalGameGroups(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.landing-game-group-name')].map(
    (el) => el.textContent?.trim() ?? '',
  );
}

function clickModalColor(label: string): void {
  [...document.querySelectorAll<HTMLButtonElement>('.landing-color-option')]
    .find((button) => button.querySelector('.landing-color-label')?.textContent === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickModalTimeControl(label: string): void {
  [...document.querySelectorAll<HTMLButtonElement>('.landing-time-presets button')]
    .find((button) => button.textContent?.trim() === label)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function selectModalVariant(gameSpecId: string): void {
  const card = document.querySelector<HTMLButtonElement>(
    `.landing-variant-card[data-game-spec="${gameSpecId}"]`,
  );
  expect(card).not.toBeNull();
  card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// The variant picker is a card grid (was a <select>): these read the cards.
function variantPickerSpecs(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.landing-variant-card[data-game-spec]')].map(
    (el) => el.dataset.gameSpec ?? '',
  );
}

function visibleVariantPickerSpecs(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.landing-variant-card[data-game-spec]')]
    .filter((el) => !el.hidden)
    .map((el) => el.dataset.gameSpec ?? '');
}

function selectedVariantSpec(): string | undefined {
  return document.querySelector<HTMLElement>('.landing-variant-card.selected[data-game-spec]')
    ?.dataset.gameSpec;
}

function activeSetupSection(): string | undefined {
  return document.querySelector<HTMLElement>('.landing-setup-accordion-section.active')?.dataset
    .setupSection;
}

function setupSummaryValue(sectionId: string): string | undefined {
  return document
    .querySelector<HTMLElement>(
      `.landing-setup-accordion-section[data-setup-section="${sectionId}"] .landing-setup-summary-value`,
    )
    ?.textContent?.trim();
}

function variantPickerPresent(): boolean {
  return document.querySelector('.landing-variant-grid') !== null;
}

function selectModalEngine(engineId: string): void {
  const engineSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Engine"]');
  expect(engineSelect).not.toBeNull();
  engineSelect!.value = engineId;
  engineSelect!.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectedModalTimeControl(): string | undefined {
  return [
    ...document.querySelectorAll<HTMLButtonElement>('.landing-time-presets .selected'),
  ][0]?.textContent?.trim();
}

function visibleModalTimeControls(): string[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.landing-time-presets:not(.landing-correspondence-presets) button',
    ),
  ]
    .filter((button) => !button.hidden)
    .map((button) => button.textContent?.trim() ?? '');
}

// Day chips are revealed/hidden as a group by the active time-control segment, so
// read the group's hidden state rather than each button's.
function visibleCorrespondenceOptions(): string[] {
  const group = document.querySelector<HTMLElement>('.landing-correspondence-presets');
  if (!group || group.hidden) return [];
  return [...group.querySelectorAll<HTMLButtonElement>('button')].map(
    (button) => button.textContent?.trim() ?? '',
  );
}

function correspondenceToggleVisible(): boolean {
  const toggle = document.querySelector<HTMLElement>('.landing-time-mode');
  return toggle !== null && !toggle.hidden;
}

function selectedModalColor(): string | undefined {
  return document
    .querySelector<HTMLButtonElement>('.landing-color-option.selected .landing-color-label')
    ?.textContent?.trim();
}

function modalColorOptions(): Array<{ label: string; glyph: string; classes: string }> {
  return [...document.querySelectorAll<HTMLButtonElement>('.landing-color-option')].map(
    (button) => ({
      label: button.querySelector('.landing-color-label')?.textContent?.trim() ?? '',
      glyph: button.querySelector('.landing-color-glyph')?.textContent?.trim() ?? '',
      classes: button.querySelector('.landing-color-glyph')?.className ?? '',
    }),
  );
}

function lobbyFetchSpy(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/live-stats') return jsonResponse({ playing: 0, online: 0 });
    if (String(input) === '/api/lobby' && init?.method === 'POST') {
      return jsonResponse({ status: 'matched', roomId: 'dmxq_lobby', url: '/room/dmxq_lobby' });
    }
    if (String(input) === '/api/lobby') return jsonResponse({ requests: [] });
    return jsonResponse({}, { status: 404 });
  });
}

function lobbyPostBody(fetchSpy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchSpy.mock.calls.find(
    ([input, init]) =>
      String(input) === '/api/lobby' && (init as RequestInit | undefined)?.method === 'POST',
  );
  expect(call).toBeDefined();
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
}

function roomPostBody(fetchSpy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchSpy.mock.calls.find(
    ([input, init]) =>
      String(input) === '/api/rooms' && (init as RequestInit | undefined)?.method === 'POST',
  );
  expect(call).toBeDefined();
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
