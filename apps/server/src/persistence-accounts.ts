import { PROVISIONAL_RD } from './glicko.js';
import { getPool, withTransaction } from './persistence-db.js';
import type { GameMode, GameTermination, GameVisibility } from './persistence-game-lifecycle.js';
import type { GameParticipantColor, GameResult, ProfileGameRecord } from './persistence-games.js';
import { attachGameParticipants } from './persistence-games.js';
import type { PlayerTitle } from './persistence-titles.js';
import {
  bucketForGame,
  PUBLIC_RATING_TIME_CLASS,
  type RatingTimeClass,
  type RatingVariant,
} from './rating-buckets.js';

export type AccountRole = 'player' | 'admin';
export type AccountLocale = 'en' | 'zh-Hans' | 'zh-Hant';
export type ProfileVisibility = 'private' | 'unlisted' | 'public';

export const ACCOUNT_LOCALES: readonly AccountLocale[] = ['en', 'zh-Hans', 'zh-Hant'];
export const PROFILE_VISIBILITIES: readonly ProfileVisibility[] = ['private', 'unlisted', 'public'];

export function isAccountLocale(value: unknown): value is AccountLocale {
  return typeof value === 'string' && ACCOUNT_LOCALES.includes(value as AccountLocale);
}

export function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return typeof value === 'string' && PROFILE_VISIBILITIES.includes(value as ProfileVisibility);
}

export type PieceAnimationPreference = 'none' | 'fast' | 'normal' | 'slow';
export type AccountDisplayPreferences = { pieceAnimation?: PieceAnimationPreference };

export type ClockTenthsPreference = 'never' | 'low-time' | 'always';
export type AccountPreferenceKey =
  | 'clockTenths'
  | 'lowTimeSound'
  | 'premoves'
  | 'confirmGameActions'
  | 'inboxBell'
  | 'correspondenceBell'
  | 'correspondenceDeadlineEmail';
export type AccountPreferences = {
  clockTenths: ClockTenthsPreference;
  lowTimeSound: boolean;
  premoves: boolean;
  confirmGameActions: boolean;
  inboxBell: boolean;
  correspondenceBell: boolean;
  correspondenceDeadlineEmail: boolean;
};

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  clockTenths: 'low-time',
  lowTimeSound: true,
  premoves: true,
  confirmGameActions: true,
  inboxBell: true,
  correspondenceBell: true,
  correspondenceDeadlineEmail: true,
};

export function isClockTenthsPreference(value: unknown): value is ClockTenthsPreference {
  return value === 'never' || value === 'low-time' || value === 'always';
}

export const PIECE_ANIMATION_PREFERENCES: readonly PieceAnimationPreference[] = [
  'none',
  'fast',
  'normal',
  'slow',
];

export function isPieceAnimationPreference(value: unknown): value is PieceAnimationPreference {
  return (
    typeof value === 'string' &&
    PIECE_ANIMATION_PREFERENCES.includes(value as PieceAnimationPreference)
  );
}

// Who may START a conversation with this user (#93). Replies to an existing
// thread are always allowed; the send guard in routes/inbox.ts only consults
// this for thread-creating sends. 'friends' = players this user follows.
export type DmPolicy = 'never' | 'friends' | 'always';

export const DM_POLICIES: readonly DmPolicy[] = ['never', 'friends', 'always'];

export function isDmPolicy(value: unknown): value is DmPolicy {
  return typeof value === 'string' && DM_POLICIES.includes(value as DmPolicy);
}

export type UserAccount = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  handle: string;
  handleChangedAt: Date | null;
  displayName: string;
  displayNameChangedAt: Date | null;
  bio: string;
  location: string;
  profileLinks: string[];
  displayPreferences: AccountDisplayPreferences;
  accountPreferences: AccountPreferences;
  profileVisibility: ProfileVisibility;
  accountRole: AccountRole;
  // Verified player title (088), granted only through the title-verification
  // pipeline (routes/titles.ts). NULL = untitled. Closed vocabulary; see
  // persistence-titles.ts.
  title: PlayerTitle | null;
  locale: AccountLocale | null;
  dmPolicy: DmPolicy;
  eloRating: number;
  // Patron program (078). patronSince is set while a donation is active (drives
  // the cosmetic badge); NULL = not a patron. stripeCustomerId is the stable
  // account->Stripe-customer map for reusing a customer and opening the billing
  // portal; NULL until the first checkout.
  patronSince: Date | null;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
};

export type LeaderboardEntry = {
  rank: number;
  handle: string;
  displayName: string;
  eloRating: number;
  gamesPlayed: number;
  // RD still above the provisional threshold — rating not yet settled. Shown on
  // the leaderboard with a "?" marker; ranked by conservative rating so it sorts
  // low until it settles.
  provisional: boolean;
};

export type LeaderboardQuery = {
  variant: RatingVariant;
  timeClass: RatingTimeClass;
  limit?: number;
};

export type UpdateUserProfileResult =
  | { ok: true; user: UserAccount }
  | { ok: false; error: 'handle_taken' | 'handle_change_cooldown'; availableAt?: Date };

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

export type AccountSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
};

export type AccountSessionSummary = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  userAgent: string | null;
};

