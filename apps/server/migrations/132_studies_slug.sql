-- 132_studies_slug.sql
-- Stable, human-authored identity for a study, so something outside the database
-- can name one without knowing its generated id.
--
-- The /practice index is a CURATED catalogue: a hand-written list saying which
-- studies appear in which section and in what order (lila does the same thing in
-- PracticeSections.scala). That list has to reference studies somehow, and both
-- of the identifiers we already had are wrong for it:
--
--   the generated id  -- changes whenever a study is re-seeded, which silently
--                        empties the section rather than failing loudly
--   the name          -- a rename is an editorial act that should not break a
--                        page, and the existing seeders match on exact name
--                        precisely because search returns near misses
--
-- A slug is set once by whoever seeds the study and never changes, so the
-- catalogue keeps pointing at the right thing across re-seeds and renames.
--
-- Nullable: only curated studies need one, and a user creating a study through
-- the UI never supplies one. UNIQUE so a slug names exactly one study, which is
-- also what makes seeding idempotent (upsert on the slug rather than the name).

ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Partial index: many studies have no slug, and NULLs should not collide.
CREATE UNIQUE INDEX IF NOT EXISTS studies_slug_key
  ON studies (slug)
  WHERE slug IS NOT NULL;
