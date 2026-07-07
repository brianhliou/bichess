import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import nodeTest, { after, before, beforeEach } from 'node:test';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { close, init, isInitialized } from './persistence.js';
import { testDatabaseUrlFromEnv } from './test-database-url.js';

export const TEST_DATABASE_URL = testDatabaseUrlFromEnv();

export const test = nodeTest;
export { assert, pg };

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function definePersistenceTests(area: string, registerTests: () => void): void {
  if (!TEST_DATABASE_URL) {
    test(`persistence ${area} (skipped - set TEST_DATABASE_URL or DATABASE_URL to enable)`, {
      skip: true,
    }, () => {});
    return;
  }

  before(async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await runMigrations(client);
    } finally {
      await client.end();
    }
    init(TEST_DATABASE_URL);
  });

  after(async () => {
    await close();
  });

  beforeEach(async () => {
    if (!isInitialized()) return;
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `TRUNCATE
           engine_move_jobs,
           live_engine_games,
           puzzle_attempts,
           user_puzzle_ratings,
           puzzle_ratings,
           puzzle_daily_selections,
           xiangqi_broadcast_sync_logs,
           xiangqi_broadcast_boards,
           xiangqi_broadcast_rounds,
           xiangqi_broadcast_tours,
           room_deadlines,
           room_lifecycle_audit,
           email_login_challenges,
           account_sessions,
           user_handle_reservations,
           forum_posts,
           forum_topics,
           bot_rating_snapshots,
           bot_profiles,
           artifact_owners,
           game_participants,
           room_seat_tokens,
           game_debug_artifacts,
           eve_games,
           engine_game_tasks,
           engine_worker_runs,
           eve_jobs,
           engine_versions,
           engines,
           users,
           events,
           games
         RESTART IDENTITY CASCADE`,
      );
    } finally {
      await client.end();
    }
  });

  registerTests();
}
