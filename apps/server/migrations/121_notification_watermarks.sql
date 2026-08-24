-- 121_notification_watermarks.sql
-- Per-account "seen" watermarks for the notification bell's new sources
-- (new followers, replies to your forum topics).
--
-- 069_user_relations shipped deliberately with "no follower notification": the
-- follow edge is private to the actor. This narrows that, but only to a COUNT.
-- The target learns how many new followers they have, never who: there is still
-- no followers list surface, and nothing here creates one.
--
-- Watermarks rather than per-row read flags because both feeds are append-only
-- and the bell only ever asks "how many since I last looked" — one timestamp
-- per account beats a row per (user, event) that is written once and read once.
--
-- NOT NULL DEFAULT now() matters: a nullable column read as "never looked"
-- would show every existing account its entire follower history as unread the
-- moment this ships. Backfilling to now() means everyone starts at zero and
-- only genuinely new activity counts.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS followers_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS forum_replies_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- "Topics I authored" is the driving side of the forum-reply count; without
-- this the count degrades to a seq scan of forum_topics per bell poll.
CREATE INDEX IF NOT EXISTS forum_topics_author_idx
  ON forum_topics (author_account_id)
  WHERE hidden_at IS NULL;
