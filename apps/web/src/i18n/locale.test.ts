import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAccountLocalePreference,
  currentLocale,
  initializeLocaleFromCurrentUrl,
  LOCALE_STORAGE_KEY,
  localeFromLanguageTag,
  localeFromPath,
  localizedHref,
  stripLocalePrefix,
} from './locale.js';

describe('locale helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('detects locales from current path prefixes', () => {
    expect(localeFromPath('/zh-hans/rules/flip-xiangqi')).toBe('zh-Hans');
    expect(localeFromPath('/zh-hant/blog')).toBe('zh-Hant');
    expect(localeFromPath('/ja')).toBeNull();
    expect(localeFromPath('/rules/flip-xiangqi')).toBeNull();
  });

  it('maps browser language tags to supported locales', () => {
    expect(localeFromLanguageTag('zh-TW')).toBe('zh-Hant');
    expect(localeFromLanguageTag('zh-CN')).toBe('zh-Hans');
    expect(localeFromLanguageTag('ja-JP')).toBeNull();
    expect(localeFromLanguageTag('fr-FR')).toBeNull();
  });

  it('persists a locale from localized content URLs', () => {
    window.history.replaceState(null, '', '/zh-hant/rules/flip-xiangqi');

    expect(initializeLocaleFromCurrentUrl()).toBe('zh-Hant');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-Hant');
    expect(document.documentElement.lang).toBe('zh-Hant');
  });

  it('falls back from a dormant stored locale outside localized content URLs', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ja');

    expect(currentLocale()).toBe('en');
  });

  it('falls back from a dormant account locale preference', () => {
    expect(applyAccountLocalePreference('ja')).toBe(false);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('applies account locale preferences on unprefixed URLs', () => {
    expect(applyAccountLocalePreference('zh-Hant')).toBe(true);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-Hant');
    expect(document.documentElement.lang).toBe('zh-Hant');
    expect(currentLocale()).toBe('zh-Hant');
  });

  it('does not let account locale override explicit URL prefixes', () => {
    window.history.replaceState(null, '', '/zh-hans/rules/flip-xiangqi');

    expect(applyAccountLocalePreference('zh-Hant')).toBe(false);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(currentLocale()).toBe('zh-Hans');
  });

  it('keeps localized article and rules hrefs in supported content locales', () => {
    expect(localizedHref('/rules/flip-xiangqi?play=1', 'zh-Hant')).toBe(
      '/zh-hant/rules/flip-xiangqi?play=1',
    );
    expect(localizedHref('/blog/misty', 'zh-Hans')).toBe('/zh-hans/blog/misty');
    expect(localizedHref('/account?tab=login', 'zh-Hant')).toBe('/account?tab=login');
  });

  it('strips existing locale prefixes before rebuilding hrefs', () => {
    expect(stripLocalePrefix('/zh-hant/rules/flip-xiangqi#top')).toBe('/rules/flip-xiangqi#top');
    expect(localizedHref('/zh-hans/rules/flip-xiangqi', 'zh-Hant')).toBe(
      '/zh-hant/rules/flip-xiangqi',
    );
  });
});

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
