-- 129_puzzles_hidden_reason.sql
-- Withhold a published puzzle from serving without destroying it.
--
-- The miner's uniqueness gate rewards exactly the moves that are easiest to
-- see: a hanging piece is the most uniquely-best move on the board, so it
-- passes with the widest margin the gate can produce. Measured over the served
-- corpus in September 2026, 12% of mined puzzles were BOTH already won before
-- the blunder (solver ahead 300cp+) AND answered by taking something nothing
-- defends. Those ask the solver nothing.
--
-- The difficulty prior was taught about free captures first
-- (deriveXiangqiPuzzleDifficulty, freeCaptureCp), which moved most of them into
-- the beginner band. That is the right fix for "too easy" and the wrong one
-- here: the problem with this set is not difficulty, it is that the puzzle
-- teaches nothing at any rating. Rating can only move who sees it.
--
-- Hidden, never deleted. Re-mining is expensive and destructive, storage is
-- cheap, and the reason string is auditable: an opt-in surface can still reach
-- these, and a better gate can un-hide them by clearing the column.
--
-- NULL means served, which keeps every existing row serving with no backfill.
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS hidden_reason text;

COMMENT ON COLUMN puzzles.hidden_reason IS
  'Non-null withholds this puzzle from the default serving set. Free text, set by scripts/hide-xiangqi-puzzles.mjs; NULL means served.';

-- The serve path filters on this, so it reads the column on every load.
CREATE INDEX IF NOT EXISTS puzzles_served_idx ON puzzles (variant, seq, id) WHERE hidden_reason IS NULL;
