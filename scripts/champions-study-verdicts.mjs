#!/usr/bin/env node
// Backfill the line verdicts on the champions study's grafted engine lines.
//
//   node scripts/champions-study-verdicts.mjs                       # dry run
//   node scripts/champions-study-verdicts.mjs --apply --cookie ~/.mistboard-cookie
//
// Why this exists as its own script rather than a flag on world-title-study.mjs:
// the two studies were built by different generators. The world study came from
// world-title-study.mjs, which closes every engine line with the measured
// verdict, and the champions study came from the server seed
// (apps/server/src/seed-xiangqi-champions-study.ts), which never had that step.
// So 1pfJeXA1 carried 52 assessments and ytSzepET carried none, and a reader
// stepping through a champions line got the refutation with no statement of who
// ended up better.
//
// This does not rebuild the trees. It walks the chapters that are already there
// and attaches a verdict to the last node of a grafted line, which is the only
// thing missing. The verdicts are the SAME measured numbers the articles print:
// scripts/data/article-line-evals.json, read through the article specs, so the
// study and the article cannot disagree about a line they both show.
//
// Safety: a verdict is attached only when the study's grafted branch is the
// measured line move for move. A branch that has drifted from the article is
// left alone rather than being labelled with a verdict for a different line.
//
// The cookie is read from a FILE and sent as a header. Never printed, never an
// argument: an argument is visible in the process list.
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

const { ASSESS_NAG } = await import('./world-title-study.mjs');
const { xiangqiChampionsArticle } = await import(
  '../apps/web/src/articles/content/xiangqi-champions.js'
);
const { xiangqiWorldChampionshipArticle } = await import(
  '../apps/web/src/articles/content/xiangqi-world-championship.js'
);

const args = process.argv.slice(2);
const argOf = (k, d = '') => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : (args[i + 1] ?? d);
};
const BASE = argOf('base', 'https://mistboard.com');
const STUDY = argOf('study', 'ytSzepET');
const APPLY = args.includes('--apply');

/** Article ICCS is 0-indexed by rank; a study node counts ranks from one. */
const toStudyUci = (iccs) => `${iccs[0]}${Number(iccs[1]) + 1}${iccs[2]}${Number(iccs[3]) + 1}`;

/** Both articles, because the 2025 world final is a chapter here and a board
 *  there. Matching is by moves, so which article a board came from never
 *  matters beyond making sure every chapter can find one. */
const boards = [xiangqiChampionsArticle, xiangqiWorldChampionshipArticle].flatMap((article) =>
  (article.sections ?? [])
    .flatMap((section) => section.blocks ?? [])
    .filter((block) => block?.kind === 'xq-replay')
    .map((block) => block.spec),
);

const mainlineOf = (root) => {
  const chain = [root];
  let node = root;
  while ((node.children ?? []).length) {
    node = node.children[0];
    chain.push(node);
  }
  return chain;
};

/** A grafted line read back as the flat move list it was written from. */
const branchLine = (node) => {
  const out = [];
  let cursor = node;
  while (cursor) {
    out.push(cursor.uci);
    cursor = (cursor.children ?? [])[0];
  }
  return out;
};

const terminalOf = (node) => {
  let cursor = node;
  while ((cursor.children ?? []).length) cursor = cursor.children[0];
  return cursor;
};

/** JSONB does not preserve key order, so a round-tripped tree never matches a
 *  raw stringify. Compare canonically or every run rewrites every chapter. */
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

async function send(method, path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const study = await (await fetch(`${BASE}/api/studies/${STUDY}`)).json();
  const chapters = study.chapters ?? [];
  console.log(`${STUDY}: ${chapters.length} chapters, ${boards.length} article boards\n`);

  const pending = [];
  let unmatchedChapters = 0;
  let skippedDrift = 0;
  for (const chapter of chapters) {
    const root = structuredClone((chapter.root ?? {}).root ?? {});
    const chain = mainlineOf(root);
    const played = chain.slice(1).map((n) => n.uci);
    const spec = boards.find((b) => {
      const want = b.iccs.trim().split(/\s+/).map(toStudyUci);
      return want.length === played.length && want.every((t, i) => t === played[i]);
    });
    if (!spec) {
      console.log(`  ? ${chapter.name}: no article board with these ${played.length} moves`);
      unmatchedChapters += 1;
      continue;
    }

    let attached = 0;
    let drifted = 0;
    for (const [plyKey, annotation] of Object.entries(spec.annotations?.byPly ?? {})) {
      if (!annotation.line || !annotation.lineEval) continue;
      const nag = ASSESS_NAG[annotation.lineEval];
      if (nag === undefined) {
        throw new Error(`unknown lineEval ${JSON.stringify(annotation.lineEval)} at ply ${plyKey}`);
      }
      const parent = chain[Number(plyKey) - 1];
      const want = annotation.line.trim().split(/\s+/).map(toStudyUci);
      const branch = (parent?.children ?? []).slice(1).find((sib) => {
        const got = branchLine(sib);
        return got.length === want.length && got.every((t, i) => t === want[i]);
      });
      if (!branch) {
        drifted += 1;
        continue;
      }
      const last = terminalOf(branch);
      // Keep any judgment glyph already on the node and add the verdict beside
      // it; they answer different questions and live in different slots.
      const existing = (last.annotations?.glyphs ?? []).filter((g) => g < 10 || g > 19);
      last.annotations = { ...last.annotations, glyphs: [...existing, nag] };
      attached += 1;
    }
    skippedDrift += drifted;

    const changed = stable((chapter.root ?? {}).root ?? {}) !== stable(root);
    console.log(
      `  ${changed ? '~' : '='} ${chapter.name}: ${attached} verdict(s)` +
        `${drifted ? `, ${drifted} branch(es) no longer match the article` : ''}`,
    );
    if (changed) pending.push({ chapter, root });
  }

  console.log(
    `\n${pending.length} chapter(s) to update, ${unmatchedChapters} unmatched, ${skippedDrift} skipped for drift`,
  );
  if (!APPLY) {
    console.log('dry run: pass --apply to write');
    return;
  }

  const cookiePath = argOf('cookie', join(homedir(), '.mistboard-cookie'));
  const cookie = readFileSync(cookiePath, 'utf8').trim();
  for (const { chapter, root } of pending) {
    await send(
      'PATCH',
      `/api/studies/${STUDY}/chapters/${chapter.id}`,
      { root: { version: 1, root }, baseVersion: chapter.version },
      cookie,
    );
    console.log(`  wrote ${chapter.name}`);
  }

  const after = await (await fetch(`${BASE}/api/studies/${STUDY}`)).json();
  let total = 0;
  const walk = (n) => {
    for (const g of n.annotations?.glyphs ?? []) if (g >= 10 && g <= 19) total += 1;
    for (const c of n.children ?? []) walk(c);
  };
  for (const c of after.chapters ?? []) walk((c.root ?? {}).root ?? {});
  console.log(`\nverified: ${total} assessment NAG(s) now on ${STUDY}`);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
