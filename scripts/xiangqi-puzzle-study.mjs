#!/usr/bin/env node
// Build the "What a mined puzzle looks like" study from the served xiangqi
// puzzle corpus.
//
//   railway run -s Postgres -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" \
//     node scripts/xiangqi-puzzle-study.mjs survey'
//   ... node scripts/xiangqi-puzzle-study.mjs emit
//   ... node scripts/xiangqi-puzzle-study.mjs create --cookie ~/.mistboard-cookie
//   ... node scripts/xiangqi-puzzle-study.mjs update <studyId> --cookie ~/.mistboard-cookie
//
// `survey` classifies every served puzzle with the rules kernel and prints the
// buckets a picker actually cares about (quiet key move, sacrifice, no mate,
// long line, zero captures). `emit` prints the study payload without sending
// it. `create`/`update` write to the account the cookie belongs to.
//
// The cookie is read from a FILE and used as a header. It is never printed,
// never logged, and never passed as an argument, because an argument is visible
// in the process list.
//
// Why the picks are ids and not a rule: the study is an exhibit, not a sample.
// The survey narrows 1,415 puzzles to a few dozen per bucket; a human chooses
// which ones read well and writes the chapter's sentence. Re-run the survey
// after a fresh mining run and the ids stay valid, because a puzzle id is
// derived from its source game and ply.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import pg from 'pg';

import { deriveXiangqiPuzzleDifficulty } from '../packages/game/dist/puzzles-xiangqi-difficulty.js';
import {
  applyStandardXiangqiMove,
  getStandardXiangqiLegalMoves,
} from '../packages/game/dist/variants-xiangqi-standard.js';
import { standardXiangqiFen } from '../packages/game/dist/xiangqi-position.js';

const MATERIAL = {
  chariot: 900,
  cannon: 450,
  horse: 450,
  elephant: 200,
  advisor: 200,
  soldier: 100,
  general: 0,
};

const args = process.argv.slice(2);
const command = args[0] ?? 'survey';
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = argOf('base', 'https://mistboard.com');

/** Material from `side`'s point of view, generals excluded (they never trade). */
function balance(board, side) {
  let diff = 0;
  for (const piece of Object.values(board)) {
    diff += (MATERIAL[piece.role] ?? 0) * (piece.color === side ? 1 : -1);
  }
  return diff;
}

/**
 * Replay a puzzle's solution through the rules kernel and describe the line.
 *
 * Everything a picker wants to know is a property of the played line, not of
 * the stored record: whether the key move takes anything, whether the solver
 * ever goes down material, whether it ends in mate. The stored themes are
 * assigned by the miner and say less than the line does.
 */
