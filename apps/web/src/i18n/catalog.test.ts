import { describe, expect, it } from 'vitest';
import {
  APP_I18N_DOMAINS,
  appTranslationKeys,
  CRITICAL_I18N_KEYS,
  hasAppTranslation,
  t,
} from './catalog.js';
import { SUPPORTED_LOCALES } from './locale.js';

describe('app i18n catalog', () => {
  it('has an English source string for every app key', () => {
    const missing = appTranslationKeys().filter((key) => t(key, {}, 'en').trim() === '');
    expect(missing).toEqual([]);
  });

  it('has every critical key translated in outreach locales', () => {
    const locales = SUPPORTED_LOCALES.filter((locale) => locale !== 'en');
    const missing: string[] = [];
    for (const locale of locales) {
      for (const key of CRITICAL_I18N_KEYS) {
        if (!hasAppTranslation(locale, key)) missing.push(`${locale}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps every key in exactly one domain with locale and critical keys in bounds', () => {
    const owners = new Map<string, string>();

    for (const domain of APP_I18N_DOMAINS) {
      for (const key of Object.keys(domain.english)) {
        expect(domain.prefixes, `${key} belongs to the ${domain.name} domain`).toContain(
          key.split('.')[0],
        );
        expect(owners.get(key), `${key} is owned by more than one domain`).toBeUndefined();
        owners.set(key, domain.name);
      }

      for (const locale of Object.values(domain.locales)) {
        expect(Object.keys(locale).filter((key) => !(key in domain.english))).toEqual([]);
      }
      expect(domain.critical.filter((key) => !(key in domain.english))).toEqual([]);
    }

    expect([...owners.keys()].sort()).toEqual(appTranslationKeys().sort());
  });

  it('interpolates params and falls back to English for non-critical gaps', () => {
    expect(t('play.playingNow', { count: 3 }, 'zh-Hant')).toBe('3 局正在進行');
    expect(t('play.unavailable', {}, 'en')).toBe('Unavailable');
  });

  it('keeps Patron support separate from future paid products', () => {
    const patronCopy = [
      t('patron.heroTitle', {}, 'en'),
      t('patron.intro', {}, 'en'),
      t('patron.perk', {}, 'en'),
      t('patron.faqPerkAnswer', {}, 'en'),
    ].join(' ');

    expect(patronCopy).toContain('Core play and learning stay free');
    expect(patronCopy).toContain('Separate paid tools or products may exist later');
    expect(patronCopy).not.toMatch(/games are free\. forever|nothing .*locked behind/i);
  });
});
