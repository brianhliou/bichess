#!/usr/bin/env node
// Fit the win% logistic constant (WIN_PCT_K in packages/game/src/analysis.ts)
// against real xiangqi outcomes: sample positions from finished games, evaluate
// each, and compare the eval to what actually happened. Red-POV throughout.
//
//   npm run build --workspace packages/game
//   npm run build --workspace apps/server        # this script reads dist/
//   node scripts/dpxq-archive-harvest.mjs --event 全国象棋个人赛 --pages 5 \
//     --limit 70 --out ./scripts/data/win-curve-corpus
//   node scripts/calibrate-win-curve.mjs 70      # writes tmp/win-curve-samples.json
//
//   node scripts/calibrate-win-curve.mjs 6 --out tmp/smoke.json    # reproducibility smoke
//
// HARVEST BY EVENT, NEVER BY PLAYER. A player-filtered corpus puts the strong
// side in the Red seat: the first run of this (2026-08-27) drew 45 games by
// champion name, got 29 Red wins to 2 Black, and "measured" a 4.24x correction
// that was pure selection bias -- visible as Red scoring 0.716 at a DEAD LEVEL
// eval, which is impossible in a fair sample. An event-filtered sample gives
// Red 0.571 and a 49% draw rate, which is the real shape. The script prints
// that split on every run: if it is not near 0.571/49%, the corpus is biased
// and the fit is worthless.
//
// Bootstrap BY GAME, not by sample: positions inside one game share its result,
// so 856 samples is closer to 70 independent observations.
//
// Repaired 2026-09-01: the imports pointed at a mistboard-champions-replay
// worktree that no longer exists and the corpus at a session scratchpad that
// had been emptied, so the script could not reproduce its own documented
// result. Imports are repo-relative now.
//
// WHAT IS AND IS NOT CHECKED IN. The raw corpus (scripts/data/win-curve-corpus,
// 712K, 70 games) is gitignored: it is third-party archive material and this
// repo does not redistribute it. Re-harvest with the command above. The DERIVED
// samples ARE tracked, at scripts/data/win-curve-samples.json (56K) -- they are
// all the fit needs, so `node scripts/fit-win-curve.mjs` re-derives every number
// in the analysis.ts note from a fresh clone, with no engine time and no
// network. Re-running THIS script is only needed to change the node budget, the
// stride, or the corpus itself.
//
// Verified 2026-09-01 against a fresh re-harvest: 856 samples / 70 games, Red
// 0.571, draws 49%, best-fit K 0.00645 (1.75x), by-game CI 0.0036-0.0109 which
// contains the chess constant, and the +/-75cp band at 0.505 observed vs 0.511
// predicted. The 2026-08-27 numbers reproduce within noise; verdict unchanged.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withXiangqiAnalysisSession } from '../apps/server/dist/xiangqi-pikafish-engine.js';
import { xiangqiMoveToPikafishUci } from '../packages/game/dist/xiangqi-uci.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = join(REPO_ROOT, 'scripts/data/win-curve-corpus');
const DEFAULT_OUT = join(REPO_ROOT, 'tmp/win-curve-samples.json');
const STRIDE = 6; // sample every 6th ply
const SKIP_OPENING = 20; // opening theory tells us little about the result

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const MAX_GAMES = Number(argv.find((a) => !a.startsWith('--') && Number.isFinite(Number(a))) || 70);
const DIR = resolve(flag('dir', DEFAULT_DIR));
const OUT = resolve(flag('out', DEFAULT_OUT));

if (!existsSync(DIR)) {
  console.error(`corpus dir not found: ${DIR}`);
  console.error(
    'harvest one first: node scripts/dpxq-archive-harvest.mjs --event 全国象棋个人赛 --pages 5 --limit 70 --out ./scripts/data/win-curve-corpus',
  );
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const games = files
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')))
  .filter((g) => g.result === '1-0' || g.result === '0-1' || g.result === '1/2-1/2')
  .sort((a, b) => (a.key < b.key ? -1 : 1))
  .slice(0, MAX_GAMES);

if (games.length === 0) {
  console.error(`no decided games in ${DIR} (${files.length} file(s) scanned)`);
  process.exit(1);
}

const scoreForRed = { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 };

// Print the selection-bias check before spending engine time on a bad corpus.
const draws = games.filter((g) => g.result === '1/2-1/2').length;
const redScore = games.reduce((sum, g) => sum + scoreForRed[g.result], 0) / games.length;
console.error(
  `corpus: ${games.length} game(s) from ${DIR}\n` +
    `  Red scores ${redScore.toFixed(3)}, draws ${((draws / games.length) * 100).toFixed(0)}%` +
    ' (event-harvested master play sits near 0.571 / 49%)',
);

const samples = [];
let done = 0;

await withXiangqiAnalysisSession(async (evaluate) => {
  for (const g of games) {
    const uci = g.moves.map((m) => xiangqiMoveToPikafishUci(m));
    for (let ply = SKIP_OPENING; ply < uci.length - 4; ply += STRIDE) {
      const ev = await evaluate(uci.slice(0, ply));
      if (ev.cp == null && ev.mate == null) continue;
      samples.push({
        key: g.key,
        ply,
        cp: ev.cp,
        mate: ev.mate,
        redScore: scoreForRed[g.result],
      });
    }
    done += 1;
    if (done % 5 === 0) console.error(`  ${done}/${games.length} games, ${samples.length} samples`);
  }
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ games: games.length, stride: STRIDE, samples }, null, 0));
console.error(`done: ${games.length} games, ${samples.length} samples -> ${OUT}`);
