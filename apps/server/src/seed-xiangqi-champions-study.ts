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
/**
 * Chapter names describe the OCCASION, never the result. "1960 - Hu Ronghua
 * beats Yang Guanlin" spoils the game before a move is played; who had which
 * side and how it ended now ride in the chapter tags, where the board can show
 * them and a flip keeps them straight.
 */
const CHAPTERS: { key: string; name: string; blurb: string; orientation: 'red' | 'black' }[] = [
  {
    key: 'm_17036',
    name: '1956 · The first national championship',
    orientation: 'red',
    blurb:
      'The first national championship ever played, and the first great upset in it. Li Yiting, the teenager from Hubei they called 小神童, the little prodigy, beats the man who goes on to win the tournament. He takes the title himself two years later, at twenty.',
  },
  {
    key: 'u_345428',
    name: '1960 · Hu Ronghua, aged fifteen',
    orientation: 'black',
    blurb:
      'Shanghai against Guangdong, and the handover between them. Round three: Hu is fifteen, in his first national tournament, with Black against the reigning champion, the man the sport called 第一国手, the first hand of the nation. He is a horse and an elephant ahead by move 43, Yang wins almost all of it back through the endgame, and Hu converts anyway. Hu went on to win ten national championships in a row between 1960 and 1979, and fourteen in all.',
  },
  {
    key: 'm_17225',
    name: '1965 · The champion Hu could not shake',
    orientation: 'red',
    blurb:
      'Guangdong answers. Five years after the handover the old champion is still beating the new one, and Hu will not have the country to himself for another decade. 183 plies, and the longest game of the pair.',
  },
  {
    key: 'm_44977',
    name: '1980 · Liu Dahua opens the summer',
    orientation: 'black',
    blurb:
      'The championship that ended Hu Ronghua’s run, and Liu Dahua’s first scalp in it: Li Laiqun, who would take the title off him two years later.',
  },
  {
    key: 'm_17496',
    name: '1980 · And then Yang Guanlin',
    orientation: 'black',
    blurb:
      'Five days later in the same championship, Liu Dahua takes apart the man who won the very first one. Seventy plies, the shortest game in the study.',
  },
  {
    key: 'm_23400',
    name: '1982 · Li Laiqun takes the title',
    orientation: 'red',
    blurb:
      'Li Laiqun’s title year, and he takes it through Hu Ronghua directly. Our engine grades Li at 98.4 with a single inaccuracy.',
  },
  {
    key: 'm_18198',
    name: '1986 · Lü Qin arrives',
    orientation: 'red',
    blurb:
      'Guangdong\u2019s third great player, in the year he won his first national title, against Yu Youhua, who would win one himself. Lü Qin went on to five national titles and five world titles, more of the latter than anyone before or since. Our engine grades him at 95.7 here.',
  },
  {
    key: 'm_18360',
    name: '1989 · Zhao Guorong before the titles',
    orientation: 'red',
    blurb:
      'Heilongjiang against Shanghai: Zhao Guorong beats Hu Ronghua the year before the first of his four national titles. Zhao grades 97.7 across 73 plies, one of the cleanest games here and among the shortest.',
  },
  {
    key: 'm_2071',
    name: '1990 · Xu Yinchuan, also aged fifteen',
    orientation: 'red',
    blurb:
      'The defending national champion against a fifteen-year-old Xu Yinchuan. It is 1960 in reverse: the same age, the same stage, the opposite result. Xu Yinchuan won his own first title three years later.',
  },
  {
    key: 'm_137202',
    name: '1994 · Fourteen years later',
    orientation: 'red',
    blurb:
      'Hu is forty-nine, and this is the man who ended his run fourteen years earlier. Six years after this he won the national title again, at fifty-five.',
  },
  {
    key: 'm_129045',
    name: '1995 · Guangdong\u2019s next champion',
    orientation: 'red',
    blurb:
      'The third of Guangdong’s champions, against the man who ended Hu’s run. Xu Yinchuan grades 97.7 here with no blunder and no mistake, and won six national titles between 1993 and 2009.',
  },
  {
    key: 'm_19406',
    name: '1996 · Tao Hanming over Liu Dahua',
    orientation: 'red',
    blurb:
      'Tao Hanming won a single national title, in 1994, in an era owned by four or five other men. Two years later he takes down Liu Dahua, a two-time champion, which is the better evidence of what he could do.',
  },
  {
    key: 'm_8975',
    name: '2002 · Yu Youhua, once',
    orientation: 'black',
    blurb:
      'Yu Youhua won the national championship in 2002 and never again, in the middle of an era owned by Hu Ronghua, Lü Qin and Xu Yinchuan. This is from the championship he won, against Xu Tianhong.',
  },
  {
    key: 'm_37503',
    name: '2010 · Sun Yongzheng, the year before',
    orientation: 'black',
    blurb:
      'Sun Yongzheng took the title in 2011. A year earlier he beats Xu Tianhong in sixty plies and grades 97.1 doing it, one of the cleanest games here.',
  },
  {
    key: 'm_135530',
    name: '2025 · Shanghai, and the title leaves China',
    orientation: 'red',
    blurb:
      'From the championship in Shanghai that Lại Lý Huynh won, the first man from outside China to take the standard world title in the thirty-five years the event has existed.',
  },
  {
    key: 'm_138948',
    name: '2025 · Wang Yubo, and an empty top',
    orientation: 'red',
    blurb:
      'The most recent national champion, from the championship he won. He faces nobody else in this study, and that is the point rather than an omission: the generation that would have been across the board from him is serving competition bans.',
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

/**
 * dpxq stores "province name" in Chinese. The site reads English first, so the
 * seat label does too: every player across these thirteen chapters is mapped
 * explicitly rather than transliterated on the fly, because a wrong romanisation
 * on a public page is worse than a missing one -- an unmapped name falls back to
 * the Chinese it came with rather than to a guess.
 *
 * Chinese seat labels come back when the English is frozen and the whole study
 * is translated, through the same i18n mechanism chapter names use. Doing it
 * now would mean translating text that is still moving.
 */
const PLAYER_NAMES: Record<string, string> = {
  胡荣华: 'Hu Ronghua',
  杨官璘: 'Yang Guanlin',
  李义庭: 'Li Yiting',
  柳大华: 'Liu Dahua',
  李来群: 'Li Laiqun',
  吕钦: 'Lü Qin',
  赵国荣: 'Zhao Guorong',
  徐天红: 'Xu Tianhong',
  陶汉明: 'Tao Hanming',
  许银川: 'Xu Yinchuan',
  李雪松: 'Li Xuesong',
  于幼华: 'Yu Youhua',
  孙勇征: 'Sun Yongzheng',
  王禹博: 'Wang Yubo',
  苏奕霖: 'Su Yilin',
  刘伯良: 'Liu Boliang',
  吴贵临: 'Wu Guilin',
  冯家俊: 'Fung Ka-chun',
  赖理兄: 'Lại Lý Huynh',
};

/**
 * dpxq event strings are Chinese and carry a year, an occasional sponsor cup,
 * and an edition number. The site reads English first, so these are mapped
 * explicitly for the same reason the names are: an unmapped event falls back to
 * the Chinese it came with rather than to a machine rendering of it.
 */
const EVENT_NAMES: [RegExp, string][] = [
  [/第(\d+)届世界象棋锦标赛/, 'World Xiangqi Championship'],
  [/世界象棋锦标赛/, 'World Xiangqi Championship'],
  [/全国象棋个人赛|全国象棋个人锦标赛/, 'National Individual Championship'],
];

function englishEvent(raw: string): string {
  const year = raw.match(/^(\d{4})年/)?.[1];
  for (const [pattern, name] of EVENT_NAMES) {
    const hit = raw.match(pattern);
    if (!hit) continue;
    const edition = hit[1] ? `${ordinal(Number(hit[1]))} ` : '';
    return `${year ? `${year} ` : ''}${edition}${name}`;
  }
  return raw;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Team/federation prefix dpxq puts before the name; not part of the player. */
const cleanPlayer = (value: string): string => {
  const bare = value.trim().split(/\s+/).slice(-1)[0] ?? value;
  return PLAYER_NAMES[bare] ?? bare;
};

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
  // The provenance line is BUILT in English rather than passing dpxq's own
  // title through: its title is Chinese and encodes the result in 胜/负, which
  // reads as untranslated noise on an English page.
  const red = cleanPlayer(game.red);
  const black = cleanPlayer(game.black);
  const outcome =
    game.result === '1-0' ? `${red} won` : game.result === '0-1' ? `${black} won` : 'Drawn';
  const root: SerializedNode = {
    annotations: {
      comments: [
        {
          text: `${meta.blurb}\n\n${red} (Red) vs ${black} (Black) · ${englishEvent(game.event)} · ${game.date.slice(0, 10)} · ${outcome}. Engine notes are Pikafish at 1,000,000 nodes a position, the same path the review page uses. Accuracy: Red ${anno.accuracy.first.toFixed(1)}, Black ${anno.accuracy.second.toFixed(1)}.`,
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
    // Identity and outcome as PGN-style tags, so the board can label the seats
    // and a flip keeps them attached to the right side.
    tags: {
      red,
      black,
      result: game.result,
      event: englishEvent(game.event),
      date: game.date.slice(0, 10),
      ...(game.sourceUrl ? { site: game.sourceUrl } : {}),
    },
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
      'One game for each national champion, from the first championship in 1956 to Shanghai in 2025, annotated by our own engine.\n\n' +
      'Read in order it is one argument: for most of these seventy years the best xiangqi player alive came from Shanghai or from Guangdong, and the two cities took turns. Guangdong produced Yang Guanlin, then Lü Qin, then Xu Yinchuan. Shanghai produced Hu Ronghua, who held the rest of the country off by himself for twenty years. Almost every chapter here is one of them against another, which is the point: none of these men were champions of an empty room.\n\n' +
      'Companion to /blog/xiangqi-champions.',
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
