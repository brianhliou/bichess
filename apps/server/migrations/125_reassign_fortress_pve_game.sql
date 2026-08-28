-- 125_reassign_fortress_pve_game.sql
-- One-off data correction (2026-08-27), the same mistake migration 120 fixed: a
-- PvE Fortress Xiangqi game against Fairy-Stockfish Level 4 was played while
-- signed in as the official @mistboard account. Move the human seat to
-- @brianhliou-dev, the account that actually played it.
--
-- Safe to run as a plain data migration, for the reasons 120 recorded:
--   * The game is UNRATED PvE (rated = false, no Glicko row, no elo_before /
--     elo_after on the participant) and the opponent seat is a bot, so there is
--     no rating history and no second seat to rewrite.
--   * game_participants is the only place a game's player identity is stored.
--     The profile game list, the per-variant game count, /game/:id, /watch, and
--     the bot head-to-head record all derive from this row. `totalGamesPlayed`
--     in particular is a live COUNT over this table, not a stored counter, so it
--     follows the seat automatically and needs no separate fixup.
--   * Unlike 120, this session left no puzzle attempts on the official account
--     (its puzzleRatings list is empty), so nothing puzzle-side is touched.
--
-- Every statement is guarded, so a state already corrected by hand is a no-op
-- rather than a clobber, and a game id that does not match reports rather than
-- silently doing nothing.

DO $$
DECLARE
  target_user_id   TEXT;
  target_name      TEXT;
  official_user_id TEXT;
  game_room_id     TEXT := 'fxq_8aed63df-dc35-45a8-84c1-2bc798bc0455';
  moved            INTEGER;
BEGIN
  SELECT id, COALESCE(NULLIF(display_name, ''), handle)
    INTO target_user_id, target_name
    FROM users
   WHERE handle = 'brianhliou-dev';

  SELECT id INTO official_user_id FROM users WHERE handle = 'mistboard';

  IF official_user_id IS NULL THEN
    RAISE NOTICE 'migration 125: no @mistboard account, nothing to correct';
    RETURN;
  END IF;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'migration 125: target account @brianhliou-dev not found, game NOT moved';
    RETURN;
  END IF;

  UPDATE game_participants
     SET subject_id   = target_user_id,
         display_name = target_name
   WHERE game_id      = game_room_id
     AND color        = 'black'
     AND subject_type = 'user'
     AND subject_id   = official_user_id;
  GET DIAGNOSTICS moved = ROW_COUNT;

  IF moved = 0 THEN
    RAISE NOTICE
      'migration 125: no matching seat on % (already moved, or not on this database)',
      game_room_id;
  ELSE
    RAISE NOTICE 'migration 125: moved % seat(s) on % to %', moved, game_room_id, target_name;
  END IF;
END $$;
