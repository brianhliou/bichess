-- 133_practice_progress.sql
-- Per-user completion of practice exercises.
--
-- This one table is what turns /practice from a list of links into a course: it
-- feeds the checkmark on every chapter row, the "solved / total" ribbon on each
-- index card, and the overall progress figure. Until it existed the rail showed
-- row numbers and the cards showed set sizes, because nothing anywhere recorded
-- that a learner had finished anything.
--
-- Shape follows lila's PracticeProgress, which stores `Map[chapterId -> nbMoves]`
-- per user: presence of the row means solved, and the number is the FEWEST moves
-- ever taken. Storing the count rather than a boolean costs nothing now and is
-- what a "best" or a star rating would need later; v1 only renders the tick.
--
-- Keyed on the chapter, not on (study, chapter): a chapter id is already unique,
-- and a chapter that moves between studies should keep its solved state.
--
-- No FK to study_chapters on purpose. A chapter can be deleted and re-seeded
-- with a new id (the corpus is re-seedable), and a cascade would silently erase
-- a learner's history on a content refresh. Orphan rows are harmless: they are
-- only ever read by joining against chapters that exist.

CREATE TABLE IF NOT EXISTS practice_progress (
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id  TEXT        NOT NULL,
  -- The learner's own moves in their best solve. Small by construction; a
  -- basic endgame that takes more than a few hundred moves is not a solve.
  moves       SMALLINT    NOT NULL,
  solved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter_id)
);

-- The read the rail and the cards both make: everything this user has solved.
CREATE INDEX IF NOT EXISTS practice_progress_user_idx
  ON practice_progress (user_id);
