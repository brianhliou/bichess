// Read-only generator for a frozen ElephantChess puzzle-mining manifest.
// Requires an explicit import-batch id so a later monthly corpus import cannot
// silently change eligibility.
//
// Mined-game handling is fail-closed: exactly one of --exclude-mined or
// --include-mined must be passed. Nothing defaults, because the silent default
// is the expensive mistake -- re-selecting games a prior run already mined.
// --include-mined reproduces the frozen 2026-07 pilot manifest byte for byte.
//
// DATABASE_URL=... npm run pilot:elephantchess-manifest --workspace @mistboard/server -- \
//   --import-batch-id <uuid> --seed elephantchess-pilot-2026-07-v1 \
//   --include-mined --out /private/path/elephantchess-pilot-v1.json
//
// Mine everything the pilot did not touch:
//
// DATABASE_URL=... npm run pilot:elephantchess-manifest --workspace @mistboard/server -- \
//   --import-batch-id <uuid> --seed elephantchess-remainder-2026-08-v1 \
//   --exclude-mined --fill-remaining --out /private/path/elephantchess-remainder.json

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import {
  buildElephantChessPilotManifest,
  type ElephantChessPilotGame,
  type ElephantChessPilotTargets,
  maximalElephantChessPilotTargets,
  renderElephantChessPilotManifest,
} from './elephantchess-pilot-manifest.js';

type PilotGameRow = {
  historical_game_id: string;
  source_game_id: string;
  import_batch_id: string;
  ply_count: number;
  result: ElephantChessPilotGame['result'];
  red_elo_before: number | null;
  black_elo_before: number | null;
  time_control_category: string | null;
  rating_mode: string | null;
  red_player_id: string | null;
  black_player_id: string | null;
};

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${flag} is required`);
  return normalized;
}

function optionalCount(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

const { values } = parseArgs({
  options: {
    'import-batch-id': { type: 'string' },
    seed: { type: 'string' },
    out: { type: 'string' },
    'exclude-mined': { type: 'boolean' },
    'include-mined': { type: 'boolean' },
    'fill-remaining': { type: 'boolean' },
    representative: { type: 'string' },
    coverage: { type: 'string' },
    correspondence: { type: 'string' },
  },
});

const importBatchId = required(values['import-batch-id'], '--import-batch-id');
const seed = required(values.seed, '--seed');
const out = resolve(required(values.out, '--out'));

const excludeMined = values['exclude-mined'] === true;
const includeMined = values['include-mined'] === true;
if (excludeMined === includeMined) {
  throw new Error('pass exactly one of --exclude-mined or --include-mined');
}

const fillRemaining = values['fill-remaining'] === true;
const representative = optionalCount(values.representative, '--representative');
const coverage = optionalCount(values.coverage, '--coverage');
const correspondence = optionalCount(values.correspondence, '--correspondence');
const explicitTargets = representative !== undefined || correspondence !== undefined;
if (fillRemaining && explicitTargets) {
  throw new Error('--fill-remaining cannot be combined with --representative or --correspondence');
}
if (explicitTargets && (representative === undefined || correspondence === undefined)) {
  throw new Error('--representative and --correspondence must be passed together');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  const result = await pool.query<PilotGameRow>(
    `SELECT
       g.id AS historical_game_id,
       g.source_game_id,
       g.import_batch_id,
       g.ply_count,
       g.result,
       NULLIF(g.tags->>'redEloBefore', '')::int AS red_elo_before,
       NULLIF(g.tags->>'blackEloBefore', '')::int AS black_elo_before,
       NULLIF(g.tags->>'timeControlCategory', '') AS time_control_category,
       NULLIF(g.tags->>'ratingMode', '') AS rating_mode,
       NULLIF(g.tags->>'redPlayerId', '') AS red_player_id,
       NULLIF(g.tags->>'blackPlayerId', '') AS black_player_id
     FROM historical_xiangqi_games g
     JOIN historical_xiangqi_sources s ON s.id = g.source_id
     JOIN historical_xiangqi_import_batches b ON b.id = g.import_batch_id
     WHERE s.slug = 'elephantchess-pvp'
       AND s.license_status = 'cleared'
       AND g.import_batch_id = $1
       AND b.status = 'completed'
       AND g.source_game_id IS NOT NULL
       AND cardinality(g.quality_flags) = 0
     ORDER BY g.id`,
    [importBatchId],
  );
  // A game is "already mined" if it belongs to any run that still owns its
  // work. Failed and canceled runs release their games back to the pool; every
  // other status (including in-flight ones) keeps them out, because resuming
  // that run is the correct recovery, not selecting the games again elsewhere.
  const minedResult = await pool.query<{ historical_game_id: string }>(
    `SELECT DISTINCT mg.historical_game_id
       FROM xiangqi_puzzle_mining_games mg
       JOIN xiangqi_puzzle_mining_runs mr ON mr.id = mg.run_id
      WHERE mr.status NOT IN ('failed', 'canceled')`,
  );
  const minedGameIds = new Set(minedResult.rows.map((row) => row.historical_game_id));
  const eligibleRows = excludeMined
    ? result.rows.filter((row) => !minedGameIds.has(row.historical_game_id))
    : result.rows;
  const excludedMined = result.rows.length - eligibleRows.length;
  const games: ElephantChessPilotGame[] = eligibleRows.map((row) => ({
    historicalGameId: row.historical_game_id,
    sourceGameId: row.source_game_id,
    importBatchId: row.import_batch_id,
    plyCount: row.ply_count,
    result: row.result,
    redEloBefore: row.red_elo_before,
    blackEloBefore: row.black_elo_before,
    timeControlCategory: row.time_control_category,
    ratingMode: row.rating_mode,
    redPlayerId: row.red_player_id,
    blackPlayerId: row.black_player_id,
  }));
  let targets: ElephantChessPilotTargets | undefined;
  if (fillRemaining) {
    targets = maximalElephantChessPilotTargets(games, { coverageLive: coverage });
  } else if (representative !== undefined && correspondence !== undefined) {
    targets = {
      representativeLiveBase: representative,
      coverageLive: coverage ?? 0,
      correspondenceMax: correspondence,
    };
  }
  const manifest = buildElephantChessPilotManifest(games, { importBatchId, seed, targets });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, renderElephantChessPilotManifest(manifest), 'utf8');
  process.stdout.write(
    `${JSON.stringify({
      kind: 'elephantchess-pilot-manifest',
      out,
      importBatchId,
      manifestSha256: manifest.manifestSha256,
      minedPolicy: excludeMined ? 'exclude-mined' : 'include-mined',
      coverage: {
        eligibleInBatch: result.rows.length,
        alreadyMined: minedGameIds.size,
        excludedFromThisManifest: excludedMined,
        eligibleAfterExclusion: games.length,
        selected: manifest.counts.selected,
        unselectedRemaining: games.length - manifest.counts.selected,
      },
      targets: manifest.targets,
      counts: manifest.counts,
    })}\n`,
  );
} finally {
  await pool.end();
}
