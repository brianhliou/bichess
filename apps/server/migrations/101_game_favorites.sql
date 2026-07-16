-- Private, account-owned saved games. This is a bookmark, not a public like:
-- there is no denormalized count on games and no viewer-facing popularity signal.

CREATE TABLE IF NOT EXISTS game_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(room_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS game_favorites_user_recent_idx
  ON game_favorites (user_id, created_at DESC, game_id);

CREATE INDEX IF NOT EXISTS game_favorites_game_idx
  ON game_favorites (game_id);
