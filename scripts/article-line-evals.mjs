#!/usr/bin/env node
/**
 * Evaluate the END of every engine sideline in every article, and write a
 * chess-style assessment symbol next to each one.
 *
 * Why this exists as a script rather than a pipeline stage: the annotations
 * carry `line` (what the engine wanted instead) but no eval for where that line
 * ARRIVES. The eval they do carry describes the played move. So a symbol at the
 * end of a sideline cannot be derived from the data we have; it has to be
 * measured, which means replaying the line and asking Pikafish.
 *
 * Reads the article's own specs, so it cannot drift from what the page renders.
 * Writes JSON keyed by "<boardIndex>:<ply>"; a separate step bakes it in, which
 * keeps the measuring and the editing separable and re-runnable.
 *
 *   node scripts/article-line-evals.mjs [--nodes N] [--write]
 *
 * --write bakes the symbols into the article sources as `lineEval`. Without it
 * the run only measures, which is what you want when checking a threshold
 * change. Re-running is safe: a `lineEval` already present is replaced.
 *
 * The default budget matches the article's stated methodology (Pikafish at a
 * million nodes a position), so the symbols and the annotations are the same
 * engine at the same strength.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { resolve as stubCss } from './lib/stub-css-hooks.mjs';

const HOME = process.env.HOME ?? '';
const BIN =
  process.env.MISTBOARD_PIKAFISH_XIANGQI_PATH ??
  resolve(HOME, 'projects/tools/pikafish-official-2026-01-02/MacOS/pikafish-apple-silicon');
const NET =
  process.env.MISTBOARD_PIKAFISH_XIANGQI_NET ??
  resolve(HOME, 'projects/tools/pikafish-official-2026-01-02/pikafish.nnue');

// Article modules import stylesheets, and some read `window` at module scope to
// pick up a stored board theme. Neither exists under node. Both are stubbed
// rather than tolerated: a module this script cannot read is an article that
// could ship without assessments, which is the case it exists to catch.
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
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const NODES = Number(flag('nodes', '1000000'));
const OUT = flag('out', 'scripts/data/article-line-evals.json');
const ARTICLE_SOURCES = 'apps/web/src/articles/content';

/**
 * Pikafish speaks the SAME coordinates we store: files a-i, ranks 0-9 with 0 as
 * Red's back rank. Verified by playing "h2e2 h9g7 b0c2" into it and reading the
 * FEN back; the rank+1 form other engines use leaves the start position
 * untouched, because every move is illegal and UCI silently drops the command.
 * That failure is invisible from the outside: you get a full run of evaluations
 * that are all the opening position, clustered around +25, and they look like
 * data. So this validates rather than converts.
 */
function toEngineMove(token) {
  if (!/^[a-i]\d[a-i]\d$/.test(token)) throw new Error(`not an ICCS move: ${token}`);
  return token;
}

/**
 * Assessment symbols, in the notation the reader already knows from chess
 * literature. Thresholds are the conventional ones; a xiangqi pawn is worth
 * about what a chess pawn is to these engines, so the scale carries over.
 */
function symbolFor({ cp, mate }) {
  if (mate != null && mate !== 0) return mate > 0 ? '+-' : '-+';
  if (cp == null) return null;
  const a = Math.abs(cp);
  if (a < 30) return '=';
  const sign = cp > 0;
  if (a < 90) return sign ? '+=' : '=+';
  if (a < 250) return sign ? '+/-' : '-/+';
  return sign ? '+-' : '-+';
}

function openEngine() {
  if (!existsSync(BIN)) throw new Error(`pikafish not found at ${BIN}`);
  const proc = spawn(BIN, { stdio: ['pipe', 'pipe', 'ignore'] });
  let buffer = '';
  const waiters = [];
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
      for (const w of [...waiters]) {
        if (w.match(line)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(line);
        } else {
          w.onLine?.(line);
        }
      }
    }
  });
  const send = (cmd) => proc.stdin.write(`${cmd}\n`);
  const until = (match, onLine) =>
    new Promise((res) => waiters.push({ match, resolve: res, onLine }));
  return { proc, send, until };
}

/**
 * Every article that has at least one engine sideline, with its own boards.
 *
 * The content modules are imported one at a time rather than through
 * articles-data, which reaches a module that imports a stylesheet and cannot be
 * loaded outside the bundler. A module that will not load is REPORTED, never
 * skipped quietly: silently missing an article is how one ships without
 * assessments, which is the thing this script exists to prevent.
 */
async function annotatedArticles() {
  const files = readdirSync(ARTICLE_SOURCES).filter((f) => f.endsWith('.ts'));
  const articles = [];
  const unreadable = [];
  for (const file of files) {
    try {
      const mod = await import(`../${ARTICLE_SOURCES}/${file}`);
      for (const value of Object.values(mod)) {
        if (value && typeof value === 'object' && 'slug' in value && 'sections' in value) {
          articles.push(value);
        }
      }
    } catch (err) {
      unreadable.push(`${file}: ${String(err).split('\n')[0]}`);
    }
  }
  if (unreadable.length) {
    console.warn(`could not load ${unreadable.length} article module(s):`);
    for (const u of unreadable) console.warn(`  ${u}`);
  }
  const found = [];
  for (const article of articles) {
    const boards = (article.sections ?? [])
      .flatMap((s) => s.blocks ?? [])
      .filter((b) => b?.kind === 'xq-replay');
    const lines = boards.reduce(
      (n, b) => n + Object.values(b.spec.annotations?.byPly ?? {}).filter((a) => a.line).length,
      0,
    );
    if (lines > 0) found.push({ slug: article.slug, boards, lines });
  }
  return found;
}

