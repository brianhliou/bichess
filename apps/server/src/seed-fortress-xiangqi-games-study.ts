/**
 * Seed the Fortress Xiangqi companion study: the twenty engine self-play games
 * behind the rules article's sample game, chapter one being the game the
 * article embeds.
 *
 * The games come from the steered self-play generator described in the article
 * (Fairy-Stockfish on both sides, 1.5-2.5s per move, MultiPV opening sampling,
 * anti-repetition and progress steering). Every mainline is replayed through the
 * Fortress kernel before it is written, so a chapter can never carry a move the
 * board would reject. Chapter comments are computed from each game's own engine
 * eval curve, not written by hand.
 *
 * Usage (local dev, server on 3001):
 *   npx tsx apps/server/src/seed-fortress-xiangqi-games-study.ts \
 *     --email you@example.com [--base http://127.0.0.1:3001] \
 *     [--visibility public|unlisted|private]
 *
 * Against a real server, supply a browser session instead of --email:
 *   MISTBOARD_SESSION_COOKIE='mistboard_session=...' npx tsx ... --base https://mistboard.com
 * The cookie is a live credential: read from the environment, never logged.
 *
 * --emit <path> writes the exact POST payloads to a file without posting, for a
 * client that already holds a session.
 *
 * --in-place rewrites the chapters of the EXISTING study, keeping its id. Use
 * this once the study is published: a plain re-run refuses to create a second
 * copy and does nothing, and --replace deletes the study so the new one gets a
 * NEW id — which 404s the /study/<id> link the rules article hardcodes and every
 * chapter URL under it.
 *
 *   MISTBOARD_SESSION_COOKIE='mistboard_session=...' npx tsx \
 *     apps/server/src/seed-fortress-xiangqi-games-study.ts \
 *     --base https://mistboard.com --in-place
 */
import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  type FortressXiangqiDropRole,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiSquare,
  fortressXiangqiMoveToFsfUci,
  isFortressXiangqiLegalMove,
} from '@mistboard/game';
import { resolveExistingStudy } from './seed-study-idempotency.js';

const STUDY_NAME = 'Fortress Xiangqi: twenty engine games';
const STUDY_DESCRIPTION =
  'Companion study to the Fortress Xiangqi rules article: the twenty engine self-play games the article\u2019s sample game was chosen from, in full. Fairy-Stockfish on both sides with opening sampling and anti-repetition steering, so the reserve actually gets used. Chapter one is the game the article embeds. Article: /rules/fortress-xiangqi';

/** The article's replay notation: board moves as from+to, drops as ROLE@square
 *  with T for the Treasure. The kernel's FSF dialect uses Q for the Treasure, so
 *  tokens are parsed here and re-emitted through fortressXiangqiMoveToFsfUci —
 *  the tree adapter reads that dialect. */
const DROP_ROLE_BY_LETTER: Record<string, FortressXiangqiDropRole> = {
  R: 'chariot',
  N: 'horse',
  C: 'cannon',
  P: 'soldier',
  T: 'treasure',
  A: 'advisor',
  E: 'elephant',
};

type SerializedNode = {
  uci?: string;
  annotations?: { comments?: { text: string }[] };
  children: SerializedNode[];
};

type SampleGame = {
  seed: number;
  plies: number;
  winner: string;
  reason: string;
  comment: string;
  moves: string;
};

