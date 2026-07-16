import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeThemeSettings,
  readStoredSiteTheme,
  setSiteThemePreference,
  siteThemeOptions,
} from './theme.js';

describe('site appearance preference', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    document.documentElement.removeAttribute('data-site-theme');
    document.documentElement.removeAttribute('data-effective-theme');
    document.documentElement.removeAttribute('data-xiangqi-board-layout');
    document.documentElement.removeAttribute('style');
    document.head.innerHTML = '<meta name="theme-color" content="#1f2521">';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to system mode', () => {
    expect(readStoredSiteTheme()).toBe('system');
    expect(siteThemeOptions.map((option) => option.id)).toEqual(['system', 'light', 'dark']);
  });

  it('stores explicit dark mode and applies it to the root', () => {
    setSiteThemePreference('dark');

    expect(window.localStorage.getItem('mistboard.siteTheme')).toBe('dark');
    expect(document.documentElement.dataset.siteTheme).toBe('dark');
    expect(document.documentElement.dataset.effectiveTheme).toBe('dark');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      '#121615',
    );
  });

  it('normalizes invalid stored values back to system', () => {
    window.localStorage.setItem('mistboard.siteTheme', 'sepia');

    expect(readStoredSiteTheme()).toBe('system');
  });

  it('resolves system mode from prefers-color-scheme', () => {
    stubPrefersDark(true);

    setSiteThemePreference('system');

    expect(document.documentElement.dataset.siteTheme).toBe('system');
    expect(document.documentElement.dataset.effectiveTheme).toBe('dark');
  });

  it('exposes the stored xiangqi layout to shared CSS sizing', () => {
    window.localStorage.setItem('mistboard.xiangqiBoardLayout', 'cell');
    window.localStorage.setItem('mistboard.xiangqiBoardLayoutVersion', '1');

    initializeThemeSettings();

    expect(document.documentElement.dataset.xiangqiBoardLayout).toBe('cell');
  });
});