export type PublicProfileUser = {
  handle: string;
  displayName: string;
  bio: string;
  location: string;
  profileLinks: string[];
  profileVisibility: UserAccount['profileVisibility'];
  accountRole: AccountRole;
  // Verified player title; drives the title badge (flair) on the public
  // profile and user card. NULL = untitled.
  title: PlayerTitle | null;
  // Set while a donation is active; drives the cosmetic Patron badge on the
  // public profile. NULL = not a patron.
  patronSince: Date | null;
  createdAt: Date;
};

export type ProfileBucketRating = {
  variant: RatingVariant;
  timeClass: RatingTimeClass;
  eloRating: number | null;
  // Count of rated games only. user_ratings.games_played is incremented per
  // rated game; casual games are not counted here. Activity in casual buckets
  // is reflected by the row existing (see UserProfile.ratings filtering).
  ratedGamesPlayed: number;
  // Count of all completed games (rated + casual). Used to decide whether
  // a row should appear for a variant; not surfaced as a number in the UI.
  totalGamesPlayed: number;
  // Rating not yet settled (RD above threshold). Client shows a "?"; RD itself
  // is intentionally not exposed (confusing to players).
  provisional: boolean;
};

// One variant's puzzle rating (Glicko-2 pool, schema in migration 073). Shown on
// the profile alongside game ratings. Only variants the user has attempted appear.
export type ProfilePuzzleRating = {
  // The puzzle variant's GameSpecId (e.g. 'xiangqi', 'fortress-xiangqi', 'jungle').
  variant: string;
  rating: number;
  provisional: boolean;
  solved: number;
  attempts: number;
};

export type UserProfile = {
  user: PublicProfileUser;
  ratings: ProfileBucketRating[];
  // Per-variant puzzle ratings (empty when the user has attempted no puzzles).
  puzzleRatings: ProfilePuzzleRating[];
  // First page of games (newest first). Older pages load via getUserGamesPage.
  games: ProfileGameRecord[];
  // Total completed games visible to the viewer, so the client can show an
  // accurate count and decide whether to offer "Load more".
  gamesTotal: number;
};

export type ProfileRatingHistoryPoint = {
  roomId: string;
  endedAt: Date;
  ratingBefore: number;
  ratingAfter: number;
};

export type ProfileRatingHistory = {
  variant: RatingVariant;
  timeClass: RatingTimeClass;
  points: ProfileRatingHistoryPoint[];
};

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

// Canonical users-table column list for reads. Keep in lockstep with UserRow
// and userFromRow below: every SELECT/RETURNING of a full user row derives from
// this, so a column can't be silently dropped from one query (which once
// stripped elo_rating from the session-load path).
const USER_COLUMNS = [
  'id',
  'email',
  'email_verified_at',
  'handle',
  'handle_changed_at',
  'display_name',
  'display_name_changed_at',
  'bio',
  'location',
  'profile_links',
  'display_preferences',
  'account_preferences',
  'profile_visibility',
  'account_role',
  'title',
  'locale',
  'dm_policy',
  'elo_rating',
  'patron_since',
  'stripe_customer_id',
  'created_at',
  'updated_at',
  'closed_at',
].join(', ');

// Same columns qualified with the `users.` alias, for queries that join users to
// another table (e.g. account_sessions) where bare column names are ambiguous.
const USER_COLUMNS_QUALIFIED = USER_COLUMNS.split(', ')
  .map((column) => `users.${column}`)
  .join(', ');

export async function findUserByEmail(email: string): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE lower(email) = lower($1)
       AND closed_at IS NULL
     LIMIT 1`,
    [email],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function closedAccountExistsForEmailHash(emailHash: string): Promise<boolean> {
  const { rows } = await getPool().query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM users WHERE closed_email_hash = $1) AS exists',
    [emailHash],
  );
  return rows[0]?.exists ?? false;
}

export async function createUser(user: {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  handle: string;
  displayName: string;
  profileVisibility?: UserAccount['profileVisibility'];
  accountRole?: AccountRole;
  now: Date;
}): Promise<UserAccount> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users
       (id, email, email_verified_at, handle, display_name, profile_visibility, account_role, created_at, updated_at)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $8
     WHERE NOT EXISTS (
       SELECT 1 FROM user_handle_reservations
       WHERE lower(handle) = lower($4) AND expires_at > $8
     )
     RETURNING ${USER_COLUMNS}`,
    [
      user.id,
      user.email,
      user.emailVerifiedAt,
      user.handle,
      user.displayName,
      user.profileVisibility ?? 'public',
      user.accountRole ?? 'player',
      user.now,
    ],
  );
  if (!rows[0]) {
    const error = new Error('handle is reserved') as Error & { code: string };
    error.code = '23505';
    throw error;
  }
  return userFromRow(rows[0]!);
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

