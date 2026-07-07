// Import a Mistboard xiangqi broadcast fixture pack into Postgres.
//
// Usage:
//   npm run import:xiangqi-broadcast --workspace @mistboard/server -- \
//     --dir ../../packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample
//
// Add --include-game-files to also ingest games/*.json. That is useful for
// local negative tests because the M0 fixture pack includes an intentionally
// illegal single-game file there.

import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { close, importXiangqiBroadcastPack, init } from './persistence.js';

export type XiangqiBroadcastFixturePack = {
  tour: unknown;
  rounds: unknown[];
  boards: unknown[];
};

type Args = {
  dir: string;
  includeGameFiles: boolean;
};

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8')) as unknown;
}

export function resolveXiangqiBroadcastInputPath(path: string): string {
  if (isAbsolute(path)) return path;
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function parseCliArgs(argv: string[]): Args {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string' },
      'include-game-files': { type: 'boolean', default: false },
    },
  });
  if (!values.dir) {
    console.error('usage: import-xiangqi-broadcast --dir <fixture-pack> [--include-game-files]');
    process.exit(1);
  }
  return {
    dir: values.dir,
    includeGameFiles: Boolean(values['include-game-files']),
  };
}

export async function readXiangqiBroadcastFixturePack(
  dir: string,
  includeGameFiles = false,
): Promise<XiangqiBroadcastFixturePack> {
  const fixtureDir = resolveXiangqiBroadcastInputPath(dir);
  const [tour, roundsRaw, boardsRaw] = await Promise.all([
    readJsonFile(join(fixtureDir, 'tour.json')),
    readJsonFile(join(fixtureDir, 'rounds.json')),
    readJsonFile(join(fixtureDir, 'boards.json')),
  ]);
  if (!Array.isArray(roundsRaw)) throw new Error(`${fixtureDir}/rounds.json must be an array`);
  if (!Array.isArray(boardsRaw)) throw new Error(`${fixtureDir}/boards.json must be an array`);

  const boards = [...boardsRaw];
  if (includeGameFiles) {
    const gamesDir = join(fixtureDir, 'games');
    const seen = new Set(
      boards
        .map((entry) =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry)
            ? (entry as Record<string, unknown>).id
            : null,
        )
        .filter((id): id is string => typeof id === 'string'),
    );
    for (const file of (await readdir(gamesDir))
      .filter((entry) => entry.endsWith('.json'))
      .sort()) {
      const board = await readJsonFile(join(gamesDir, file));
      const id =
        typeof board === 'object' && board !== null && !Array.isArray(board)
          ? (board as Record<string, unknown>).id
          : null;
      if (typeof id === 'string' && seen.has(id)) continue;
      if (typeof id === 'string') seen.add(id);
      boards.push(board);
    }
  }

  return { tour, rounds: roundsRaw, boards };
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
    const pack = await readXiangqiBroadcastFixturePack(args.dir, args.includeGameFiles);
    const result = await importXiangqiBroadcastPack(pack);
    console.log(
      `imported xiangqi broadcast tour=${result.tourSlug} rounds=${result.roundsImported} boards=${result.boardsImported} skipped=${result.boardsSkipped}`,
    );
    for (const error of result.errors) {
      console.log(
        `  skipped board=${error.boardId ?? 'unknown'} source=${error.sourceBoardId ?? 'unknown'} kind=${error.kind}: ${error.message}`,
      );
    }
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