/**
 * Bake symbols into one article source.
 *
 * The specs are top-level consts whose order in the FILE is not the order the
 * sections reference them in, so a symbol cannot be placed by counting `line:`
 * occurrences. Each const carries its own `iccs`, and the loaded article gives
 * iccs -> board index, which is the only stable bridge between the two.
 */
function bake(slug, boards, evals) {
  const path = `${ARTICLE_SOURCES}/${slug.replace(/[^a-z0-9-]/g, '')}.ts`;
  if (!existsSync(path)) return { path, inserted: 0, skipped: 'no such source' };
  let src = readFileSync(path, 'utf8');
  const boardOf = new Map(boards.map((b, i) => [b.spec.iccs, i]));

  // Drop any previous run's symbols so re-running cannot stack them.
  src = src.replace(/\n\s*lineEval: "[^"]*",/g, '');

  const blocks = [...src.matchAll(/^const (\w+): XiangqiReplaySpec = \{/gm)];
  const inserts = [];
  blocks.forEach((m, bi) => {
    const start = m.index + m[0].length;
    const end = bi + 1 < blocks.length ? blocks[bi + 1].index : src.length;
    const body = src.slice(start, end);
    const iccs = /iccs: "([^"]+)"/.exec(body);
    const board = iccs ? boardOf.get(iccs[1]) : undefined;
    if (board === undefined) return;
    let ply = null;
    for (const t of body.matchAll(/("(\d+)":\s*\{)|(\n(\s*)line: ")/g)) {
      if (t[2]) {
        ply = Number(t[2]);
        continue;
      }
      const hit = evals[`${slug}:${board}:${ply}`];
      if (!hit?.symbol) continue;
      inserts.push([start + body.indexOf('",', t.index + t[0].length) + 2, t[4], hit.symbol]);
    }
  });

  inserts.sort((a, b) => a[0] - b[0]);
  let out = '';
  let prev = 0;
  for (const [pos, indent, symbol] of inserts) {
    out += src.slice(prev, pos) + `\n${indent}lineEval: "${symbol}",`;
    prev = pos;
  }
  writeFileSync(path, out + src.slice(prev));
  return { path, inserted: inserts.length };
}

async function main() {
  const write = args.includes('--write');
  const found = await annotatedArticles();
  const jobs = [];
  for (const { slug, boards } of found) {
    boards.forEach((block, boardIndex) => {
      const mainline = block.spec.iccs.trim().split(/\s+/);
      for (const [plyKey, a] of Object.entries(block.spec.annotations?.byPly ?? {})) {
        if (!a.line) continue;
        const ply = Number(plyKey);
        // The line replaces the played move, so the prefix is everything BEFORE it.
        const prefix = mainline.slice(0, ply - 1);
        const moves = [...prefix, ...a.line.trim().split(/\s+/)].map(toEngineMove);
        jobs.push({ key: `${slug}:${boardIndex}:${ply}`, moves });
      }
    });
  }
  console.log(
    `${found.map((f) => `${f.slug} (${f.lines})`).join(', ')} -> ${jobs.length} sidelines, ${NODES} nodes each`,
  );

  const { proc, send, until } = openEngine();
  send('uci');
  await until((l) => l === 'uciok');
  if (existsSync(NET)) send(`setoption name EvalFile value ${NET}`);
  send('setoption name Threads value 4');
  send('isready');
  await until((l) => l === 'readyok');

  const out = {};
  let done = 0;
  for (const job of jobs) {
    send('ucinewgame');
    send('isready');
    await until((l) => l === 'readyok');
    send(`position startpos moves ${job.moves.join(' ')}`);
    let cp = null;
    let mate = null;
    send(`go nodes ${NODES}`);
    await until(
      (l) => l.startsWith('bestmove'),
      (l) => {
        const m = /score (cp|mate) (-?\d+)/.exec(l);
        if (!m) return;
        if (m[1] === 'cp') {
          cp = Number(m[2]);
          mate = null;
        } else {
          mate = Number(m[2]);
          cp = null;
        }
      },
    );
    // Pikafish reports from the side to move; the articles speak Red POV.
    const redToMove = job.moves.length % 2 === 0;
    const redCp = cp == null ? null : redToMove ? cp : -cp;
    const redMate = mate == null ? null : redToMove ? mate : -mate;
    out[job.key] = { cp: redCp, mate: redMate, symbol: symbolFor({ cp: redCp, mate: redMate }) };
    done += 1;
    if (done % 20 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
  }
  proc.kill();

  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  const tally = {};
  for (const v of Object.values(out)) tally[v.symbol] = (tally[v.symbol] ?? 0) + 1;
  console.log('wrote', OUT, tally);

  if (write) {
    for (const { slug, boards } of found) {
      const r = bake(slug, boards, out);
      console.log(`  baked ${r.inserted} into ${r.path}${r.skipped ? ` (${r.skipped})` : ''}`);
    }
  } else {
    console.log('measured only; pass --write to bake the symbols in');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
