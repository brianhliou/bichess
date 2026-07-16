// Focused local calibration for the public standard-Xiangqi engine ladder.
//
// Runs color-reversed paired openings for every adjacent Fairy-Stockfish level,
// then places the top FSF rung against selected Pikafish profiles. This is a
// coarse rung-separation probe, not an Elo estimator: truncated games are
// reported separately and never counted as evidence for either engine.
//
//   tsx src/scripts/xiangqi-engine-calibrate.ts [openingPairs] [maxPlies] [concurrency]
//
// Defaults: 4 opening pairs, 160 plies, 2 concurrent games = 80 games total.

import { playXiangqiEngineGame } from '../xiangqi-engine-game.js';

const openingPairs = positiveInteger(process.argv[2], 4);
const maxPlies = positiveInteger(process.argv[3], 160);
const concurrency = positiveInteger(process.argv[4], 2);
const openingPlies = 4;
const baseSeed = 20260711;

type Matchup = {
  weakerId: string;
  strongerId: string;
};

type GameSpec = Matchup & {
  blackEngineId: string;
  openingIndex: number;
  redEngineId: string;
  seed: string;
};

type Score = {
  aborted: number;
  draws: number;
  losses: number;
  strongerWins: number;
  truncated: number;
};

const fsf = (level: number): string => `fairy-stockfish-xiangqi-level-${level}`;
const pika = (level: number): string => `pikafish-xiangqi-level-${level}`;

function calibrationMatchups(): Matchup[] {
  const adjacent = Array.from({ length: 7 }, (_, index) => ({
    weakerId: fsf(index + 1),
    strongerId: fsf(index + 2),
  }));
  return [
    ...adjacent,
    { weakerId: fsf(8), strongerId: pika(5) },
    { weakerId: fsf(8), strongerId: pika(7) },
    { weakerId: fsf(8), strongerId: pika(8) },
  ];
}

function gamePlan(): GameSpec[] {
  return calibrationMatchups().flatMap((matchup, matchupIndex) =>
    Array.from({ length: openingPairs }, (_, openingIndex) => {
      const seed = String(baseSeed + matchupIndex * 10_000 + openingIndex);
      return [
        {
          ...matchup,
          blackEngineId: matchup.strongerId,
          openingIndex,
          redEngineId: matchup.weakerId,
          seed,
        },
        {
          ...matchup,
          blackEngineId: matchup.weakerId,
          openingIndex,
          redEngineId: matchup.strongerId,
          seed,
        },
      ];
    }).flat(),
  );
}

async function main(): Promise<void> {
  const plan = gamePlan();
  const scores = new Map<string, Score>();
  let completed = 0;

  console.log(
    JSON.stringify({ kind: 'calibration-start', games: plan.length, openingPairs, maxPlies }),
  );

  await parallelMap(plan, concurrency, async (game, gameIndex) => {
    const result = await playXiangqiEngineGame({
      blackEngineId: game.blackEngineId,
      maxPlies,
      openingPolicy: { kind: 'random_first_n_plies', n: openingPlies, seed: game.seed },
      redEngineId: game.redEngineId,
      roomId: `xq_cal_${gameIndex}`,
    });
    const key = `${game.weakerId}__${game.strongerId}`;
    const score = scores.get(key) ?? emptyScore();
    if (result.status === 'aborted') score.aborted += 1;
    else if (result.termination === 'truncated') score.truncated += 1;
    else if (result.result === 'draw') score.draws += 1;
    else {
      const winnerId = result.result === 'red-wins' ? game.redEngineId : game.blackEngineId;
      if (winnerId === game.strongerId) score.strongerWins += 1;
      else score.losses += 1;
    }
    scores.set(key, score);
    completed += 1;
    console.log(
      JSON.stringify({
        kind: 'calibration-game',
        completed,
        total: plan.length,
        ...game,
        result: result.result,
        status: result.status,
        termination: result.termination,
        plies: result.plyCount,
        thinkMs: result.totalThinkTimeMs,
      }),
    );
  });

  for (const matchup of calibrationMatchups()) {
    const key = `${matchup.weakerId}__${matchup.strongerId}`;
    console.log(
      JSON.stringify({
        kind: 'calibration-summary',
        ...matchup,
        ...(scores.get(key) ?? emptyScore()),
      }),
    );
  }
}

function emptyScore(): Score {
  return { aborted: 0, draws: 0, losses: 0, strongerWins: 0, truncated: 0 };
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`expected positive integer: ${raw}`);
  return parsed;
}

async function parallelMap<T>(
  values: readonly T[],
  limit: number,
  run: (value: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        await run(values[index]!, index);
      }
    }),
  );
}

void main();
