-- 093_study_chapter_gamebook.sql
-- Gamebook / interactive-lesson flag on a study chapter (S4 of the study track).
-- Same tree data as a vanilla chapter; the flag flips the chapter's default
-- presentation to the guess-the-move player. Per-node hint/deviation text lives
-- inside the serialized tree (NodeGamebook), so no new columns for those.

ALTER TABLE study_chapters
  ADD COLUMN IF NOT EXISTS gamebook BOOLEAN NOT NULL DEFAULT false;
