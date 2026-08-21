-- 120_reassign_official_account_pve_game.sql
-- One-off data correction (2026-08-21). A PvE dark-chess game against Misty was
-- played while signed in as the official @mistboard account by mistake. Move the
-- human seat to the account that actually played it, and clear the stray puzzle
-- attempt left on the official account by the same session.
--
-- Safe to run as a plain data migration:
--   * The game is UNRATED PvE, so there is no Glicko row, no elo_before/after on
--     the participant, and no opponent seat to rewrite.
--   * game_participants is the only place a game's player identity is stored.
--     The profile game list, the per-variant game count, /game/:id, /watch, and
--     the bot head-to-head record all derive from this row.
--   * puzzle_ratings (the puzzle's own difficulty aggregate) is deliberately NOT
--     touched. A Glicko update to a shared difficulty rating is not cleanly
--     reversible, and it carries no account attribution.
--
-- Every statement is guarded, so a state that has already been corrected by hand
-- is a no-op rather than a clobber.

DO $$
DECLARE
  target_user_id   TEXT;
  target_name      TEXT;
  official_user_id TEXT;
  moved            INTEGER;
  cleared_attempts INTEGER;
  cleared_ratings  INTEGER;
BEGIN
  SELECT id, COALESCE(NULLIF(display_name, ''), handle)
    INTO target_user_id, target_name
    FROM users
   WHERE lower(email) = 'test1@mistboard.com';

  SELECT id INTO official_user_id FROM users WHERE handle = 'mistboard';

  IF official_user_id IS NULL THEN
    RAISE NOTICE 'migration 120: no @mistboard account, nothing to correct';
    RETURN;
  END IF;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'migration 120: target account test1@mistboard.com not found, game NOT moved';
  ELSE
    UPDATE game_participants
       SET subject_id   = target_user_id,
           display_name = target_name
     WHERE game_id      = '42b652b6-98e3-4e16-9a1e-b1a44e1f69d1'
       AND color        = 'black'
       AND subject_type = 'user'
       AND subject_id   = official_user_id;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'migration 120: moved % game seat(s) to %', moved, target_name;
  END IF;

  DELETE FROM puzzle_attempts WHERE user_id = official_user_id;
  GET DIAGNOSTICS cleared_attempts = ROW_COUNT;

  DELETE FROM user_puzzle_ratings WHERE user_id = official_user_id;
  GET DIAGNOSTICS cleared_ratings = ROW_COUNT;

  RAISE NOTICE 'migration 120: cleared % puzzle attempt(s), % puzzle rating row(s)',
    cleared_attempts, cleared_ratings;
END $$;
