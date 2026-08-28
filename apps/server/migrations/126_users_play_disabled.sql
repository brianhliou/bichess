-- 126_users_play_disabled.sql
-- Per-account play lock: when set, the account cannot take a seat in a game,
-- post or accept a correspondence challenge, or book a puzzle attempt.
--
-- This exists for accounts that are identities rather than players: the
-- official @mistboard account, and any future org/press account signed into on
-- the same browser as a real one. Migration 120 was the cost of not having it,
-- a PvE game and a puzzle attempt landing on the official account because a
-- session was signed in as the wrong identity.
--
-- A timestamp rather than a boolean, matching patron_since / closed_at: the
-- column answers "since when" as well as "whether", which is what you want
-- when auditing why an account has no games after a date. NULL = can play,
-- which is the default and stays the default for every existing row.
--
-- Deliberately NOT tied to account_role. Admins play; this is orthogonal to
-- privilege, and conflating the two would have locked the working account out.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS play_disabled_at TIMESTAMPTZ;
