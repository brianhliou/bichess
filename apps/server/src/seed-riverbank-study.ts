/**
 * Seed the Riverbank Cannon companion study: the article's verified theory
 * lines as annotated chapters, then the twenty scripted-rush-vs-Misty defense
 * games in full. Every mainline is replayed through the fog kernel before it
 * is written, so a chapter can never carry a move the board would reject.
 *
 * Usage (local dev, server on 3001):
 *   npx tsx apps/server/src/seed-riverbank-study.ts \
 *     --games <path to rush_vs_engine_20games.jsonl.txt> \
 *     --email you@example.com [--base http://127.0.0.1:3001] \
 *     [--visibility public|unlisted|private]
 *
 * Against a real server, supply a browser session instead of --email:
 *   MISTBOARD_SESSION_COOKIE='mistboard_session=...' npx tsx ... --base https://mistboard.com
 * The cookie is a live credential: read from the environment, never logged.
 */
import { readFileSync } from 'node:fs';
import {
  applyMove,
  createInitialXiangqiState,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';

type SerializedNode = {
  uci?: string;
  annotations?: { comments?: { text: string }[] };
  children: SerializedNode[];
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

/** Replay tokens through the fog kernel; throw on any illegal move. */
function verifiedLine(name: string, tokens: string[]): XiangqiMove[] {
  let state: XiangqiGameState = createInitialXiangqiState(`seed-${name}`);
  const kept: XiangqiMove[] = [];
  for (const token of tokens) {
    const match = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(token);
    if (!match) throw new Error(`${name}: bad token ${token}`);
    const move = { from: match[1], to: match[2] } as XiangqiMove;
    const next = applyMove(state, move);
    if (next === state) throw new Error(`${name}: illegal ${token}`);
    state = next;
    kept.push(move);
    if (state.status.type !== 'playing') break;
  }
  return kept;
}

function chapterPayload(name: string, tokens: string[], comment: string) {
  const moves = verifiedLine(name, tokens);
  let child: SerializedNode | null = null;
  for (const move of [...moves].reverse()) {
    child = { uci: `${move.from}${move.to}`, children: child ? [child] : [] };
  }
  return {
    name,
    variant: 'dark-xiangqi' as const,
    orientation: 'red' as const,
    root: {
      version: 1 as const,
      root: {
        annotations: { comments: [{ text: comment }] },
        children: child ? [child] : [],
      },
    },
  };
}

const THEORY: Array<{ name: string; tokens: string[]; comment: string }> = [
  {
    name: 'The stealth rush',
    tokens: ['b3d3', 'h10g8', 'd3d5', 'b10c8', 'd5e5', 'c7c6', 'e5e10'],
    comment:
      'The invisible route. Up the empty d-file nothing Black owns sees a single point, and the general falls on move 4. Black developed normally and saw only that a red piece left home. This is why the defense has to be played every game, blind.',
  },
  {
    name: 'The poisoned advisor',
    tokens: ['b3b5', 'd10e9', 'b5g5', 'b10c8', 'g5g10', 'e10d10', 'g10d10'],
    comment:
      'The defense most players find first, and its landmine. Black’s second move went elsewhere, so Red takes the elephant on the wing whose advisor stayed home and the cannon fires along the back rank through it; from there all 41 of Black’s legal moves lose within two moves. The disarm exists (the poisoned wing’s elephant to the middle, immediately), but it is the move Black should have played first, and with both of Black’s moves spent on the center, Red takes a rim chariot for free instead.',
  },
  {
    name: 'The tripwire',
    tokens: ['b3b5', 'a7a6', 'b5a5', 'a6a5'],
    comment:
      'The soldier push, played FIRST. The pushed soldier watches the one point the cannon must fire from, and a cannon that lands there dies before it can shoot. Push before Red commits; the seal can wait one move, the tripwire cannot.',
  },
  {
    name: 'The push that came too late',
    tokens: ['b3b5', 'c10e8', 'b5a5', 'a7a6', 'a5a10'],
    comment:
      'The same push, one move late. The cannon is already on its firing point, and a pushed soldier still counts as one screen: the chariot falls straight over it. Order is everything.',
  },
  {
    name: 'The counter-battery',
    tokens: ['b3b5', 'h8h6', 'b5a5', 'h6e6', 'a5a10', 'e6e1'],
    comment:
      'Black’s own riverbank plan. The battery on e6 is invisible to Red, and any grab spends the tempo the mate needed him to spend sealing: Red takes the chariot and is mated on the reply. Against a Red who seals first it concedes more than the soldier line (engine verdict +0.25 against 0.00), so it is the weapon for greedy opponents, not the default.',
  },
];

type GameRow = {
  game: number;
  winner: string | null;
  plies: number;
  moves: string[];
  final_mat: { red: number; black: number };
};

async function main(): Promise<void> {
  const args = parseArgs();
  const base = typeof args.base === 'string' ? args.base : 'http://127.0.0.1:3001';
  const gamesPath = typeof args.games === 'string' ? args.games : null;
  const rimPath = typeof args.rim === 'string' ? args.rim : null;
  const selfplayPath = typeof args.selfplay === 'string' ? args.selfplay : null;
  const email = typeof args.email === 'string' ? args.email : null;
  const visibility = typeof args.visibility === 'string' ? args.visibility : 'public';
  if (!gamesPath) {
    console.error('--games <jsonl> is required');
    process.exitCode = 1;
    return;
  }

  const games: GameRow[] = readFileSync(gamesPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as GameRow);

  const chapters = THEORY.map((t) => chapterPayload(t.name, t.tokens, t.comment));
  for (const g of games) {
    const clean = g.moves.map((m) => (m.includes('x') ? m.slice(0, m.indexOf('x')) : m));
    chapters.push(
      chapterPayload(
        `Defense game ${g.game + 1} of ${games.length} (${g.plies} plies)`,
        clean,
        `Scripted riverbank rush (Red), straight up the b-file in plain sight, versus Misty DXQ (Black), game ${g.game + 1} of ${games.length}. Black’s cannon watches the arrival point, and the engine answers with a seal in time: the snipe never lands. Red’s scripted play is strong in the opening and weak afterwards, so read these as the rush failing, not as Black demonstrating best play.`,
      ),
    );
  }
  const readGames = (path: string): GameRow[] =>
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim().startsWith('{'))
      .map((line) => JSON.parse(line) as GameRow);
  if (rimPath) {
    for (const g of readGames(rimPath)) {
      const clean = g.moves.map((m) => (m.includes('x') ? m.slice(0, m.indexOf('x')) : m));
      chapters.push(
        chapterPayload(
          `Rim gambit game ${g.game + 1} (${g.winner ?? 'no result'}, ${g.plies} plies)`,
          clean,
          'Scripted Red skips the snipe and goes straight for a chariot, in plain sight. Misty does not play the tripwire scheme, so the grab usually lands: what the guessed-wrong branch looks like in the wild, chariot down, fighting.',
        ),
      );
    }
  }
  const schemePath = typeof args.schemegames === 'string' ? args.schemegames : null;
  if (schemePath) {
    for (const g of readGames(schemePath)) {
      chapters.push(
        chapterPayload(
          `Scheme test game ${g.game + 1} (${g.winner ?? 'ply cap'}, ${g.plies} plies)`,
          g.moves,
          'Black is forced through the recommended line (edge soldier, wing-matched central elephant, far-side horse) while Red, a free-playing Misty, does as it pleases. Black won five of the seven decisive games in this set, against one of twelve when both sides chose freely: the three insurance moves cost nothing.',
        ),
      );
    }
  }
  if (selfplayPath) {
    for (const g of readGames(selfplayPath)) {
      chapters.push(
        chapterPayload(
          `Engine self-play game ${g.game + 1} (${g.winner ?? 'ply cap'}, ${g.plies} plies)`,
          g.moves,
          'Misty against itself, both sides free to choose. Red never plays the riverbank rush: soldier pushes, horse development, the central cannon. This is what fog xiangqi looks like when nobody is running a script.',
        ),
      );
    }
  }
  console.log(`${chapters.length} chapters prepared (all mainlines fog-kernel verified)`);

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

  const [first, ...rest] = chapters;
  const createResponse = await post('/api/studies', {
    name: 'The Riverbank Cannon',
    description:
      'Companion study to the article of the same name: the verified theory lines of fog xiangqi’s opening cannon rush, twenty engine defense games, ten rim-gambit games, and sixteen engine self-play games, all in full. Article: /blog/riverbank-cannon',
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
      throw new Error(`chapter ${index + 2} (${chapter.name}) failed: ${response.status}`);
    }
  }
  console.log(`done: ${chapters.length} chapters at ${base.replace(':3001', ':3000')}/study/${created.study.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
