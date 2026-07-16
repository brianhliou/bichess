-- 096_account_email_changes.sql
-- Purpose-bound challenges for changing a signed-in account's login email.

CREATE TABLE IF NOT EXISTS account_email_change_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0)
);

CREATE INDEX IF NOT EXISTS account_email_change_challenges_user_idx
  ON account_email_change_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_email_change_challenges_expires_at_idx
  ON account_email_change_challenges (expires_at);
