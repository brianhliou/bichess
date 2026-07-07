// Replay a xiangqi broadcast tape into local Postgres.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import {
  readXiangqiBroadcastFixturePack,
  resolveXiangqiBroadcastInputPath,
} from './import-xiangqi-broadcast.js';
import { runMigrations } from './migrate.js';
import { close, init } from './persistence.js';
import { runXiangqiBroadcastTape } from './xiangqi-broadcast-sim.js';

type Args = {
  dir: string;
  tape: string;
  speed: number | 'instant';
  allowCorrection: boolean;
};

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8')) as unknown;
}

function parseCliArgs(argv: string[]): Args {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string' },
      tape: { type: 'string', default: 'tape.json' },
      speed: { type: 'string', default: 'instant' },
      'allow-correction': { type: 'boolean', default: false },
    },
  });
  if (!values.dir) {
    console.error(
      'usage: simulate-xiangqi-broadcast --dir <fixture-pack> [--tape tape.json] [--speed instant|10] [--allow-correction]',
    );
    process.exit(1);
  }
  const speed = values.speed === 'instant' ? 'instant' : Number(values.speed);
  if (speed !== 'instant' && (!Number.isFinite(speed) || speed <= 0)) {
    console.error('--speed must be instant or a positive number');
    process.exit(1);
  }
  return {
    dir: values.dir,
    tape: values.tape,
    speed,
    allowCorrection: Boolean(values['allow-correction']),
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  try {
    const applied = await runMigrations(migrationClient);
    if (applied.length > 0) console.log(`migrations applied: ${applied.join(', ')}`);
  } finally {
    await migrationClient.end();
  }

  init(databaseUrl);
  try {
    const pack = await readXiangqiBroadcastFixturePack(args.dir);
    const tape = await readJsonFile(join(resolveXiangqiBroadcastInputPath(args.dir), args.tape));
    const result = await runXiangqiBroadcastTape({
      pack,
      tape,
      speed: args.speed,
      allowCorrection: args.allowCorrection,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    const counts = new Map<string, number>();
    for (const update of result.updates) {
      const key = update.ok ? update.status : update.kind;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    console.log(
      `simulated ${result.framesApplied} frame(s): ${[...counts.entries()]
        .map(([key, count]) => `${key}=${count}`)
        .join(' ')}`,
    );
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
