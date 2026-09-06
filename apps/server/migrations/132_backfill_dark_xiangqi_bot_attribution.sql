-- 132_backfill_dark_xiangqi_bot_attribution.sql
-- Backfill for the bug fixed in the parent commit: Dark Xiangqi is the only
-- tenant that overrides persistence.buildGameSummary, and its private
-- participant builder never read room.pveBotId. Every dxq PvE seat was
-- therefore written as subject_type 'engine-version' / subject_id
-- 'python-fdx-v1.x', where every other tenant writes 'bot' / 'misty'.
--
-- The bot profile counts games by (subject_type = 'bot', subject_id), so
-- Misty's Fog Xiangqi tab read "0 Games / No completed Fog Xiangqi games yet"
-- while finished games existed. The code fix stops new games from landing this
-- way; this migration corrects the rows already written.
--
-- Safe as a plain data migration:
--   * No information is lost or invented. subject_id already holds the engine
--     id, and Misty is the ONLY first-party bot that has ever fronted a
--     dark-xiangqi engine (FIRST_PARTY_BOT_PROFILES), so the mapping is total
--     and unambiguous. The engine build stays recoverable from the games row
--     and the event log.
--   * dxq PvE is UNRATED (buildDarkXiangqiGameSummary pins rated = false), so
--     there is no Glicko row and no elo_before/elo_after to rewrite -- this is
--     the same reasoning migrations 120 and 125 recorded.
--   * Scoped by games.variant = 'dark-xiangqi', so a human seat, a spectator
--     row, and every other variant are untouched. The engine-version guard
--     means an already-corrected row is skipped rather than clobbered.
--
-- Both dxq engine ids are covered: 'python-fdx-v1.1' (current) and
-- 'python-fdx-v1.0' (the earlier build). Re-running is a no-op.

DO $$
DECLARE
  moved INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bot_profiles WHERE id = 'misty') THEN
    RAISE NOTICE 'migration 132: no misty bot profile, nothing to correct';
    RETURN;
  END IF;

  UPDATE game_participants gp
     SET subject_type = 'bot',
         subject_id   = 'misty',
         display_name = 'Misty'
    FROM games g
   WHERE gp.game_id      = g.room_id
     AND g.variant       = 'dark-xiangqi'
     AND gp.subject_type = 'engine-version'
     AND gp.subject_id IN ('python-fdx-v1.0', 'python-fdx-v1.1');
  GET DIAGNOSTICS moved = ROW_COUNT;

  IF moved = 0 THEN
    RAISE NOTICE
      'migration 132: no dark-xiangqi engine seats to reattribute (already corrected, or none on this database)';
  ELSE
    RAISE NOTICE 'migration 132: reattributed % dark-xiangqi engine seat(s) to misty', moved;
  END IF;
END $$;
