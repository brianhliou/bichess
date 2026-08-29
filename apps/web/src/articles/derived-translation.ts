// Content-language translations that keep their OWN slug.
//
// The zh path (article-i18n.ts) renders one English article at /zh-hant/<slug>:
// same slug, URL prefix, and the prefix also switches the interface, because
// `Locale` is one list serving both. Vietnamese is a CONTENT language and the
// language policy closes the interface set at en/zh-Hans/zh-Hant, so it cannot
// use that path without promising a Vietnamese nav we are not building.
//
// It also should not be a hand-written second article, which is what it was until
// now. That is the exact failure the zh model was designed to avoid: a duplicated
// structure drifts the moment the English changes shape, and co-up drifted from
// jieqi-platform within hours of being written.
//
// So: same mechanism as zh (one structural source + a string dictionary), but the
// result is registered as an ordinary Article at its own slug. Nothing downstream
// needs to know — routing, prerendering, meta and hreflang all work off slugs.
//
// A string with no dictionary entry falls through as English. That is deliberate:
// an English edit surfaces as visible English on the translated page rather than
// silently vanishing, and `untranslatedStrings` turns it into a check.
import type { Article } from './types.js';

function deepSubstitute<T>(value: T, dict: Record<string, string>): T {
  if (typeof value === 'string') return (dict[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => deepSubstitute(v, dict)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepSubstitute(v, dict);
    return out as T;
  }
  return value;
}

/** Every human-readable string in an article, in traversal order. Board geometry
 *  (squares, roles, uci) never appears here because those live behind keys this
 *  skips: only fields a reader sees are collected. */
export function articleStrings(article: Article): string[] {
  const out: string[] = [];
  const READABLE = new Set([
    'title',
    'seoTitle',
    'summary',
    'audience',
    'heading',
    'text',
    'caption',
    'label',
    'question',
    'answer',
    'name',
    'outcome',
    'resultText',
    'event',
  ]);
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === 'string') {
      if (key && READABLE.has(key) && value.trim()) out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) walk(v, key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(article as unknown);
  return out;
}

/** Strings the dictionary does not cover, i.e. what would render in the source
 *  language. Empty is the contract a finished translation has to meet. */
export function untranslatedStrings(
  source: Article,
  dict: Record<string, string>,
): string[] {
  return [...new Set(articleStrings(source))].filter((s) => !Object.hasOwn(dict, s));
}

export type DerivedTranslationOptions = {
  /** The translated page's own slug, e.g. 'co-up'. */
  slug: string;
  /** BCP-47 tag for <html lang>, hreflang and JSON-LD inLanguage. */
  sourceLang: string;
  dict: Record<string, string>;
  /** Fields that are not a translation of anything: a different rules link for a
   *  different audience, a different publication state. Applied last. */
  overrides?: Partial<Article>;
};

/** Build a translated Article from an English one plus a dictionary. The English
 *  article stays the single structural source: add a section there and it appears
 *  here, in English, until the dictionary catches up. */
export function deriveTranslation(
  source: Article,
  { slug, sourceLang, dict, overrides }: DerivedTranslationOptions,
): Article {
  const translated = deepSubstitute(source, dict);
  return { ...translated, slug, sourceLang, ...overrides } as Article;
}
