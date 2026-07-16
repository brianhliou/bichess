-- Public study appreciation. One like per account, removed automatically when
-- either the study or account is deleted. The study-first index supports the
-- homepage's most-liked public studies query.

CREATE TABLE IF NOT EXISTS study_likes (
  study_id TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (study_id, user_id)
);

CREATE INDEX IF NOT EXISTS study_likes_study_idx
  ON study_likes (study_id, created_at DESC);
