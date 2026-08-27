// Forum topic watches (123_forum_topic_watches.sql): which threads an account
// wants reply notifications for, and how far into each one it has read.
//
// One table, one rule. The bell used to count replies on "topics you
// authored", an implicit watch nobody could turn off. 123 turns that into a row
// per (account, topic): authors were backfilled, creating a topic or replying
// in one upserts a row, and unwatching deletes it. The notification query in
// persistence-notifications.ts reads ONLY this table, so the Watch button and
// the badge share one source of truth.
//
// seen_at is the per-topic read watermark. Visiting the topic advances it, and
// a post counts as unread only after GREATEST(users.forum_replies_seen_at,
// seen_at), so "opening the bell clears everything" (121) still holds beside
// "reading the thread clears that thread".
//
// Watch state is private to the actor: nothing here counts or lists watchers,
// matching the follow-edge posture in 069.

import type pg from 'pg';
import { getPool } from './persistence-db.js';

export type WatchForumTopicResult =
  | { ok: true; watching: boolean }
  | { ok: false; error: 'topic_not_found' };

const UPSERT_WATCH_SQL = `INSERT INTO forum_topic_watches (account_id, topic_id, seen_at, created_at)
   VALUES ($1, $2, $3, $3)
   ON CONFLICT (account_id, topic_id) DO UPDATE SET seen_at = EXCLUDED.seen_at`;

// Runs inside a forum write transaction (create topic, add reply): the poster
// is (re)subscribed and this moment counts as read. ON CONFLICT resets seen_at
// rather than keeping the old one because posting in a thread is the strongest
// evidence the poster has just read it. A prior explicit unwatch is overridden
// on purpose: replying again is opting back in, as on lichess and GitHub.
export async function ensureForumTopicWatch(
  client: pg.PoolClient,
  input: { accountId: string; topicId: string; now: Date },
): Promise<void> {
  await client.query(UPSERT_WATCH_SQL, [input.accountId, input.topicId, input.now]);
}

export async function watchForumTopic(input: {
  accountId: string;
  topicId: string;
  now: Date;
}): Promise<WatchForumTopicResult> {
  // Hidden topics are unwatchable: the button never renders for them and a
  // watch row on one would only ever count moderated-away replies.
  const { rowCount } = await getPool().query(
    `INSERT INTO forum_topic_watches (account_id, topic_id, seen_at, created_at)
     SELECT $1, t.id, $3, $3
     FROM forum_topics t
     WHERE t.id = $2 AND t.hidden_at IS NULL
     ON CONFLICT (account_id, topic_id) DO UPDATE SET seen_at = EXCLUDED.seen_at`,
    [input.accountId, input.topicId, input.now],
  );
  if (!rowCount) return { ok: false, error: 'topic_not_found' };
  return { ok: true, watching: true };
}

// Idempotent: unwatching a topic you never watched is still "not watching".
// Hidden topics are fine to unwatch (getting out is always allowed); only a
// topic that does not exist at all is a 404.
export async function unwatchForumTopic(input: {
  accountId: string;
  topicId: string;
}): Promise<WatchForumTopicResult> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT id FROM forum_topics WHERE id = $1`,
    [input.topicId],
  );
  if (!rows[0]) return { ok: false, error: 'topic_not_found' };
  await getPool().query(`DELETE FROM forum_topic_watches WHERE account_id = $1 AND topic_id = $2`, [
    input.accountId,
    input.topicId,
  ]);
  return { ok: true, watching: false };
}

export async function isWatchingForumTopic(accountId: string, topicId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ one: number }>(
    `SELECT 1 AS one FROM forum_topic_watches WHERE account_id = $1 AND topic_id = $2`,
    [accountId, topicId],
  );
  return rows.length > 0;
}

// The topic page calls this after it renders. A no-op for non-watchers (no row
// to advance) and never moves the watermark backwards, so a stale tab cannot
// un-read a thread.
export async function markForumTopicSeen(input: {
  accountId: string;
  topicId: string;
  now: Date;
}): Promise<void> {
  await getPool().query(
    `UPDATE forum_topic_watches
     SET seen_at = $3
     WHERE account_id = $1 AND topic_id = $2 AND seen_at < $3`,
    [input.accountId, input.topicId, input.now],
  );
}
