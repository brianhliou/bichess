// Auth-flow persistence: email login challenges, durable auth rate-limit
// buckets, email change + account closure challenges, and the account-lifecycle
// writes those flows own (email verification/change, closure). Split out of
// persistence-accounts.ts; the shared users-row plumbing (USER_COLUMNS,
// userFromRow) stays there.
import {
  isUniqueViolation,
  USER_COLUMNS,
  type UserAccount,
  type UserRow,
  userFromRow,
} from './persistence-accounts.js';
import { getPool, withTransaction } from './persistence-db.js';

export type EmailLoginChallenge = {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
};

export type AuthRateLimitScope = 'email-confirm-ip' | 'email-start-email' | 'email-start-ip';

export type AuthRateLimitInput = {
  cooldownMs?: number;
  limit: number;
  now: Date;
  scope: AuthRateLimitScope;
  subjectHash: string;
  windowMs: number;
};

export type EmailChangeChallenge = EmailLoginChallenge & {
  userId: string;
};

export type AccountClosureChallenge = {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
};

export type UpdateUserEmailResult =
  | { ok: true; user: UserAccount }
  | { ok: false; error: 'email_taken' | 'user_not_found' };

export type CloseUserAccountResult =
  | { ok: true }
  | { ok: false; error: 'active_subscription' | 'already_closed' | 'user_not_found' };

export async function createEmailLoginChallenge(challenge: EmailLoginChallenge): Promise<void> {
  await getPool().query(
    `INSERT INTO email_login_challenges (id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [challenge.id, challenge.email, challenge.codeHash, challenge.expiresAt],
  );
}

export async function deleteEmailLoginChallenge(id: string): Promise<void> {
  await getPool().query('DELETE FROM email_login_challenges WHERE id = $1', [id]);
}

export async function supersedeEmailLoginChallenges(
  email: string,
  keepId: string,
  at: Date,
): Promise<void> {
  await getPool().query(
    `UPDATE email_login_challenges
        SET consumed_at = $3
      WHERE lower(email) = lower($1)
        AND id <> $2
        AND consumed_at IS NULL`,
    [email, keepId, at],
  );
}

export async function consumeAuthRateLimitBucket(input: AuthRateLimitInput): Promise<boolean> {
  if (
    input.limit < 1 ||
    input.windowMs < 1 ||
    (input.cooldownMs !== undefined && input.cooldownMs < 0)
  ) {
    throw new Error('invalid auth rate-limit configuration');
  }
  const windowCutoff = new Date(input.now.getTime() - input.windowMs);
  const cooldownCutoff = new Date(input.now.getTime() - (input.cooldownMs ?? 0));
  const { rowCount } = await getPool().query(
    `INSERT INTO auth_rate_limit_buckets
       (scope, subject_hash, window_started_at, hit_count, last_hit_at)
     VALUES ($1, $2, $3, 1, $3)
     ON CONFLICT (scope, subject_hash) DO UPDATE
       SET window_started_at = CASE
             WHEN auth_rate_limit_buckets.window_started_at <= $4 THEN $3
             ELSE auth_rate_limit_buckets.window_started_at
           END,
           hit_count = CASE
             WHEN auth_rate_limit_buckets.window_started_at <= $4 THEN 1
             ELSE auth_rate_limit_buckets.hit_count + 1
           END,
           last_hit_at = $3
       WHERE (
         auth_rate_limit_buckets.window_started_at <= $4
         OR auth_rate_limit_buckets.hit_count < $5
       )
       AND auth_rate_limit_buckets.last_hit_at <= $6
     RETURNING hit_count`,
    [input.scope, input.subjectHash, input.now, windowCutoff, input.limit, cooldownCutoff],
  );
  return (rowCount ?? 0) > 0;
}

export async function pruneAuthRateLimitBuckets(before: Date): Promise<number> {
  const result = await getPool().query(
    'DELETE FROM auth_rate_limit_buckets WHERE last_hit_at < $1',
    [before],
  );
  return result.rowCount ?? 0;
}

export async function consumeEmailLoginChallenge(
  id: string,
  codeHash: string,
  at: Date,
): Promise<{ email: string } | null> {
  // Atomic attempt-and-check. Every guess against a live, non-exhausted
  // challenge burns one attempt; a correct guess additionally marks the
  // challenge consumed and returns the email. A wrong guess increments
  // attempt_count without matching code_hash, so once attempt_count reaches
  // max_attempts the row no longer satisfies the WHERE clause and the
  // challenge is dead well before its TTL — closing the brute-force window on
  // the 8-digit code. Single statement so concurrent confirms can't race past
  // the cap.
  const { rows } = await getPool().query<{ email: string }>(
    `UPDATE email_login_challenges
     SET attempt_count = attempt_count + 1,
         consumed_at = CASE WHEN code_hash = $2 THEN $3 ELSE consumed_at END
     WHERE id = $1
       AND consumed_at IS NULL
       AND expires_at > $3
       AND attempt_count < max_attempts
     RETURNING CASE WHEN consumed_at = $3 THEN email ELSE NULL END AS email`,
    [id, codeHash, at],
  );
  return rows[0]?.email ? { email: rows[0].email } : null;
}

export async function createEmailChangeChallenge(challenge: EmailChangeChallenge): Promise<void> {
  await getPool().query(
    `INSERT INTO account_email_change_challenges (id, user_id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [challenge.id, challenge.userId, challenge.email, challenge.codeHash, challenge.expiresAt],
  );
}

export async function deleteEmailChangeChallenge(id: string): Promise<void> {
  await getPool().query('DELETE FROM account_email_change_challenges WHERE id = $1', [id]);
}

export async function consumeEmailChangeChallenge(
  id: string,
  userId: string,
  codeHash: string,
  at: Date,
): Promise<{ email: string } | null> {
  const { rows } = await getPool().query<{ email: string | null }>(
    `UPDATE account_email_change_challenges
     SET attempt_count = attempt_count + 1,
         consumed_at = CASE WHEN code_hash = $3 THEN $4 ELSE consumed_at END
     WHERE id = $1
       AND user_id = $2
       AND consumed_at IS NULL
       AND expires_at > $4
       AND attempt_count < max_attempts
     RETURNING CASE WHEN consumed_at = $4 THEN email ELSE NULL END AS email`,
    [id, userId, codeHash, at],
  );
  return rows[0]?.email ? { email: rows[0].email } : null;
}

export async function createAccountClosureChallenge(
  challenge: AccountClosureChallenge,
): Promise<void> {
  await getPool().query(
    `INSERT INTO account_closure_challenges (id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [challenge.id, challenge.userId, challenge.codeHash, challenge.expiresAt],
  );
}

export async function deleteAccountClosureChallenge(id: string): Promise<void> {
  await getPool().query('DELETE FROM account_closure_challenges WHERE id = $1', [id]);
}

export async function consumeAccountClosureChallenge(
  id: string,
  userId: string,
  codeHash: string,
  at: Date,
): Promise<boolean> {
  const { rows } = await getPool().query<{ verified: boolean }>(
    `UPDATE account_closure_challenges
     SET attempt_count = attempt_count + 1,
         consumed_at = CASE WHEN code_hash = $3 THEN $4 ELSE consumed_at END
     WHERE id = $1
       AND user_id = $2
       AND consumed_at IS NULL
       AND expires_at > $4
       AND attempt_count < max_attempts
     RETURNING consumed_at = $4 AS verified`,
    [id, userId, codeHash, at],
  );
  return rows[0]?.verified === true;
}

export async function closedAccountExistsForEmailHash(emailHash: string): Promise<boolean> {
  const { rows } = await getPool().query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM users WHERE closed_email_hash = $1) AS exists',
    [emailHash],
  );
  return rows[0]?.exists ?? false;
}

export async function markUserEmailVerified(userId: string, at: Date): Promise<UserAccount> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, $2),
         updated_at = $2
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, at],
  );
  return userFromRow(rows[0]!);
}

export async function updateUserEmail(
  userId: string,
  email: string,
  at: Date,
): Promise<UpdateUserEmailResult> {
  try {
    const { rows } = await getPool().query<UserRow>(
      `UPDATE users
       SET email = $2,
           email_verified_at = $3,
           updated_at = $3
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [userId, email, at],
    );
    return rows[0]
      ? { ok: true, user: userFromRow(rows[0]) }
      : { ok: false, error: 'user_not_found' };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: 'email_taken' };
    throw err;
  }
}

