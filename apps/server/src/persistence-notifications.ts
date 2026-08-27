// Notification-bell counts (121_notification_watermarks.sql).
//
// Every count here answers one question: "how many things have happened to me
// since I last looked?" Two shapes appear:
//   - watermarked feeds (new followers, forum replies) are append-only, so the
//     count is rows-after-users.<kind>_seen_at and "reading" them is a single
//     timestamp write. Forum replies add a second, per-topic watermark on the
//     watch row (123) so reading one thread clears just that thread.
//   - live-state counts (unread DMs, your-move games, incoming challenges) have
//     no watermark: the thing itself is either still pending or it is not, so a
//     watermark would let a badge lie about work that is still outstanding.
//
// The watermark columns deliberately stay out of USER_COLUMNS. They change on
// a different cadence from account identity and are read only by this module,
// so putting them on the row every session-load fetches would add width to the
// hottest query in the app for no reader.

import { getPool } from './persistence-db.js';

export type NotificationWatermarkKind = 'followers' | 'forum-replies';

const WATERMARK_COLUMNS: Record<NotificationWatermarkKind, string> = {
  followers: 'followers_seen_at',
  'forum-replies': 'forum_replies_seen_at',
};

export function isNotificationWatermarkKind(value: unknown): value is NotificationWatermarkKind {
  return value === 'followers' || value === 'forum-replies';
}

// Follows pointed AT this user since they last opened the bell. Count only:
// nothing here exposes which accounts they are, which keeps 069's "no public
// followers list" posture intact.
export async function countNewFollowers(userId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM user_relations r
     JOIN users u ON u.id = $1
     WHERE r.target_id = $1
       AND r.relation = 'follow'
       AND r.created_at > u.followers_seen_at`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export type ForumWatchNotification = {
  topicId: string;
  slug: string;
  title: string;
  unread: number;
  // The oldest unread reply: the bell row deep-links to it through the post
  // redirect route, so one click lands where the reader left off.
  firstUnreadPostId: string;
};

export type UnreadWatchedForumTopics = {
  // Topics with at least one unread reply. The badge counts THESE, not
  // replies: one busy thread is a 1, not a 40.
  total: number;
  // The most recently active of them, capped by the caller.
  topics: ForumWatchNotification[];
};

// Unread activity older than this drops off the bell by itself. The watch row
// stays; a thread the user walked away from simply stops asking for them.
export const FORUM_UNREAD_WINDOW_DAYS = 30;

// Replies by other people in the topics this user watches (123), grouped per
// topic. A reply is unread when it postdates BOTH the bell watermark (opening
// the panel) and the topic's own seen_at (visiting the thread). Left out so
// the badge never points at something the user cannot see or does not want:
// hidden posts and topics, their own posts, replies from accounts they block,
// and anything older than the window.
export async function unreadWatchedForumTopics(
  userId: string,
  options: { limit?: number } = {},
): Promise<UnreadWatchedForumTopics> {
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 5)));
  const { rows } = await getPool().query<{
    topic_id: string;
    slug: string;
    title: string;
    unread: number;
    first_unread_post_id: string;
    total: number;
  }>(
    `WITH unread AS (
       SELECT t.id AS topic_id, t.slug, t.title, t.last_post_at,
              count(*)::int AS unread,
              (array_agg(p.id ORDER BY p.created_at ASC, p.id ASC))[1] AS first_unread_post_id
       FROM forum_topic_watches w
       JOIN users u ON u.id = w.account_id
       JOIN forum_topics t ON t.id = w.topic_id AND t.hidden_at IS NULL
       JOIN forum_posts p ON p.topic_id = t.id
         AND p.hidden_at IS NULL
         AND p.author_account_id IS DISTINCT FROM w.account_id
         AND p.created_at > GREATEST(u.forum_replies_seen_at, w.seen_at)
         AND p.created_at > now() - make_interval(days => $2::int)
         AND NOT EXISTS (
           SELECT 1
           FROM user_relations b
           WHERE b.actor_id = w.account_id
             AND b.target_id = p.author_account_id
             AND b.relation = 'block'
         )
       WHERE w.account_id = $1
       GROUP BY t.id, t.slug, t.title, t.last_post_at
     )
     SELECT topic_id, slug, title, unread, first_unread_post_id,
            (count(*) OVER ())::int AS total
     FROM unread
     ORDER BY last_post_at DESC, topic_id ASC
     LIMIT $3::int`,
    [userId, FORUM_UNREAD_WINDOW_DAYS, limit],
  );
  return {
    total: rows[0]?.total ?? 0,
    topics: rows.map((row) => ({
      topicId: row.topic_id,
      slug: row.slug,
      title: row.title,
      unread: row.unread,
      firstUnreadPostId: row.first_unread_post_id,
    })),
  };
}

// Directed correspondence challenges still awaiting this user's answer. Live
// state, not a feed: an unanswered challenge stays counted until it is accepted,
// declined, or expires.
export async function countIncomingChallenges(userId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM correspondence_seeks
     WHERE target_user_id = $1
       AND (expires_at IS NULL OR expires_at > now())`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationsSeen(
  userId: string,
  kind: NotificationWatermarkKind,
  at: Date = new Date(),
): Promise<void> {
  // Column name comes from the closed map above, never from the request, so
  // the interpolation cannot carry caller-controlled SQL.
  const column = WATERMARK_COLUMNS[kind];
  await getPool().query(`UPDATE users SET ${column} = $2 WHERE id = $1`, [userId, at]);
}
