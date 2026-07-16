-- 102_retire_japanese_locale.sql
-- Japanese is no longer a supported product locale. Clear legacy preferences
-- so affected accounts return to normal URL/browser/default inference, then
-- tighten the database contract to the active locale set.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_locale_check;

UPDATE users
SET locale = NULL
WHERE locale = 'ja';

ALTER TABLE users
  ADD CONSTRAINT users_locale_check
    CHECK (locale IS NULL OR locale IN ('en', 'zh-Hans', 'zh-Hant'));
