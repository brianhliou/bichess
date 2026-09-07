// Translations for "How Misty wins at Jungle" (study 4UhOMlsE): 52 chapter names
// and 52 root comments, every one of them generated.
//
// Split into its own module because it is seventeen templates and the script that
// applies them should not be mostly data. Same contract throughout: a string that
// does not match its template returns null and stays in English. That is what
// makes mechanical translation safe here -- a partial match would produce a
// fluent Chinese sentence stating a result the game did not have.
//
// Terminology: 斗兽棋 for the game, 兽穴 for the den, 步 for a ply (the source
// counts half-moves), 子力 for material.
//
// The source is inconsistent about the second seat: chapter NAMES say "Blue"
// while the material line inside the comments says "black". That is mirrored
// rather than normalised -- this module translates, it does not edit the study.

/** `red 227, black 217 (4v4 pieces)` -> `红 227，黑 217（4对4 子）`. The tail every
 *  comment template ends with; 黑 is the same character in both scripts. */
function materialTail(red, black, a, b, i) {
  return i === 0
    ? `最终子力：红 ${red}，黑 ${black}（${a}对${b} 子）`
    : `最終子力：紅 ${red}，黑 ${black}（${a}對${b} 子）`;
}

const NAME_RULES = [
  [
    /^(Red|Blue) wins the race from (\d+) behind$/,
    (m, i) =>
      i === 0
        ? `${m[1] === 'Red' ? '红方' : '蓝方'}落后 ${m[2]} 分仍抢先入穴`
        : `${m[1] === 'Red' ? '紅方' : '藍方'}落後 ${m[2]} 分仍搶先入穴`,
  ],
  [
    /^(Red|Blue) wins a level race$/,
    (m, i) =>
      i === 0
        ? `${m[1] === 'Red' ? '红方' : '蓝方'}在均势下抢先入穴`
        : `${m[1] === 'Red' ? '紅方' : '藍方'}在均勢下搶先入穴`,
  ],
  [
    /^(Red|Blue) converts a (\d+)-point lead at the den$/,
    (m, i) =>
      i === 0
        ? `${m[1] === 'Red' ? '红方' : '蓝方'}以 ${m[2]} 分优势入穴取胜`
        : `${m[1] === 'Red' ? '紅方' : '藍方'}以 ${m[2]} 分優勢入穴取勝`,
  ],
  [
    /^Level position, drawn by repetition$/,
    (_m, i) => (i === 0 ? '均势，重复局面成和' : '均勢，重複局面成和'),
  ],
  [
    /^Level position, drawn by the no-capture clock$/,
    (_m, i) => (i === 0 ? '均势，无吃子计时成和' : '均勢，無吃子計時成和'),
  ],
  [
    /^The one drawn game with (\d+) points in hand$/,
    (m, i) =>
      i === 0
        ? `唯一一局握有 ${m[1]} 分优势却成和的对局`
        : `唯一一局握有 ${m[1]} 分優勢卻成和的對局`,
  ],
  [
    /^The (\d+)M engine wins in (\d+) plies$/,
    (m, i) => (i === 0 ? `${m[1]}M 引擎 ${m[2]} 步取胜` : `${m[1]}M 引擎 ${m[2]} 步取勝`),
  ],
];

