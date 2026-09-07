#!/usr/bin/env node
/**
 * Which published studies still read in the wrong language, and where.
 *
 *   npm run studies:i18n-sweep                    # every public study on prod
 *   npm run studies:i18n-sweep -- --study ytSzepET
 *   npm run studies:i18n-sweep -- --base http://127.0.0.1:3011 --json
 *
 * Reads the public API, so it needs no credential and reports what a reader
 * actually gets rather than what a seeder believes it wrote. That distinction is
 * the reason this exists: the study i18n coverage tests all passed while 434
 * strings across nine studies rendered in the wrong language, because each test
 * checked the dictionary its own builder used and no test looked at the site.
 *
 * Counts every authored string a reader sees -- study name and description,
 * chapter names, the language-carrying chapter tags (red / black / event), and
 * every comment in every tree -- against the three interface locales.
 *
 * Base language is decided PER STRING, not per study: the curated manuals carry
 * English chapter names over Chinese comments in one record, and an English name
 * that quotes its Chinese term ("... (士象全)") is still English. A string whose
 * CJK is script-neutral (去卒 reads the same either way) is reported as needing
 * English only, never a second Chinese script.
 *
 * A gap is a string with no overlay for a locale it is not already written in.
 * Gamebook hint and deviation text have no i18n slot in the tree at all, so they
 * are counted separately as untranslatable rather than as gaps.
 */
const args = process.argv.slice(2);
const argOf = (k, d = '') => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : (args[i + 1] ?? d);
};
const BASE = argOf('base', 'https://mistboard.com');
const ONLY = argOf('study');
const LOCALES = ['en', 'zh-Hans', 'zh-Hant'];

/** Traditional-only forms that appear constantly in xiangqi prose, against their
 *  simplified twins. Enough to tell which script a Chinese string is in. */
const HANT = '車馬砲將帥後們個時發學習實現對這會來國門專萬與號雙變邊點爭勢殺當還';
const HANS = '车马炮将帅后们个时发学习实现对这会来国门专万与号双变边点争势杀当还';

