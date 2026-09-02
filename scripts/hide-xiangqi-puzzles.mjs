#!/usr/bin/env node
// Withhold mined xiangqi puzzles that ask the solver nothing.
//
// The set: BOTH already won before the blunder (solver ahead by >= 300cp, from
// the run's own scan evidence) AND answered by capturing a piece that nothing
// can recapture. Either condition alone is fine. A free capture can be the
// payoff of a real combination, and a tactic in an already-good position is
// still a tactic. Together they are a player noticing a hanging piece in a game
// they had already won.
//
// This is deliberately NOT a gate change. Rejecting at mine time destroys the
// candidate and needs a re-mine to undo; this sets a column, and clearing it
// serves the puzzle again. It is also not a rating change: the difficulty prior
// already learned about free captures, which fixed "too easy". It cannot fix
// "teaches nothing", because that is true at every rating.
//
//   railway run -s Postgres -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" \
//     node scripts/hide-xiangqi-puzzles.mjs'            # dry run, prints the set
//   ... node scripts/hide-xiangqi-puzzles.mjs --apply    # writes hidden_reason
//   ... node scripts/hide-xiangqi-puzzles.mjs --unhide   # clears this reason
import pg from 'pg';
import {
  applyStandardXiangqiMove,
  getStandardXiangqiLegalMoves,
} from '../packages/game/dist/variants-xiangqi-standard.js';

const REASON = 'already-won-free-capture';
const AHEAD_CP = 300;

const apply = process.argv.includes('--apply');
const unhide = process.argv.includes('--unhide');

/** Nothing can recapture on the square the move landed on. Only meaningful
 *  while the game is still running: a capture that MATES also leaves the
 *  opponent no legal replies, and that is not a free capture. */
function isFreeCapture(state, move) {
  if (!state.board[move.to]) return false;
  const after = applyStandardXiangqiMove(state, move);
  if (after.status.type !== 'playing') return false;
  return getStandardXiangqiLegalMoves(after).every((reply) => reply.to !== move.to);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  if (unhide) {
    const { rowCount } = await client.query(
      `UPDATE puzzles SET hidden_reason = NULL WHERE hidden_reason = $1`,
      [REASON],
    );
    console.log(`un-hid ${rowCount} puzzles`);
    process.exit(0);
  }

  const { rows } = await client.query(
    `SELECT p.id, p.data, p.hidden_reason, cand.scan_evidence
       FROM puzzles p
       JOIN xiangqi_puzzle_mining_candidates cand
         ON p.id = 'xq-mined-' || cand.historical_game_id || '-' || cand.post_blunder_ply
      WHERE p.variant = 'xiangqi'`,
  );

  const hide = [];
  for (const row of rows) {
    const puzzle = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    // preBestCp is from the blunderer's point of view, so negate for the solver.
    const solverAhead = -(row.scan_evidence?.preBestCp ?? 0);
    if (solverAhead < AHEAD_CP) continue;
    if (!isFreeCapture(puzzle.initial, puzzle.solution[0])) continue;
    hide.push({ id: row.id, ahead: solverAhead, already: row.hidden_reason });
  }

  console.log(`examined ${rows.length} mined puzzles`);
  console.log(
    `match (already ahead >= ${AHEAD_CP}cp AND key move is a free capture): ${hide.length}`,
  );
  console.log(`already hidden: ${hide.filter((h) => h.already).length}`);
  for (const h of hide.slice(0, 5)) console.log(`  ${h.id}  solver ahead ${h.ahead}cp`);
  if (hide.length > 5) console.log(`  ... ${hide.length - 5} more`);

  if (!apply) {
    console.log('\ndry run. pass --apply to write hidden_reason.');
    process.exit(0);
  }
  const { rowCount } = await client.query(
    `UPDATE puzzles SET hidden_reason = $1 WHERE id = ANY($2::text[])`,
    [REASON, hide.map((h) => h.id)],
  );
  console.log(`\nhid ${rowCount} puzzles with reason "${REASON}"`);
} finally {
  await client.end();
}
