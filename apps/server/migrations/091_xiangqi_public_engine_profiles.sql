-- 091_xiangqi_public_engine_profiles.sql
-- Make Fairy-Stockfish's stochastic levels the public human ladder and retain
-- only the strongest practical Pikafish profile as a separately named elite
-- challenge. Hidden Pikafish profiles remain addressable by id for historical
-- games, EvE calibration, and future rated personalities.

INSERT INTO bot_profiles
  (id, display_name, bio, active_engine_id, default_game_spec_id,
   supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
SELECT
  'fairy-stockfish-xiangqi-level-' || level,
  'Fairy-Stockfish - Level ' || level,
  'Level ' || level || ' of Mistboard''s eight-level human Xiangqi ladder, backed by Fairy-Stockfish.',
  'fairy-stockfish-xiangqi-level-' || level,
  'xiangqi',
  ARRAY['xiangqi'],
  180000,
  2000,
  'public'
FROM generate_series(1, 8) AS levels(level)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  bio = EXCLUDED.bio,
  active_engine_id = EXCLUDED.active_engine_id,
  default_game_spec_id = EXCLUDED.default_game_spec_id,
  supported_game_spec_ids = EXCLUDED.supported_game_spec_ids,
  play_initial_ms = EXCLUDED.play_initial_ms,
  play_increment_ms = EXCLUDED.play_increment_ms,
  visibility = EXCLUDED.visibility,
  updated_at = now();

UPDATE bot_profiles
SET visibility = 'unlisted', updated_at = now()
WHERE active_engine_id IN (
  'pikafish-xiangqi-level-1',
  'pikafish-xiangqi-level-2',
  'pikafish-xiangqi-level-3',
  'pikafish-xiangqi-level-4',
  'pikafish-xiangqi-level-5',
  'pikafish-xiangqi-level-6',
  'pikafish-xiangqi-level-7'
);

UPDATE bot_profiles
SET
  display_name = 'Pikafish',
  bio = 'Mistboard''s elite standard-Xiangqi challenge, backed by mainline Pikafish.',
  visibility = 'public',
  updated_at = now()
WHERE active_engine_id = 'pikafish-xiangqi-level-8';
