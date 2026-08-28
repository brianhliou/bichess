/**
 * Seed the champions study: one chapter per national or world champion, each a
 * verified game with our own engine annotations attached to the moves.
 *
 * Every chapter is built the same way and nothing in it is hand-written except
 * the blurb: the mainline comes from a record that was replayed through our
 * rules kernel before it was kept, and the glyphs, evals and variations come
 * from scripts/annotate-game.mjs running the production analysis path. A judged
 * move carries its NAG and a comment; the line the engine preferred is attached
 * as a sibling branch off the same parent, so it is clickable rather than prose.
 *
 * Usage (local dev pair on 3010/3011):
 *   npx tsx apps/server/src/seed-xiangqi-champions-study.ts \
 *     --games <dir of harvested game json> --anno <dir of annotate-game json> \
 *     --email you@example.com --base http://127.0.0.1:3011 \
 *     [--visibility public|unlisted|private] [--emit out.json]
 *
 * Against a real server, supply a browser session instead of --email:
 *   MISTBOARD_SESSION_COOKIE='mistboard_session=...' npx tsx ... --base https://mistboard.com
 * The cookie is a live credential: read from the environment, never logged.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyMove,
  createInitialXiangqiState,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';

type SerializedNode = {
  uci?: string;
  annotations?: { comments?: { text: string }[]; glyphs?: number[] };
  children: SerializedNode[];
};

type HarvestedGame = {
  key: string;
  title: string;
  event: string;
  date: string;
  red: string;
  black: string;
  result: string;
  moves: XiangqiMove[];
  sourceUrl?: string;
};

type AnnotationRow = {
  ply: number;
  moveNumber: number;
  side: 'red' | 'black';
  judgment: 'blunder' | 'mistake' | 'inaccuracy' | null;
  cp: number | null;
  mate: number | null;
  lost: number;
  pv: string[];
};

type AnnotationFile = { accuracy: { first: number; second: number }; rows: AnnotationRow[] };

/** The curated list. Order is chronological; the blurb is the only prose. */
const CHAPTERS: { key: string; name: string; blurb: string; orientation: 'red' | 'black' }[] = [
  {
    key: 'm_17036',
    name: '1956 · Li Yiting beats Yang Guanlin',
    orientation: 'red',
    blurb:
      'The first national championship ever played. Yang Guanlin won it; this is the game he lost, to a nineteen-year-old from Hubei who would take the title himself two years later.',
  },
  {
    key: 'u_345428',
    name: '1960 · Hu Ronghua beats Yang Guanlin',
    orientation: 'black',
    blurb:
      'Round three. Hu is fifteen, in his first national tournament, with Black against the reigning champion the sport called 第一国手. He is a horse and an elephant ahead by move 43, Yang wins almost all of it back through the endgame, and Hu converts anyway. Hu held the title for the next twenty years.',
  },
  {
    key: 'm_17225',
    name: '1965 · Yang Guanlin beats Hu Ronghua',
    orientation: 'red',
    blurb:
      'Five years after the handover, the old champion is still beating the new one. 183 plies, and the longest game of the pair.',
  },
  {
    key: 'm_17496',
    name: '1980 · Liu Dahua beats Yang Guanlin',
    orientation: 'black',
    blurb:
      'The summer Hu Ronghua’s run finally ended. Seventy plies, the shortest game in the study, and Liu takes Yang apart in it.',
  },
  {
    key: 'm_44977',
    name: '1980 · Liu Dahua beats Li Laiqun',
    orientation: 'black',
    blurb:
      'Eight days earlier in the same championship, against the man who would take the title off him two years later.',
  },
  {
    key: 'm_23400',
    name: '1982 · Li Laiqun beats Hu Ronghua',
    orientation: 'red',
    blurb:
      'Li Laiqun’s title year, and he takes it through Hu Ronghua directly. Our engine grades Li at 98.4, the cleanest game in the study.',
  },
  {
    key: 'm_25675',
    name: '1990 · Lü Qin at the first World Championship',
    orientation: 'red',
    blurb:
      'The inaugural World Xiangqi Championship, in Singapore, which Lü Qin won. He would win four more, more than anyone.',
  },
  {
    key: 'm_2071',
    name: '1990 · Xu Tianhong beats Xu Yinchuan',
    orientation: 'red',
    blurb:
      'The defending national champion against a fifteen-year-old Xu Yinchuan. It is 1960 in reverse: the same age, the same stage, the opposite result. Xu Yinchuan won his own first title three years later.',
  },
  {
    key: 'm_18615',
    name: '1991 · Zhao Guorong at the World Championship',
    orientation: 'red',
    blurb:
      'Zhao against Wu Guilin of Chinese Taipei in the event Zhao won. Four blunders between them, the most in any game here, and a reminder that a world championship is not automatically the cleanest chess.',
  },
  {
    key: 'm_141464',
    name: '1994 · Tao Hanming',
    orientation: 'red',
    blurb: 'From the championship Tao Hanming won, his only national title.',
  },
  {
    key: 'm_137202',
    name: '1994 · Hu Ronghua beats Liu Dahua',
    orientation: 'red',
    blurb:
      'Hu is forty-nine, and this is the man who ended his run fourteen years earlier. Six years after this he won the national title again, at fifty-five.',
  },
  {
    key: 'm_129045',
    name: '1995 · Xu Yinchuan beats Liu Dahua',
    orientation: 'red',
    blurb:
      'Guangdong’s next champion against Hu’s old nemesis. Xu grades 97.7 here with no blunder and no mistake.',
  },
  {
    key: 'm_135530',
    name: '2025 · Lại Lý Huynh at the World Championship',
    orientation: 'red',
    blurb:
      'From the championship in Shanghai that Lại Lý Huynh won, the first man from outside China to take the standard world title in the thirty-five years the event has existed.',
  },
];

