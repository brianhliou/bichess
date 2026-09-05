-- 131_study_chapter_practice.sql
-- Practice (engine-adjudicated exercise) mode on a study chapter.
--
-- The sibling of 093's gamebook flag, and its opposite in what it needs from the
-- chapter. A gamebook is played against the AUTHORED tree: the solution is the
-- mainline and the per-node hint/deviation text rides inside the serialized tree,
-- so 093 needed no columns beyond the flag.
--
-- A practice chapter ignores the tree entirely. It is played from the chapter's
-- root position against the engine, so the only thing it needs that a vanilla
-- chapter does not is the GOAL: "mate in 3", "win", "draw in 20". lila keeps the
-- equivalent in a PGN `Termination` tag and parses it with a regex, which is why
-- 27 of its 316 practice chapters silently fall back to a goal nobody authored.
-- A real column cannot go missing that way, and it lets a practice chapter be
-- found by query rather than by parsing every chapter's tags.
--
-- Goal text is validated in the application (parsePracticeGoal), not here: the
-- grammar is small but it is a product decision that will move, and a CHECK
-- constraint on it would turn a copy edit into a migration.

ALTER TABLE study_chapters
  ADD COLUMN IF NOT EXISTS practice BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS practice_goal TEXT;

-- A practice chapter is meaningless without a goal, and a goal on a chapter that
-- is not in practice mode is dead data. Keep the two in step at the storage
-- layer so a half-written chapter cannot reach a learner.
ALTER TABLE study_chapters
  DROP CONSTRAINT IF EXISTS study_chapters_practice_goal_present;
ALTER TABLE study_chapters
  ADD CONSTRAINT study_chapters_practice_goal_present
  CHECK (practice = false OR practice_goal IS NOT NULL);
