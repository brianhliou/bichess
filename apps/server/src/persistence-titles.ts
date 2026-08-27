// Title verification pipeline persistence (088) + the closed title vocabulary.
//
// PLAYER_TITLES is the server-side source of truth for which titles exist.
// Three surfaces must stay in lockstep with it (each carries a pointer back
// here): the CHECK constraints in migrations/088_user_titles.sql and the web
// mirror in apps/web/src/player-titles.ts (the web workspace cannot import
// server code). Unknown values are rejected fail-closed everywhere: the API
// 400s, the DB CHECK refuses, and the client select only offers this list.
//
// Xiangqi (WXF/CXA-style) titles lead because Mistboard is xiangqi-first; FIDE
// chess titles follow because the site hosts both families. A user holds ONE
// title (users.title): approval overwrites it with the approved claim.

import { getPool, withTransaction } from './persistence-db.js';

export const PLAYER_TITLES = [
  // Xiangqi (WXF/CXA style)
  'xgm', // Xiangqi Grandmaster
  'xim', // Xiangqi International Master
  'xnm', // Xiangqi National Master
  'xwgm', // Xiangqi Woman Grandmaster
  'xwim', // Xiangqi Woman International Master
  // Chess (FIDE)
  'gm',
  'im',
  'fm',
  'cm',
  'wgm',
  'wim',
  'wfm',
  'wcm',
] as const;

export type PlayerTitle = (typeof PLAYER_TITLES)[number];

export function isPlayerTitle(value: unknown): value is PlayerTitle {
  return typeof value === 'string' && (PLAYER_TITLES as readonly string[]).includes(value);
}

// Titles a player can currently REQUEST via /api/titles/verify. Both families
// are open: xiangqi titles verify against WXF/CXA records, chess titles against
// a FIDE ID. Anything outside this list is rejected fail-closed. Mirror of
// REQUESTABLE_PLAYER_TITLES in apps/web/src/player-titles.ts.
export const REQUESTABLE_PLAYER_TITLES: readonly PlayerTitle[] = PLAYER_TITLES;

export function isRequestableTitle(value: unknown): value is PlayerTitle {
  return isPlayerTitle(value) && (REQUESTABLE_PLAYER_TITLES as readonly string[]).includes(value);
}

export type TitleVerificationStatus = 'pending' | 'approved' | 'rejected';

export type TitleVerificationRequest = {
  id: string;
  userId: string;
  title: PlayerTitle;
  evidence: string;
  status: TitleVerificationStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

// Admin queue row: the request joined with enough requester identity to review
// it without a second lookup.
export type TitleVerificationRequestWithUser = TitleVerificationRequest & {
  handle: string;
  displayName: string;
  currentTitle: PlayerTitle | null;
};

export type CreateTitleVerificationRequestResult =
  | { ok: true; request: TitleVerificationRequest }
  | { ok: false; error: 'request_pending' };

const REQUEST_COLUMNS = 'id, user_id, title, evidence, status, decided_by, decided_at, created_at';

export async function createTitleVerificationRequest(input: {
  id: string;
  userId: string;
  title: PlayerTitle;
  evidence: string;
  now: Date;
}): Promise<CreateTitleVerificationRequestResult> {
  try {
    const { rows } = await getPool().query<TitleVerificationRequestRow>(
      `INSERT INTO title_verification_requests (id, user_id, title, evidence, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING ${REQUEST_COLUMNS}`,
      [input.id, input.userId, input.title, input.evidence, input.now],
    );
    return { ok: true, request: requestFromRow(rows[0]!) };
  } catch (err) {
    // The one-pending-per-user partial unique index makes the duplicate-submit
    // race safe: the second concurrent insert loses here instead of creating a
    // second live request.
    if (isUniqueViolation(err)) return { ok: false, error: 'request_pending' };
    throw err;
  }
}

// The user's most recent request (any status), for the /verify-title status
// view: pending shows progress, rejected offers resubmit, approved celebrates.
export async function latestTitleVerificationRequestForUser(
  userId: string,
): Promise<TitleVerificationRequest | null> {
  const { rows } = await getPool().query<TitleVerificationRequestRow>(
    `SELECT ${REQUEST_COLUMNS}
     FROM title_verification_requests
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId],
  );
  return rows[0] ? requestFromRow(rows[0]) : null;
}

// Admin lists. 'pending' is the review queue (oldest first, FIFO fairness);
// 'decided' is the recent history (newest decisions first, bounded).
export async function listTitleVerificationRequests(
  view: 'pending' | 'decided',
  limit = 100,
): Promise<TitleVerificationRequestWithUser[]> {
  const where = view === 'pending' ? `r.status = 'pending'` : `r.status <> 'pending'`;
  const order = view === 'pending' ? 'r.created_at ASC, r.id ASC' : 'r.decided_at DESC, r.id DESC';
  const { rows } = await getPool().query<TitleVerificationRequestWithUserRow>(
    `SELECT r.id, r.user_id, r.title, r.evidence, r.status, r.decided_by, r.decided_at,
            r.created_at, u.handle, u.display_name, u.title AS current_title
     FROM title_verification_requests r
     JOIN users u ON u.id = r.user_id
     WHERE ${where}
     ORDER BY ${order}
     LIMIT $1`,
    [Math.max(1, Math.min(limit, 500))],
  );
  return rows.map((row) => ({
    ...requestFromRow(row),
    handle: row.handle,
    displayName: row.display_name,
    currentTitle: row.current_title,
  }));
}

// Decide a pending request. Approval also stamps users.title (overwrite: a
// user holds one title, the one they claimed). Both writes ride one
// transaction, and the status='pending' guard makes concurrent decisions
// first-writer-wins: the loser sees no row and returns null.
export async function decideTitleVerificationRequest(input: {
  id: string;
  decision: 'approved' | 'rejected';
  decidedBy: string | null;
  now: Date;
}): Promise<TitleVerificationRequest | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<TitleVerificationRequestRow>(
      `UPDATE title_verification_requests
       SET status = $2, decided_by = $3, decided_at = $4
       WHERE id = $1 AND status = 'pending'
       RETURNING ${REQUEST_COLUMNS}`,
      [input.id, input.decision, input.decidedBy, input.now],
    );
    if (!rows[0]) return null;
    const request = requestFromRow(rows[0]);
    if (input.decision === 'approved') {
      await client.query(`UPDATE users SET title = $2, updated_at = $3 WHERE id = $1`, [
        request.userId,
        request.title,
        input.now,
      ]);
    }
    return request;
  });
}

type TitleVerificationRequestRow = {
  id: string;
  user_id: string;
  title: PlayerTitle;
  evidence: string;
  status: TitleVerificationStatus;
  decided_by: string | null;
  decided_at: Date | null;
  created_at: Date;
};

type TitleVerificationRequestWithUserRow = TitleVerificationRequestRow & {
  handle: string;
  display_name: string;
  current_title: PlayerTitle | null;
};

function requestFromRow(row: TitleVerificationRequestRow): TitleVerificationRequest {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    evidence: row.evidence,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
