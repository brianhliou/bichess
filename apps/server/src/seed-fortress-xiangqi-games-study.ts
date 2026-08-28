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
    seed: 2009,
    plies: 87,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -100. The engine eval stayed inside a pawn of level through ply 51 of 87. The position broke open on ply 52. 20 drops (Red 11, Black 9). Red mates with the drop T@d8.',
    moves:
      'b2b3 f7f6 f2f3 c8c5 c1b2 b7c7 f1e3 g8f7 e3c4 c5f5 g2f2 b8c6 a2a3 a7b7 g1g4 f6g6 a1a2 f7f6 g4e4 f5f2 e1e8 a8a6 e4e2 f2f1 e2e1 f1f2 e8e6 a6a7 e6e4 P@d4 d2e2 f2g2 e4f4 f6e5 f4g4 e5f5 g4g3 d4c4 e1g1 g2b2 a2b2 A@f7 g3g7 f5f6 g7d7 c7d7 C@c8 d8b6 P@d8 f7e8 P@e6 f6e6 g1g6 N@f6 d8e8 f8f7 c8c4 c6d4 P@g7 f7e7 g6f6 C@f1 A@c1 f1f6 N@c8 e7e8 c8a7 P@f8 R@e4 R@e5 e4e5 e6e5 P@f7 R@d8 f7f8 e8e7 R@e3 P@a1 b2a1 d8f8 e3e5 P@e6 c4c7 b7c7 P@f7 f8f7 T@d8',
  },
  {
    seed: 1004,
    plies: 124,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'The advantage changed hands: Red peaked at +356 on ply 85, Black at -238 on ply 95. The engine eval stayed inside a pawn of level through ply 94 of 124. The position broke open on ply 96. 23 drops (Red 11, Black 12). Black mates with c2b2.',
    moves:
      'f2f3 b7b6 e1e4 b8c6 e4g4 c6e5 g4f4 f7e7 f1e3 e5g6 f4d4 c8c6 f3f4 e7e6 g1f1 a8c8 f4e4 g8f7 b2b3 b6a6 d4a4 a7b7 a1b2 e6f6 a4b4 a6a5 b2c3 c6e6 c3d4 a5a4 b4c4 e6e3 f1e1 f6e6 c4c2 N@f5 d4e3 f5e3 e1e3 c8c5 g2f2 c5d5 f2e2 b7c7 c1b2 f8g8 c2c1 d5g5 e3d3 T@d5 d3e3 d5c6 e3f3 c6c5 N@c3 c5b6 a2a3 a4a3 b3a3 P@f6 C@g3 g5f5 f3f5 f6f5 g3d3 d8f6 d3f3 f6d8 f3f1 R@a6 e2e3 e6f6 P@e5 a6a8 R@f3 f5e5 e4e5 b6a5 P@g5 a5b4 a3b3 b4a4 b3a3 a4a3 b2a3 a8a3 T@b2 a3a7 g5g6 g7g6 e5f5 P@a3 f1g1 A@g7 f5f6 P@a2 d2c2 P@b3 f3f2 b3b2 c2b2 a2b2 f2b2 P@a2 P@c2 a2b2 c2b2 R@b4 P@c2 a3b3 P@a2 a7a2 P@f8 f7f8 N@e7 f8e7 b2a2 P@b2 a2b2 b3b2 c2b2 T@c2 b1a1 c2b2',
  },
  {
    seed: 2006,
    plies: 106,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'The advantage changed hands: Red peaked at +107 on ply 9, Black at -387 on ply 46. The engine eval stayed inside a pawn of level through ply 45 of 106. The position broke open on ply 47. 29 drops (Red 14, Black 15). Black mates with the drop T@a4.',
    moves:
      'f2f3 b7b6 f1e3 b6b5 g2f2 b5c5 f3f4 b8c6 f2e2 c8b8 d1b3 c5b5 f4e4 f7f6 e1f1 e8f7 g1g5 b5b4 g5b5 b4b3 b2b3 c6a5 P@c8 b8b7 a1b2 a5b3 c8d8 b3d2 e2d2 a8d8 N@c5 b7b2 c1b2 T@c6 b5a5 E@c7 a5a7 c6c5 P@e6 N@d5 C@f2 P@e1 e6f6 e1f1 f6f7 f8f7 e4d4 C@b3 b2c1 b3b8 A@c2 c5d4 e3d5 d4d5 N@f4 P@f3 f4e6 f7e7 f2e2 e7e6 P@e5 e6f6 e5d5 P@b2 b1a1 P@b1 c2b1 b2b1 a1b1 N@c3 T@c2 c3e2 b1a1 N@b4 c2b1 b8b1 d5d6 b1b3 E@b1 b3c3 P@b3 P@c2 b3c3 d7d6 d2e2 c2c1 C@b7 C@d7 b7b6 b4c6 N@e4 f6f7 a2b2 d7a7 e4d6 f7f8 P@f7 g8f7 P@g8 f8g8 d6f7 P@a2 a1a2 P@a3 a2a3 T@a4',
  },
  {
    seed: 2004,
    plies: 129,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at +327. The engine eval stayed inside a pawn of level through ply 54 of 129. The position broke open on ply 60. 32 drops (Red 18, Black 14). Red mates with the drop T@f7.',
    moves:
      'b2b3 f7f6 e1e4 b7c7 e4f4 f6e6 c1b2 g7g6 f2f3 e6e5 g2f2 g8g7 f4a4 a7b7 a4g4 g7f7 g4f4 f7g7 f2e2 a8a5 f1e3 e5e4 f4g4 a5g5 e3c2 e8f7 e2e3 e4e3 f3e3 P@f4 g4g2 b7b6 c2d4 b8a6 d4e2 g7f6 P@g3 g5a5 e3d3 f4e4 g2f2 f6f5 g3g4 f8g8 f2g2 g8f8 e2g3 c8a8 g1f1 f5e5 g3e4 e5e4 g2g6 a5f5 f1f5 e4f5 g6a6 b6a6 R@f1 f5e6 P@e5 e6d6 P@g7 N@f3 f1f3 C@g1 f3f1 g1g7 N@e6 d7e7 e6g7 d6e5 f1e1 e5f6 C@f3 R@f2 N@d5 P@e2 e1e2 f2f3 d5f6 f3f6 e2e7 C@f1 P@e1 f1g1 P@f5 P@d7 f5f6 d7e7 R@c8 R@e8 c8a8 N@e4 a8a6 e4d2 P@c2 d2f3 C@f4 f8g8 g7f5 P@g7 T@f2 e7d7 f6f7 g7f7 f2g1 P@f6 C@g3 f7g7 f4f6 e8e1 f6f3 e1d1 A@c1 E@f6 P@f7 P@g6 g4f4 d1g1 f7g7 g8f8 P@f7 f8e8 a6e6 T@e7 f7e7 d7e7 T@f7',
  },
  {
    seed: 1006,
    plies: 94,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -369. The engine eval stayed inside a pawn of level through ply 55 of 94. The position broke open on ply 64. 19 drops (Red 10, Black 9). Black mates with c1b2.',
    moves:
      'f2f3 f7f6 e1e4 b7b6 f1e3 g8f7 g2f2 b8c6 a2a3 f8g8 e4a4 a7b7 a1a2 a8a5 g1g4 f7e6 a3b3 c6e5 g4d4 e5c6 d4f4 f6f5 f4e4 e6e5 e4c4 c8c4 e3c4 a5a4 C@g4 R@g6 g4a4 C@d4 a4d4 e5d4 C@c8 b6b5 d2c2 c6e5 c4d2 C@d6 R@e1 g8f8 f3g3 g6g3 d2f3 d4d5 f3e5 f5e5 N@c4 d5c4 e1e5 N@f6 e5e6 N@d5 e6d6 d7d6 C@f5 f6g8 P@f6 g7f7 f6e6 f7g7 e6d6 R@a8 P@f6 g7f7 f6f7 f8f7 P@c3 c4d4 c8e8 a8a5 b3a3 g3g1 a2b3 g1d1 a3a4 a5a6 f5b5 P@b4 c3c4 b4b3 P@g7 f7g7 A@a2 b3b2 c2b2 d1c1 b1c1 P@d1 c1b1 T@c1 b1a1 c1b2',
  },
  {
    seed: 1007,
    plies: 69,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'The advantage changed hands: Red peaked at +425 on ply 32, Black at -223 on ply 15. The engine eval stayed inside a pawn of level through ply 30 of 69. The position broke open on ply 45. 12 drops (Red 7, Black 5). Red mates with the drop T@f6.',
    moves:
      'f2e2 b7c7 f1g3 b8c6 g3e4 f7f6 g2f2 a8b8 d2d3 a7a6 e4f6 d8f6 e2d2 g8f7 e1f1 c8d8 f2e2 N@f5 g1g4 b8b5 P@c8 d8d3 d2d3 g7g6 g4f4 g6g5 f4e4 P@e1 f1f6 f7f6 C@f4 f6f7 c8d8 C@b4 f4b4 d7e7 C@f2 f8g8 f2g2 g8f8 d1b3 c6b4 g2f2 f8g8 f2f7 b5c5 e4e7 c5c1 b1c1 b4d3 e2d2 C@g1 c1c2 g1g2 d2d3 P@e2 c2c3 g2g3 N@f3 f5d6 e7e8 d6e8 P@f8 g8f8 d8e8 f8f7 R@f8 f7g7 T@f6',
  },
  {
    seed: 1000,
    plies: 81,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at +346. The engine eval stayed inside a pawn of level through ply 48 of 81. The position broke open on ply 52. 13 drops (Red 6, Black 7). Red mates with the drop T@e7.',
    moves:
      'b2b3 f7f6 a1b2 g8f7 f2f3 f6g6 g2f2 c8c5 g1g4 b7c7 f2g2 b8c6 g4c4 c5f5 f1e3 f5b5 c4c5 b5b2 c1b2 f7f6 e3d5 a7b7 d5f6 d8f6 b3a3 e8f7 C@g4 N@e4 c5c2 e4g5 c2c3 c6e5 g4f4 e5f3 d1f3 T@e5 e1f1 g5e4 c3e3 P@g4 f4f5 g4f4 f3d1 g6g5 f5f7 g7f7 f1g1 f4g4 N@f2 C@e6 g2g3 g4g3 f2e4 e5f4 e3b3 g3g2 N@c5 e6e5 g1g5 f4g5 e4g5 d7e7 g5f7 C@e1 A@c1 e7f7 b3e3 P@g7 e3e1 c7d7 C@g5 N@g6 c5d7 f8g8 e1e5 f7e7 e5e7 g8f8 e7g7 f8e8 T@e7',
  },
  {
    seed: 2008,
    plies: 134,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'The advantage changed hands: Red peaked at +100 on ply 71, Black at -361 on ply 94. The engine eval stayed inside a pawn of level through ply 90 of 134. The position broke open on ply 96. 17 drops (Red 8, Black 9). Black mates with c1b1.',
    moves:
      'f2e2 f7f6 f1e3 b7c7 g2f2 b8a6 g1g5 e8f7 e1f1 g7g6 g5b5 c8b8 f1g1 a7b7 b5a5 b7a7 d1b3 c7c6 a5d5 c6d6 d5b5 b8b7 b2c2 d6c6 a1b2 a6c5 b5b4 c6b6 b4c4 b6c6 g1d1 d7d6 c4b4 d8b6 b4c4 a7a6 b2c3 b6d8 c1b2 c5e6 c4g4 a6b6 a2a3 a8a5 g4e4 b7e7 e4g4 a5a8 d1f1 e7c7 c3d3 g8g7 f1g1 a8a5 g1d1 c7a7 d1f1 g6g5 g4g3 g7g6 g3f3 f6f5 f2g2 a7a3 b2a3 a5a3 e3f5 g5f5 f1f5 d8f6 C@b8 f8g8 f3g3 P@a1 b1b2 N@g5 f5f7 a3a8 b8b7 a8a5 d3c4 g6f7 c4b4 a5e5 P@d7 f7g6 P@g4 f6d8 g2f2 b6b5 b4a3 A@f8 b7a7 b5a5 d7d8 C@a6 E@a4 a5a4 a3a4 E@a5 a4b4 e5e4 b4a5 e4g4 a5a6 g4g3 P@c1 g5e4 A@a2 R@d7 a7a8 d7d8 a8a7 g3g1 E@g2 d8a8 C@g4 e4g5 g4b4 g1c1 a6b7 a8a7 b7a7 P@a4 g2e4 P@a3 b4b8 e6d8 b8b4 a3a2 b2a2 P@a3 a2b2 c1b1',
  },
  {
    seed: 1001,
    plies: 56,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'The advantage changed hands: Red peaked at +266 on ply 11, Black at -356 on ply 29. The engine eval stayed inside a pawn of level through ply 25 of 56. The position broke open on ply 30. 11 drops (Red 5, Black 6). Black mates with the drop N@b4.',
    moves:
      'f2e2 f7f6 f1g3 g8f7 e1f1 b7b6 g3e4 b8c6 e4g5 c8b8 b2b3 d7e7 g5e4 c6e5 f1f7 b6c6 a2b2 e8f7 g2f2 f6g6 T@d5 C@e8 b3b4 a7b7 b2b3 a8a1 b1a1 b8a8 d5d4 T@a3 R@a2 a3a2 a1a2 e5d7 a2b2 d7c5 e4d6 c6d6 T@b1 c5b3 d4c3 P@a3 b2c2 a8c8 b4c4 R@a1 b1b2 a1a2 b2a2 a3a2 R@b1 T@a1 b1a1 b3a1 T@b1 N@b4',
  },
  {
    seed: 2002,
    plies: 106,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -393. The engine eval stayed inside a pawn of level through ply 27 of 106. The position broke open on ply 60. 18 drops (Red 8, Black 10). Black mates with the drop P@b1.',
    moves:
      'e1e4 b7b6 f2e2 b8c6 e4a4 a7b7 a4a3 a8a5 a3f3 d8f6 f1e3 c8a8 g1f1 g7g6 f3g3 a5c5 g3g8 f8g8 T@a4 C@a6 f1f4 g8f8 a2a3 b6b5 b2a2 a6b6 d1b3 a8b8 a1b2 b7a7 f4e4 b5a5 a4b4 b8b4 e4b4 c5c1 b2c1 c6b4 R@c4 b4c6 b1a1 T@b5 c4e4 f7g7 C@f2 e8f7 b3d1 R@f3 e3c4 b6b7 c4b2 b5c5 d2d3 a5b5 e2d2 f3f5 e4e3 b7b8 e3g3 b8c8 d1f3 f5d5 f3d1 c5b4 a3a4 b4c5 d2c2 b5b4 a4b4 c5b4 c2c3 P@a3 a2a3 b4a3 P@a2 a3a2 f2a2 P@a3 T@b1 c8a8 P@a4 a7b7 b2c4 a3a2 b1a2 C@e1 c4a3 e1c1 P@b2 d5b5 c3b3 T@d2 d3c3 c1c2 a2b1 P@c1 b1c1 d2c1 P@b1 a8a3 b2c2 c1b1 a1b1 T@a2 b1c1 P@b1',
  },
  {
    seed: 1002,
    plies: 80,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'The advantage changed hands: Red peaked at +84 on ply 5, Black at -396 on ply 24. The engine eval stayed inside a pawn of level through ply 21 of 80. The position broke open on ply 25. 17 drops (Red 8, Black 9). Black mates with the drop R@a2.',
    moves:
      'b2b3 b7c7 e1e4 d8f6 e4f4 c8d8 a2a3 a7a6 f2e2 b8c6 e2e3 a6a5 e3e4 c6e7 f4g4 d8b8 c1b2 e7d5 f1g3 d5b6 g4g8 f8g8 g1e1 C@c8 a1a2 b6c4 d2c2 c4a3 e4f4 a3b5 b1a1 a5a4 T@c1 a4b4 b3a3 P@b3 e1e3 b3a3 b2a3 P@b3 P@b2 b3b2 a2b2 P@b3 b2a2 b4a4 a3b2 a4a3 b2a3 b3a3 e3a3 b5a3 P@b3 R@e3 P@c3 a3b5 P@a3 b8b3 a2b3 b5a3 g2f2 P@b1 c1b1 a3b1 C@a2 b1c3 P@b1 a8a2 b3a2 c3a2 R@a4 T@b3 g3e2 c8c2 a4a2 b3a2 a1a2 T@b3 a2a1 R@a2',
  },
  {
    seed: 1009,
    plies: 68,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'The advantage changed hands: Red peaked at +89 on ply 7, Black at -382 on ply 39. The engine eval stayed inside a pawn of level through ply 24 of 68. The position broke open on ply 40. 12 drops (Red 6, Black 6). Black mates with c2b2.',
    moves:
      'f2f3 b7c7 e1e4 d8f6 f1e3 b8a6 d1b3 a7b7 g2f2 d7d6 e4c4 a6c5 e3f5 c7c6 c4g4 b7c7 g1e1 c5e6 b2c2 a8a5 g4g8 c8b8 c1b2 a5f5 T@c8 b8a8 c8b8 f5a5 b8c7 f8g8 c7b7 a8a2 P@a3 a2c2 d2c2 a5g5 f3e3 g5f5 f2f3 P@d8 c2d2 N@c4 C@c3 e6d4 a1a2 C@a5 b1a1 c4a3 c3a3 a5a2 a1a2 P@a4 C@g4 f5g5 g4a4 T@b4 N@c1 d4c2 P@f8 g8f8 d2c2 b4b3 a2a1 P@b1 a1b1 b3c2 b1a1 c2b2',
  },
  {
    seed: 2007,
    plies: 65,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at +365. The engine eval stayed inside a pawn of level through ply 22 of 65. The position broke open on ply 29. 14 drops (Red 8, Black 6). Red mates with the drop T@g5.',
    moves:
      'f2e2 b7b6 d1b3 b8c6 f1e3 f7f6 g2f2 d7e7 e3d5 e7d7 d5f6 d8f6 P@g6 g7g6 g1g6 N@e5 g6f6 e8f7 e1g1 a7b7 f2g2 P@g6 f6f4 a8a7 f4f5 g8g7 g2f2 g6f6 f5g5 f6g6 g5e5 c6e5 g1g7 f8g8 N@e6 f7e6 g7b7 N@g7 b7b8 g7e8 P@d8 R@f7 d8c8 a7a8 C@d8 f7f8 b8b7 e6f7 d8a8 e5c4 c8d8 c4d2 e2d2 P@c7 d8e8 c7b7 R@g1 C@e1 g1e1 g8g7 C@g1 g6f6 P@g6 g7g6 T@g5',
  },
  {
    seed: 1003,
    plies: 68,
    winner: 'black',
    reason: 'checkmate',
    comment:
      'Black held the edge before the break, peaking at -253. The engine eval stayed inside a pawn of level through ply 19 of 68. The position broke open on ply 26. 16 drops (Red 7, Black 9). Black mates with the drop R@a1.',
    moves:
      'f2e2 f7f6 a2a3 b7c7 b2b3 g8f7 c1b2 b8c6 a1a2 a7a6 b1a1 a6a5 g2g3 a8a6 f1e3 c8a8 e1f1 a5a4 e3c4 c6d4 f1f7 e8f7 g3f3 f6g6 T@e3 d4e6 e3d3 a4a3 b3a3 P@d4 P@b6 a6a3 b2a3 a8a2 d3c2 C@a4 a1b1 P@a1 b1a1 a2d2 a3b2 T@a3 a1b1 a3a2 b1c1 P@b1 c2b1 a2b1 c1b1 T@c2 b1a1 d4c4 R@b5 d2b2 T@d3 c2d3 g1g6 T@a3 P@a2 g7g6 P@e8 f8e8 P@c1 a3b3 a2b2 P@a2 a1b1 R@a1',
  },
  {
    seed: 1005,
    plies: 51,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at +384. The engine eval stayed inside a pawn of level through ply 17 of 51. The position broke open on ply 22. 11 drops (Red 7, Black 4). Red mates with the drop P@f8.',
    moves:
      'f2e2 b7b6 f1g3 c8c5 g3e4 c5e5 e4c5 e5d5 d1b3 b8c6 e1f1 d5f5 f1d1 a7b7 d1d7 a8a5 c5e6 f7e7 e6g7 e7d7 g7e6 d7e7 P@g7 g8g7 e6g7 C@g8 g1d1 e7f7 g7f5 a5f5 d2c2 N@c4 P@c5 P@c8 c5c6 c4b2 N@e6 P@e7 C@f1 g8g7 T@g6 f8g8 g6f5 e7e6 R@f8 g8f8 f5g6 f8g8 g6f7 e8f7 P@f8',
  },
  {
    seed: 2000,
    plies: 85,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at +288. The engine eval stayed inside a pawn of level through ply 28 of 85. The position broke open on ply 37. 16 drops (Red 8, Black 8). Red mates with e7f8.',
    moves:
      'e1e4 g7g6 e4d4 d7e7 d4f4 f7g7 f4a4 g6f6 b2b3 b7c7 a4a8 c8a8 f2f3 C@a6 a2b2 g7g6 f1e3 c7d7 g2f2 e7e6 f3f4 g8f7 f4f5 a6b6 f5f6 e6f6 P@a4 b6a6 b2a2 b8c6 R@c8 d7d6 e3c4 f7e6 c8c7 e6d5 a4a5 P@f7 a5a6 d5c4 C@f4 a8b8 a1b2 f8g8 f4g4 N@g5 g1e1 d6e6 c7c6 b8b2 c6c4 b2f2 a6a7 P@f8 c1b2 f2f5 T@d7 f5d5 P@f5 f7g7 N@c7 d5d1 e1d1 T@f7 f5f6 e6f6 P@e7 E@e5 e7f7 g7f7 c7d5 d8b6 d5b6 e5c7 C@d8 P@c8 b6c8 g8g7 d7e8 P@c1 d1c1 g7g8 e8e7 g8g7 e7f8',
  },
  {
    seed: 2003,
    plies: 81,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at +332. The engine eval stayed inside a pawn of level through ply 14 of 81. The position broke open on ply 19. 17 drops (Red 10, Black 7). Red mates with g8g7.',
    moves:
      'f2e2 b7b6 b2b3 g7g6 a1b2 g8g7 g2g3 c8c5 b3a3 c5b5 b1a1 b5d5 d2c2 g7f6 f1e3 d5a5 e1f1 b6b5 a3a4 a5a2 b2a2 b8c6 C@f4 f8g8 f1f6 d8f6 g3f3 P@g5 T@f5 g5f5 g1g6 T@g7 f4g4 C@g5 g6g7 f7g7 T@e6 c6d4 e6f6 R@f7 f6f7 e8f7 R@d5 d4c2 e3c2 a8c8 d5f5 P@g6 a2b2 a7b7 P@f6 g6f6 f5g5 P@g6 g5b5 T@g5 g4g1 c8b8 b5a5 g8f8 C@a8 f7e8 c2d4 b7c7 g1f1 d7e7 f3e3 g5f4 N@e6 f8g8 e6f4 c7d7 f4e6 f6e6 P@f8 g8f8 P@f7 f8f7 T@g8 f7f6 g8g7',
  },
  {
    seed: 2001,
    plies: 43,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at +207. The engine eval stayed inside a pawn of level through ply 12 of 43. The position broke open on ply 14. 10 drops (Red 6, Black 4). Red mates with the drop R@e5.',
    moves:
      'f2e2 b7c7 f1g3 g7g6 g2f2 g6f6 e1f1 b8a6 g3e4 a6c5 f1f6 f7f6 e4f6 C@b8 P@b7 d8f6 b7b8 a8b8 P@g7 b8b6 g7g8 f8f7 C@f4 P@f5 T@g6 f7e7 g6f5 c8b8 g1g7 N@f7 g7g3 c5e4 g3e3 b6b2 b1b2 c7b7 d1b3 b7c7 P@b4 P@e6 f5e6 e7e6 R@e5',
  },
  {
    seed: 2005,
    plies: 79,
    winner: 'red',
    reason: 'checkmate',
    comment:
      'Red held the edge before the break, peaking at +384. The engine eval stayed inside a pawn of level through ply 10 of 79. The position broke open on ply 17. 12 drops (Red 6, Black 6). Red mates with f6f7.',
    moves:
      'e1e4 b7c7 e4a4 a7a6 a4a8 c8a8 f2f3 C@b5 d1b3 a8a7 f1e3 g7g6 g1e1 f7f6 e3d5 g8f7 R@c8 b8c6 c8d8 f6e6 d8c8 a7b7 e1e3 f8g8 d5c7 b5b4 P@c4 b4b6 c4c5 c6e5 c7d5 b7b3 e3b3 e5f3 d5e3 f3e5 c5d5 e5f3 c8a8 f3g5 a8a6 E@d8 P@f5 e6f6 a6a8 f6f5 a8d8 b6a6 e3f5 g6f6 d8d7 P@e7 d7d6 a6a1 b1a1 T@g6 C@c8 P@f8 C@g3 g8g7 d5e5 g7g8 b3b7 g6g7 f5e3 f6g6 e5f5 g5f3 d6g6 f7g6 b7e7 R@f7 e7f7 f3g5 f7g7 g8g7 T@f6 g7g8 f6f7',
  },
  {
    seed: 1008,
    plies: 50,
    winner: 'none',
    reason: 'repetition',
    comment:
      'Red held the edge before the break, peaking at +211. The engine eval stayed inside a pawn of level through ply 50 of 50. 11 drops (Red 6, Black 5). Drawn by threefold repetition: neither side could force a way in.',
    moves:
      'f2e2 b7b6 f1g3 f7f6 b2b3 c8c5 e2e3 c5a5 g3e4 g8f7 e1f1 a7b7 a2b2 a5f5 e4f6 d8f6 P@e5 N@c4 e5f5 c4d2 C@c2 P@g6 a1a2 d2f1 c2c8 C@d8 g1f1 a8a5 N@e4 b7c7 f5f6 g6f6 e4f6 b8c6 f6d7 c7d7 f1f7 g7f7 P@f6 d7e7 f6f7 e7f7 P@f6 P@g7 f6f7 g7f7 P@f6 P@e7 f6f7 e7f7',
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