const COMMENT_RULES = [
  [
    /^(Red|Blue) reaches the den on ply (\d+), having been (\d+) down on material ten plies earlier\. The den settles a game that material did not\. About one game in twenty-one finishes this way\. Final material: red (\d+), black (\d+) \((\d+)v(\d+) pieces\)\.$/,
    (m, i) => {
      const side = i === 0 ? (m[1] === 'Red' ? '红方' : '蓝方') : m[1] === 'Red' ? '紅方' : '藍方';
      return i === 0
        ? `${side}第 ${m[2]} 步入穴，而十步之前还在子力上落后 ${m[3]} 分。子力没能决定的一局，由兽穴决定了。大约每二十一局会这样收场。${materialTail(m[4], m[5], m[6], m[7], 0)}`
        : `${side}第 ${m[2]} 步入穴，而十步之前還在子力上落後 ${m[3]} 分。子力沒能決定的一局，由獸穴決定了。大約每二十一局會這樣收場。${materialTail(m[4], m[5], m[6], m[7], 1)}`;
    },
  ],
  [
    /^Material was dead level ten plies before the entry, so the whole game came down to who arrived first\. (Red|Blue) did, on ply (\d+)\. Final material: red (\d+), black (\d+) \((\d+)v(\d+) pieces\)\.$/,
    (m, i) => {
      const side = i === 0 ? (m[1] === 'Red' ? '红方' : '蓝方') : m[1] === 'Red' ? '紅方' : '藍方';
      return i === 0
        ? `入穴前十步子力完全均等，所以整局就看谁先到。${side}先到，在第 ${m[2]} 步。${materialTail(m[3], m[4], m[5], m[6], 0)}`
        : `入穴前十步子力完全均等，所以整局就看誰先到。${side}先到，在第 ${m[2]} 步。${materialTail(m[3], m[4], m[5], m[6], 1)}`;
    },
  ],
  [
    /^(Red|Blue) was already (\d+) ahead ten plies out and finished at the den on ply (\d+)\. Most den entries look like this: material decides, and the den is where it gets collected\. Final material: red (\d+), black (\d+) \((\d+)v(\d+) pieces\)\.$/,
    (m, i) => {
      const side = i === 0 ? (m[1] === 'Red' ? '红方' : '蓝方') : m[1] === 'Red' ? '紅方' : '藍方';
      return i === 0
        ? `${side}在十步之前就已领先 ${m[2]} 分，第 ${m[3]} 步入穴收官。多数入穴局都是这个样子：子力决定胜负，兽穴只是把它兑现的地方。${materialTail(m[4], m[5], m[6], m[7], 0)}`
        : `${side}在十步之前就已領先 ${m[2]} 分，第 ${m[3]} 步入穴收官。多數入穴局都是這個樣子：子力決定勝負，獸穴只是把它兌現的地方。${materialTail(m[4], m[5], m[6], m[7], 1)}`;
    },
  ],
  [
    /^Drawn by threefold repetition on ply (\d+), material exactly level\. Four draws in five end like this\. Neither side threw anything away\. The position simply had nothing left in it\. Final material: red (\d+), black (\d+) \((\d+)v(\d+) pieces\)\.$/,
    (m, i) =>
      i === 0
        ? `第 ${m[1]} 步三次重复局面成和，子力完全均等。五局和棋里有四局是这样结束的。双方都没有失着，只是这个局面已经没有内容了。${materialTail(m[2], m[3], m[4], m[5], 0)}`
        : `第 ${m[1]} 步三次重複局面成和，子力完全均等。五局和棋裡有四局是這樣結束的。雙方都沒有失著，只是這個局面已經沒有內容了。${materialTail(m[2], m[3], m[4], m[5], 1)}`,
  ],
  [
    /^Drawn by the no-capture clock, then (\d+) moves by each side with nothing taken on ply (\d+), material exactly level\. Four draws in five end like this\. Neither side threw anything away\. The position simply had nothing left in it\. Final material: red (\d+), black (\d+) \((\d+)v(\d+) pieces\)\.$/,
    (m, i) =>
      i === 0
        ? `无吃子计时成和：双方各走 ${m[1]} 着未有吃子，至第 ${m[2]} 步，子力完全均等。五局和棋里有四局是这样结束的。双方都没有失着，只是这个局面已经没有内容了。${materialTail(m[3], m[4], m[5], m[6], 0)}`
        : `無吃子計時成和：雙方各走 ${m[1]} 著未有吃子，至第 ${m[2]} 步，子力完全均等。五局和棋裡有四局是這樣結束的。雙方都沒有失著，只是這個局面已經沒有內容了。${materialTail(m[3], m[4], m[5], m[6], 1)}`,
  ],
  [
    /^Drawn by the no-capture clock, then (\d+) moves by each side with nothing taken on ply (\d+) with a (\d+)-point material edge still unconverted\. One of (\d+) draws went this way\. Every other one finished inside a rat's worth of level\. Final material: red (\d+), black (\d+) \((\d+)v(\d+) pieces\)\.$/,
    (m, i) =>
      i === 0
        ? `无吃子计时成和：双方各走 ${m[1]} 着未有吃子，至第 ${m[2]} 步，且仍有 ${m[3]} 分子力优势未能兑现。${m[4]} 局和棋中只有这一局是这样，其余每一局收场时的子力差距都不到一只鼠。${materialTail(m[5], m[6], m[7], m[8], 0)}`
        : `無吃子計時成和：雙方各走 ${m[1]} 著未有吃子，至第 ${m[2]} 步，且仍有 ${m[3]} 分子力優勢未能兌現。${m[4]} 局和棋中只有這一局是這樣，其餘每一局收場時的子力差距都不到一隻鼠。${materialTail(m[5], m[6], m[7], m[8], 1)}`,
  ],
  [
    /^([\d,]+) nodes a move against ([\d,]+), a gap worth about (\d+) Elo\. The (\d+)M engine took this one on ply (\d+) by reaching the den\. Across (\d+) such games the stronger engine went (\d+)-(\d+) with (\d+) draws, so it converts an advantage when it has one and draws when it does not\. Final material: red (\d+), black (\d+)\.$/,
    (m, i) =>
      i === 0
        ? `每步 ${m[1]} 个节点对 ${m[2]} 个节点，差距约合 ${m[3]} Elo。${m[4]}M 引擎在第 ${m[5]} 步入穴拿下此局。在 ${m[6]} 局这样的对局中，较强的引擎战绩为 ${m[7]} 胜 ${m[8]} 负 ${m[9]} 和，也就是有优势时能兑现，没有优势时守和。最终子力：红 ${m[10]}，黑 ${m[11]}。`
        : `每步 ${m[1]} 個節點對 ${m[2]} 個節點，差距約合 ${m[3]} Elo。${m[4]}M 引擎在第 ${m[5]} 步入穴拿下此局。在 ${m[6]} 局這樣的對局中，較強的引擎戰績為 ${m[7]} 勝 ${m[8]} 負 ${m[9]} 和，也就是有優勢時能兌現，沒有優勢時守和。最終子力：紅 ${m[10]}，黑 ${m[11]}。`,
  ],
];

