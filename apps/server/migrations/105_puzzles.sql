-- 105_puzzles.sql
-- Puzzle content store (#183, Phase 2 of the mining scale path).
--
-- Puzzle CONTENT (initial position, solution line, goal, themes) moves out of
-- TypeScript modules compiled into @mistboard/game and into Postgres, so the
-- mining pipeline can append rows instead of code-gen'ing a TS file + commit +
-- redeploy per batch (#156 targets 1,000+ puzzles). Only puzzle METADATA was
-- in the DB before this (puzzle_daily_selections / puzzle_ratings /
-- puzzle_attempts, all keyed by the puzzle's string id). Those keys now have a
-- real home table but stay WITHOUT a foreign key on purpose: attempts and
-- daily rows may legitimately reference retired puzzles, exactly as they could
-- when the serving set lived in code and shrank across deploys.
--
-- Population is a boot-time sync, not a data migration: the committed seed
-- assets (packages/game/seed/) are upserted by apps/server/src/puzzle-store.ts
-- on first use, gated on a content hash in puzzle_seed_sync. `git push` alone
-- therefore keeps prod serving the committed corpus with no manual step, and
-- re-runs are no-ops. Miner-inserted rows use source_kind='mined' and are
-- never touched by the seed reconciliation.
--
-- `data` holds the ENTIRE serialized puzzle record and is what the API serves;
-- the scalar columns are extracted query/selection dimensions (rotation,
-- difficulty-adaptive and unseen-by-user selection are SQL problems, #184).
-- `data` is `json`, not `jsonb`, DELIBERATELY: jsonb normalizes key order, and
-- the serving contract pins byte-identical payloads against the pre-#183
-- in-memory arrays. `json` stores the exact text, so a DB round trip
-- reproduces exactly the serialized puzzle the seed carries.

CREATE TABLE IF NOT EXISTS puzzles (
  id             text PRIMARY KEY,
  variant        text NOT NULL,
  title          text NOT NULL,
  -- Global serving order: the registry concatenation order of the pre-#183
  -- in-memory arrays (mini/drop-mini, fortress, jungle, xiangqi). Seed rows
  -- carry 0..N-1; miner-appended rows take max(seq)+1 and land after the seed
  -- set, preserving the existing list ordering as the corpus grows.
  seq            integer NOT NULL,
  goal_type      text NOT NULL,
  themes         text[] NOT NULL DEFAULT '{}',
  solution_plies integer NOT NULL,
  -- The full puzzle record (id/variant/title/initial/solution/goal/themes and,
  -- when mined from a game, sourceGame). The single source the API serves.
  data           json NOT NULL,
  -- 'seed' = owned by the committed seed sync (reconciled on hash change);
  -- 'mined' = appended by the miner, never touched by the seed sync.
  source_kind    text NOT NULL DEFAULT 'seed',
  mined_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS puzzles_seq_idx ON puzzles (seq, id);
CREATE INDEX IF NOT EXISTS puzzles_variant_seq_idx ON puzzles (variant, seq, id);

-- Full recorded self-play games the Jungle/Fortress tactic puzzles were mined
-- from (puzzle data.sourceGame.gameId points here for those variants; standard
-- xiangqi references historical_xiangqi_games instead). Not served by any
-- route yet; kept so a puzzle can link back to its source game in a future
-- "from game" surface, and so corpus verification can replay the linkage.
CREATE TABLE IF NOT EXISTS puzzle_source_games (
  id          text PRIMARY KEY,
  variant     text NOT NULL,
  -- The full serialized source-game record ({id, variant, moves}), json for
  -- the same byte-fidelity reason as puzzles.data.
  data        json NOT NULL,
  source_kind text NOT NULL DEFAULT 'seed',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Single-row bookkeeping for the boot-time seed sync (see puzzle-store.ts).
CREATE TABLE IF NOT EXISTS puzzle_seed_sync (
  slot      text PRIMARY KEY,
  seed_hash text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
