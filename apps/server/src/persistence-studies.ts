// Persistence for user-created studies (schema in migration 092). A study owns an
// ordered set of chapters; each chapter carries a serialized move tree (JSONB) plus
// a `version` optimistic-concurrency token. Single-author for now: every write is
// gated on ownership at the route; the version guard here is what lets a future
// multi-contributor step stay safe without live sync (study-track.md, Decision A).
// All reads/writes no-op (null / no-op) when persistence is disabled.

import { randomBytes } from 'node:crypto';
import { getPool, isInitialized } from './persistence-db.js';

export type StudyVisibility = 'private' | 'unlisted' | 'public';

export function isStudyVisibility(value: unknown): value is StudyVisibility {
  return value === 'private' || value === 'unlisted' || value === 'public';
}

export type StudyChapterRecord = {
  id: string;
  studyId: string;
  ordinal: number;
  name: string;
  variant: string;
  orientation: string;
  /** SerializedTree (tree-serialize.ts); node-pg parses JSONB, so already an object. */
  root: unknown;
  denorm: unknown;
  version: number;
  /** Gamebook (interactive-lesson) chapter: the guess-the-move player is the
   *  default presentation. Same tree data; per-node hint/deviation live in it. */
  gamebook: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StudyRecord = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  createdAt: Date;
  updatedAt: Date;
};

export type StudyWithChapters = StudyRecord & { chapters: StudyChapterRecord[] };

/** `chapterNames` is a preview slice (first few by ordinal), not the full set —
 *  enough to render lichess-style chapter previews on a study card. */
export type StudySummary = StudyRecord & { chapterCount: number; chapterNames: string[] };

export type PublicStudySummary = StudySummary & {
  ownerHandle: string;
  ownerDisplayName: string;
  likeCount: number;
};

export type NewChapterInput = {
  name: string;
  variant: string;
  orientation: string;
  root: unknown;
  denorm?: unknown;
};

export type CreateStudyInput = {
  ownerId: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  chapter: NewChapterInput;
};

export type UpdateChapterResult =
  | { ok: true; chapter: StudyChapterRecord }
  | { ok: false; error: 'not_found' | 'forbidden' | 'conflict' };

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Short lila-style base62 id (8 chars ≈ 62^8 space). Not cryptographic identity,
 *  just a compact unguessable-enough handle for unlisted sharing. */
function shortId(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  return out;
}

type StudyRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  created_at: Date;
  updated_at: Date;
};

