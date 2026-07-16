import { describe, expect, it } from 'vitest';
import {
  ARTICLE_LANGS,
  hasTranslation,
  TRANSLATED_ARTICLE_SLUGS,
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
