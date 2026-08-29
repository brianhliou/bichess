#!/usr/bin/env node
// Build the world-title study from the committed annotations.
//
//   node scripts/world-title-study.mjs --cookie ~/.mistboard-cookie --dry-run
//   node scripts/world-title-study.mjs --cookie ~/.mistboard-cookie --create
//
// Dry run is the default and prints what it would post. --create writes to the
// account the cookie belongs to: one study, then a chapter per game.
//
// The cookie is read from a FILE and used as a header. It is never printed, never
// logged, and never passed as an argument, because an argument is visible in the
// process list.
//
// Direction of truth: this reads the same annotation files the article's specs
// are generated from, so the study and the article are siblings rather than one
// being compiled from the other. The article must not depend on the study still
// existing, which is why it does not fetch it at render time.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DATA = 'scripts/data/world-title-annotations';
const args = process.argv.slice(2);
const argOf = (k, d = '') => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : (args[i + 1] ?? d);
};
const BASE = argOf('base', 'https://mistboard.com');
const CREATE = args.includes('--create');

/** Study trees use ranks 1-10; everything upstream of here is ICCS 0-9. */
const toStudyUci = (iccs) => `${iccs[0]}${Number(iccs[1]) + 1}${iccs[2]}${Number(iccs[3]) + 1}`;

/** The widget's glyphs, back to the NAG codes a study node stores. */
const NAG = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };

/**
 * A chapter tree: the mainline as first children, and each engine line hung as a
 * SIBLING on the node the refuted move was played from. That is exactly the
 * shape study-chapter-to-article reads back, so a chapter built here converts
 * into the same spec the article already carries.
 */
function buildTree(spec) {
  const mainline = spec.iccs.trim().split(/\s+/);
  const root = { annotations: {}, children: [] };
  const nodes = [root];
  for (const [index, token] of mainline.entries()) {
    const node = { uci: toStudyUci(token), children: [] };
    const annotation = spec.annotations.byPly[String(index + 1)];
    if (annotation) {
      const glyph = NAG[annotation.glyph];
      node.annotations = {
        ...(glyph ? { glyphs: [glyph] } : {}),
        ...(annotation.note ? { comments: [{ text: annotation.note }] } : {}),
      };
    }
    nodes[index].children.push(node);
    nodes.push(node);
  }
  // Variations second, so the game continuation stays child zero everywhere.
  for (const [plyKey, annotation] of Object.entries(spec.annotations.byPly)) {
    if (!annotation.line) continue;
    const parent = nodes[Number(plyKey) - 1];
    if (!parent) continue;
    let cursor = parent;
    for (const token of annotation.line.trim().split(/\s+/)) {
      const node = { uci: toStudyUci(token), children: [] };
      cursor.children.push(node);
      cursor = node;
    }
  }
  return { version: 1, root };
}

function chapterFor(game, spec) {
  return {
    name: `${game.year} · ${game.champion}`,
    variant: 'xiangqi',
    orientation: 'red',
    root: buildTree(spec),
    tags: {
      Event: spec.event,
      Red: spec.red,
      Black: spec.black,
      Result: spec.resultText,
    },
  };
}

async function post(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'));
  const specDir = argOf('specs', '/tmp/world-specs');
  const games = manifest.games.map((game) => {
    const spec = JSON.parse(readFileSync(join(specDir, `${game.slug}.json`), 'utf8'));
    const year = /^(\d{4})/.exec(spec.event)?.[1] ?? '';
    // The champion is whichever side is not the opponent, read off the result.
    const champion = spec.resultText === '1-0' ? spec.red : spec.black;
    return { slug: game.slug, year, champion, spec };
  });
  games.sort((a, b) => a.year.localeCompare(b.year));

  for (const game of games) {
    const tree = buildTree(game.spec);
    const depth = (function walk(node, n = 0) {
      return node.children.length ? walk(node.children[0], n + 1) : n;
    })(tree.root);
    const lines = Object.values(game.spec.annotations.byPly).filter((a) => a.line).length;
    console.log(
      `${game.year} · ${game.champion.padEnd(14)} ${String(depth).padStart(3)} plies, ${lines} lines`,
    );
  }

  if (!CREATE) {
    console.log(`\ndry run: ${games.length} chapters. Pass --create to write them.`);
    return;
  }

  const cookiePath = argOf('cookie', join(homedir(), '.mistboard-cookie'));
  const cookie = readFileSync(cookiePath, 'utf8').trim();
  const [first, ...rest] = games;
  const study = await post(
    '/api/studies',
    {
      name: 'Every Xiangqi World Champion',
      description:
        'One world-championship game for each man who has won the title, from the edition he won it in. Engine annotations throughout; the losing lines are variations you can step into.',
      // Unlisted, not public. The article that frames these games is still a
      // draft, and a public study would put ten annotated world-championship
      // games on /study before the piece explaining them exists. Unlisted is
      // fully readable by link and fully embeddable; flipping it to public is
      // one control in the study UI once the article ships.
      visibility: args.includes('--public') ? 'public' : 'unlisted',
      chapter: chapterFor(first, first.spec),
    },
    cookie,
  );
  const studyId = study.study?.id ?? study.id;
  console.log(`\ncreated study ${studyId}`);
  for (const game of rest) {
    await post(`/api/studies/${studyId}/chapters`, chapterFor(game, game.spec), cookie);
    console.log(`  + ${game.year} · ${game.champion}`);
  }
  console.log(`\n${BASE}/study/${studyId}`);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