function describe(puzzle) {
  let state = puzzle.initial;
  const side = state.status.turn;
  const startBalance = balance(state.board, side);
  let minBalance = startBalance;
  let captures = 0;
  let firstIsCapture = false;
  const iccs = [];
  const uciLine = [];
  const trace = [];
  const startFen = standardXiangqiFen(state);

  for (const [index, move] of puzzle.solution.entries()) {
    const legal = getStandardXiangqiLegalMoves(state);
    // A stored line that no longer replays is a corpus defect, not a puzzle to
    // choose from. Drop it rather than half-describing it.
    if (!legal.some((m) => m.from === move.from && m.to === move.to)) return null;
    if (state.board[move.to]) {
      captures += 1;
      if (index === 0) firstIsCapture = true;
    }
    const mover = state.board[move.from];
    const taken = state.board[move.to];
    state = applyStandardXiangqiMove(state, move);
    iccs.push(`${square(move.from)}${square(move.to)}`);
    uciLine.push(`${move.from}${move.to}`);
    trace.push(
      [
        index % 2 === 0 ? 'solver' : 'defence',
        `${mover.color} ${mover.role}`,
        `${move.from}-${move.to}`,
        taken ? `takes ${taken.color} ${taken.role}` : 'takes nothing',
        state.status.type === 'finished' ? 'MATE' : state.status.inCheck ? 'check' : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    minBalance = Math.min(minBalance, balance(state.board, side));
  }

  // Difficulty is the read-time prior, and it already walks this line to find
  // the things a picker wants named: a quiet key move, an unrecovered
  // sacrifice, a capture nothing defends. Recomputing them here would be a
  // second opinion that can disagree with the one players are shown.
  const difficulty = safeDifficulty(puzzle);

  return {
    id: puzzle.id,
    title: puzzle.title,
    side,
    ply: puzzle.solution.length,
    captures,
    firstIsCapture,
    // How far below the starting material the solver goes at the deepest point
    // of the line, which is not the same as the prior's sacrificeCp: that one
    // only counts material the line never wins back.
    materialDipCp: startBalance - minBalance,
    endBalance: balance(state.board, side),
    startBalance,
    mates: state.status.type === 'finished',
    score: difficulty?.score ?? null,
    motifs: difficulty?.motifs ?? [],
    sacrificeCp: difficulty?.sacrificeCp ?? 0,
    freeCaptureCp: difficulty?.freeCaptureCp ?? 0,
    goal: puzzle.goal,
    themes: puzzle.themes ?? [],
    sourceGame: puzzle.sourceGame ?? null,
    startFen,
    iccs,
    uciLine,
    trace,
  };
}

/**
 * ICCS ranks are 0-9; ours are 1-10.
 *
 * Only the article's xq-replay specs speak ICCS. A STUDY tree's `uci` is our
 * own square names, ranks 1-10, and the two are one character apart in a way
 * that is invisible on inspection: a chapter built from ICCS posts cleanly,
 * returns cleanly from the API, and renders an empty move list, because every
 * move in it is illegal from the root position.
 */
const square = (name) => `${name[0]}${Number(name.slice(1)) - 1}`;

function safeDifficulty(puzzle) {
  try {
    return deriveXiangqiPuzzleDifficulty(puzzle);
  } catch {
    return null;
  }
}

async function loadCorpus() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT data FROM puzzles WHERE variant = 'xiangqi' AND hidden_reason IS NULL ORDER BY seq, id`,
    );
    const described = [];
    for (const row of rows) {
      const puzzle = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const line = describe(puzzle);
      if (line) described.push(line);
    }
    return described;
  } finally {
    await client.end();
  }
}

const BUCKETS = [
  ['sacrifice, unrecovered', (p) => p.motifs.includes('sacrifice')],
  ['sacrifice, material comes back', (p) => !p.motifs.includes('sacrifice') && p.materialDipCp > 0],
  ['nothing captured in the whole line', (p) => p.captures === 0],
  ['quiet key move, wins without mating', (p) => !p.firstIsCapture && !p.mates],
  ['long forced line (7+ ply)', (p) => p.ply >= 7 && p.motifs.includes('forced-line')],
  ['hardest quiet mates', (p) => !p.firstIsCapture && p.mates && (p.score ?? 0) >= 2200],
  ['wide defense (many replies to refute)', (p) => p.motifs.includes('wide-defense')],
  [
    'beginner band, not a free grab',
    (p) => (p.score ?? 9999) <= 1500 && !p.motifs.includes('free-material'),
  ],
  [
    'middle band, key move is a capture',
    (p) => p.firstIsCapture && (p.score ?? 0) >= 1600 && (p.score ?? 0) <= 1900,
  ],
  ['three-ply mates', (p) => p.ply === 3 && p.mates],
  [
    'no mate, but the last move collects',
    (p) =>
      !p.mates &&
      !p.firstIsCapture &&
      p.endBalance - p.startBalance >= 400 &&
      p.endBalance > 0 &&
      p.ply >= 5,
  ],
];

function survey(corpus) {
  console.log(`served puzzles that replay: ${corpus.length}\n`);
  for (const [label, match] of BUCKETS) {
    const hits = corpus.filter(match).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (label.startsWith('beginner')) hits.reverse();
    console.log(`${label}: ${hits.length}`);
    for (const p of hits.slice(0, 10)) console.log(`  ${describeLine(p)}`);
    console.log('');
  }
}

const describeLine = (p) =>
  [
    p.id.padEnd(44),
    `${p.side} to move`,
    `${p.ply}p`,
    `d${p.score ?? '?'}`,
    p.firstIsCapture ? 'key=capture' : 'key=quiet',
    p.mates ? 'mate' : 'no-mate',
    p.sacrificeCp ? `sac ${p.sacrificeCp}cp` : '',
    p.freeCaptureCp ? `free ${p.freeCaptureCp}cp` : '',
    `${p.captures} captures`,
    p.motifs.join('/'),
  ]
    .filter(Boolean)
    .join('  ');

// ---------------------------------------------------------------------------
// The study
// ---------------------------------------------------------------------------

const STUDY_NAME = 'Mined from real games: a xiangqi puzzle sampler';
const STUDY_DESCRIPTION =
  'Twelve positions pulled out of amateur games by an automated miner, chosen to show what the corpus is made of rather than which puzzles are hardest. Each chapter plays the solution move by move.';
const STUDY_I18N = {
  'zh-Hans': {
    name: '从真实对局中挖掘：象棋习题选',
    description:
      '自动挖掘程序从业余对局中提取的十二个局面，选取标准是展示题库的构成，而不是难度。每章都可逐着播放解法。',
  },
  'zh-Hant': {
    name: '從真實對局中挖掘：象棋習題選',
    description:
      '自動挖掘程式從業餘對局中提取的十二個局面，選取標準是展示題庫的構成，而不是難度。每章都可逐著播放解法。',
  },
};

/**
 * The chapters, in reading order. `id` is a served puzzle; everything else is
 * the exhibit built around it.
 *
 * Chosen from `survey` output to span what the corpus contains rather than
 * which puzzles score highest: quiet key moves, sacrifices, lines that win
 * without mating, lines where nothing is captured at all, and one position
 * where the winning move is a king step. Every comment states something the
 * replay above it actually does, because a sampler whose twelve chapters all
 * say "to move and win" shows the reader nothing.
 *
 * The band runs roughly 1800 to 2600. The easy end of the corpus is one-ply
 * captures, which are honest output and poor exhibits.
 */
const PICKS = [
  {
    id: 'xq-mined-hxq_875a152f5c31f46f135272cc-57',
    name: 'Mate in two, nothing taken',
    zhHans: '两步杀，一子未吃',
    zhHant: '兩步殺，一子未吃',
    comment:
      "Both of Black's chariots are already on the back rank. Chariot c1 to c2 first, Red's chariot comes back to d2, and chariot g1 to g2 is mate. Neither side captures anything.",
    commentHans:
      '黑方两个车都已在底线。先走车c1到c2，红车退到d2，再走车g1到g2，成杀。双方一子未吃。',
    commentHant:
      '黑方兩個車都已在底線。先走車c1到c2，紅車退到d2，再走車g1到g2，成殺。雙方一子未吃。',
  },
  {
    id: 'xq-mined-hxq_612a219fa11c138c05211e1d-33',
    name: 'Behind on material, mating first',
    zhHans: '少子先杀',
    zhHant: '少子先殺',
    comment:
      'Black starts 650 centipawns down and mates in three. The chariot takes the advisor on f1, the general steps to e2, the second chariot swings to b2, and the first one finishes on f3.',
    commentHans:
      '黑方开局落后650分，三步成杀。车吃掉f1的士，红帅走到e2，另一个车摆到b2，第一个车落f3收局。',
    commentHant:
      '黑方開局落後650分，三步成殺。車吃掉f1的士，紅帥走到e2，另一個車擺到b2，第一個車落f3收局。',
  },
  {
    id: 'xq-mined-hxq_ab87f105f0ea32c9a69f2bb9-26',
    name: 'The line that only wins material',
    zhHans: '只赢子，不成杀',
    zhHant: '只贏子，不成殺',
    comment:
      'No mate, just material. Five plies later Red has an elephant, a cannon and a chariot for nothing. Most of the corpus looks like this, because most real blunders lose pieces rather than lose the game outright.',
    commentHans:
      '没有杀棋，只是赢子。五步之后红方白得一象、一炮、一车。题库里大多数题目都是这样，因为真实对局中的错着多半是丢子，而不是当场输棋。',
    commentHant:
      '沒有殺棋，只是贏子。五步之後紅方白得一象、一炮、一車。題庫裡大多數題目都是這樣，因為真實對局中的錯著多半是丟子，而不是當場輸棋。',
  },
  {
    id: 'xq-mined-hxq_282c7e105d9270ca6038e4c3-87',
    name: 'Give the chariot away, mate next move',
    zhHans: '弃车，下一步杀',
    zhHant: '棄車，下一步殺',
    comment:
      'Black plays the chariot to f5, where the horse takes it, and mates with the other chariot on f3. A material count calls the key move a blunder, so the difficulty prior has to reward it instead.',
    commentHans:
      '黑方把车走到f5送吃，红马吃掉之后，另一个车在f3成杀。按子力计算，这一手是错着，所以难度评估必须反过来奖励它。',
    commentHant:
      '黑方把車走到f5送吃，紅馬吃掉之後，另一個車在f3成殺。按子力計算，這一手是錯著，所以難度評估必須反過來獎勵它。',
  },
  {
    id: 'xq-mined-hxq_50982b077aec4bcae49c5832-86',
    name: 'Chariot and horse against the full defence',
    zhHans: '车马对士象全',
    zhHant: '車馬對士象全',
    comment:
      'Red is a chariot and a horse up on the full defence, a general with both advisors and both elephants, which is a standard win. Eighteen of Red\u2019s twenty-seven legal moves force mate from here; this one is the fastest at mate in four, and three others drop the position from mate to roughly level. It is here to show how the full defence comes apart, not as a find-the-only-move puzzle.',
    commentHans:
      '红方多一车一马，对方是士象全（将、双士、双象），这是标准的必胜局面。此局红方27着合法着法中有18着都能成杀，这一着最快，四步杀；另有三着会把杀局走成大致均势。收录它是为了展示士象全如何被拆开，而不是当作只有一个正解的习题。',
    commentHant:
      '紅方多一車一馬，對方是士象全（將、雙士、雙象），這是標準的必勝局面。此局紅方27著合法著法中有18著都能成殺，這一著最快，四步殺；另有三著會把殺局走成大致均勢。收錄它是為了展示士象全如何被拆開，而不是當作只有一個正解的習題。',
  },
  {
    id: 'xq-mined-hxq_395a0c2b3d05bc932c9a68ff-38',
    name: 'Five captures in seven plies',
    zhHans: '七步之内五次吃子',
    zhHant: '七步之內五次吃子',
    comment:
      'Five of the seven plies are captures and a thousand centipawns change hands before the mate arrives. It opens with a soldier taking an advisor. From a 2026 master invitational.',
    commentHans:
      '七步之中有五次吃子，成杀之前有一千分的子力易手。开头是兵吃士。出自2026年的一场大师擂台赛。',
    commentHant:
      '七步之中有五次吃子，成殺之前有一千分的子力易手。開頭是兵吃士。出自2026年的一場大師擂臺賽。',
  },
  {
    id: 'xq-mined-hxq_3299460c242fc092f982d18e-50',
    name: 'The winning move is a king step',
    zhHans: '取胜的一手是帅走一步',
    zhHant: '取勝的一手是帥走一步',
    comment:
      "Red's general goes from e2 to e1 and takes nothing. Three plies later the cannon reaches e8, and the trades that follow leave Red 650 centipawns better off than at the start.",
    commentHans:
      '红帅从e2走到e1，什么也没吃。三步之后炮到e8，随后的几次交换让红方比开局多出650分。',
    commentHant:
      '紅帥從e2走到e1，什麼也沒吃。三步之後炮到e8，隨後的幾次交換讓紅方比開局多出650分。',
  },
  {
    id: 'xq-mined-hxq_44502a043b19bb7ed7d700c2-64',
    name: 'Which advisor steps up',
    zhHans: '哪个士上二路',
    zhHant: '哪個士上二路',
    comment:
      'Both of Red\u2019s advisors can step to e2 and only one of them wins. The advisor on f1 is what stops Black\u2019s chariot reaching the back rank, so moving that one runs into chariot to h1 and Red has to give a chariot back: 0.00. Step up with the d1 advisor instead and it is +913. Material is dead level at the start, six of the seven plies capture nothing, and the seventh takes a whole chariot.',
    commentHans:
      '红方两个士都能上到e2，但只有一个能赢。f1的士正挡着黑车通往底线，动了它就会挨车h1，红方只好还回一个车，评分0.00；改用d1的士上二路，评分是+913。开局子力完全均等，七步里有六步一子未吃，第七步吃掉整整一个车。',
    commentHant:
      '紅方兩個士都能上到e2，但只有一個能贏。f1的士正擋著黑車通往底線，動了它就會挨車h1，紅方只好還回一個車，評分0.00；改用d1的士上二路，評分是+913。開局子力完全均等，七步裡有六步一子未吃，第七步吃掉整整一個車。',
  },
  {
    id: 'xq-mined-hxq_14d5d0d7fe8d4c382417c4aa-51',
    name: 'Nothing captured, and it is mate',
    zhHans: '全程无吃子的杀局',
    zhHant: '全程無吃子的殺局',
    comment:
      'From a real tournament game, Guangdong against Shandong, April 2026. Four different Black pieces move, neither side captures anything, and it is mate.',
    commentHans:
      '出自真实的比赛对局：2026年4月，广东对山东。黑方四个不同的子先后出动，双方一子未吃，结果是杀。',
    commentHant:
      '出自真實的比賽對局：2026年4月，廣東對山東。黑方四個不同的子先後出動，雙方一子未吃，結果是殺。',
  },
  {
    id: 'xq-mined-hxq_030c8f1498825794c0537e74-60',
    name: 'Down two chariots, and winning',
    zhHans: '少两个车，仍是胜势',
    zhHant: '少兩個車，仍是勝勢',
    comment:
      'Red is 1,850 centipawns down, about two chariots, and the engine scores the position as won. The horse goes to c9 and the attack outruns the deficit.',
    commentHans: '红方落后1850分，约合两个车，引擎仍判为胜势。马走c9，攻势跑赢了子力的差距。',
    commentHant: '紅方落後1850分，約合兩個車，引擎仍判為勝勢。馬走c9，攻勢跑贏了子力的差距。',
  },
  {
    id: 'xq-mined-hxq_d0a0038aa930320273863772-65',
    name: 'The sacrifice that wins without mating',
    zhHans: '弃子取胜，但不成杀',
    zhHant: '棄子取勝，但不成殺',
    comment:
      'Black gives up a chariot and does not mate. The chariot goes to f2 where the general takes it, and h1 to h2 leaves Black winning by more than a chariot. A miner that kept only mates would throw this away.',
    commentHans:
      '黑方弃车，却不成杀。车走到f2被帅吃掉，再走h1到h2，黑方净胜超过一个车。只保留杀局的挖掘程序会把它丢掉。',
    commentHant:
      '黑方棄車，卻不成殺。車走到f2被帥吃掉，再走h1到h2，黑方淨勝超過一個車。只保留殺局的挖掘程式會把它丟掉。',
  },
  {
    id: 'xq-mined-hxq_134eb521cfed0660805f762a-41',
    name: 'Chariot for the mating net',
    zhHans: '弃车成杀',
    zhHant: '棄車成殺',
    comment:
      'The chariot travels the length of the board to c1, the horse comes to c3, and the chariot steps into f1 to be taken. Horse to d1 is mate. Seven hundred centipawns net, for a mate in four.',
    commentHans:
      '车从底线一路走到c1，马跳到c3，然后车进f1送吃。马到d1成杀。净弃七百分，换一个四步杀。',
    commentHant:
      '車從底線一路走到c1，馬跳到c3，然後車進f1送吃。馬到d1成殺。淨棄七百分，換一個四步殺。',
  },
];

/**
 * A chapter carrying the puzzle's position and its solution as the mainline.
 *
 * `rootFen` is what makes a chapter a composition rather than a game: without
 * it the widget renders the opening position under these moves and the first
 * one is illegal. The chapter i18n is keyed to an OBJECT per locale, the
 * comment i18n to a bare string; that asymmetry is in the types, not a typo.
 */
function chapterFor(pick, line) {
  const root = { annotations: {}, children: [] };
  let node = root;
  for (const uci of line.uciLine) {
    const child = { uci, annotations: {}, children: [] };
    node.children.push(child);
    node = child;
  }
  root.annotations.comments = [
    {
      text: pick.comment,
      i18n: { 'zh-Hans': pick.commentHans, 'zh-Hant': pick.commentHant },
    },
  ];
  return {
    name: pick.name,
    variant: 'xiangqi',
    // The solver's side, so the board faces the player being asked to move.
    orientation: line.side,
    i18n: { 'zh-Hans': { name: pick.zhHans }, 'zh-Hant': { name: pick.zhHant } },
    root: { version: 1, rootFen: line.startFen, root },
  };
}

function buildChapters(corpus) {
  const byId = new Map(corpus.map((p) => [p.id, p]));
  return PICKS.map((pick) => {
    const line = byId.get(pick.id);
    if (!line) throw new Error(`pick ${pick.id} is not in the served corpus`);
    return { pick, line, chapter: chapterFor(pick, line) };
  });
}

async function send(method, path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

function cookieFromFile() {
  return readFileSync(argOf('cookie', join(homedir(), '.mistboard-cookie')), 'utf8').trim();
}

const corpus = await loadCorpus();

if (command === 'survey') {
  survey(corpus);
} else if (command === 'detail') {
  const wanted = new Set(args.slice(1).filter((a) => !a.startsWith('--')));
  for (const p of corpus.filter((p) => wanted.has(p.id))) {
    console.log(describeLine(p));
    console.log(`  goal        ${JSON.stringify(p.goal)}`);
    console.log(`  themes      ${p.themes.join(', ')}`);
    console.log(
      `  material    start ${p.startBalance} -> end ${p.endBalance} (dip ${p.materialDipCp})`,
    );
    console.log(`  source      ${JSON.stringify(p.sourceGame)}`);
    console.log(`  startFen    ${p.startFen}`);
    console.log(`  iccs        ${p.iccs.join(' ')}`);
    for (const step of p.trace) console.log(`    ${step}`);
    console.log('');
  }
} else if (command === 'emit') {
  const built = buildChapters(corpus);
  console.log(JSON.stringify({ name: STUDY_NAME, chapters: built.map((b) => b.chapter) }, null, 2));
} else if (command === 'update') {
  const studyId = args[1];
  if (!studyId) throw new Error('update needs a study id');
  const built = buildChapters(corpus);
  const cookie = cookieFromFile();
  const current = await (await fetch(`${BASE}/api/studies/${studyId}`)).json();
  // Matched by POSITION, not by name: a chapter whose name is being corrected
  // cannot be found by the name it is about to have, and the study was created
  // from this list in this order.
  if (current.chapters.length !== built.length) {
    throw new Error(`study has ${current.chapters.length} chapters, PICKS has ${built.length}`);
  }
  for (const [index, entry] of built.entries()) {
    const existing = current.chapters[index];
    const renamed = existing.name !== entry.chapter.name;
    await send(
      'PATCH',
      `/api/studies/${studyId}/chapters/${existing.id}`,
      {
        root: entry.chapter.root,
        // Always sent, never conditionally: orientation is derived from the
        // puzzle's side to move, so swapping which puzzle a chapter holds can
        // change it. Leaving it out of the patch left a red-to-move position on
        // a board still flipped for the black-to-move puzzle it replaced.
        orientation: entry.chapter.orientation,
        baseVersion: existing.version,
        // The rename path takes name and i18n together; i18n alone renames to
        // nothing.
        ...(renamed ? { name: entry.chapter.name, i18n: entry.chapter.i18n } : {}),
      },
      cookie,
    );
    console.log(`  ~ ${entry.chapter.name}${renamed ? `  (was "${existing.name}")` : ''}`);
  }
  console.log(`\n${BASE}/study/${studyId}`);
} else if (command === 'publish') {
  const studyId = args[1];
  if (!studyId) throw new Error('publish needs a study id');
  await send('PATCH', `/api/studies/${studyId}`, { visibility: 'public' }, cookieFromFile());
  console.log(`${BASE}/study/${studyId} is public`);
} else if (command === 'create') {
  const built = buildChapters(corpus);
  const cookie = cookieFromFile();
  const [first, ...rest] = built;
  const study = await send(
    'POST',
    '/api/studies',
    {
      name: STUDY_NAME,
      description: STUDY_DESCRIPTION,
      i18n: STUDY_I18N,
      visibility: args.includes('--unlisted') ? 'unlisted' : 'public',
      chapter: first.chapter,
    },
    cookie,
  );
  const studyId = study.study?.id ?? study.id;
  console.log(`created study ${studyId}`);
  console.log(`  + ${first.pick.name}`);
  for (const entry of rest) {
    await send('POST', `/api/studies/${studyId}/chapters`, entry.chapter, cookie);
    console.log(`  + ${entry.pick.name}`);
  }
  console.log(`\n${BASE}/study/${studyId}`);
} else {
  console.error(`unknown command: ${command}`);
  process.exit(1);
}