function stubPrefersDark(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) satisfies MediaQueryList,
  );
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('appearance family gating', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() });
    document.body.innerHTML = '<nav class="site-nav"><div class="site-nav-utilities"></div></nav>';
    document.documentElement.removeAttribute('data-board-family');
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('puts signed-out language choices inside the gear menu', () => {
    window.history.replaceState(null, '', '/zh-hant/rules/flip-xiangqi');

    rebuildThemePanel();

    expect(document.querySelector('.site-nav-language')).toBeNull();
    expect(
      document.querySelector<HTMLElement>(
        '[data-theme-control] [data-appearance-target="language"]',
      )?.textContent,
    ).toBe('語言');
    expect(
      [...document.querySelectorAll<HTMLElement>('.appearance-language-option')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['English', '简体中文', '繁體中文']);
    expect(
      document
        .querySelector<HTMLElement>('.appearance-language-option.selected')
        ?.getAttribute('data-locale'),
    ).toBe('zh-Hant');
  });

  it('renders signed-out sound, appearance, and connection controls in the gear menu', () => {
    rebuildThemePanel();

    expect(document.querySelector('[data-theme-control] .account-nav-status')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[data-appearance-target="sound"]')?.click();
    expect(
      document.querySelector<HTMLElement>('[data-theme-control]')?.dataset.themeControlView,
    ).toBe('submenu');
    expect(
      [...document.querySelectorAll<HTMLButtonElement>('button[data-sound-option]')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['Wood', 'Mist', 'Piano', 'SFX', 'Futuristic', 'NES', 'Silent']);
    expect(
      document
        .querySelector<HTMLButtonElement>('button[data-sound-option="wood"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');

    document.querySelector<HTMLButtonElement>('button[data-sound-option="silent"]')?.click();
    expect(window.localStorage.getItem('mistboard.soundMuted')).toBe('true');
    expect(
      document
        .querySelector<HTMLButtonElement>('button[data-sound-option="silent"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');

    document.querySelector<HTMLButtonElement>('button[data-sound-option="mist"]')?.click();
    expect(window.localStorage.getItem('mistboard.soundMuted')).toBe('false');
    expect(window.localStorage.getItem('mistboard.soundSet')).toBe('mist');

    document.querySelector<HTMLButtonElement>('.appearance-submenu-back')?.click();
    expect(
      document.querySelector<HTMLElement>('[data-theme-control]')?.dataset.themeControlView,
    ).toBe('root');
    document.querySelector<HTMLButtonElement>('[data-appearance-target="theme"]')?.click();
    expect(
      [...document.querySelectorAll<HTMLButtonElement>('button[data-site-theme-option]')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['Device theme', 'Light', 'Dark']);
  });

  it('surfaces current xiangqi and chess settings without retired shogi controls', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'false');

    rebuildThemePanel();

    const familyGroup = document.querySelector<HTMLElement>('[data-board-family-select]');
    expect(
      [...familyGroup!.querySelectorAll<HTMLButtonElement>('[data-board-family-option]')].map(
        (option) => option.dataset.boardFamilyOption,
      ),
    ).toEqual(['xiangqi', 'chess']);
    expect(document.querySelector('[data-theme-tile="piece"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="fog"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqlayout"]')).toBeNull();
    expect(document.querySelector('[data-theme-tile="xqboard"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqpiece"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="shogiboard"]')).toBeNull();
    expect(document.querySelector('[data-theme-tile="shogipiece"]')).toBeNull();
    expect(
      [...document.querySelectorAll<HTMLButtonElement>('[data-theme-tile="xqboard"]')].map((tile) =>
        tile.getAttribute('aria-label'),
      ),
    ).toEqual(['International', 'Traditional', 'Square grid']);

    document
      .querySelector<HTMLButtonElement>('[data-theme-tile="xqboard"][data-id="cell"]')
      ?.click();
    expect(window.localStorage.getItem('mistboard.xiangqiBoardLayout')).toBe('cell');
    expect(document.documentElement.dataset.xiangqiBoardLayout).toBe('cell');

    document
      .querySelector<HTMLButtonElement>('[data-theme-tile="xqboard"][data-id="traditional"]')
      ?.click();
    expect(window.localStorage.getItem('mistboard.xiangqiBoardTheme')).toBe('traditional');
    expect(window.localStorage.getItem('mistboard.xiangqiBoardLayout')).toBe('intersection');
    expect(document.documentElement.dataset.xiangqiBoardLayout).toBe('intersection');
  });

  it('keeps Crossroads inside the xiangqi appearance family', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'false');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'false');

    rebuildThemePanel();

    const familyGroup = document.querySelector<HTMLElement>('[data-board-family-select]');
    expect(
      [...familyGroup!.querySelectorAll<HTMLButtonElement>('[data-board-family-option]')].map(
        (option) => option.dataset.boardFamilyOption,
      ),
    ).toEqual(['xiangqi', 'chess']);

    expect(document.querySelector('[data-theme-tile="piece"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqlayout"]')).toBeNull();
    expect(document.querySelector('[data-theme-tile="xqboard"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqpiece"]')).not.toBeNull();
  });

  it('surfaces the Game toggle + xiangqi pickers without xiangqi env flags', () => {
    rebuildThemePanel();

    expect(document.querySelector('[data-board-family-select]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqlayout"]')).toBeNull();
    expect(document.querySelector('[data-theme-tile="xqboard"]')).not.toBeNull();
    expect(document.querySelector('[data-theme-tile="xqpiece"]')).not.toBeNull();
  });

  it('opens board and piece settings on the first Xiangqi family option by default', () => {
    rebuildThemePanel();

    for (const key of ['board', 'pieces']) {
      document.querySelector<HTMLButtonElement>(`[data-appearance-target="${key}"]`)?.click();
      const submenu = document.querySelector<HTMLElement>(`.appearance-submenu[data-key="${key}"]`);
      const xiangqi = submenu?.querySelector<HTMLButtonElement>(
        '[data-board-family-option="xiangqi"]',
      );
      const chess = submenu?.querySelector<HTMLButtonElement>('[data-board-family-option="chess"]');

      expect(xiangqi?.classList.contains('selected')).toBe(true);
      expect(xiangqi?.getAttribute('aria-checked')).toBe('true');
      expect(chess?.classList.contains('selected')).toBe(false);
      expect(chess?.getAttribute('aria-checked')).toBe('false');

      submenu?.querySelector<HTMLButtonElement>('.appearance-submenu-back')?.click();
    }
  });
});

// Drop any panel the persistent nav observer mounted before the flag stub, then
// rebuild from scratch so the panel reflects the env stubbed in this test.
function rebuildThemePanel(): void {
  for (const control of document.querySelectorAll('[data-theme-control]')) control.remove();
  initializeThemeSettings();
}
