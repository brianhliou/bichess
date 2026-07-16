-- 098_account_closure.sql
-- Soft-close accounts while preserving immutable game, rating, message, and
-- moderation references. Plaintext login identity is removed on closure.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_email_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_closed_email_hash_idx
  ON users (closed_email_hash)
  WHERE closed_email_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_closure_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0)
);

CREATE INDEX IF NOT EXISTS account_closure_challenges_user_idx
  ON account_closure_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_closure_challenges_expires_at_idx
  ON account_closure_challenges (expires_at);