export async function updateUserProfile(
  userId: string,
  updates: { handle: string; displayName: string },
  at: Date,
): Promise<UpdateUserProfileResult> {
  const handleCooldownMs = 30 * 24 * 60 * 60 * 1000;
  const handleReservationMs = 90 * 24 * 60 * 60 * 1000;
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query<UserRow>(
        `SELECT ${USER_COLUMNS}
       FROM users
       WHERE id = $1
       FOR UPDATE`,
        [userId],
      );
      const current = rows[0] ? userFromRow(rows[0]) : null;
      if (!current) throw new Error(`missing user ${userId}`);

      const nextHandle = updates.handle;
      const nextDisplayName = updates.displayName;
      const handleChanged = nextHandle !== current.handle;
      const displayNameChanged = nextDisplayName !== current.displayName;

      if (handleChanged) {
        if (
          current.handleChangedAt &&
          at.getTime() - current.handleChangedAt.getTime() < handleCooldownMs
        ) {
          return {
            ok: false,
            error: 'handle_change_cooldown',
            availableAt: new Date(current.handleChangedAt.getTime() + handleCooldownMs),
          };
        }
        const { rows: conflicts } = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (
           SELECT 1 FROM users WHERE lower(handle) = lower($1) AND id <> $2
           UNION ALL
           SELECT 1 FROM user_handle_reservations
           WHERE lower(handle) = lower($1)
             AND user_id <> $2
             AND expires_at > $3
         ) AS exists`,
          [nextHandle, userId, at],
        );
        if (conflicts[0]?.exists) {
          return { ok: false, error: 'handle_taken' };
        }
        await client.query(
          `INSERT INTO user_handle_reservations (handle, user_id, reserved_at, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (handle) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             reserved_at = EXCLUDED.reserved_at,
             expires_at = EXCLUDED.expires_at`,
          [current.handle, userId, at, new Date(at.getTime() + handleReservationMs)],
        );
      }

      const { rows: updatedRows } = await client.query<UserRow>(
        `UPDATE users
       SET handle = $2,
           handle_changed_at = CASE WHEN $4 THEN $6 ELSE handle_changed_at END,
           display_name = $3,
           display_name_changed_at = CASE WHEN $5 THEN $6 ELSE display_name_changed_at END,
           updated_at = $6
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
        [userId, nextHandle, nextDisplayName, handleChanged, displayNameChanged, at],
      );
      return { ok: true, user: userFromRow(updatedRows[0]!) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: 'handle_taken' };
    throw err;
  }
}

export async function updateUserPublicProfileDetails(
  userId: string,
  details: { bio: string; location: string; profileLinks: string[] },
  at: Date,
): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET bio = $2,
         location = $3,
         profile_links = $4,
         updated_at = $5
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, details.bio, details.location, details.profileLinks, at],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function updateUserPieceAnimationPreference(
  userId: string,
  pieceAnimation: PieceAnimationPreference,
  at: Date,
): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET display_preferences = jsonb_set(
           display_preferences,
           '{pieceAnimation}',
           to_jsonb($2::text),
           true
         ),
         updated_at = $3
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, pieceAnimation, at],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function updateUserAccountPreference(
  userId: string,
  key: AccountPreferenceKey,
  value: string | boolean,
  at: Date,
): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET account_preferences = jsonb_set(
           account_preferences,
           ARRAY[$2::text],
           $3::jsonb,
           true
         ),
         updated_at = $4
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, key, JSON.stringify(value), at],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function updateUserLocale(
  userId: string,
  locale: AccountLocale | null,
  at: Date,
): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET locale = $2,
         updated_at = $3
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, locale, at],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function updateUserProfileVisibility(
  userId: string,
  profileVisibility: ProfileVisibility,
  at: Date,
): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET profile_visibility = $2,
         updated_at = $3
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, profileVisibility, at],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function updateUserDmPolicy(
  userId: string,
  dmPolicy: DmPolicy,
  at: Date,
): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users
     SET dm_policy = $2,
         updated_at = $3
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, dmPolicy, at],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