function scriptOf(text) {
  // Latin-vs-CJK by weight, not by presence: the English chapter names quote the
  // Chinese term they translate ("... (士象全)"), and a substring test called
  // those Chinese and demanded an English translation of English.
  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (cjk === 0 || latin > cjk * 2) return 'en';
  let hant = 0;
  let hans = 0;
  for (const ch of text) {
    if (HANT.includes(ch)) hant += 1;
    else if (HANS.includes(ch)) hans += 1;
  }
  if (hant > hans) return 'zh-Hant';
  if (hans > hant) return 'zh-Hans';
  return 'zh';
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

/** Every authored string in a study, each with the overlay object that would
 *  translate it. `overlay` is a locale->string map, or undefined when the field
 *  has no i18n slot at all (gamebook prose). */
function collectStrings(study, chapters) {
  const out = [];
  const push = (kind, text, overlay, where) => {
    if (typeof text !== 'string' || !text.trim()) return;
    out.push({ kind, text, overlay, where });
  };
  push('study.name', study.name, study.i18n, 'study');
  push('study.description', study.description, study.i18n, 'study');
  for (const [i, ch] of chapters.entries()) {
    const at = `ch${i + 1}`;
    push('chapter.name', ch.name, ch.i18n, at);
    for (const tag of ['red', 'black', 'event']) {
      push(`tag.${tag}`, ch.tags?.[tag], ch.i18n, `${at}.tags`);
    }
    walk(ch.root?.root, (node, path) => {
      for (const c of node.annotations?.comments ?? []) {
        push('comment', c.text, c.i18n, `${at}${path}`);
      }
      const gb = node.annotations?.gamebook;
      if (gb?.hint) push('gamebook.hint', gb.hint, null, `${at}${path}`);
      if (gb?.deviation) push('gamebook.deviation', gb.deviation, null, `${at}${path}`);
    });
  }
  return out;
}

function walk(node, fn, path = '') {
  if (!node || typeof node !== 'object') return;
  fn(node, path);
  const kids = Array.isArray(node.children) ? node.children : [];
  for (const [i, kid] of kids.entries()) walk(kid, fn, `${path}/${i}`);
}

/** Does this string have text for `locale`? A study/chapter overlay nests the
 *  field under the locale ({zh-Hant:{name}}); a comment overlay is flat
 *  ({zh-Hant:"..."}). Both are handled, plus tags ({zh-Hant:{tags:{red}}}). */
function hasLocale(entry, locale) {
  const o = entry.overlay;
  if (!o || typeof o !== 'object') return false;
  const slot = o[locale];
  if (!slot) return false;
  if (typeof slot === 'string') return slot.trim().length > 0;
  if (entry.kind.startsWith('tag.')) {
    const tag = entry.kind.slice(4);
    return typeof slot.tags?.[tag] === 'string' && slot.tags[tag].trim().length > 0;
  }
  const field = entry.kind.split('.')[1];
  return typeof slot[field] === 'string' && slot[field].trim().length > 0;
}

const list = await getJson('/api/studies/public?limit=200');
const studies = (list.studies ?? list).filter((s) => !ONLY || s.id === ONLY);
const report = [];

for (const summary of studies) {
  const detail = await getJson(`/api/studies/${summary.id}`);
  const study = detail.study ?? detail;
  const chapters = detail.chapters ?? [];
  const strings = collectStrings(study, chapters);

  // Base language is a property of each STRING, not of the study: the curated
  // manuals carry English names over Chinese comments in the same record. A
  // string whose CJK is script-neutral (去卒 reads the same either way) needs no
  // overlay for the other Chinese script, only an English one.
  const missing = {};
  const noSlot = strings.filter((s) => s.overlay === null);
  const bases = {};
  for (const s of strings) {
    s.base = scriptOf(s.text);
    bases[s.base] = (bases[s.base] ?? 0) + 1;
  }
  for (const locale of LOCALES) {
    const gaps = strings.filter(
      (s) =>
        s.overlay !== null &&
        s.base !== locale &&
        !(s.base === 'zh' && locale !== 'en') &&
        !hasLocale(s, locale),
    );
    const byKind = {};
    for (const g of gaps) byKind[g.kind] = (byKind[g.kind] ?? 0) + 1;
    missing[locale] = { count: gaps.length, byKind, examples: gaps.slice(0, 3) };
  }
  const baseLocale = Object.entries(bases)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');
  report.push({
    id: study.id,
    name: study.name,
    chapters: chapters.length,
    baseLocale,
    total: strings.filter((s) => s.overlay !== null).length,
    untranslatable: noSlot.length,
    missing,
  });
}

if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(
    `${pad('study', 46)} ${pad('base mix', 24)} ${pad('strings', 7)} ${LOCALES.map((l) => pad(`${l} gaps`, 10)).join(' ')}`,
  );
  for (const r of report) {
    const cells = LOCALES.map((l) => pad(r.missing[l].count || '-', 10)).join(' ');
    console.log(
      `${pad(`${r.name} (${r.id})`, 46)} ${pad(r.baseLocale, 24)} ${pad(r.total, 7)} ${cells}`,
    );
  }
  console.log('\nBreakdown of what is missing:');
  for (const r of report) {
    const gaps = Object.entries(r.missing).filter(([, m]) => m.count > 0);
    if (!gaps.length && !r.untranslatable) continue;
    console.log(`\n${r.name} (${r.id})  ${r.chapters} chapters  base mix ${r.baseLocale}`);
    for (const [locale, m] of gaps) {
      const kinds = Object.entries(m.byKind)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}×${n}`)
        .join(', ');
      console.log(`  ${locale}: ${m.count} untranslated of ${r.total} — ${kinds}`);
      for (const ex of m.examples) {
        console.log(`      ${ex.where} ${ex.kind}: ${JSON.stringify(ex.text.slice(0, 70))}`);
      }
    }
    if (r.untranslatable) {
      console.log(`  no i18n slot at all (gamebook prose): ${r.untranslatable} strings`);
    }
  }
}
