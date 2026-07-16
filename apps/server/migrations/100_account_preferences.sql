-- 100_account_preferences.sql
-- Account-backed gameplay and notification preferences. The object stays
-- sparse: missing keys use the product defaults in persistence-accounts.ts.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_account_preferences_object_check,
  ADD CONSTRAINT users_account_preferences_object_check
    CHECK (jsonb_typeof(account_preferences) = 'object');
