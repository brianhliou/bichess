// Practice progress: which exercises a learner has solved, and in how few moves.
//
// One table (migration 133) feeds three surfaces -- the checkmark on a chapter
// row, the "solved / total" ribbon on an index card, and the overall figure in
// the sidebar. They are the same question asked at three granularities, so they
// are answered here rather than counted separately in each caller.

import { getPool, isInitialized } from './persistence-db.js';

/**
 * Record a solve, keeping the FEWEST moves ever taken.
 *
 * Idempotent by construction: re-solving the same exercise updates the row
 * rather than inserting, and a slower solve does not overwrite a faster one.
 * lila keeps the same minimum-moves semantics, and it is the behaviour a learner
 * expects -- practising again should never look like losing ground.
 */
export async function recordPracticeSolved(
  userId: string,
  chapterId: string,
  moves: number,
): Promise<void> {
  if (!isInitialized()) return;
  // Clamped rather than rejected: the column is a SMALLINT and a pathological
  // move count is a reason to store a big number, not to lose the solve.
  const clamped = Math.max(0, Math.min(30000, Math.round(moves)));
  await getPool().query(
    `INSERT INTO practice_progress (user_id, chapter_id, moves)
          VALUES ($1, $2, $3)
     ON CONFLICT (user_id, chapter_id) DO UPDATE
        SET moves = LEAST(practice_progress.moves, EXCLUDED.moves),
            updated_at = now()`,
    [userId, chapterId, clamped],
  );
}

/** Chapter ids this user has solved, among the ones asked about. */
export async function solvedChapterIds(
  userId: string,
  chapterIds: readonly string[],
): Promise<Set<string>> {
  if (!isInitialized() || chapterIds.length === 0) return new Set();
  const { rows } = await getPool().query<{ chapter_id: string }>(
    'SELECT chapter_id FROM practice_progress WHERE user_id = $1 AND chapter_id = ANY($2::text[])',
    [userId, [...chapterIds]],
  );
  return new Set(rows.map((row) => row.chapter_id));
}

/**
 * How many practice chapters this user has solved, per study.
 *
 * Counted in the database rather than by fetching every chapter id and
 * intersecting in the route: the index asks this for every card at once, and the
 * join is what the table's user index exists for.
 */
export async function solvedCountsByStudy(
  userId: string,
  studyIds: readonly string[],
): Promise<Map<string, number>> {
  if (!isInitialized() || studyIds.length === 0) return new Map();
  const { rows } = await getPool().query<{ study_id: string; solved: string }>(
    `SELECT c.study_id, count(*) AS solved
       FROM practice_progress p
       JOIN study_chapters c ON c.id = p.chapter_id
      WHERE p.user_id = $1
        AND c.study_id = ANY($2::text[])
        AND c.practice
      GROUP BY c.study_id`,
    [userId, [...studyIds]],
  );
  return new Map(rows.map((row) => [row.study_id, Number.parseInt(row.solved, 10) || 0]));
}
