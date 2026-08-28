#!/usr/bin/env node
// Fit the win% logistic constant (WIN_PCT_K in packages/game/src/analysis.ts)
// against real xiangqi outcomes: sample positions from finished games, evaluate
// each, and compare the eval to what actually happened. Red-POV throughout.
//
//   node scripts/dpxq-archive-harvest.mjs --event 全国象棋个人赛 --pages 5 \
//     --limit 70 --out ./calib-games
//   node scripts/calibrate-win-curve.mjs 70          # writes calib.json
//
// HARVEST BY EVENT, NEVER BY PLAYER. A player-filtered corpus puts the strong
// side in the Red seat: the first run of this (2026-08-27) drew 45 games by
// champion name, got 29 Red wins to 2 Black, and "measured" a 4.24x correction
// that was pure selection bias -- visible as Red scoring 0.716 at a DEAD LEVEL
// eval, which is impossible in a fair sample. An event-filtered sample gives
// Red 0.571 and a 49% draw rate, which is the real shape.
//
// Bootstrap BY GAME, not by sample: positions inside one game share its result,
// so 856 samples is closer to 70 independent observations.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { withXiangqiAnalysisSession } from '/Users/brianliou/projects/mistboard-champions-replay/apps/server/dist/xiangqi-pikafish-engine.js';
import { xiangqiMoveToPikafishUci } from '/Users/brianliou/projects/mistboard-champions-replay/packages/game/dist/xiangqi-uci.js';

const DIR =
  '/private/tmp/claude-501/-Users-brianliou-projects-mistboard/1fe682df-daca-420e-92ee-abd92f35a52d/scratchpad/unbiased';
const STRIDE = 6; // sample every 6th ply
const SKIP_OPENING = 20; // opening theory tells us little about the result
const MAX_GAMES = Number(process.argv[2] || 45);

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const games = files
  .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')))
  .filter((g) => g.result === '1-0' || g.result === '0-1' || g.result === '1/2-1/2')
  .sort((a, b) => (a.key < b.key ? -1 : 1))
  .slice(0, MAX_GAMES);

const scoreForRed = { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 };
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

writeFileSync(
  '/private/tmp/claude-501/-Users-brianliou-projects-mistboard/1fe682df-daca-420e-92ee-abd92f35a52d/scratchpad/calib2.json',
  JSON.stringify({ games: games.length, stride: STRIDE, samples }, null, 0),
);
console.error(`done: ${games.length} games, ${samples.length} samples`);
