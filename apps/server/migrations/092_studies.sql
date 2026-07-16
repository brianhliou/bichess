-- 092_studies.sql
-- User-created studies (lichess-parity): a persistent, owned container of one or
-- more chapters, each holding a serialized move tree with annotations. This is S2
-- of the study track (docs-private/study-track.md) — single-author, owner-only
-- write, no real-time collaboration (that is S8). The `version` column on a
-- chapter is the optimistic-concurrency token: a save carrying a stale version is
-- rejected rather than clobbering (Decision A), which gives multi-contributor
-- safety later without the live-sync machinery.

CREATE TABLE IF NOT EXISTS studies (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studies_owner_idx
  ON studies (owner_id, updated_at DESC);
-- The "top / recent public studies" surface (homepage widget, browse) reads only
-- public rows ordered by recency; a partial index keeps that scan tight.
CREATE INDEX IF NOT EXISTS studies_public_recent_idx
  ON studies (updated_at DESC) WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS study_chapters (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  -- GameSpecId (fail-closed on load; the route validates against a study allowlist).
  variant TEXT NOT NULL CHECK (char_length(btrim(variant)) > 0),
  orientation TEXT NOT NULL DEFAULT 'red',
  -- The serialized move tree (tree-serialize.ts SerializedTree): move UCIs +
  -- annotations only; positions are rebuilt by replay on load.
  root JSONB NOT NULL,
  -- Denormalized last-mainline info for cheap previews (plyCount, last uci).
  denorm JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Optimistic-concurrency token: bumped on every tree save.
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_chapters_study_idx
  ON study_chapters (study_id, ordinal, created_at);