function parseArgs(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function parseToken(token: string): FortressXiangqiMove {
  const drop = /^([RNCPTAE])@([a-g][1-8])$/.exec(token);
  if (drop) {
    const role = DROP_ROLE_BY_LETTER[drop[1]!];
    if (!role) throw new Error(`unknown drop role in ${token}`);
    return { drop: role, to: drop[2] as FortressXiangqiSquare };
  }
  const board = /^([a-g][1-8])([a-g][1-8])$/.exec(token);
  if (board) {
    return { from: board[1] as FortressXiangqiSquare, to: board[2] as FortressXiangqiSquare };
  }
  throw new Error(`bad token ${token}`);
}

/** Replay a game through the Fortress kernel, returning FSF UCIs. Throws on any
 *  move the board would reject, so a bad corpus fails the seed instead of
 *  silently writing a chapter that truncates on load. */
function verifiedLine(
  label: string,
  moves: string,
): { ucis: string[]; final: FortressXiangqiGameState } {
  let state = createInitialFortressXiangqiState(`seed-${label}`);
  const ucis: string[] = [];
  for (const token of moves.trim().split(/\s+/)) {
    const move = parseToken(token);
    if (!isFortressXiangqiLegalMove(state, move)) {
      throw new Error(`${label}: illegal ${token} at ply ${ucis.length + 1}`);
    }
    const next = applyFortressXiangqiMove(state, move);
    if (next === state) throw new Error(`${label}: no-op ${token} at ply ${ucis.length + 1}`);
    state = next;
    ucis.push(fortressXiangqiMoveToFsfUci(move));
    if (state.status.type !== 'playing') break;
  }
  return { ucis, final: state };
}

function chapterName(game: SampleGame, ordinal: number): string {
  const moveNumber = Math.ceil(game.plies / 2);
  if (game.reason === 'repetition')
    return `Game ${ordinal}: drawn by repetition on move ${moveNumber}`;
  const who = game.winner === 'red' ? 'Red' : 'Black';
  const suffix = ordinal === 1 ? ' (the article\u2019s game)' : '';
  return `Game ${ordinal}: ${who} mates on move ${moveNumber}${suffix}`;
}

function chapterPayload(game: SampleGame, ordinal: number) {
  const name = chapterName(game, ordinal);
  const { ucis, final } = verifiedLine(String(game.seed), game.moves);
  if (final.status.type !== 'finished') {
    throw new Error(`${name}: replay did not finish (status ${final.status.type})`);
  }
  let child: SerializedNode | null = null;
  for (const uci of [...ucis].reverse()) {
    child = { uci, children: child ? [child] : [] };
  }
  return {
    name,
    variant: 'fortress-xiangqi' as const,
    orientation: 'red' as const,
    root: {
      version: 1 as const,
      root: {
        annotations: { comments: [{ text: game.comment }] },
        children: child ? [child] : [],
      },
    },
  };
}

/** Ordered for the study: the article's game first, then by how competitive the
 *  game stayed. Generated by scripts (see the article's methodology note); the
 *  comments are computed from each game's engine eval curve. */
const GAMES: SampleGame[] = [
  {
    seed: 0,
    plies: 75,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'The game the rules article embeds. 19 drops (Red 11, Black 8). Red mates with the cannon to e4, firing up the e-file over its own horse on e5 while the soldier on f5 covers the general\u2019s last square. Comment written by hand rather than from an eval curve: this game predates the Modal batch the other nineteen come from.',
    moves:
      'e1e4 b7b6 e4f4 d8f6 f2f3 b8c6 f1e3 c8d8 e3c4 a8c8 g1e1 c8c7 e1e6 c6b4 c4b6 c7c6 e6c6 b4c6 R@c5 R@d6 P@f5 c6b8 f5f6 d6b6 f6e6 N@f6 e6f6 b6f6 c5c8 d8d2 N@c5 P@d8 c8b8 d2d5 N@e6 P@e7 e6c7 d5d4 c7d5 f6f4 d5f4 f7f6 R@d5 d4c4 b8d8 C@b5 E@b3 b5d5 f4d5 R@d6 d8d7 d6d7 c5d7 R@d8 C@f4 g8f7 d5f6 f8g8 f4g4 g8f8 R@f5 f7e6 P@g8 f8f7 P@g6 e6f5 f6d5 f5g6 g4f4 P@e5 d7e5 f7f6 P@f5 f6e6 f4e4',
  },
  {
    seed: 1100024,
    plies: 167,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 634. The engine eval stayed inside a pawn of level through ply 99 of 167. The position broke open on ply 100. 54 drops (Red 28, Black 26). Red mates with the drop R@f8.',
    moves:
      'd1f3 c8c2 e1d1 c2c3 d2d3 b7b6 f1d2 c3c2 d3d4 c2f2 d4d5 P@c2 d2e4 f2d2 e4g5 b8c6 d5c5 c6e7 d1d7 d2d4 b2b3 a8c8 g5e6 d4c4 c1b2 f7f6 g1e1 c4a4 P@c7 a4a1 b1a1 T@d6 c7c8 d6d7 a1b1 d7c8 e6d4 c2b2 b1b2 g8f7 C@f4 P@f5 P@e6 c8d7 f4f6 f7e6 d4e6 P@c2 b2b1 d7e6 e1e6 N@d3 T@c3 d3c5 P@f7 f8f7 e6e7 f7e7 c3c2 e7f7 R@c7 A@e7 c7c5 e7f6 c5f5 R@c7 N@c4 P@c1 c2c1 C@f1 f3d1 f1c1 P@e6 f7f8 P@e7 T@f7 e7e8 f7e8 P@e7 P@c2 e7e8 f8e8 f5d5 C@g8 T@d3 P@c3 d3c3 c1c3 A@b2 T@f7 e6f6 d8f6 T@d3 P@a1 b1a1 c2b2 P@b1 P@a3 a2a3 c3a3 b1b2 a3d3 d5d3 e8f8 d3d4 g8g2 C@f2 T@e6 P@e5 e6d7 A@b1 P@f3 d1f3 g2g1 a1a2 g1e1 P@d6 e1e2 a2a1 e2e1 f3d1 d7e8 e5e6 P@e2 f2f3 f8g8 f3g3 A@g6 d4f4 e1e6 d6e6 f7e6 P@e5 e6f7 N@d6 P@d7 d6f7 e8f7 T@d3 c7c6 d3e2 P@c1 e2d2 c1d1 P@e6 E@c5 e6f6 f7f6 P@e8 P@f8 d2d1 N@g5 P@e6 b6b5 f4f6 g6f7 C@g4 c6a6 T@a3 a6a3 c4a3 T@g6 e8f8 g8f8 P@e8 f8g8 R@f8',
  },
  {
    seed: 1100009,
    plies: 209,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 406. The engine eval stayed inside a pawn of level through ply 121 of 209. The position broke open on ply 122. 53 drops (Red 28, Black 25). Red mates with e6–d6.',
    moves:
      'e1e4 c8c5 a2a3 g7g6 e4a4 c5b5 d1b3 b5a5 f2f3 b7b6 f1e3 b6b5 e3d5 f7f6 a4f4 g8f7 d5c7 b8c6 c7a8 a5a8 R@c5 N@d4 g1e1 a8c8 c5d5 d4f3 e1e3 P@f5 f4d4 c6d4 d5d4 c8c2 N@d1 c2g2 e3f3 P@c2 f3f1 b5b4 d4b4 c2d2 d1f2 d2e2 f2e4 C@e1 f1e1 e2e1 b4c4 g2g1 a1a2 P@c2 N@e2 g1f1 e4g3 f1f2 b1a1 e1d1 e2d4 c2c1 g3e2 d7d6 c4c5 a7a6 P@d7 d6d5 c5d5 f7e6 d5f5 e6f5 P@e7 f2f1 e7e8 f8g8 A@b1 A@f7 d7d8 R@e7 b3d1 f5g5 C@e1 e7b7 P@f8 g8g7 e1c1 f1c1 e2c1 R@d2 d4f3 d2d1 f3g5 g6g5 E@e3 E@g6 C@g1 d1d5 T@e1 b7c7 a2b3 N@e6 e1e2 e6f4 e2f3 f4e6 f3e2 e6f4 e2f3 f4e6 f3e4 e6d8 e8d8 P@c3 P@d4 d5d8 N@b5 c7c5 b5c3 P@c4 b3c4 c5c4 e4d3 c4c6 P@g2 g5g4 g1g4 T@g5 P@e7 d8f8 c3d5 P@e8 e7f7 f8f7 g4f4 P@f5 f4f1 f5f4 d5f4 f7d7 f1g1 g5f5 f4d5 C@a5 b1a2 g7f7 c1b3 a5b5 P@c5 b5d5 d4d5 c6b6 P@g5 N@f3 P@d6 d7b7 g5f5 f6f5 g1g6 f7f6 b3d4 b6b2 T@c2 f6g6 c2b2 b7b2 C@c6 g6g7 R@g6 g7f7 g6f6 f7g7 d3c2 T@f7 c2b2 f7f6 c6f6 R@d1 b2b1 d1d4 f6f3 P@f6 f3f6 d4g4 f6a6 C@f1 E@d1 N@c2 T@b2 e8e7 b2c2 f1b1 a2b1 T@f7 a6a7 g7g8 R@a8 g8g7 P@f6 P@d7 f6f7 g7f7 C@f3 P@f4 N@e5 f7g7 P@f7 g7g6 a7a6 e7e6 d6e6 d7d6 e6d6',
  },
  {
    seed: 1100025,
    plies: 233,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -576. The engine eval stayed inside a pawn of level through ply 169 of 233. The position broke open on ply 170. 52 drops (Red 26, Black 26). Red mates with f5–f6.',
    moves:
      'e1e3 d8f6 e3e6 c8c7 f2f3 b7b6 f1e3 c7c5 b2b3 f6d8 g1e1 b8c6 e3d5 a8c8 a1b2 c6e5 d5c3 e5c6 e1e4 f7f6 e4d4 g8f7 e6e1 c5b5 c3b5 c6d4 b5d4 R@d5 C@f4 f8g8 f4g4 g8f8 g4f4 f8g8 f4f7 e8f7 T@d3 d5e5 N@e3 e5a5 f3f4 d7d6 f4f5 d6d5 f5f6 d8f6 d4f5 C@a6 P@e7 c8c7 g2g3 g7g6 g3g4 g8f8 e3d5 a5d5 f5e3 d5c5 P@g7 N@d6 e7f7 d6f7 g7f7 f8f7 A@c3 f6d8 N@f4 f7f8 e1f1 f8g8 f1g1 P@g7 g1f1 P@f2 f1e1 c7f7 f4e6 a6e6 e1e6 N@e5 b2c2 c5c6 e6e8 c6c5 d3e4 f2e2 C@a8 e2e1 e4d4 f7f4 d4d3 e1d1 c2d1 e5d3 d2d3 T@e6 N@d5 f4f7 c3b2 e6d5 e3d5 c5d5 e8e2 E@e8 T@c3 d5c5 e2d2 P@d6 d2c2 c5e5 d3d4 N@f2 d1d2 f2g4 a2a3 g8f8 a8c8 b6b5 c8c4 g6g5 c4c8 a7a6 c8b8 N@f3 d2d3 P@e4 d4d5 d6d5 d3e2 e4e3 e2f3 e3f3 N@c6 T@c8 c3d2 c8b8 c6e5 g4e5 R@e6 N@c6 c2c5 P@d3 d2d1 C@e3 P@e7 c6e7 e6e5 b8c7 e5e4 e3b3 b1a1 c7d6 c5g5 f7f5 g5g1 P@d4 P@g8 f8f7 e4e1 f3f2 d1c2 f2f1 e1d1 P@d2 c2d2 d3d2 N@e3 d2d1 e3f5 e7f5 R@f8 f7e7 P@f6 T@e6 g1d1 e6f6 f8f6 d6e6 P@f7 e6f7 f6f5 f1e1 f5e5 f7e6 e5e1 P@e4 T@c3 b3b4 e1g1 g7g6 c3b4 R@c7 b4c3 N@e2 g1f1 e2c3 b2c3 T@f5 P@d6 c7c3 d6e6 f5e6 T@b2 c3c6 N@c3 P@f4 c3d5 e6d5 d1d5 b5b4 P@d7 e7f7 C@b7 f7f6 d5d8 N@d5 d8d5 c6c5 d5d6 c5b5 d6b6 b5b6 f1f4 e4f4 N@d5 C@e5 P@f5 f6e6 f5e5 e6f6 e5f5 f6e6 f5f6',
  },
  {
    seed: 1100028,
    plies: 149,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 130. The engine eval stayed inside a pawn of level through ply 20 of 149. The position broke open on ply 21. 42 drops (Red 23, Black 19). Red mates with the drop P@d6.',
    moves:
      'd1f3 d7d6 e1e2 a7a6 d2d3 c8c4 f1d2 b8d7 b2b3 c4f4 d3d4 d7f6 e2e6 a6a5 f3d1 a8c8 a1b2 f4f5 g1e1 f5b5 e6e5 b5b2 c1b2 c8c2 e1e2 T@f5 C@b8 f5e5 e2e5 c2c8 d2c4 C@g6 b8d8 c8d8 c4a5 f6g4 e5e1 C@a6 T@f3 f7f6 P@g5 g4f2 f3f2 P@c2 g5g6 g7g6 N@c5 a6b6 E@b4 g8f7 a5b7 d8a8 P@b5 c2b2 b1b2 P@c2 b2b1 f8g8 C@a3 b6c6 b5b6 c6c7 P@d7 c7c8 b7d6 A@e6 e1e2 a8a7 d7d8 c8c7 c5e6 c7e7 e6f4 a7d7 d6f7 d7d4 P@f8 g8g7 e2c2 e8f7 a3a7 d4d8 T@c1 P@f5 P@e6 d8d7 a7e7 f7e6 f4d5 N@d3 C@b7 d3c1 c2c1 T@d6 e7e8 P@e7 N@c7 d7d8 c7e6 d8d7 d5f6 d7b7 b6b7 e7e6 R@g8 g7f7 g8g6 C@e7 g6g3 P@g7 c1c4 N@b6 c4d4 d6e5 P@d7 b6d7 d4d7 e5f6 N@d5 N@e4 d5f6 e4g3 f2g3 P@d8 d7e7 f7e7 N@d5 R@d6 C@a7 d8d7 b7c7 e6e5 c7d7 e7e6 P@g5 R@f1 T@e1 d6d7 e1f1 P@a1 a7a1 d7d5 R@f7 N@d2 b4d2 d5d8 P@e7 d8e8 P@d6',
  },
  {
    seed: 1100002,
    plies: 150,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -230. The engine eval stayed inside a pawn of level through ply 74 of 150. The position broke open on ply 75. 42 drops (Red 23, Black 19). Black mates with b4–b3.',
    moves:
      'd1f3 c8c3 e1e4 c3c4 b2b3 b7b6 d2d3 f7f6 f1d2 g8f7 a1b2 b8c6 g1e1 c4c5 d3d4 c5f5 d4d5 f5f2 e4a4 a8c8 d2e4 c6d4 e4f2 P@e2 e1d1 d4f3 a4f4 E@f5 d5e5 b6b5 C@d3 d8b6 e5f5 f6f5 f4f7 e8f7 T@e3 P@d2 d1g1 f3e5 f2e4 d2c2 E@c3 c2b2 c1b2 T@e6 P@c5 C@c2 c5b5 c2a2 g1f1 e2f2 f1d1 P@c2 g2g3 b6d8 e4c5 e6d6 d3d5 f5f4 P@f5 f4f3 f5e5 f3e3 d5d7 T@e7 d7f7 f8f7 P@e6 c2b2 b1b2 C@g2 A@c2 a2c2 e6e7 d6e7 T@g1 c2e2 g1f2 e2e5 f2g2 e5b5 P@b4 c8c5 b4b5 c5c3 d1f1 e3f3 C@b7 f7f8 N@d4 P@c2 d4c2 P@a2 b2a2 c3c2 P@b2 P@a3 a2a3 c2b2 f1f3 A@f7 P@a4 A@f6 b5a5 b2g2 P@c7 N@d4 f3d3 e7e8 C@c8 T@b8 c8e8 f7e8 T@b1 b8c7 d3d4 c7b7 P@c2 C@e3 P@c3 g2g1 b1b2 C@e2 b2a2 g1c1 N@d1 P@d2 a2b2 c1d1 g3g4 P@b4 d4b4 d2c2 b4b7 c2b2 T@a2 d1d4 P@b4 e2a2 b7a7 d4b4 P@g8 f8g8 a7g7 f6g7 P@f8 g7f8 a5a6 b4b3',
  },
  {
    seed: 1100019,
    plies: 158,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -105. The engine eval stayed inside a pawn of level through ply 13 of 158. The position broke open on ply 14. 36 drops (Red 18, Black 18). Black mates with the drop P@b1.',
    moves:
      'e1e2 b7b6 a2a3 g7g6 d2d3 b8c6 f1d2 f7f6 g1e1 g8f7 e2e3 f6f5 b2b3 d8f6 a1b2 a8b8 f2f3 b6b5 e3e2 b5b4 e2f2 b8b5 g2g3 b4c4 e1e3 f6d8 b1a1 b5d5 d2b1 f7f6 f2c2 e8f7 g3g4 d5d6 c2d2 c4d4 e3e2 f6e6 d3d4 d6d4 P@c7 c8a8 b2c3 P@a4 c3d4 a4a3 b1a3 c6d4 e2e4 a8a3 c1b2 P@c2 e4d4 c2b2 N@c4 a3f3 c4b2 f3f1 a1a2 P@c2 R@f3 f1g1 d2g2 T@c6 c7c8 c6c7 f3f2 c2b2 g2b2 d7d6 f2c2 c7d7 c8d8 d7d8 P@g7 A@f6 E@e3 g1e1 c2e2 e1f1 e2f2 f1e1 g7f7 f8f7 P@g5 N@c3 A@a3 e1e2 P@c2 c3b5 d4b4 e2b2 a2b2 N@d4 g5g6 C@a6 P@g7 f6g7 g6g7 f7g7 A@a2 P@g6 f2g2 e6f6 C@f1 P@f4 f1g1 a6b6 g4g5 g6g5 g1g5 b6b4 b3b4 P@g3 g2g3 P@g4 g5b5 g4g3 P@g5 R@c4 a2b3 c4b4 P@g6 f6g6 g5g6 g7f7 g6f6 f7g7 T@c3 b4b5 C@g1 P@g4 g1g4 f4g4 b2b1 C@e1 e3c1 d4b3 f6g6 g7g6 a3b2 R@a4 P@a1 b3c5 N@b4 C@b6 c3c4 b6b4 c4b3 c5d3 b3b4 a4b4 C@b3 b4b3 a1a2 b3b2 b1a1 P@b1',
  },
  {
    seed: 1100001,
    plies: 126,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -230. The engine eval stayed inside a pawn of level through ply 44 of 126. The position broke open on ply 45. 34 drops (Red 16, Black 18). Black mates with the drop P@b1.',
    moves:
      'b2b3 b7b6 e1e3 c8c5 f2f3 b8c6 a1b2 f7f6 e3c3 c5g5 f1g3 g8f7 g1e1 c6d4 e1e4 d4b5 c3d3 g5g2 e4e2 g2g1 e2e1 g1g2 f3f4 P@c2 b2c2 g2c2 P@e7 f7e7 e1e7 e8f7 T@b2 T@d6 e7e1 a8c8 b3b4 P@c3 g3e4 c3d3 d2d3 C@b7 b1a1 c2c6 P@c5 c6c1 b2c1 d6c5 e4c5 c8c5 T@b2 c5c8 b4b5 b6b5 e1e2 b5b4 C@f2 c8c5 e2e4 b7b2 c1b2 T@e6 e4b4 P@c2 C@a8 f7e8 N@g5 c2b2 g5e6 T@e7 b4b2 e7e6 T@b1 P@c1 b1c2 N@b4 b2b4 c5c2 f2f3 N@d5 b4b8 T@e7 P@b2 d5f4 a2a3 A@f7 N@e4 c2c4 P@c8 d8b6 b8b6 c4e4 c8d8 e7d8 E@d2 e4c4 d2f4 c1d1 b6b8 d8e7 f3f1 E@d8 d3d4 c4d4 N@c5 e6d5 b8d8 e7d8 c5d7 P@e7 d7b8 d5e6 b8c6 P@b1 f1b1 N@c3 P@g8 f7g8 P@f7 g8f7 c6b4 d1c1 E@c2 c1b1 a1b1 P@c1 b1a1 P@b1',
  },
  {
    seed: 1100010,
    plies: 119,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 161. The engine eval stayed inside a pawn of level through ply 15 of 119. The position broke open on ply 16. 33 drops (Red 17, Black 16). Red mates with the drop P@d6.',
    moves:
      'd1b3 c8c3 d2d3 b7b6 e1e4 d8f6 f1d2 b8c6 g1e1 b6b5 e4f4 c3c2 d3d4 c2f2 d2e4 P@g4 f4f5 f2f4 d4d5 c6d4 e1d1 a8d8 f5b5 d8b8 b5c5 g7g6 P@e7 g8g7 e7d7 f8g8 P@f3 d4b3 b2b3 b8b3 a1b2 b3f3 c5c8 g7f8 d7e7 E@d8 e7e8 f8e7 d5d6 f3e3 N@c5 P@d5 e8d8 g8g7 d1d5 e3e4 P@g5 f4f1 E@d1 N@f3 d6d7 f3g5 d7e7 e4e7 T@f2 P@c6 c5d3 f1c1 b2c1 P@c3 d3e5 A@f8 A@b3 c3b3 d1b3 g5e4 f2e3 P@d6 d5d6 e4c3 P@c2 e7e5 C@d7 e5e7 c2c3 A@e6 P@e5 e7d7 d6d7 C@e1 b3d1 e1e5 N@d4 N@b4 R@b5 P@d5 b5b4 d5d4 b4d4 f6d8 d7d8 f8e7 d4g4 P@g5 g4f4 N@a6 P@d6 a6c7 P@d7 e5f5 d6e6 f5f6 e6f6 f7f6 c8c6 P@c2 P@f7 g7f7 d7e7 f7e7 C@b7 P@d7 d8d7 e7e6 P@d6',
  },
  {
    seed: 1100020,
    plies: 105,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 0. The engine eval stayed inside a pawn of level through ply 3 of 105. The position broke open on ply 4. 27 drops (Red 14, Black 13). Red mates with the drop C@c7.',
    moves:
      'f2f3 a7a6 e1e5 d7d6 e5f5 d8f6 f1g3 c8c6 b2b3 b8d7 g1e1 a8c8 a1b2 g7g6 e1e7 c8d8 f5f4 d6d5 g3f5 c6b6 f5d6 b6b2 c1b2 T@c6 d6f7 e8f7 P@e8 d8e8 e7e8 f8e8 R@c8 f6d8 c8c6 N@e6 C@c8 d8b6 c8g8 P@e4 c6c8 e8e7 g8f8 d7c5 f4f5 R@e5 T@f2 c5d7 T@d3 d5d4 d3d4 e4d4 P@d6 T@d8 c8d8 b6d8 d6d7 e7e8 d7d8 e6d8 f8d8 R@c8 N@d6 P@d7 d6f7 e5f5 d8d4 e8f8 f7d8 C@c2 d4f4 f8e8 N@g7 f5f7 P@f8 e8e7 d8f7 e7f7 R@f5 f7g7 f4g4 N@g5 f5g5 c2f2 g5c5 g7f7 c5c8 T@g7 T@e1 g6g5 g4g7 N@c4 e1f2 c4d2 T@c2 d2f3 g7d7 P@a1 b2a1 P@c1 c2c1 f3d2 c1d2 g5g4 N@d5 g4g3 C@c7',
  },
  {
    seed: 1100008,
    plies: 112,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -167. The engine eval stayed inside a pawn of level through ply 23 of 112. The position broke open on ply 24. 27 drops (Red 13, Black 14). Black mates with a3–a2.',
    moves:
      'e1e5 g7g6 e5e7 d7d6 d2d3 c8c5 f1d2 f7f6 b2b3 g8f7 g1e1 b7b6 a1b2 d6d5 b3b4 b8a6 b2b3 a8c8 c1b2 a6b4 b3b4 c5c2 d2f3 c2a2 N@d7 P@e2 e7e4 P@e7 e1g1 e2f2 b1a1 f2g2 g1e1 P@e2 a1a2 e2e1 f3e1 P@c2 b2c3 R@a5 C@a3 a5b5 P@b3 b5b4 b3b4 c8c3 e4e3 c3c4 R@b3 T@d6 a3a4 c4c8 d7b6 d8b6 b4b5 c8c4 P@b4 c4c8 e1g2 c2d2 e3f3 N@c1 b3b1 c1d3 P@g7 d2c2 b1b3 d3c1 a2a3 c2d2 g7f7 e8f7 b3e3 d2d1 g2f4 A@g7 T@b2 P@c4 f4d3 c1d3 f3d3 c4b4 d3d6 b4a4 a3a2 N@c2 a2a1 c2e3 T@b1 P@c2 N@d3 c2b2 b1b2 C@f1 P@b1 R@a3 b2a3 a4a3 R@f2 d1c1 d3c1 e3c2 f2c2 c8c2 P@e8 f7e8 d6d8 b6d8 N@c3 P@a2 c3a2 a3a2',
  },
  {
    seed: 1100005,
    plies: 102,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 0. The engine eval stayed inside a pawn of level through ply 4 of 102. The position broke open on ply 5. 25 drops (Red 12, Black 13). Black mates with the drop R@a1.',
    moves:
      'e1e6 c8c6 d1f3 c6c7 d2d3 b7b6 f1d2 b8c6 g1e1 f7f6 b2b3 g8f7 e6e3 b6b5 f3d1 b5b4 e3f3 a8b8 a1b2 b4b3 d2b3 P@c2 b2c2 c7c2 e1e2 c6d4 P@c8 b8b6 d3d4 b6b3 c1b2 b3f3 f2f3 C@b6 P@b5 c2a2 e2e3 b6d6 g2g3 T@c7 c8d8 c7d8 N@c4 d6d1 e3e1 d1d2 c4d2 a2d2 R@b8 N@c8 C@a8 P@c2 b8b7 f7e7 b5a5 P@a2 a8d8 e7d8 T@b3 a2b2 b3b2 d2b2 b7b3 N@c6 d4d5 c6a5 E@a4 P@c1 b1a1 C@b1 e1e8 d8e8 b3c3 b2b8 c3c2 b1b3 c2c1 c8b6 P@a2 b6d5 P@b1 b3g3 P@c8 R@c4 c1g1 P@b2 b1b2 P@b1 g1b1 b8b1 P@d8 e8d8 c8d8 b1f1 d8e8 f8e8 P@d8 e8e7 a2a3 g3g1 a1a2 R@a1',
  },
  {
    seed: 1100000,
    plies: 131,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 123. The engine eval stayed inside a pawn of level through ply 16 of 131. The position broke open on ply 17. 25 drops (Red 13, Black 12). Red mates with f7–f8.',
    moves:
      'e1e7 c8c4 e7e2 c4e4 f2f3 b7b6 b2b3 e4g4 f1g3 f7f6 f3f4 g8f7 g1f1 f7g6 e2e4 g4e4 g3e4 C@b5 a1b2 b8c6 f1e1 g6f7 e4c3 a8c8 e1e4 a7a6 c3b5 b6b5 C@e1 c8b8 e4c4 b8b6 C@d3 f7e7 c4e4 e7d6 b2c3 e8f7 c1b2 a6a5 a2a3 b6b8 d3f3 b8c8 g2g3 c6b8 e1f1 c8c5 f3f6 d8f6 f1f6 f7g6 f6f5 N@e7 P@e6 C@e8 b3b4 b8c6 b4b5 c5b5 e6e7 d6e7 e4c4 P@a2 d1b3 P@b4 c3b4 c6b4 N@f6 b5f5 f4f5 g6f7 c4b4 T@e6 R@f1 e8d8 E@d4 d8e8 P@e5 e6d6 b4c4 C@b7 c4c8 b7b2 P@a1 b2c2 c8c2 e8b8 N@b6 b8b3 a1a2 E@d8 P@c7 f8g8 c7d7 e7f8 C@c8 b3e3 b6c4 d6c6 c4a5 c6b5 P@e7 A@g6 f6d5 e3e2 d2d3 e2e3 d4b2 b5a5 d5e3 N@b6 c8b8 b6d7 e7d7 P@b3 f5f6 b3b2 c2b2 f7e8 d7d8 e8f7 f6f7 g6f7 f1f7 P@c8 d8c8 f8e8 P@f8 e8f8 f7f8',
  },
  {
    seed: 1100018,
    plies: 95,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 0. The engine eval stayed inside a pawn of level through ply 3 of 95. The position broke open on ply 4. 23 drops (Red 13, Black 10). Red mates with e7–f7.',
    moves:
      'e1e7 d8b6 e7e1 b6d8 e1e4 b7b6 e4f4 d8f6 f2f3 b8c6 f1e3 c6e7 b2b3 c8d8 e3c4 a8c8 c4b6 c8c6 g1e1 e7d5 P@e7 d5e7 e1e7 c6b6 e7d7 N@c3 P@c2 d8b8 a1b2 c3e2 d7a7 b6b3 N@d7 P@e7 d7b8 b3b8 a7b7 b8c8 P@b8 c8d8 C@a8 N@c6 a8d8 c6d8 b7e7 e2f4 f3f4 C@b5 R@b4 C@d6 e7e1 d6d1 e1d1 b5b2 P@e7 E@c6 c1b2 T@d6 d1e1 P@e5 b8c8 d6e7 c8d8 e7d6 d8e8 c6e8 C@b8 f6d8 b4d4 d6e6 N@c7 P@d7 C@c8 f7f6 b8d8 f8f7 N@g5 g7g6 g5e6 d7d6 d8g8 P@d5 c7d5 e5e4 e1e4 d6d5 c8c7 d5d4 P@e7 f7f8 P@f7 f8g8 f7g7 g8f8 e7f7',
  },
  {
    seed: 1100006,
    plies: 96,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 346. The engine eval stayed inside a pawn of level through ply 41 of 96. The position broke open on ply 42. 23 drops (Red 11, Black 12). Black mates with the drop P@b1.',
    moves:
      'f2f3 d8f6 e1e5 c8c5 f1e3 b7b6 g1e1 b8c6 e3c4 a8c8 d1b3 g7g6 g2g3 g8g7 e5f5 g6g5 d2d3 g7g6 f3f4 c8b8 d3d4 b6b5 f5b5 b8b5 d4d5 c5c1 b1c1 f6d8 C@c8 A@e7 d5c5 b5b4 c5c6 C@c5 c4e5 c5c8 P@c7 g6f6 c7c8 b4f4 C@b8 d8b6 c6b6 C@f1 b3d1 f6e5 e1f1 f4c4 E@c2 N@d3 C@d2 P@e2 N@g6 f8g8 g6e5 d3e5 T@e3 c4c8 b6b7 e2d2 e3d2 P@d3 d2d3 e5d3 P@d2 T@c6 c1b1 c6b7 d2d3 b7b8 N@b4 C@b6 P@c1 C@b5 f1f4 N@e2 b2b3 e2f4 a1b2 c8c4 g3g4 f4d3 g4g5 d3b2 g5g6 b5b3 b1b2 b3d3 P@b3 d3d2 c2e4 P@c2 b2b1 c2c1 b1a1 P@b1',
  },
  {
    seed: 1100017,
    plies: 97,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 188. The engine eval stayed inside a pawn of level through ply 7 of 97. The position broke open on ply 8. 23 drops (Red 12, Black 11). Red mates with the drop P@g6.',
    moves:
      'e1e4 a7a6 d1b3 c8c5 e4a4 c5a5 f2f3 b7b6 a4f4 d8f6 f1e3 b6b5 e3c4 b8c6 g1e1 b5b4 f4b4 c6b4 c4b6 a8d8 P@c8 d8c8 b6c8 b4d5 R@c5 C@b5 c8b6 a5c5 b6d7 P@e7 d7c5 R@d8 P@d4 g7g6 d4d5 g8g7 e1e7 f8g8 d5d6 b5a5 d6d7 d8c8 C@g3 a5a1 b1a1 T@f8 e7e5 c8c5 e5c5 N@e4 C@g4 e4g3 g2g3 a6a5 N@e6 C@e3 e6f8 e3g3 c5e5 P@c2 R@e1 c2d2 e5e8 d2c2 d7e7 c2b2 c1b2 P@g5 g4f4 P@f5 e8c8 f5f4 f3f4 g5g4 f8d7 C@f8 f4f5 a5a4 c8f8 g7f8 e7e8 g3g1 e1g1 R@e7 e8f8 g8f8 C@c8 f8g8 P@f8 g8g7 C@g5 g6g5 P@g6 g7g6 f5g5 g6g7 P@g6',
  },
  {
    seed: 1100015,
    plies: 76,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 0. The engine eval stayed inside a pawn of level through ply 3 of 76. The position broke open on ply 4. 20 drops (Red 8, Black 12). Black mates with the drop P@a2.',
    moves:
      'e1e5 c8c5 e5e1 c5d5 d1b3 d5g5 b3d1 b7b6 b2b3 b8c6 f2f3 g5g1 e1g1 c6d4 a1b2 a8c8 d2d3 d4e6 a2a3 c8c5 f1e3 R@d2 C@f4 e6f4 f3f4 C@e1 d3d4 d2d3 N@c2 c5c2 b2c2 d3e3 R@f1 e3e2 c2b2 e2b2 b1b2 e1c1 d1f3 c1g1 f1g1 N@e2 g1d1 C@f2 R@d2 f2d2 d1d2 e2f4 C@f1 N@d3 b2a2 R@b1 f1f4 d3f4 N@a5 f4d3 C@b2 d3b2 d2c2 C@a6 g2g3 T@b5 c2b2 b1b2 a2b2 R@e2 N@c2 b5a5 b3b4 C@d2 b2b1 P@b2 b1a1 a6a3 g3g4 P@a2',
  },
  {
    seed: 1100016,
    plies: 88,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -113. The engine eval stayed inside a pawn of level through ply 6 of 88. The position broke open on ply 7. 20 drops (Red 8, Black 12). Black mates with the drop P@c1.',
    moves:
      'e1e6 c8c4 d2d3 b7b6 f1d2 c4b4 d1b3 b8c6 e6e4 f7f6 d3d4 b4e4 d2e4 c6b4 g1d1 a8c8 C@f3 e8f7 f3g3 a7a6 a2a3 f7g6 g3g4 b4d3 d4d5 c8c2 f2f3 g8f7 f3f4 C@e1 d1e1 d3e1 d5c5 R@c8 C@a2 c2c5 e4c5 c8c5 a2a6 e1d3 P@d2 P@c2 a1a2 d3f4 b1a1 c2c1 a6a4 f4g2 g4g3 P@b1 a2b1 c1b1 a1b1 N@e4 g3d3 e4d2 P@c2 c5c2 R@b8 c2c8 b1a1 P@b1 a1a2 c8b8 P@a1 g2e1 d3d4 P@c2 a4b4 c2b2 b4b2 P@c2 P@e8 f7e8 d4f4 e8f7 f4b4 c2b2 b4b2 C@a5 P@a4 R@c2 a4a5 c2b2 a2b2 P@c2 b2b1 P@c1',
  },
  {
    seed: 1100003,
    plies: 76,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at 0. The engine eval stayed inside a pawn of level through ply 3 of 76. The position broke open on ply 4. 18 drops (Red 8, Black 10). Black mates with the drop P@b1.',
    moves:
      'e1e4 c8c5 d1f3 c5d5 b2b3 b7b6 e4a4 b8a6 d2d3 b6b5 a4f4 d8f6 d3d4 d5g5 f4g4 b5b4 f1d2 g5b5 a1b2 b4b3 d2b3 a6c5 g4g3 P@c2 P@c4 c5e4 c4c5 b5b2 c1b2 e4g3 g2g3 a8b8 d4d5 C@b4 N@d1 b4b2 d1b2 b8b3 C@c8 T@d8 c8c2 N@c4 C@e2 c4b2 e2d2 b3b4 d2b2 N@d3 c2c3 d3f2 N@a3 f2d3 P@d2 b4b3 d2d3 b3c3 b2b6 c3b3 b1a1 C@a6 N@b5 P@b4 g1b1 b3b1 a1b1 R@b3 b1c1 a6a2 b6b4 b3b4 P@b1 C@a1 b1b2 b4b2 d3d4 P@b1',
  },
  {
    seed: 1100004,
    plies: 86,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -132. The engine eval stayed inside a pawn of level through ply 11 of 86. The position broke open on ply 12. 17 drops (Red 10, Black 7). Black mates with b2–b1.',
    moves:
      'd1b3 c8c6 e1d1 a7a6 f2f3 a6a5 f3f4 a5a4 f1e3 a8a5 f4f5 a5c5 d1f1 c5c3 f5g5 d8f6 e3f5 c6b6 f5d4 d7d6 g5f5 d6d5 d4b5 c3c5 f5f6 c5b5 f6e6 N@f4 E@d1 d5d4 e6d6 b5c5 g2g3 f7f6 d6e6 g8f7 e6f6 f7f6 f1f6 P@c2 d1f3 d4d3 d2d3 f4d3 T@d1 P@c3 P@a5 c5a5 d1c2 c3c2 P@d2 c2d2 f6d6 P@c2 g1f1 a5c5 d6d2 c2d2 P@b5 c5b5 P@a6 b6b3 b2b3 d2c2 a1b2 c2b2 c1b2 P@c2 f3d1 P@f2 b1a1 c2b2 f1f2 d3f2 C@f1 f2d1 P@f6 e8f7 f6f7 f8f7 A@b1 C@e1 P@c1 d1c3 f1f6 b2b1',
  },
];

async function main(): Promise<void> {
  const args = parseArgs();
  const base = typeof args.base === 'string' ? args.base : 'http://127.0.0.1:3001';
  const email = typeof args.email === 'string' ? args.email : null;
  const visibility = typeof args.visibility === 'string' ? args.visibility : 'public';

  const chapters = GAMES.map((game, index) => chapterPayload(game, index + 1));
  console.log(`${chapters.length} chapters prepared (all mainlines Fortress-kernel verified)`);

  const emitPath = typeof args.emit === 'string' ? args.emit : null;
  if (emitPath) {
    const [firstChapter, ...restChapters] = chapters;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      emitPath,
      JSON.stringify({
        study: {
          name: STUDY_NAME,
          description: STUDY_DESCRIPTION,
          visibility,
          chapter: firstChapter,
        },
        chapters: restChapters,
      }),
    );
    console.log(`wrote ${chapters.length} chapter payloads to ${emitPath}`);
    return;
  }

  const suppliedCookie = process.env.MISTBOARD_SESSION_COOKIE?.trim();
  if (!suppliedCookie && !email) {
    console.error('--email required (dev server), or set MISTBOARD_SESSION_COOKIE');
    process.exitCode = 1;
    return;
  }

  let cookie = suppliedCookie ?? '';
  const post = async (path: string, body: unknown): Promise<Response> => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0] ?? cookie;
    return response;
  };

  if (!suppliedCookie) {
    const start = await post('/api/auth/email/start', { email });
    if (!start.ok) throw new Error(`auth start failed: ${start.status}`);
    const started = (await start.json()) as { loginId?: string; devCode?: string };
    if (!started.loginId || !started.devCode) {
      throw new Error('no dev code returned; use MISTBOARD_SESSION_COOKIE against a real server');
    }
    const confirm = await post('/api/auth/email/confirm', {
      loginId: started.loginId,
      code: started.devCode,
    });
    if (!confirm.ok) throw new Error(`auth confirm failed: ${confirm.status}`);
    console.log(`signed in as ${email} at ${base}`);
  }

  const get = async (path: string): Promise<Response> =>
    fetch(`${base}${path}`, { headers: { ...(cookie ? { cookie } : {}) } });
  const del = async (path: string): Promise<Response> =>
    fetch(`${base}${path}`, { method: 'DELETE', headers: { ...(cookie ? { cookie } : {}) } });
  const patch = async (path: string, body: unknown): Promise<Response> =>
    fetch(`${base}${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  // --in-place rewrites the chapters of the EXISTING study instead of creating
  // or replacing one. This is the mode to use once a study is published and
  // linked: --replace deletes the study and the new one gets a NEW id, which
  // 404s the /study/<id> link the rules article hardcodes, and every chapter
  // URL with it. PATCHing each chapter keeps the study id, the chapter ids, and
  // anyone's bookmark.
  if (args['in-place'] === true) {
    const lookup = await get(`/api/studies/mine?q=${encodeURIComponent(STUDY_NAME)}`);
    if (!lookup.ok) throw new Error(`study lookup failed: ${lookup.status}`);
    const studies = ((await lookup.json()) as { studies?: Array<{ id: string; name: string }> })
      .studies;
    const target = (studies ?? []).find((study) => study.name === STUDY_NAME);
    if (!target) throw new Error(`no existing study named "${STUDY_NAME}" to edit in place`);

    const detailResponse = await get(`/api/studies/${target.id}`);
    if (!detailResponse.ok) throw new Error(`study fetch failed: ${detailResponse.status}`);
    const existing = (await detailResponse.json()) as {
      chapters: Array<{ id: string; root: { version?: number } }>;
    };
    console.log(
      `editing ${target.id} in place: ${existing.chapters.length} chapters on the server`,
    );

    for (const [index, chapter] of chapters.entries()) {
      const current = existing.chapters[index];
      if (current) {
        const response = await patch(`/api/studies/${target.id}/chapters/${current.id}`, {
          name: chapter.name,
          root: chapter.root,
          ...(typeof current.root?.version === 'number'
            ? { baseVersion: current.root.version }
            : {}),
        });
        if (!response.ok) {
          throw new Error(
            `chapter ${index + 1} patch failed: ${response.status} ${await response.text()}`,
          );
        }
      } else {
        const response = await post(`/api/studies/${target.id}/chapters`, chapter);
        if (!response.ok) {
          throw new Error(
            `chapter ${index + 1} add failed: ${response.status} ${await response.text()}`,
          );
        }
      }
    }
    // More chapters on the server than games: drop the tail rather than leave
    // stale ones behind the new set.
    for (const stale of existing.chapters.slice(chapters.length)) {
      const response = await del(`/api/studies/${target.id}/chapters/${stale.id}`);
      if (!response.ok) throw new Error(`stale chapter delete failed: ${response.status}`);
    }
    console.log(
      `done: ${chapters.length} chapters rewritten at ${base.replace(':3001', ':3000')}/study/${target.id}`,
    );
    return;
  }

  // Do not create a second copy on a re-run (see seed-study-idempotency.ts).
  const decision = await resolveExistingStudy({ get, del }, STUDY_NAME, {
    replace: args.replace === true,
  });
  if (decision.action === 'skip') return;

  const [first, ...rest] = chapters;
  const createResponse = await post('/api/studies', {
    name: STUDY_NAME,
    description: STUDY_DESCRIPTION,
    visibility,
    chapter: first,
  });
  if (!createResponse.ok) {
    throw new Error(`create study failed: ${createResponse.status} ${await createResponse.text()}`);
  }
  const created = (await createResponse.json()) as { study: { id: string } };
  console.log(`created study ${created.study.id} (${visibility})`);

  for (const [index, chapter] of rest.entries()) {
    const response = await post(`/api/studies/${created.study.id}/chapters`, chapter);
    if (!response.ok) {
      throw new Error(
        `chapter ${index + 2} (${chapter.name}) failed: ${response.status} ${await response.text()}`,
      );
    }
  }
  console.log(
    `done: ${chapters.length} chapters at ${base.replace(':3001', ':3000')}/study/${created.study.id}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
