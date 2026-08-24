// Notification-bell counts (121_notification_watermarks.sql).
//
// Every count here answers one question: "how many things have happened to me
// since I last looked?" Two shapes appear:
//   - watermarked feeds (new followers, forum replies) are append-only, so the
//     count is rows-after-users.<kind>_seen_at and "reading" them is a single
//     timestamp write.
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

// Replies by other people on topics this user started, since they last looked.
// Hidden posts and hidden topics are excluded so a moderated reply does not
// leave a badge the user can never clear by reading.
export async function countForumReplies(userId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM forum_posts p
     JOIN forum_topics t ON t.id = p.topic_id
     JOIN users u ON u.id = $1
     WHERE t.author_account_id = $1
       AND p.author_account_id IS DISTINCT FROM $1
       AND p.hidden_at IS NULL
       AND t.hidden_at IS NULL
       AND p.created_at > u.forum_replies_seen_at`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
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
