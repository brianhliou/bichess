-- 122_user_flair.sql
-- Cosmetic profile flair: one preset icon key per account, rendered beside the
-- handle wherever a player is named.
--
-- A key, not an uploaded image. The allowlist lives in application code
-- (apps/server/src/flair.ts, mirrored in apps/web/src/flair.ts with a
-- conformance test) rather than a DB enum, so adding an icon is a code change
-- and not a migration. The CHECK here is a shape guard only — it stops junk and
-- unbounded strings reaching the column; it deliberately does not enumerate the
-- valid keys, because a DB-side list would drift from the code-side one.
--
-- NULL = no flair, which is the default and stays the default: nothing
-- backfills a flair onto an existing account.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS flair TEXT
    CHECK (flair IS NULL OR flair ~ '^[a-z0-9][a-z0-9-]{0,39}$');
