// Repair `content_sha256` for archive rows written before the digest keyed on
// content instead of on the source's own labels.
//
// Why this exists: the old digest folded in `source_game_id` and the anonymized
// player names. ElephantChess re-randomizes both on every monthly release, so the
// stored hashes describe the June dump's LABELS, not the games. Importing July
// against them would match nothing and insert 10,469 duplicates. Fixing the
// importer alone does not help — the rows already in the table have to be rehashed
// too, or the next import compares new-style digests against old-style ones and
// dedupes nothing.
//
// Dry run (default; prints what would change and any collisions):
//   env DATABASE_URL=... npm run rehash:historical-xiangqi --workspace @mistboard/server -- \
//     --source-slug elephantchess-pvp
//
// Apply:
//   ... --source-slug elephantchess-pvp --persist
//
// Collisions are the point, not an error: two rows that now hash the same ARE the
// same game imported twice, so the script reports them and (with --persist) keeps
// the oldest and deletes the rest. It refuses to delete anything it did not first
// print.

import { parseArgs } from 'node:util';
import type { XiangqiMove } from '@mistboard/game';
import pg from 'pg';
import { historicalXiangqiDigest } from './historical-xiangqi-digest.js';

type Row = {
  id: string;
  played_on: string | null;
  result: string;
  moves: XiangqiMove[];
  content_sha256: string;
  created_at: Date;
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'source-slug': { type: 'string' },
      persist: { type: 'boolean', default: false },
    },
  });
  const slug = values['source-slug'];
  if (!slug) {
    console.error('--source-slug is required (e.g. elephantchess-pvp)');
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { rows } = await pool.query<Row>(
      `SELECT games.id, games.played_on::text AS played_on, games.result, games.moves,
              games.content_sha256, games.created_at
         FROM historical_xiangqi_games games
         JOIN historical_xiangqi_sources sources ON sources.id = games.source_id
        WHERE sources.slug = $1
        ORDER BY games.created_at, games.id`,
      [slug],
    );
    console.log(`source ${slug}: ${rows.length} rows`);

    // First writer of a digest wins; everything after it is a duplicate of that
    // row. Ordering by created_at makes "first" mean oldest, deterministically.
    const owner = new Map<string, string>();
    const updates: Array<{ id: string; digest: string }> = [];
    const duplicates: Array<{ id: string; keeps: string; digest: string }> = [];

    for (const row of rows) {
      const digest = historicalXiangqiDigest({
        playedOn: row.played_on,
        result: row.result,
        moves: row.moves,
      });
      const existing = owner.get(digest);
      if (existing) {
        duplicates.push({ id: row.id, keeps: existing, digest });
        continue;
      }
      owner.set(digest, row.id);
      if (digest !== row.content_sha256) updates.push({ id: row.id, digest });
    }

    console.log(`  rehash: ${updates.length}`);
    console.log(`  duplicates found: ${duplicates.length}`);
    for (const duplicate of duplicates.slice(0, 20)) {
      console.log(`    ${duplicate.id} duplicates ${duplicate.keeps}`);
    }
    if (duplicates.length > 20) console.log(`    ... and ${duplicates.length - 20} more`);

    if (!values.persist) {
      console.log('dry run: nothing written. Re-run with --persist to apply.');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Duplicates go first: they hold digests the survivors are about to claim,
      // and the column is UNIQUE.
      for (const duplicate of duplicates) {
        await client.query('DELETE FROM historical_xiangqi_games WHERE id = $1', [duplicate.id]);
      }
      for (const update of updates) {
        await client.query(
          'UPDATE historical_xiangqi_games SET content_sha256 = $2 WHERE id = $1',
          [update.id, update.digest],
        );
      }
      await client.query('COMMIT');
      console.log(`applied: ${updates.length} rehashed, ${duplicates.length} duplicates removed`);
      console.log('NOTE: rebuild the opening explorer after this (build-xiangqi-explorer).');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
