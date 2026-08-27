-- 123_forum_topic_watches.sql
-- Which forum threads an account wants reply notifications for, and how far
-- into each one it has read.
--
-- Before this the bell counted replies on "topics you authored": an implicit
-- watch that nobody could turn off and nobody could turn on for a thread they
-- merely replied to. This makes the watch explicit, one row per
-- (account, topic), and the notification query reads ONLY this table, so the
-- Watch button and the badge cannot disagree.
--
-- seen_at is the per-topic read watermark. Visiting a topic advances it; a
-- post counts as unread only after GREATEST(users.forum_replies_seen_at,
-- seen_at), so 121's "opening the bell clears everything" contract still
-- holds beside the per-topic one.
--
-- Backfill: every existing topic author gets a watch row, seeded with the
-- account's current bell watermark rather than now(), so nobody's badge
-- changes on deploy. Past REPLIERS are deliberately not backfilled: that would
-- silently subscribe people to threads they touched once months ago. Auto-watch
-- on reply starts with the next reply.
--
-- Watch state is private to the actor: no watcher counts, no watcher lists,
-- the same posture 069 takes for the follow edge.

CREATE TABLE IF NOT EXISTS forum_topic_watches (
  account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, topic_id)
);

-- Topic-side lookups (cascade on topic delete; any future "watchers of X" admin
-- read). The PK already covers the account-side scan the bell does.
CREATE INDEX IF NOT EXISTS forum_topic_watches_topic_idx
  ON forum_topic_watches (topic_id);

INSERT INTO forum_topic_watches (account_id, topic_id, seen_at, created_at)
SELECT t.author_account_id, t.id, u.forum_replies_seen_at, t.created_at
FROM forum_topics t
JOIN users u ON u.id = t.author_account_id
ON CONFLICT (account_id, topic_id) DO NOTHING;
