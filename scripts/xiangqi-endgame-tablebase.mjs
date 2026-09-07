#!/usr/bin/env node
/**
 * Walk a corpus position through chessdb.cn and emit the line, in the shape
 * seed-xiangqi-endgame-study.ts already reads (--json).
 *
 *   node scripts/xiangqi-endgame-tablebase.mjs --id three-soldiers-vs-full-defence
 *   node scripts/xiangqi-endgame-tablebase.mjs --all --out /tmp/verify.json
 *
 * Why this exists next to verify-xiangqi-endgames.ts rather than inside it: that
 * script ASKS AN ENGINE what it thinks and prints the two verdicts side by side,
 * which needs a Pikafish binary. This one asks the cloud database, which answers
 * exactly for small material and needs nothing installed. When the two disagree
 * the database is right and the engine is searching; when the database has no
 * row it says so rather than guessing.
 *
 * `querypv` returns ONE move, not a variation, so a line has to be walked: ask,
 * apply the move through the real kernel, ask again. Every move is replayed
 * through `isStandardXiangqiLegalMove` on the way, so a move the database offers
 * that our rules reject stops the walk instead of producing a line that cannot
 * be played back.
 *
 * A drawn position yields no line, and that is correct rather than a failure:
 * there is no principal variation to show for "this holds".
 */
import { writeFileSync } from 'node:fs';
import {
  applyStandardXiangqiMove,
  endgameEntryEngineFen,
  endgameEntryState,
  isStandardXiangqiLegalMove,
  pikafishUciToXiangqiSquares,
  standardXiangqiEngineFen,
  XIANGQI_ENDGAME_CORPUS,
} from '@mistboard/game';

const args = process.argv.slice(2);
const argOf = (flag, fallback = '') => {
  const at = args.indexOf(`--${flag}`);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};

const ENDPOINT = 'http://www.chessdb.cn/chessdb.php';
const MAX_PLIES = 60;

async function ask(action, fen) {
  const url = `${ENDPOINT}?action=${action}&board=${encodeURIComponent(fen)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  return (await response.text()).trim();
}

/** The exact verdict and distance, from the side to move. */
async function verdictOf(fen) {
  const text = await ask('queryall', fen);
  const best = text.split('|')[0] ?? '';
  const note = /note:[^(]*\((W|D|L)-M-(\d+)\)/.exec(best);
  if (!note) return { verdict: 'not-in-db', plies: null };
  return {
    verdict: note[1] === 'W' ? 'win' : note[1] === 'L' ? 'loss' : 'draw',
    plies: Number(note[2]),
  };
}

/**
 * The database's BEST move for a position, as our squares, or null.
 *
 * From `queryall` and not `querypv`, because querypv returns a winning move
 * rather than the shortest one: on the chariot-and-cannon counterexample it
 * walked 41 plies for a position the database calls mate in 34, and a chapter
 * that announces one number while showing a longer line teaches the wrong thing.
 * queryall ranks every move with its own distance, so picking the smallest
 * reproduces the line the announced distance refers to.
 *
 * chessdb speaks the rank-0 dialect Pikafish does, so `a4f4` is a5->f5 here.
 * Reusing pikafishUciToXiangqiSquares rather than redoing the arithmetic: the
 * first version skipped the conversion and every move came back illegal at ply
 * 0, which reads exactly like "the database has no line".
 */
async function bestMove(fen) {
  const text = await ask('queryall', fen);
  let best = null;
  for (const part of text.split('|')) {
    const uci = /move:([a-i]\d[a-i]\d)/.exec(part)?.[1];
    if (!uci) continue;
    const note = /note:[^(]*\((W|D|L)-M-(\d+)\)/.exec(part);
    // Prefer a win, and among wins the shortest. A move with no distance is a
    // fallback only, so a position the database ranks but cannot resolve still
    // produces a line rather than stopping.
    const rank = note?.[1] === 'W' ? Number(note[2]) : Number.POSITIVE_INFINITY;
    if (!best || rank < best.rank) best = { uci, rank };
  }
  return best ? pikafishUciToXiangqiSquares(best.uci) : null;
}

async function walk(entry) {
  const { verdict, plies } = await verdictOf(endgameEntryEngineFen(entry));
  // Nothing to walk: a draw has no winning line, and a position the database
  // does not hold has no answer at all.
  if (verdict !== 'win') return { verdict, plies, pv: [] };

  let state = endgameEntryState(entry);
  const pv = [];
  for (let ply = 0; ply < MAX_PLIES; ply += 1) {
    if (state.status.type !== 'playing') break;
    const move = await bestMove(standardXiangqiEngineFen(state));
    if (!move) break;
    // The database and our kernel must agree, or the line is not playable here.
    if (!isStandardXiangqiLegalMove(state, move)) break;
    state = applyStandardXiangqiMove(state, move);
    // Emitted in OUR notation: the seeder replays it with the same parser.
    pv.push(`${move.from}${move.to}`);
  }
  return { verdict, plies, pv, ended: state.status.type };
}

async function main() {
  const only = argOf('id');
  const entries = args.includes('--all')
    ? XIANGQI_ENDGAME_CORPUS
    : XIANGQI_ENDGAME_CORPUS.filter((e) => e.id === only);
  if (!entries.length)
    throw new Error(only ? `no corpus entry ${only}` : 'pass --id <id> or --all');

  const rows = [];
  for (const entry of entries) {
    const { verdict, plies, pv, ended } = await walk(entry);
    const agrees = verdict === 'not-in-db' ? false : verdict === entry.verdict;
    rows.push({
      id: entry.id,
      cp: null,
      // The distance OF THE LINE THIS EMITS, in moves, so the "mate in N" the
      // chapter prints matches the mainline beside it. Deliberately not the
      // database's own figure: that is a move count under best play by both
      // sides, the walk takes the database's preferred defence rather than the
      // most stubborn one, and the two differ (34 vs the 41 plies walked).
      mate: verdict === 'win' && pv.length ? Math.ceil(pv.length / 2) : null,
      depth: 0,
      pv,
      read: `tablebase:${verdict}`,
      agrees,
      expected: entry.verdict === 'win',
      unresolved: verdict === 'not-in-db',
    });
    console.log(
      `${entry.id.padEnd(46)} corpus=${entry.verdict.padEnd(5)} db=${verdict.padEnd(10)} ` +
        `${plies == null ? '' : `${plies}ply `}pv=${pv.length}${ended ? ` end=${ended}` : ''}` +
        `${agrees ? '' : '   <-- DISAGREES'}`,
    );
  }

  const out = argOf('out');
  if (out) {
    writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log(`\nwrote ${out} (${rows.length} rows)`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