function applyRules(rules, text) {
  const trimmed = text.trim();
  for (const [pattern, format] of rules) {
    const m = pattern.exec(trimmed);
    if (m) return { 'zh-Hans': format(m, 0), 'zh-Hant': format(m, 1) };
  }
  return null;
}

/** Chapter names carry a "07. " ordinal prefix that is not language. */
export function jungleChapterName(name) {
  const m = /^(\d+\.\s*)(.*)$/.exec(name.trim());
  const prefix = m ? m[1] : '';
  const body = m ? m[2] : name.trim();
  const out = applyRules(NAME_RULES, body);
  if (!out) return null;
  return { 'zh-Hans': prefix + out['zh-Hans'], 'zh-Hant': prefix + out['zh-Hant'] };
}

export function jungleComment(text) {
  return applyRules(COMMENT_RULES, text);
}

export const JUNGLE_STUDY_I18N = {
  'zh-Hans': {
    name: 'Misty 是怎么下斗兽棋的',
    description:
      'Misty 以全力自战的五十二局对局，供你逐着查看。挑选的是能说明问题的局：抢先入穴、子力优势的兑现，以及和棋。每一章的说明都由该局自身的数据生成，不是事后追加的评语。',
  },
  'zh-Hant': {
    name: 'Misty 是怎麼下鬥獸棋的',
    description:
      'Misty 以全力自戰的五十二局對局，供你逐著查看。挑選的是能說明問題的局：搶先入穴、子力優勢的兌現，以及和棋。每一章的說明都由該局自身的資料生成，不是事後追加的評語。',
  },
};