// The inbox send guard's read: the target's policy by id, defaulting closed
// to 'never' if the row vanished mid-request.
export async function getUserDmPolicy(userId: string): Promise<DmPolicy> {
  const { rows } = await getPool().query<{ dm_policy: DmPolicy }>(
    `SELECT dm_policy FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.dm_policy ?? 'never';
}

// Cheap existence probe by account id — used to validate a challenge target
// before writing a directed seek (a clean 404 instead of an FK violation).
export async function userExists(userId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ one: number }>(
    `SELECT 1 AS one FROM users WHERE id = $1 AND closed_at IS NULL LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

export async function createAccountSession(session: AccountSession): Promise<void> {
  await getPool().query(
    `INSERT INTO account_sessions (id, user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [session.id, session.userId, session.tokenHash, session.expiresAt, session.userAgent ?? null],
  );
}

export async function listActiveAccountSessions(
  userId: string,
  at: Date,
): Promise<AccountSessionSummary[]> {
  const { rows } = await getPool().query<{
    id: string;
    created_at: Date;
    last_seen_at: Date;
    expires_at: Date;
    user_agent: string | null;
  }>(
    `SELECT id, created_at, last_seen_at, expires_at, user_agent
     FROM account_sessions
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > $2
     ORDER BY last_seen_at DESC, created_at DESC`,
    [userId, at],
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
  }));
}

export async function backfillUserAccountSessionAgent(
  userId: string,
  sessionIds: string[],
  userAgent: string,
): Promise<void> {
  await getPool().query(
    `UPDATE account_sessions
     SET user_agent = $3
     WHERE user_id = $1
       AND id = ANY($2::text[])
       AND user_agent IS NULL`,
    [userId, sessionIds, userAgent],
  );
}

export async function revokeUserAccountSession(
  userId: string,
  sessionId: string,
  at: Date,
): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE account_sessions
     SET revoked_at = $3
     WHERE id = $1
       AND user_id = $2
       AND revoked_at IS NULL`,
    [sessionId, userId, at],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function revokeOtherUserAccountSessions(
  userId: string,
  currentSessionIds: string[],
  at: Date,
): Promise<number> {
  const result = await getPool().query(
    `UPDATE account_sessions
     SET revoked_at = $3
     WHERE user_id = $1
       AND NOT (id = ANY($2::text[]))
       AND revoked_at IS NULL`,
    [userId, currentSessionIds, at],
  );
  return result.rowCount ?? 0;
}

// How stale users.last_seen_at may get before a session validation refreshes
// it. Throttling the durable bump keeps the per-request cost at zero extra
// writes in the common case (the session-row update below still happens every
// request, as before 087).
const LAST_SEEN_BUMP_INTERVAL_MS = 5 * 60 * 1000;

export async function getUserByAccountSession(
  sessionId: string,
  tokenHash: string,
  at: Date,
): Promise<UserAccount | null> {
  // One statement, two writes: the session-row touch (pre-087 behavior) and a
  // throttled bump of the durable users.last_seen_at (087). The bump CTE only
  // matches when the current value is NULL or older than the throttle window,
  // so steady traffic writes the users row at most once per interval.
  const { rows } = await getPool().query<UserRow>(
    `WITH matched AS (
       UPDATE account_sessions
       SET last_seen_at = $3
       FROM users
       WHERE account_sessions.id = $1
         AND account_sessions.token_hash = $2
         AND account_sessions.user_id = users.id
         AND users.closed_at IS NULL
         AND account_sessions.revoked_at IS NULL
         AND account_sessions.expires_at > $3
       RETURNING ${USER_COLUMNS_QUALIFIED}
     ),
     last_seen_bump AS (
       UPDATE users
       SET last_seen_at = $3
       FROM matched
       WHERE users.id = matched.id
         AND (users.last_seen_at IS NULL
              OR users.last_seen_at < $3::timestamptz - ($4 * interval '1 millisecond'))
     )
     SELECT * FROM matched`,
    [sessionId, tokenHash, at, LAST_SEEN_BUMP_INTERVAL_MS],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function revokeAccountSession(
  sessionId: string,
  tokenHash: string,
  at: Date,
): Promise<void> {
  await getPool().query(
    `UPDATE account_sessions
     SET revoked_at = $3
     WHERE id = $1
       AND token_hash = $2
       AND revoked_at IS NULL`,
    [sessionId, tokenHash, at],
  );
}

// Default page size for the profile games list. The first page ships with the
// profile payload; the rest load lazily via getUserGamesPage.
const PROFILE_GAMES_PAGE = 15;

// Resolve a public profile user by handle (case-insensitive). Null when the
// handle doesn't exist.
async function loadProfileUser(handle: string): Promise<UserAccount | null> {
  const { rows } = await getPool().query<UserRow>(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE lower(handle) = lower($1)
     LIMIT 1`,
    [handle],
  );
  return rows[0] ? userFromRow(rows[0]) : null;
}

// Resolve a user's id by handle (case-insensitive), or null. Directed challenges
// address the target by handle like the rest of the social API; this maps it to
// the id the directed-seek path expects without exposing ids to the client.
export async function userIdForHandle(handle: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT id FROM users WHERE lower(handle) = lower($1) AND closed_at IS NULL LIMIT 1`,
    [handle],
  );
  return rows[0]?.id ?? null;
}

// Build the visibility filter for a profile's game queries. A viewer sees their
// own private games; everyone else is restricted to non-private rows.
function profileVisibilityClause(isViewer: boolean): string {
  return isViewer
    ? ''
    : `AND games.visibility <> 'private'
       AND game_participants.visibility <> 'private'`;
}

// One page of a user's completed games, newest first. total_count is a window
// aggregate (COUNT(*) OVER()) so the caller learns the full match count in the
// same round-trip — used to drive the profile "Load more" pager.
async function queryUserGames(
  userId: string,
  isViewer: boolean,
  offset: number,
  limit: number,
): Promise<{ games: ProfileGameRecord[]; total: number }> {
  const { rows } = await getPool().query<{
    room_id: string;
    player_color: GameParticipantColor;
    variant: string;
    mode: GameMode;
    result: string;
    termination: string;
    ply_count: number;
    started_at: Date;
    ended_at: Date;
    white_name: string | null;
    black_name: string | null;
    corpus_id: string | null;
    initial_ms: number | null;
    increment_ms: number | null;
    rated: boolean;
    visibility: GameVisibility;
    total_count: string;
  }>(
    `SELECT games.room_id, game_participants.color AS player_color,
            games.variant, games.mode, games.result, games.termination,
            games.ply_count, games.started_at, games.ended_at,
            games.white_name, games.black_name, games.corpus_id,
            games.initial_ms, games.increment_ms,
            COALESCE(games.rated, false) AS rated, games.visibility,
            COUNT(*) OVER() AS total_count
     FROM game_participants
     JOIN games ON games.room_id = game_participants.game_id
     WHERE game_participants.subject_type = 'user'
       AND game_participants.subject_id = $1
       AND games.status = 'completed'
       ${profileVisibilityClause(isViewer)}
     ORDER BY games.ended_at DESC, games.room_id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const games = rows.map(
    (row): ProfileGameRecord => ({
      roomId: row.room_id,
      playerColor: row.player_color,
      variant: row.variant,
      mode: row.mode,
      result: row.result as GameResult,
      termination: row.termination as GameTermination,
      plyCount: row.ply_count,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      whiteName: row.white_name,
      blackName: row.black_name,
      corpusId: row.corpus_id,
      initialMs: row.initial_ms,
      incrementMs: row.increment_ms,
      rated: row.rated,
      visibility: row.visibility,
      participants: [],
    }),
  );
  return { games: await attachGameParticipants(games), total };
}

// First page of a profile: identity, bucketed ratings, and the newest games.
// Older game pages load lazily via getUserGamesPage.
export async function getUserProfileByHandle(
  handle: string,
  viewerUserId: string | null,
): Promise<UserProfile | null> {
  const user = await loadProfileUser(handle);
  if (!user) return null;

  const isViewer = viewerUserId === user.id;
  if (user.profileVisibility === 'private' && !isViewer) return null;

  const { games, total: gamesTotal } = await queryUserGames(
    user.id,
    isViewer,
    0,
    PROFILE_GAMES_PAGE,
  );

  const visibilityClause = profileVisibilityClause(isViewer);
  const { rows: ratingRows } = await getPool().query<{
    variant: RatingVariant;
    elo_rating: number;
    rating_deviation: number;
    games_played: number;
  }>(
    `SELECT variant, elo_rating, rating_deviation, games_played
     FROM user_ratings
     WHERE user_id = $1 AND time_class = $2`,
    [user.id, PUBLIC_RATING_TIME_CLASS],
  );
  const ratingByVariant = new Map<
    RatingVariant,
    { eloRating: number; gamesPlayed: number; ratingDeviation: number }
  >();
  for (const row of ratingRows) {
    ratingByVariant.set(row.variant, {
      eloRating: row.elo_rating,
      gamesPlayed: row.games_played,
      ratingDeviation: row.rating_deviation,
    });
  }

  // Public ratings are one pool per variant. Count all completed visible games
  // in that variant so pre-rated activity still earns a profile row.
  const { rows: variantCountRows } = await getPool().query<{
    variant: RatingVariant;
    games_played: string;
  }>(
    `SELECT
       CASE
         WHEN games.variant IN ('crossroads-chess', 'dual-chess') THEN 'crossroads_chess_open'
         WHEN games.variant IN ('dark-crossroads-chess', 'dark-dual-chess') THEN 'crossroads_chess'
         WHEN games.variant = 'dark-mini-xiangqi' THEN 'dark_mini_xiangqi'
         WHEN games.variant = 'drop-mini-xiangqi' THEN 'drop_mini_xiangqi'
         WHEN games.variant = 'dark-xiangqi' THEN 'dark_xiangqi'
         WHEN games.variant = 'jieqi' THEN 'jieqi'
         WHEN games.variant = 'banqi' THEN 'banqi'
         WHEN games.variant = 'reveal-chess' THEN 'reveal_chess'
         WHEN games.variant = 'dark-shogi' THEN 'dark_shogi'
         WHEN games.variant = 'dark-crazyhouse' THEN 'dark_crazyhouse'
         WHEN games.variant = 'kriegspiel' THEN 'kriegspiel'
         WHEN games.variant = 'jungle' THEN 'jungle'
         WHEN games.variant = 'jungle-flip' THEN 'jungle_flip'
         WHEN games.variant = 'xiangqi' THEN 'xiangqi'
         WHEN games.variant = 'fortress-xiangqi' THEN 'fortress_xiangqi'
         WHEN games.variant IN ('draft960', 'dark-draft960', 'fog-draft960')
              OR COALESCE(games.hidden_draft960, false) THEN 'fog_draft960'
         ELSE 'fog'
       END AS variant,
       COUNT(*)::text AS games_played
     FROM game_participants
     JOIN games ON games.room_id = game_participants.game_id
     WHERE game_participants.subject_type = 'user'
       AND game_participants.subject_id = $1
       AND games.status = 'completed'
       AND games.variant IN ('dark-chess', 'fog', 'draft960', 'dark-draft960', 'fog-draft960', 'dark-mini-xiangqi', 'drop-mini-xiangqi', 'dark-xiangqi', 'xiangqi', 'jieqi', 'banqi', 'reveal-chess', 'crossroads-chess', 'dual-chess', 'dark-crossroads-chess', 'dark-dual-chess', 'dark-shogi', 'dark-crazyhouse', 'kriegspiel', 'jungle', 'jungle-flip', 'fortress-xiangqi')
       ${visibilityClause}
     GROUP BY 1`,
    [user.id],
  );
  const variantGameCounts = new Map<RatingVariant, number>();
  for (const row of variantCountRows) {
    variantGameCounts.set(row.variant, Number(row.games_played));
  }

  const variantKeys = new Set<RatingVariant>([
    ...ratingByVariant.keys(),
    ...variantGameCounts.keys(),
  ]);
  const ratings: ProfileBucketRating[] = [];
  for (const variant of variantKeys) {
    const rating = ratingByVariant.get(variant);
    const totalGames = variantGameCounts.get(variant) ?? 0;
    if (totalGames === 0 && !rating) continue;
    ratings.push({
      variant,
      timeClass: PUBLIC_RATING_TIME_CLASS,
      eloRating: rating?.eloRating ?? null,
      ratedGamesPlayed: rating?.gamesPlayed ?? 0,
      totalGamesPlayed: totalGames,
      provisional: rating ? rating.ratingDeviation > PROVISIONAL_RD : false,
    });
  }

  // Puzzle ratings (separate Glicko-2 pool). Show only variants the user has
  // actually attempted, so an untouched pool never renders a default 1500.
  const { rows: puzzleRatingRows } = await getPool().query<{
    variant: string;
    rating: number;
    rating_deviation: number;
    solved: number;
    attempts: number;
  }>(
    `SELECT variant, rating, rating_deviation, solved, attempts
       FROM user_puzzle_ratings
       WHERE user_id = $1 AND attempts > 0
       ORDER BY attempts DESC`,
    [user.id],
  );
  const puzzleRatings: ProfilePuzzleRating[] = puzzleRatingRows.map((row) => ({
    variant: row.variant,
    rating: Math.round(row.rating),
    provisional: row.rating_deviation > PROVISIONAL_RD,
    solved: row.solved,
    attempts: row.attempts,
  }));

  return {
    user: {
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      location: user.location,
      profileLinks: user.profileLinks,
      profileVisibility: user.profileVisibility,
      accountRole: user.accountRole,
      title: user.title,
      patronSince: user.patronSince,
      createdAt: user.createdAt,
    },
    ratings,
    puzzleRatings,
    games,
    gamesTotal,
  };
}

// A page of a user's games for the profile "Load more" pager. Returns null when
// the profile is missing or private to a non-viewer (same gate as the full
// profile), so the endpoint can 404 without leaking existence.
export async function getUserGamesPage(
  handle: string,
  viewerUserId: string | null,
  offset: number,
  limit: number,
): Promise<{ games: ProfileGameRecord[]; total: number } | null> {
  const user = await loadProfileUser(handle);
  if (!user) return null;
  const isViewer = viewerUserId === user.id;
  if (user.profileVisibility === 'private' && !isViewer) return null;
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  const boundedOffset = Math.max(0, offset);
  return queryUserGames(user.id, isViewer, boundedOffset, boundedLimit);
}

export async function getUserRatingHistory(
  handle: string,
  viewerUserId: string | null,
  variant: RatingVariant,
): Promise<ProfileRatingHistory | null> {
  const user = await loadProfileUser(handle);
  if (!user) return null;
  const isViewer = viewerUserId === user.id;
  if (user.profileVisibility === 'private' && !isViewer) return null;

  const { rows } = await getPool().query<{
    room_id: string;
    variant: string;
    hidden_draft960: boolean | null;
    initial_ms: number | null;
    increment_ms: number | null;
    ended_at: Date;
    elo_before: number;
    elo_after: number;
  }>(
    `SELECT games.room_id, games.variant, games.hidden_draft960,
            games.initial_ms, games.increment_ms, games.ended_at,
            game_participants.elo_before, game_participants.elo_after
     FROM game_participants
     JOIN games ON games.room_id = game_participants.game_id
     WHERE game_participants.subject_type = 'user'
       AND game_participants.subject_id = $1
       AND games.status = 'completed'
       AND games.mode = 'pvp'
       AND COALESCE(games.rated, false) = true
       AND game_participants.elo_before IS NOT NULL
       AND game_participants.elo_after IS NOT NULL
       ${profileVisibilityClause(isViewer)}
     ORDER BY games.ended_at ASC, games.room_id ASC`,
    [user.id],
  );

  const points = rows
    .filter((row) => {
      const bucket = bucketForGame({
        variant: row.variant,
        initialMs: row.initial_ms,
        incrementMs: row.increment_ms,
        hiddenDraft960: row.hidden_draft960,
      });
      return bucket?.variant === variant && bucket.timeClass === PUBLIC_RATING_TIME_CLASS;
    })
    .map(
      (row): ProfileRatingHistoryPoint => ({
        roomId: row.room_id,
        endedAt: row.ended_at,
        ratingBefore: row.elo_before,
        ratingAfter: row.elo_after,
      }),
    );

  return { variant, timeClass: PUBLIC_RATING_TIME_CLASS, points };
}

export async function getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
  const bounded = Math.max(1, Math.min(query.limit ?? 100, 500));
  const { rows } = await getPool().query<{
    rank: string;
    handle: string;
    display_name: string;
    elo_rating: number;
    rating_deviation: number;
    games_played: number;
  }>(
    // Rank by conservative rating (rating - 2*RD): a high-uncertainty player
    // can't top the board on noise, so a one-game fluke sorts low. Provisional
    // players (RD above threshold) are shown — marked with "?" client-side — so
    // the board isn't barren at low liquidity; their low conservative rating
    // keeps them out of the top until they settle. Only never-played rows hide.
    `SELECT RANK() OVER (ORDER BY (r.elo_rating - 2 * r.rating_deviation) DESC) AS rank,
            u.handle, u.display_name, r.elo_rating, r.rating_deviation, r.games_played
     FROM user_ratings r
     JOIN users u ON u.id = r.user_id
     WHERE r.variant = $1 AND r.time_class = $2
       AND u.profile_visibility IN ('public', 'unlisted')
       AND r.games_played > 0
     ORDER BY (r.elo_rating - 2 * r.rating_deviation) DESC
     LIMIT $3`,
    [query.variant, query.timeClass, bounded],
  );
  return rows.map((row) => ({
    rank: Number(row.rank),
    handle: row.handle,
    displayName: row.display_name,
    eloRating: row.elo_rating,
    gamesPlayed: row.games_played,
    provisional: row.rating_deviation > PROVISIONAL_RD,
  }));
}

export type LeaderboardSummaryLadder = {
  variant: string;
  leaderboard: LeaderboardEntry[];
};

// Top-N of every ladder in one round trip, for the public leaderboard page
// (which otherwise fans out one query per variant). Same semantics as
// getLeaderboard: conservative-rating order, visible profiles, played rows
// only. RANK carries the displayed rank (ties share it); ROW_NUMBER bounds
// the panel so a tie at the cutoff can't overflow it. Ladders with no rated
// games simply don't appear; the client renders those as empty.
export async function getLeaderboardSummary(query: {
  timeClass: RatingTimeClass;
  limitPerVariant?: number;
}): Promise<LeaderboardSummaryLadder[]> {
  const bounded = Math.max(1, Math.min(query.limitPerVariant ?? 10, 50));
  const { rows } = await getPool().query<{
    variant: string;
    rank: string;
    handle: string;
    display_name: string;
    elo_rating: number;
    rating_deviation: number;
    games_played: number;
  }>(
    `SELECT variant, rank, handle, display_name, elo_rating, rating_deviation, games_played
     FROM (
       SELECT r.variant,
              RANK() OVER (
                PARTITION BY r.variant
                ORDER BY (r.elo_rating - 2 * r.rating_deviation) DESC
              ) AS rank,
              ROW_NUMBER() OVER (
                PARTITION BY r.variant
                ORDER BY (r.elo_rating - 2 * r.rating_deviation) DESC
              ) AS row_number,
              u.handle, u.display_name, r.elo_rating, r.rating_deviation, r.games_played
       FROM user_ratings r
       JOIN users u ON u.id = r.user_id
       WHERE r.time_class = $1
         AND u.profile_visibility IN ('public', 'unlisted')
         AND r.games_played > 0
     ) ranked
     WHERE row_number <= $2
     ORDER BY variant, row_number`,
    [query.timeClass, bounded],
  );
  const ladders = new Map<string, LeaderboardEntry[]>();
  for (const row of rows) {
    let entries = ladders.get(row.variant);
    if (!entries) {
      entries = [];
      ladders.set(row.variant, entries);
    }
    entries.push({
      rank: Number(row.rank),
      handle: row.handle,
      displayName: row.display_name,
      eloRating: row.elo_rating,
      gamesPlayed: row.games_played,
      provisional: row.rating_deviation > PROVISIONAL_RD,
    });
  }
  return [...ladders.entries()].map(([variant, leaderboard]) => ({ variant, leaderboard }));
}

export type ActivePlayerEntry = {
  rank: number;
  handle: string;
  displayName: string;
  gamesPlayed: number;
};

// Most-active ladder: completed human games per account, any variant, rated or
// casual. At low liquidity this fills the leaderboard's first panel while the
// rating ladders are still empty.
export async function getMostActivePlayers(limit = 10): Promise<ActivePlayerEntry[]> {
  const bounded = Math.max(1, Math.min(limit, 50));
  const { rows } = await getPool().query<{
    handle: string;
    display_name: string;
    games_played: string;
  }>(
    `SELECT u.handle, u.display_name, COUNT(*) AS games_played
     FROM game_participants p
     JOIN games g ON g.room_id = p.game_id
     JOIN users u ON u.id = p.subject_id
     WHERE p.subject_type = 'user'
       AND g.status = 'completed'
       AND u.profile_visibility IN ('public', 'unlisted')
     GROUP BY u.id, u.handle, u.display_name
     ORDER BY COUNT(*) DESC, u.handle
     LIMIT $1`,
    [bounded],
  );
  return rows.map((row, index) => ({
    rank: index + 1,
    handle: row.handle,
    displayName: row.display_name,
    gamesPlayed: Number(row.games_played),
  }));
}

export type BestRatingEntry = {
  variant: string;
  eloRating: number;
  provisional: boolean;
};

// Highest current rating per user across all pools of one time class, for the
// online-players list (one representative figure per player, playstrategy
// style). DISTINCT ON + the elo DESC sort keeps exactly the best row per user.
export async function getBestRatings(
  userIds: string[],
  timeClass: RatingTimeClass,
): Promise<Map<string, BestRatingEntry>> {
  if (userIds.length === 0) return new Map();
  const { rows } = await getPool().query<{
    user_id: string;
    variant: string;
    elo_rating: number;
    rating_deviation: number;
  }>(
    `SELECT DISTINCT ON (user_id) user_id, variant, elo_rating, rating_deviation
     FROM user_ratings
     WHERE user_id = ANY($1) AND time_class = $2 AND games_played > 0
     ORDER BY user_id, elo_rating DESC`,
    [userIds, timeClass],
  );
  const best = new Map<string, BestRatingEntry>();
  for (const row of rows) {
    best.set(row.user_id, {
      variant: row.variant,
      eloRating: row.elo_rating,
      provisional: row.rating_deviation > PROVISIONAL_RD,
    });
  }
  return best;
}

// Highest current rating per user across ALL pools and time classes, for the
// Friends page (one representative "best rating" per followed player). A
// deliberate sibling of getBestRatings above, which stays scoped to one time
// class for the online-players surfaces; existing callers keep their behavior.
export async function getBestRatingsAnyTimeClass(
  userIds: string[],
): Promise<Map<string, BestRatingEntry>> {
  if (userIds.length === 0) return new Map();
  const { rows } = await getPool().query<{
    user_id: string;
    variant: string;
    elo_rating: number;
    rating_deviation: number;
  }>(
    `SELECT DISTINCT ON (user_id) user_id, variant, elo_rating, rating_deviation
     FROM user_ratings
     WHERE user_id = ANY($1) AND games_played > 0
     ORDER BY user_id, elo_rating DESC`,
    [userIds],
  );
  const best = new Map<string, BestRatingEntry>();
  for (const row of rows) {
    best.set(row.user_id, {
      variant: row.variant,
      eloRating: row.elo_rating,
      provisional: row.rating_deviation > PROVISIONAL_RD,
    });
  }
  return best;
}

// Completed-game totals for a set of users in one query (the Friends page rows).
// Matches the public-profile gamesTotal semantics for a non-viewer: completed
// games only, private games excluded, so the number here equals what the viewer
// would see on that player's profile. Users with zero games simply have no map
// entry; callers default to 0.
export async function getGamesTotals(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const { rows } = await getPool().query<{ user_id: string; games_total: string }>(
    `SELECT game_participants.subject_id AS user_id, COUNT(*) AS games_total
     FROM game_participants
     JOIN games ON games.room_id = game_participants.game_id
     WHERE game_participants.subject_type = 'user'
       AND game_participants.subject_id = ANY($1)
       AND games.status = 'completed'
       AND games.visibility <> 'private'
       AND game_participants.visibility <> 'private'
     GROUP BY game_participants.subject_id`,
    [userIds],
  );
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.user_id, Number(row.games_total));
  return totals;
}

type UserRow = {
  id: string;
  email: string;
  email_verified_at: Date | null;
  handle: string;
  handle_changed_at: Date | null;
  display_name: string;
  display_name_changed_at: Date | null;
  bio: string;
  location: string;
  profile_links: string[];
  display_preferences: unknown;
  account_preferences: unknown;
  profile_visibility: UserAccount['profileVisibility'];
  account_role: AccountRole;
  title: PlayerTitle | null;
  locale: AccountLocale | null;
  dm_policy: DmPolicy;
  elo_rating: number;
  patron_since: Date | null;
  stripe_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
};

function userFromRow(row: UserRow): UserAccount {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    handle: row.handle,
    handleChangedAt: row.handle_changed_at,
    displayName: row.display_name,
    displayNameChangedAt: row.display_name_changed_at,
    bio: row.bio,
    location: row.location,
    profileLinks: row.profile_links,
    displayPreferences: displayPreferencesFromJson(row.display_preferences),
    accountPreferences: accountPreferencesFromJson(row.account_preferences),
    profileVisibility: row.profile_visibility,
    accountRole: row.account_role,
    title: row.title,
    locale: row.locale,
    dmPolicy: row.dm_policy,
    eloRating: row.elo_rating,
    patronSince: row.patron_since,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

function displayPreferencesFromJson(value: unknown): AccountDisplayPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const pieceAnimation = (value as Record<string, unknown>).pieceAnimation;
  return isPieceAnimationPreference(pieceAnimation) ? { pieceAnimation } : {};
}

function accountPreferencesFromJson(value: unknown): AccountPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_ACCOUNT_PREFERENCES };
  }
  const parsed = value as Record<string, unknown>;
  return {
    clockTenths: isClockTenthsPreference(parsed.clockTenths)
      ? parsed.clockTenths
      : DEFAULT_ACCOUNT_PREFERENCES.clockTenths,
    lowTimeSound: booleanOrDefault(parsed.lowTimeSound, DEFAULT_ACCOUNT_PREFERENCES.lowTimeSound),
    premoves: booleanOrDefault(parsed.premoves, DEFAULT_ACCOUNT_PREFERENCES.premoves),
    confirmGameActions: booleanOrDefault(
      parsed.confirmGameActions,
      DEFAULT_ACCOUNT_PREFERENCES.confirmGameActions,
    ),
    inboxBell: booleanOrDefault(parsed.inboxBell, DEFAULT_ACCOUNT_PREFERENCES.inboxBell),
    correspondenceBell: booleanOrDefault(
      parsed.correspondenceBell,
      DEFAULT_ACCOUNT_PREFERENCES.correspondenceBell,
    ),
    correspondenceDeadlineEmail: booleanOrDefault(
      parsed.correspondenceDeadlineEmail,
      DEFAULT_ACCOUNT_PREFERENCES.correspondenceDeadlineEmail,
    ),
  };
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
