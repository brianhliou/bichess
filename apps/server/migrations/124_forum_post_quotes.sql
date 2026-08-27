-- 124_forum_post_quotes.sql
-- Which earlier posts a reply quoted, recorded when the reply is created.
--
-- The quote itself stays plain text inside body_text; nothing renders from
-- this table. The row exists for one reader: the quoted author, who is told
-- "X quoted you" in the bell even in a thread they do not watch.
--
-- Links are by post id and validated at insert to a visible post in the same
-- topic, so a quote cannot reach across threads or resurrect a hidden post.
-- Hand-typed "> Alice wrote:" text creates no row; only the Quote button
-- (or a client sending ids the same way) does, and posting is already
-- rate-limited per account, so this adds no new way to ping someone.

CREATE TABLE IF NOT EXISTS forum_post_quotes (
  post_id TEXT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  quoted_post_id TEXT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, quoted_post_id)
);

-- "Posts that quote one of mine" walks from the quoted side.
CREATE INDEX IF NOT EXISTS forum_post_quotes_quoted_post_idx
  ON forum_post_quotes (quoted_post_id);
