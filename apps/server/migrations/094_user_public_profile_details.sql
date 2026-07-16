-- 094_user_public_profile_details.sql
-- Small, public profile details managed from account settings. These stay on
-- the user row because they are loaded with both the signed-in identity and the
-- public profile; all fields are optional and plain text.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_links TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_bio_length_check,
  ADD CONSTRAINT users_bio_length_check CHECK (char_length(bio) <= 500),
  DROP CONSTRAINT IF EXISTS users_location_length_check,
  ADD CONSTRAINT users_location_length_check CHECK (char_length(location) <= 80),
  DROP CONSTRAINT IF EXISTS users_profile_links_count_check,
  ADD CONSTRAINT users_profile_links_count_check CHECK (cardinality(profile_links) <= 5),
  DROP CONSTRAINT IF EXISTS users_profile_links_no_nulls_check,
  ADD CONSTRAINT users_profile_links_no_nulls_check
    CHECK (array_position(profile_links, NULL) IS NULL);