/** NAG codes the review tree renders: 4 = ??, 2 = ?, 6 = ?!. */
const NAG: Record<string, number> = { blunder: 4, mistake: 2, inaccuracy: 6 };

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith('--')) continue;
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      out[arg.slice(2)] = next;
      i += 1;
    } else out[arg.slice(2)] = 'true';
  }
  return out;
}

const uciOf = (m: XiangqiMove) => `${m.from}${m.to}`;

/** Pikafish UCI is rank-shifted by one against our squares. */
function fromPikafish(uci: string): XiangqiMove | null {
  const sq = (s: string): XiangqiSquare | null => {
    const file = s[0];
    const rank = Number(s.slice(1)) + 1;
    return file && rank >= 1 && rank <= 10 ? (`${file}${rank}` as XiangqiSquare) : null;
  };
  const from = sq(uci.slice(0, 2));
  const to = sq(uci.slice(2, 4));
  return from && to ? { from, to } : null;
}

/**
 * A variation is only worth attaching if it actually plays. Replay it from the
 * position the judged move was made in and truncate at the first rejection,
 * rather than shipping a branch the board would refuse.
 */
function legalLine(state: XiangqiGameState, pv: readonly string[]): XiangqiMove[] {
  const out: XiangqiMove[] = [];
  let cursor = state;
  for (const raw of pv) {
    const move = fromPikafish(raw);
    if (!move) break;
    const next = applyMove(cursor, move);
    if (next === cursor) break;
    out.push(move);
    cursor = next;
  }
  return out;
}

function chainOf(moves: readonly XiangqiMove[]): SerializedNode | null {
  let child: SerializedNode | null = null;
  for (const move of [...moves].reverse()) {
    child = { uci: uciOf(move), children: child ? [child] : [] };
  }
  return child;
}

function evalText(row: AnnotationRow): string {
  if (row.mate != null) return `mate in ${Math.abs(row.mate)}`;
  if (row.cp == null) return '';
  return `${row.cp >= 0 ? '+' : ''}${(row.cp / 100).toFixed(2)}`;
}

