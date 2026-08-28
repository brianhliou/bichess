-- Study chapters carry no player identity, so a chapter of a real game cannot
-- say who had Red. The PGN importer already PARSES [Red]/[Black]/[Event] and
-- then throws them away, using them only to synthesize a chapter title, because
-- there is nowhere to keep them; export then invents an Event tag from the study
-- and chapter names. The round trip is lossy in both directions.
--
-- One JSONB column rather than five text columns: this is the PGN tag roster,
-- which is open-ended by design, and a study of a real game may carry Round,
-- ECO or Site as readily as Red and Black. Consumers read the keys they know.
ALTER TABLE study_chapters
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN study_chapters.tags IS
  'PGN-style tag pairs for this chapter (red, black, result, event, date, round, site). Authored or imported, never derived — unlike denorm.';
