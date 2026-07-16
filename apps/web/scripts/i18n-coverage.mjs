// Per-article translation coverage reporter.
//
// Loads the real article data, the shared prose extractor, and the zh
// dictionaries (via Vite SSR, same mechanism as prerender-articles.mjs) and
// reports, per published article and per zh script, how many natural-language
// strings resolve to a translation. Also flags orphaned dictionary keys:
// entries that match no current article string, which are the residue of an
// English copy edit that silently left the page rendering English.
//
// This is the visibility companion to article-i18n.coverage.test.ts: the test
// ENFORCES full coverage for slugs in TRANSLATION_LOCKED_SLUGS; this reporter
// shows where every article stands so you can decide what is ready to lock.
//
// Read-only and always exits 0 (informational). Run: npm run i18n:coverage
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const window = new Window();
globalThis.window = window;
globalThis.document = window.document;

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

function truncate(text) {
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

try {
  const { articles } = await server.ssrLoadModule('/src/articles-data.ts');
  const { articleProse, articleTranslationSourceStrings } =
    await server.ssrLoadModule('/src/article-prose.ts');
  const { ARTICLE_LANGS, hasTranslation, translationKeys } =
    await server.ssrLoadModule('/src/article-i18n.ts');

  const published = articles.filter((a) => a.status === 'published');

  // `npm run i18n:coverage -- <slug>` focuses on one article and prints its
  // missing strings in full (untruncated), deduped across scripts -- the
  // working view while translating that article.
  const onlySlug = process.argv[2] ?? null;

  // For orphan detection a key is "live" if it matches ANY string anywhere in
  // ANY article. deepTranslate swaps by value across the whole object tree
  // (board labels, CTA labels, draft articles included), so a full deep walk is
  // the correct denominator -- articleProse alone would falsely orphan board
  // labels and any string only used by an unpublished article.
  const liveStrings = articleTranslationSourceStrings(articles);

  console.log(
    `translation coverage — ${published.length} published articles × ${ARTICLE_LANGS.length} zh scripts\n`,
  );

  const rows = published.map((article) => {
    const prose = articleProse(article);
    const perLang = {};
    for (const lang of ARTICLE_LANGS) {
      const missing = prose.filter(({ text }) => !hasTranslation(lang, text));
      perLang[lang] = { translated: prose.length - missing.length, total: prose.length, missing };
    }
    const ready = ARTICLE_LANGS.every((lang) => perLang[lang].missing.length === 0);
    return { slug: article.slug, perLang, ready };
  });

  // Lock-ready first, then by ascending coverage so the biggest gaps sink.
  rows.sort((a, b) => Number(b.ready) - Number(a.ready) || a.slug.localeCompare(b.slug));

  if (onlySlug) {
    const row = rows.find((r) => r.slug === onlySlug);
    if (!row) {
      console.log(`no published article with slug "${onlySlug}"`);
    } else {
      // Same string is usually missing in both scripts; dedupe by text.
      const byText = new Map();
      for (const lang of ARTICLE_LANGS) {
        for (const m of row.perLang[lang].missing) {
          if (!byText.has(m.text)) byText.set(m.text, { path: m.path, langs: [] });
          byText.get(m.text).langs.push(lang);
        }
      }
      console.log(`${onlySlug}: ${byText.size} distinct string(s) to translate\n`);
      for (const [text, info] of byText) {
        console.log(`# ${info.path}  (missing: ${info.langs.join(', ')})`);
        console.log(text);
        console.log('');
      }
    }
  } else {
    for (const row of rows) {
      const cells = ARTICLE_LANGS.map((lang) => {
        const { translated, total } = row.perLang[lang];
        const pct = total === 0 ? 100 : Math.round((translated / total) * 100);
        return `${lang} ${`${translated}/${total}`.padStart(7)} ${`(${pct}%)`.padStart(6)}`;
      }).join('   ');
      console.log(
        `${row.ready ? '✅ lock-ready' : '   gaps     '}  ${row.slug.padEnd(20)} ${cells}`,
      );
    }

    for (const row of rows) {
      const gaps = ARTICLE_LANGS.flatMap((lang) =>
        row.perLang[lang].missing.map((m) => ({ lang, ...m })),
      );
      if (gaps.length === 0) continue;
      console.log(`\n— ${row.slug}: ${gaps.length} untranslated string(s) —`);
      for (const { lang, path, text } of gaps) {
        console.log(`  [${lang}] ${path}: ${truncate(text)}`);
      }
    }

    for (const lang of ARTICLE_LANGS) {
      const orphans = translationKeys(lang).filter((key) => !liveStrings.has(key));
      if (orphans.length === 0) continue;
      console.log(
        `\n— ${lang}: ${orphans.length} orphaned key(s) (match no current article string) —`,
      );
      for (const key of orphans) console.log(`  ${truncate(key)}`);
    }
  }
} finally {
  await server.close();
}
