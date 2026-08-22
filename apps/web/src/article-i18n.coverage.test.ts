import { describe, expect, it } from 'vitest';
import {
  ARTICLE_LANGS,
  hasTranslation,
  TRANSLATED_ARTICLE_SLUGS,
  translateArticleText,
  translationKeys,
} from './article-i18n.js';
import { articleProse, articleTranslationSourceStrings } from './article-prose.js';
import { type Article, articles } from './articles-data.js';

// Slugs whose English copy is editorially frozen AND fully translated into
// every zh script. Add a slug here only after (1) its copy is final and
// (2) every prose string it contributes resolves in zh-Hans and zh-Hant.
//
// Once a slug is listed, any later English edit that orphans a dictionary key
// fails this test instead of silently rendering English on the zh pages. That
// failure is the point: it forces the dictionary update to ride along with the
// copy change. This is the durability guarantee for the translations.
function truncate(text: string): string {
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

const published = articles.filter((a) => a.status === 'published');

describe('article translation coverage', () => {
  for (const slug of TRANSLATED_ARTICLE_SLUGS) {
    it(`${slug}: every prose string resolves in all zh scripts`, () => {
      const article = published.find((a) => a.slug === slug);
      expect(article, `locked slug "${slug}" is not a published article`).toBeTruthy();
      const missing: string[] = [];
      for (const { path, text } of articleProse(article as Article)) {
        for (const lang of ARTICLE_LANGS) {
          if (!hasTranslation(lang, text)) missing.push(`[${lang}] ${path}: ${truncate(text)}`);
        }
      }
      expect(missing, `untranslated strings:\n${missing.join('\n')}`).toEqual([]);
    });
  }

  it('locked slugs are real published articles', () => {
    const slugs = new Set(published.map((a) => a.slug));
    const unknown = TRANSLATED_ARTICLE_SLUGS.filter((s) => !slugs.has(s));
    expect(unknown, `locked but not published: ${unknown.join(', ')}`).toEqual([]);
  });

  // zh-Hant values are derived from zh-Hans by script conversion, which is
  // near length-preserving and never rewrites ASCII (names, numbers, links).
  // A value that blows past its sibling's length, or whose ASCII token stream
  // drifts, means the derivation tooling corrupted it (this shipped once:
  // 2026-08-22, ASCII-token placeholders were restored as whole sentences and
  // one zh-Hant paragraph rendered 42 copies of itself). Keys whose values are
  // per-locale resources (locale-suffixed URLs/paths) are exempt from the
  // ASCII comparison by design.
  it('zh-Hant values stay parallel to their zh-Hans siblings', () => {
    const asciiTokens = (s: string) => (s.match(/[A-Za-z0-9]+/g) ?? []).join('|');
    const problems: string[] = [];
    for (const key of translationKeys('zh-Hant')) {
      if (!hasTranslation('zh-Hans', key)) continue;
      const hans = translateArticleText('zh-Hans', key);
      const hant = translateArticleText('zh-Hant', key);
      const perLocaleResource = /zh-han/i.test(hans) || /zh-han/i.test(hant);
      const slack = (n: number) => Math.max(n * 1.25, n + 8);
      if (hant.length > slack(hans.length) || hans.length > slack(hant.length)) {
        problems.push(`length ${hans.length} vs ${hant.length}: ${truncate(key)}`);
      }
      if (!perLocaleResource && asciiTokens(hans) !== asciiTokens(hant)) {
        problems.push(`ascii drift: ${truncate(key)}`);
      }
    }
    expect(problems, `corrupted zh values:\n${problems.join('\n')}`).toEqual([]);
  });

  it('dictionaries contain only strings used by current articles', () => {
    const liveStrings = articleTranslationSourceStrings(articles);

    const orphans = ARTICLE_LANGS.flatMap((lang) =>
      translationKeys(lang)
        .filter((key) => !liveStrings.has(key))
        .map((key) => `[${lang}] ${truncate(key)}`),
    );
    expect(orphans, `orphaned translation keys:\n${orphans.join('\n')}`).toEqual([]);
  });
});
