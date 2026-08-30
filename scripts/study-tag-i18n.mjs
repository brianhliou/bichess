#!/usr/bin/env node
/**
 * Backfill a study's chapter TAG translations from the article dictionaries.
 *
 *   node scripts/study-tag-i18n.mjs --study ytSzepET                      # dry run
 *   node scripts/study-tag-i18n.mjs --study ytSzepET --write --cookie ~/.mistboard-cookie
 *
 * Why this exists as its own script rather than a mode of a study builder: the
 * two annotated-game studies were built by different programs (one a server
 * seed, one scripts/world-title-study.mjs), and a study seeded before chapter
 * i18n carried tags at all has no way back to its own source data. What it does
 * have is player and event names that the ARTICLE beside it already translates,
 * reviewed to the same standard as the prose around them.
 *
 * So the dictionary is the source, and this only ever ADDS what the dictionary
 * knows: a tag with no entry is left in English rather than guessed at, and an
 * existing overlay is merged into, never replaced.
 *
 * The name-script rule comes along for free by reading the dictionary rather
 * than converting: a mainland player stays simplified for a Traditional reader
 * because that is what his dictionary entry says, and a Hong Kong or Taiwanese
 * player converts because his says so.
 */
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolve as stubCss } from './lib/stub-css-hooks.mjs';

registerHooks({ resolve: stubCss });
globalThis.window ??= {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  location: { pathname: '/', search: '', origin: 'https://mistboard.com' },
};
globalThis.localStorage ??= globalThis.window.localStorage;
globalThis.document ??= {
  documentElement: { classList: { add() {}, remove() {}, contains: () => false }, style: {} },
  createElement: () => ({
    style: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    append() {},
  }),
  addEventListener() {},
};

const args = process.argv.slice(2);
const argOf = (k, d = '') => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : (args[i + 1] ?? d);
};
const BASE = argOf('base', 'https://mistboard.com');
const STUDY = argOf('study');
const WRITE = args.includes('--write');
const LANGS = ['zh-Hans', 'zh-Hant'];
/** Only the tags that carry language. A date is a date; a result is 1-0. */
const TRANSLATABLE = ['red', 'black', 'event'];

const stable = (v) =>
  Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
          .join(',')}}`
      : JSON.stringify(v ?? null);

async function main() {
  if (!STUDY) throw new Error('need --study <id>');
  const { hasTranslation, translateArticleText } = await import('../apps/web/src/article-i18n.ts');

  const study = await (await fetch(`${BASE}/api/studies/${STUDY}`)).json();
  if (!study?.chapters) throw new Error(`no study ${STUDY} at ${BASE}`);

  let changed = 0;
  const untranslated = new Set();
  for (const chapter of study.chapters) {
    const tags = chapter.tags ?? {};
    // Merge into whatever the chapter already carries: this script owns the tag
    // half of the overlay and must not drop a name someone translated by hand.
    const next = JSON.parse(JSON.stringify(chapter.i18n ?? {}));
    for (const lang of LANGS) {
      const overlay = {};
      for (const key of TRANSLATABLE) {
        const value = tags[key];
        if (!value) continue;
        if (!hasTranslation(lang, value)) {
          untranslated.add(`${key}: ${value}`);
          continue;
        }
        overlay[key] = translateArticleText(lang, value);
      }
      if (!Object.keys(overlay).length) continue;
      next[lang] = { ...next[lang], tags: { ...next[lang]?.tags, ...overlay } };
    }
    if (stable(next) === stable(chapter.i18n ?? {})) {
      console.log(`  = ${chapter.name}`);
      continue;
    }
    const preview = LANGS.map(
      (l) => `${l}:${next[l]?.tags?.red ?? '-'}/${next[l]?.tags?.black ?? '-'}`,
    );
    console.log(`  ~ ${chapter.name}  ${preview.join('  ')}`);
    changed += 1;
    if (!WRITE) continue;
    const cookie = readFileSync(
      argOf('cookie', join(homedir(), '.mistboard-cookie')),
      'utf8',
    ).trim();
    // The rename path takes name and i18n together; i18n alone would be a
    // rename to nothing.
    const res = await fetch(`${BASE}/api/studies/${STUDY}/chapters/${chapter.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: chapter.name, i18n: next }),
    });
    if (!res.ok)
      throw new Error(`PATCH ${chapter.id} -> ${res.status} ${(await res.text()).slice(0, 140)}`);
  }

  if (untranslated.size) {
    console.log(
      `\n${untranslated.size} tag value(s) the dictionary does not know, left in English:`,
    );
    for (const u of untranslated) console.log(`  ${u}`);
  }
  console.log(`\n${changed} chapter(s) ${WRITE ? 'updated' : 'would change'}`);

  if (WRITE && changed) {
    // Read back rather than trusting the 200s: this endpoint accepts a body it
    // is free to partly ignore, which is how a whole study once stored {}.
    const after = await (await fetch(`${BASE}/api/studies/${STUDY}`)).json();
    const bad = after.chapters.filter(
      (c) => (c.tags?.red || c.tags?.event) && LANGS.some((l) => !c.i18n?.[l]?.tags),
    );
    if (bad.length) {
      console.error(`\ntags i18n did not stick on: ${bad.map((c) => c.name).join(', ')}`);
      process.exit(1);
    }
    console.log('verified: every chapter with game tags carries them in both zh scripts');
  }
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
