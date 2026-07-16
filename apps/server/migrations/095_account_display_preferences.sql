-- 095_account_display_preferences.sql
-- Account-backed display preferences. The JSON object is intentionally sparse:
-- only preferences with real runtime consumers are accepted by the API.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_display_preferences_object_check,
  ADD CONSTRAINT users_display_preferences_object_check
    CHECK (jsonb_typeof(display_preferences) = 'object');