function chapterFor(game: HarvestedGame, anno: AnnotationFile, meta: (typeof CHAPTERS)[number]) {
  const root: SerializedNode = {
    annotations: {
      comments: [
        {
          text: `${meta.blurb}\n\n${game.title} · ${game.event} · ${game.date}. Engine notes are Pikafish at 1,000,000 nodes a position, the same path the review page uses. Accuracy: Red ${anno.accuracy.first.toFixed(1)}, Black ${anno.accuracy.second.toFixed(1)}.`,
        },
      ],
    },
    children: [],
  };

  const byPly = new Map(anno.rows.map((r) => [r.ply, r]));
  let state = createInitialXiangqiState(`champions-${game.key}`);
  let parent = root;

  game.moves.forEach((move, index) => {
    const ply = index + 1;
    const row = byPly.get(ply);
    const node: SerializedNode = { uci: uciOf(move), children: [] };

    if (row?.judgment) {
      const line = legalLine(state, row.pv ?? []);
      node.annotations = {
        glyphs: [NAG[row.judgment] ?? 6],
        comments: [
          {
            text: `${row.judgment}: ${row.lost} win% given up${evalText(row) ? `, eval ${evalText(row)} after` : ''}.${line.length ? ' The engine wanted the line in the sibling branch.' : ''}`,
          },
        ],
      };
      parent.children.push(node);
      // The refutation branches from the SAME position, so it is a sibling of
      // the played move, not a child of it.
      const branch = chainOf(line);
      if (branch) parent.children.push(branch);
    } else {
      parent.children.push(node);
    }

    state = applyMove(state, move);
    parent = node;
  });

  return {
    name: meta.name,
    variant: 'xiangqi' as const,
    orientation: meta.orientation,
    root: { version: 1 as const, root },
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const base = args.base ?? 'http://127.0.0.1:3011';
  const gamesDir = args.games;
  const annoDir = args.anno;
  if (!gamesDir || !annoDir) {
    console.error('--games <dir> and --anno <dir> are required');
    process.exitCode = 1;
    return;
  }

  const chapters = CHAPTERS.map((meta) => {
    const game = JSON.parse(
      readFileSync(join(gamesDir, `${meta.key}.json`), 'utf8'),
    ) as HarvestedGame;
    const anno = JSON.parse(
      readFileSync(join(annoDir, `${meta.key}.json`), 'utf8'),
    ) as AnnotationFile;
    return chapterFor(game, anno, meta);
  });

  if (args.emit) {
    writeFileSync(args.emit, JSON.stringify(chapters, null, 2));
    console.log(`wrote ${chapters.length} chapter payloads to ${args.emit}`);
    return;
  }

  const suppliedCookie = process.env.MISTBOARD_SESSION_COOKIE?.trim();
  const email = args.email;
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
    name: 'Every Xiangqi Champion',
    description:
      'One game for each national and world champion, from the first championship in 1956 to Shanghai in 2025, annotated by our own engine. Companion to /blog/xiangqi-champions.',
    visibility: args.visibility ?? 'unlisted',
    chapter: first,
  });
  if (!createResponse.ok) {
    throw new Error(`create study failed: ${createResponse.status} ${await createResponse.text()}`);
  }
  const created = (await createResponse.json()) as { study: { id: string } };
  console.log(`created study ${created.study.id}`);

  for (const [index, chapter] of rest.entries()) {
    const response = await post(`/api/studies/${created.study.id}/chapters`, chapter);
    if (!response.ok) {
      throw new Error(
        `chapter ${index + 2} (${chapter.name}) failed: ${response.status} ${await response.text()}`,
      );
    }
  }
  console.log(
    `done: ${chapters.length} chapters at ${base.replace(':3011', ':3010')}/study/${created.study.id}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
