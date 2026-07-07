// Poll a xiangqi broadcast source snapshot into local Postgres.

import { parseArgs } from 'node:util';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { close, init } from './persistence.js';
import {
  pollXiangqiBroadcastSourceLoop,
  pollXiangqiBroadcastSourceOnce,
  type XiangqiBroadcastPollResult,
} from './xiangqi-broadcast-poller.js';

type Args = {
  source: string;
  intervalMs: number;
  timeoutMs: number;
  allowCorrection: boolean;
  once: boolean;
};

function parseCliArgs(argv: string[]): Args {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: 'string' },
      'interval-ms': { type: 'string', default: '1000' },
      'timeout-ms': { type: 'string', default: '5000' },
      'allow-correction': { type: 'boolean', default: false },
      once: { type: 'boolean', default: false },
    },
  });
  if (!values.source) {
    console.error(
      'usage: poll-xiangqi-broadcast-source --source <url> [--once] [--interval-ms 1000] [--timeout-ms 5000] [--allow-correction]',
    );
    process.exit(1);
  }
  const intervalMs = Number(values['interval-ms']);
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    console.error('--interval-ms must be a positive integer');
    process.exit(1);
  }
  const timeoutMs = Number(values['timeout-ms']);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    console.error('--timeout-ms must be a positive integer');
    process.exit(1);
  }
  return {
    source: values.source,
    intervalMs,
    timeoutMs,
    allowCorrection: Boolean(values['allow-correction']),
    once: Boolean(values.once),
  };
}

function printResult(result: XiangqiBroadcastPollResult): void {
  if (!result.ok) {
    console.log(`poll failed kind=${result.kind} message=${result.message}`);
    return;
  }
  const counts = new Map<string, number>();
  for (const update of result.updates) {
    const key = update.ok ? update.status : update.kind;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const updateSummary = [...counts.entries()].map(([key, count]) => `${key}=${count}`).join(' ');
  console.log(
    `poll ok tour=${result.tourSlug} rounds=${result.roundsImported} boards=${result.boardsSeen} failed=${result.boardsFailed}${updateSummary ? ` ${updateSummary}` : ''}`,
  );
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
    if (args.once) {
      printResult(
        await pollXiangqiBroadcastSourceOnce({
          sourceUrl: args.source,
          timeoutMs: args.timeoutMs,
          allowCorrection: args.allowCorrection,
        }),
      );
      return;
    }

    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    await pollXiangqiBroadcastSourceLoop({
      sourceUrl: args.source,
      intervalMs: args.intervalMs,
      timeoutMs: args.timeoutMs,
      allowCorrection: args.allowCorrection,
      signal: controller.signal,
      onResult: printResult,
    });
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