type ChapterRow = {
  id: string;
  study_id: string;
  ordinal: number;
  name: string;
  variant: string;
  orientation: string;
  root: unknown;
  denorm: unknown;
  version: number;
  gamebook: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapStudy(row: StudyRow): StudyRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChapter(row: ChapterRow): StudyChapterRecord {
  return {
    id: row.id,
    studyId: row.study_id,
    ordinal: row.ordinal,
    name: row.name,
    variant: row.variant,
    orientation: row.orientation,
    root: row.root,
    denorm: row.denorm,
    version: row.version,
    gamebook: row.gamebook,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STUDY_COLS = 'id, owner_id, name, description, visibility, created_at, updated_at';
const CHAPTER_COLS =
  'id, study_id, ordinal, name, variant, orientation, root, denorm, version, gamebook, created_at, updated_at';

/** Correlated scalar subquery yielding the first few chapter names (by ordinal) as
 *  a text[], for a study aliased `s`. This is the preview slice a study card shows,
 *  not the full chapter set. */
const CHAPTER_NAMES_PREVIEW = `(SELECT array_agg(name ORDER BY ordinal, created_at)
         FROM (SELECT name, ordinal, created_at FROM study_chapters
                WHERE study_id = s.id ORDER BY ordinal, created_at LIMIT 4) preview) AS chapter_names`;

/** Optional `AND s.name ILIKE $n` fragment for a search query, with `%`/`_`/`\`
 *  escaped so a literal search term can't act as a wildcard. Returns an empty
 *  clause (and no bound value) when the query is blank. */
function nameFilter(q: string | undefined, paramIndex: number): { clause: string; value?: string } {
  const trimmed = q?.trim();
  if (!trimmed) return { clause: '' };
  const escaped = trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return { clause: ` AND s.name ILIKE $${paramIndex}`, value: `%${escaped}%` };
}

type PublicStudyRow = StudyRow & {
  chapter_count: string;
  chapter_names: string[] | null;
  owner_handle: string;
  owner_display_name: string;
  like_count: string;
};

function mapPublicStudy(row: PublicStudyRow): PublicStudySummary {
  return {
    ...mapStudy(row),
    chapterCount: Number(row.chapter_count),
    chapterNames: row.chapter_names ?? [],
    ownerHandle: row.owner_handle,
    ownerDisplayName: row.owner_display_name,
    likeCount: Number(row.like_count),
  };
}

/** Create a study and its first chapter atomically. Returns the full record. */
export async function createStudy(input: CreateStudyInput): Promise<StudyWithChapters | null> {
  if (!isInitialized()) return null;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const studyId = shortId();
    await client.query(
      `INSERT INTO studies (id, owner_id, name, description, visibility)
         VALUES ($1, $2, $3, $4, $5)`,
      [studyId, input.ownerId, input.name, input.description, input.visibility],
    );
    await client.query(
      `INSERT INTO study_chapters (id, study_id, ordinal, name, variant, orientation, root, denorm)
         VALUES ($1, $2, 0, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        shortId(),
        studyId,
        input.chapter.name,
        input.chapter.variant,
        input.chapter.orientation,
        JSON.stringify(input.chapter.root),
        JSON.stringify(input.chapter.denorm ?? {}),
      ],
    );
    await client.query('COMMIT');
    return getStudyById(studyId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStudyById(id: string): Promise<StudyWithChapters | null> {
  if (!isInitialized()) return null;
  const study = await getPool().query<StudyRow>(`SELECT ${STUDY_COLS} FROM studies WHERE id = $1`, [
    id,
  ]);
  const row = study.rows[0];
  if (!row) return null;
  const chapters = await getPool().query<ChapterRow>(
    `SELECT ${CHAPTER_COLS} FROM study_chapters WHERE study_id = $1 ORDER BY ordinal, created_at`,
    [id],
  );
  return { ...mapStudy(row), chapters: chapters.rows.map(mapChapter) };
}

export async function listStudiesForOwner(ownerId: string, q?: string): Promise<StudySummary[]> {
  if (!isInitialized()) return [];
  const filter = nameFilter(q, 2);
  const params: unknown[] = [ownerId];
  if (filter.value !== undefined) params.push(filter.value);
  const { rows } = await getPool().query<
    StudyRow & { chapter_count: string; chapter_names: string[] | null }
  >(
    `SELECT ${STUDY_COLS.split(', ')
      .map((c) => `s.${c}`)
      .join(', ')},
       (SELECT count(*) FROM study_chapters c WHERE c.study_id = s.id) AS chapter_count,
       ${CHAPTER_NAMES_PREVIEW}
       FROM studies s WHERE s.owner_id = $1${filter.clause} ORDER BY s.updated_at DESC`,
    params,
  );
  return rows.map((row) => ({
    ...mapStudy(row),
    chapterCount: Number(row.chapter_count),
    chapterNames: row.chapter_names ?? [],
  }));
}

/** Most-liked public studies, with recency as the deterministic tie-breaker.
 *  `q` filters by study name (case-insensitive substring). */
export async function listTopPublicStudies(limit = 5, q?: string): Promise<PublicStudySummary[]> {
  if (!isInitialized()) return [];
  const bounded = Math.max(1, Math.min(limit, 50));
  const filter = nameFilter(q, 2);
  const params: unknown[] = [bounded];
  if (filter.value !== undefined) params.push(filter.value);
  const { rows } = await getPool().query<PublicStudyRow>(
    `SELECT ${STUDY_COLS.split(', ')
      .map((column) => `s.${column}`)
      .join(', ')},
            u.handle AS owner_handle,
            u.display_name AS owner_display_name,
            count(DISTINCT c.id) AS chapter_count,
            count(DISTINCT l.user_id) AS like_count,
            ${CHAPTER_NAMES_PREVIEW}
       FROM studies s
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN study_chapters c ON c.study_id = s.id
       LEFT JOIN study_likes l ON l.study_id = s.id
      WHERE s.visibility = 'public'
        AND u.profile_visibility IN ('public', 'unlisted')${filter.clause}
      GROUP BY s.id, u.handle, u.display_name
      ORDER BY count(DISTINCT l.user_id) DESC, s.updated_at DESC, s.id
      LIMIT $1`,
    params,
  );
  return rows.map(mapPublicStudy);
}

/** Public studies the signed-in user has liked (their favorites). Same shape as the
 *  public index, filtered to studies still public + from listable profiles, so a
 *  later visibility flip can't leak a now-private study through a stale like. */
export async function listFavoriteStudies(
  userId: string,
  limit = 30,
  q?: string,
): Promise<PublicStudySummary[]> {
  if (!isInitialized()) return [];
  const bounded = Math.max(1, Math.min(limit, 50));
  const filter = nameFilter(q, 3);
  const params: unknown[] = [userId, bounded];
  if (filter.value !== undefined) params.push(filter.value);
  const { rows } = await getPool().query<PublicStudyRow>(
    `SELECT ${STUDY_COLS.split(', ')
      .map((column) => `s.${column}`)
      .join(', ')},
            u.handle AS owner_handle,
            u.display_name AS owner_display_name,
            count(DISTINCT c.id) AS chapter_count,
            count(DISTINCT l.user_id) AS like_count,
            ${CHAPTER_NAMES_PREVIEW}
       FROM study_likes fav
       JOIN studies s ON s.id = fav.study_id
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN study_chapters c ON c.study_id = s.id
       LEFT JOIN study_likes l ON l.study_id = s.id
      WHERE fav.user_id = $1
        AND s.visibility = 'public'
        AND u.profile_visibility IN ('public', 'unlisted')${filter.clause}
      GROUP BY s.id, u.handle, u.display_name
      ORDER BY s.updated_at DESC, s.id
      LIMIT $2`,
    params,
  );
  return rows.map(mapPublicStudy);
}

export async function getStudyLikeState(
  studyId: string,
  userId?: string,
): Promise<{ likeCount: number; likedByViewer: boolean }> {
  if (!isInitialized()) return { likeCount: 0, likedByViewer: false };
  const { rows } = await getPool().query<{ like_count: string; liked_by_viewer: boolean }>(
    `SELECT count(*) AS like_count,
            COALESCE(bool_or(user_id = $2), false) AS liked_by_viewer
       FROM study_likes
      WHERE study_id = $1`,
    [studyId, userId ?? ''],
  );
  return {
    likeCount: Number(rows[0]?.like_count ?? 0),
    likedByViewer: rows[0]?.liked_by_viewer ?? false,
  };
}

/** Set, rather than toggle, so retries are idempotent. Only public studies can
 * receive likes. Returns null when the study is absent or not public. */
export async function setStudyLike(
  studyId: string,
  userId: string,
  liked: boolean,
): Promise<{ likeCount: number; likedByViewer: boolean } | null> {
  if (!isInitialized()) return null;
  const visible = await getPool().query(
    `SELECT 1 FROM studies WHERE id = $1 AND visibility = 'public'`,
    [studyId],
  );
  if ((visible.rowCount ?? 0) === 0) return null;
  if (liked) {
    await getPool().query(
      `INSERT INTO study_likes (study_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [studyId, userId],
    );
  } else {
    await getPool().query(`DELETE FROM study_likes WHERE study_id = $1 AND user_id = $2`, [
      studyId,
      userId,
    ]);
  }
  return getStudyLikeState(studyId, userId);
}

/** Owner-checked, version-guarded save of a chapter's tree. A stale `baseVersion`
 *  loses to whoever wrote last → 'conflict' (the caller tells the user to reload). */
export async function updateChapterTree(
  chapterId: string,
  ownerId: string,
  patch: { root: unknown; denorm?: unknown; baseVersion?: number },
): Promise<UpdateChapterResult> {
  if (!isInitialized()) return { ok: false, error: 'not_found' };
  const { rows } = await getPool().query<{ owner_id: string; version: number; study_id: string }>(
    `SELECT s.owner_id, c.version, c.study_id
       FROM study_chapters c JOIN studies s ON s.id = c.study_id
       WHERE c.id = $1`,
    [chapterId],
  );
  const found = rows[0];
  if (!found) return { ok: false, error: 'not_found' };
  if (found.owner_id !== ownerId) return { ok: false, error: 'forbidden' };
  if (patch.baseVersion !== undefined && patch.baseVersion !== found.version) {
    return { ok: false, error: 'conflict' };
  }
  const now = new Date();
  const updated = await getPool().query<ChapterRow>(
    `UPDATE study_chapters
       SET root = $1::jsonb,
           denorm = COALESCE($2::jsonb, denorm),
           version = version + 1,
           updated_at = $3
       WHERE id = $4
     RETURNING ${CHAPTER_COLS}`,
    [
      JSON.stringify(patch.root),
      patch.denorm === undefined ? null : JSON.stringify(patch.denorm),
      now,
      chapterId,
    ],
  );
  await getPool().query(`UPDATE studies SET updated_at = $1 WHERE id = $2`, [now, found.study_id]);
  return { ok: true, chapter: mapChapter(updated.rows[0]!) };
}

export type UpdateStudyMetaResult =
  | { ok: true; study: StudyRecord }
  | { ok: false; error: 'not_found' | 'forbidden' };

export async function updateStudyMeta(
  id: string,
  ownerId: string,
  patch: { name?: string; description?: string; visibility?: StudyVisibility },
): Promise<UpdateStudyMetaResult> {
  if (!isInitialized()) return { ok: false, error: 'not_found' };
  const existing = await getPool().query<StudyRow>(
    `SELECT ${STUDY_COLS} FROM studies WHERE id = $1`,
    [id],
  );
  const row = existing.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.owner_id !== ownerId) return { ok: false, error: 'forbidden' };
  const updated = await getPool().query<StudyRow>(
    `UPDATE studies
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           visibility = COALESCE($3, visibility),
           updated_at = now()
       WHERE id = $4
     RETURNING ${STUDY_COLS}`,
    [patch.name ?? null, patch.description ?? null, patch.visibility ?? null, id],
  );
  return { ok: true, study: mapStudy(updated.rows[0]!) };
}

/** Owner-checked hard delete (chapters cascade). Returns false if absent/not owner. */
export async function deleteStudy(id: string, ownerId: string): Promise<boolean> {
  if (!isInitialized()) return false;
  const { rowCount } = await getPool().query(
    `DELETE FROM studies WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (rowCount ?? 0) > 0;
}

export type AddChapterResult =
  | { ok: true; chapter: StudyChapterRecord }
  | { ok: false; error: 'not_found' | 'forbidden' };

/** Append a chapter to a study (owner only). Ordinal = current max + 1. */
export async function addChapter(
  studyId: string,
  ownerId: string,
  input: NewChapterInput,
): Promise<AddChapterResult> {
  if (!isInitialized()) return { ok: false, error: 'not_found' };
  const owner = await getPool().query<{ owner_id: string }>(
    `SELECT owner_id FROM studies WHERE id = $1`,
    [studyId],
  );
  const row = owner.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.owner_id !== ownerId) return { ok: false, error: 'forbidden' };
  const now = new Date();
  const inserted = await getPool().query<ChapterRow>(
    `INSERT INTO study_chapters (id, study_id, ordinal, name, variant, orientation, root, denorm)
       VALUES ($1, $2,
               (SELECT COALESCE(MAX(ordinal), -1) + 1 FROM study_chapters WHERE study_id = $2),
               $3, $4, $5, $6::jsonb, $7::jsonb)
     RETURNING ${CHAPTER_COLS}`,
    [
      shortId(),
      studyId,
      input.name,
      input.variant,
      input.orientation,
      JSON.stringify(input.root),
      JSON.stringify(input.denorm ?? {}),
    ],
  );
  await getPool().query(`UPDATE studies SET updated_at = $1 WHERE id = $2`, [now, studyId]);
  return { ok: true, chapter: mapChapter(inserted.rows[0]!) };
}

export type DeleteChapterResult =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'forbidden' | 'last_chapter' };

/** Delete a chapter (owner only). Refuses to remove the last chapter — a study
 *  always has at least one. */
export async function deleteChapter(
  chapterId: string,
  ownerId: string,
): Promise<DeleteChapterResult> {
  if (!isInitialized()) return { ok: false, error: 'not_found' };
  const { rows } = await getPool().query<{ owner_id: string; study_id: string }>(
    `SELECT s.owner_id, c.study_id
       FROM study_chapters c JOIN studies s ON s.id = c.study_id
       WHERE c.id = $1`,
    [chapterId],
  );
  const found = rows[0];
  if (!found) return { ok: false, error: 'not_found' };
  if (found.owner_id !== ownerId) return { ok: false, error: 'forbidden' };
  const count = await getPool().query<{ n: string }>(
    `SELECT count(*) AS n FROM study_chapters WHERE study_id = $1`,
    [found.study_id],
  );
  if (Number(count.rows[0]?.n ?? 0) <= 1) return { ok: false, error: 'last_chapter' };
  await getPool().query(`DELETE FROM study_chapters WHERE id = $1`, [chapterId]);
  await getPool().query(`UPDATE studies SET updated_at = now() WHERE id = $1`, [found.study_id]);
  return { ok: true };
}

/** Rename a chapter (owner only). Does not touch the tree `version`. */
export async function renameChapter(
  chapterId: string,
  ownerId: string,
  name: string,
): Promise<UpdateChapterResult> {
  if (!isInitialized()) return { ok: false, error: 'not_found' };
  const { rows } = await getPool().query<{ owner_id: string }>(
    `SELECT s.owner_id
       FROM study_chapters c JOIN studies s ON s.id = c.study_id
       WHERE c.id = $1`,
    [chapterId],
  );
  const found = rows[0];
  if (!found) return { ok: false, error: 'not_found' };
  if (found.owner_id !== ownerId) return { ok: false, error: 'forbidden' };
  const updated = await getPool().query<ChapterRow>(
    `UPDATE study_chapters SET name = $1, updated_at = now() WHERE id = $2 RETURNING ${CHAPTER_COLS}`,
    [name, chapterId],
  );
  return { ok: true, chapter: mapChapter(updated.rows[0]!) };
}

/** Flip a chapter between vanilla and gamebook (interactive-lesson) mode (owner). */
export async function setChapterGamebook(
  chapterId: string,
  ownerId: string,
  gamebook: boolean,
): Promise<UpdateChapterResult> {
  if (!isInitialized()) return { ok: false, error: 'not_found' };
  const { rows } = await getPool().query<{ owner_id: string }>(
    `SELECT s.owner_id
       FROM study_chapters c JOIN studies s ON s.id = c.study_id
       WHERE c.id = $1`,
    [chapterId],
  );
  const found = rows[0];
  if (!found) return { ok: false, error: 'not_found' };
  if (found.owner_id !== ownerId) return { ok: false, error: 'forbidden' };
  const updated = await getPool().query<ChapterRow>(
    `UPDATE study_chapters SET gamebook = $1, updated_at = now() WHERE id = $2 RETURNING ${CHAPTER_COLS}`,
    [gamebook, chapterId],
  );
  return { ok: true, chapter: mapChapter(updated.rows[0]!) };
}