export async function closeUserAccount(
  userId: string,
  identity: { closedEmailHash: string; closedHandle: string; placeholderEmail: string },
  at: Date,
): Promise<CloseUserAccountResult> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS}
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );
    const user = rows[0] ? userFromRow(rows[0]) : null;
    if (!user) return { ok: false, error: 'user_not_found' };
    if (user.closedAt) return { ok: false, error: 'already_closed' };
    if (user.patronSince) return { ok: false, error: 'active_subscription' };

    await client.query(
      `INSERT INTO user_handle_reservations (handle, user_id, reserved_at, expires_at)
       VALUES ($1, $2, $3, 'infinity'::timestamptz)
       ON CONFLICT (handle) DO NOTHING`,
      [user.handle, userId, at],
    );
    await client.query(
      `UPDATE users
       SET email = $2,
           email_verified_at = NULL,
           closed_email_hash = $3,
           handle = $4,
           handle_changed_at = $5,
           display_name = 'Closed account',
           display_name_changed_at = $5,
           bio = '',
           location = '',
           profile_links = '{}'::text[],
           display_preferences = '{}'::jsonb,
           account_preferences = '{}'::jsonb,
           profile_visibility = 'private',
           account_role = 'player',
           title = NULL,
           locale = NULL,
           dm_policy = 'never',
           patron_since = NULL,
           closed_at = $5,
           updated_at = $5
       WHERE id = $1`,
      [userId, identity.placeholderEmail, identity.closedEmailHash, identity.closedHandle, at],
    );
    await client.query(
      `UPDATE account_sessions
       SET revoked_at = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, at],
    );
    await client.query('DELETE FROM user_relations WHERE actor_id = $1 OR target_id = $1', [
      userId,
    ]);
    await client.query(
      'DELETE FROM correspondence_seeks WHERE creator_user_id = $1 OR target_user_id = $1',
      [userId],
    );
    await client.query('DELETE FROM coach_profiles WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM account_email_change_challenges WHERE user_id = $1', [userId]);
    return { ok: true };
  });
}
