#!/usr/bin/env node
/**
 * Translate a study's own name/description and its chapter names, in place.
 *
 *   node scripts/study-name-i18n.mjs --study wd6c7qvG                       # dry run
 *   node scripts/study-name-i18n.mjs --study wd6c7qvG --write --cookie ~/.mistboard-cookie
 *
 * Why this exists rather than a translation added to a seeder: the studies it
 * covers have no seeder in this repo. They were built once, outside it, and the
 * only handle anyone has on them now is the API. `study-tag-i18n.mjs` is the same
 * shape for the same reason and this follows it deliberately.
 *
 * What it will and will not translate. A chapter name here is GENERATED -- "Game
 * 7: Red mates on move 46" is a template over a number, a side and an outcome --
 * and a template is safe to translate mechanically, the same argument the
 * judgment comments make in xiangqi-judgment-comment-i18n.ts. So the rule is a
 * PARSER plus a formatter, not eighteen hand-written strings: a name that does
 * not parse is left in English and reported, rather than guessed at.
 *
 * Study-level name and description are real prose and are written out by hand.
 *
 * Merges into whatever the record already carries and never replaces it: this
 * script owns the name half of the overlay, and a description someone translated
 * by hand must survive a run.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const argOf = (k, d = '') => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : (args[i + 1] ?? d);
};
const BASE = argOf('base', 'https://mistboard.com');
const STUDY = argOf('study');
const WRITE = args.includes('--write');
const LANGS = ['zh-Hans', 'zh-Hant'];

const stable = (v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? `{${Object.keys(v)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
        .join(',')}}`
    : JSON.stringify(v ?? null);

/**
 * Per-study rules. `study` is the hand-written prose; `chapter` parses a
 * generated name and returns one per language, or null to leave it alone.
 */
const STUDIES = {
  // Jieqi: eighteen engine games. 揭棋 is the canonical name (variant.jieqi.name
  // in the play catalog), not a transliteration.
  wd6c7qvG: {
    study: {
      'zh-Hans': {
        name: '揭棋：十八局引擎自战',
        description:
          '揭棋页面的配套研习：十八局引擎自战全谱。双方均为 PikaJieQi，设置与本站机器人实际所用一致（每步 4 秒，不限深度），所以这就是你可以挑战的那个引擎，而不是削弱版。不足 40 回合的对局，以及触及生成器步数上限的对局，均已剔除。请把它们当作参考而不是定论：该引擎没有神经网络，并且高估自己的暗子，这一偏差在深度 8 到深度 48 之间测得始终存在。规则：/rules/jieqi',
      },
      'zh-Hant': {
        name: '揭棋：十八局引擎自戰',
        description:
          '揭棋頁面的配套研習：十八局引擎自戰全譜。雙方均為 PikaJieQi，設定與本站機器人實際所用一致（每步 4 秒，不限深度），所以這就是你可以挑戰的那個引擎，而不是削弱版。不足 40 回合的對局，以及觸及產生器步數上限的對局，均已剔除。請把它們當作參考而不是定論：該引擎沒有神經網路，並且高估自己的暗子，這一偏差在深度 8 到深度 48 之間測得始終存在。規則：/rules/jieqi',
      },
    },
    chapter: jieqiChapterName,
  },
};

/**
 * "Game 7: Red mates on move 46" / "Game 3: Red wins by stalemate on move 53".
 *
 * Stalemate is 困毙 and it is a LOSS in xiangqi, so "wins by stalemate" is
 * 困毙对手 -- the side that cannot move is the side that loses. Translating it as
 * a draw, which is what the English word means in chess, would state the opposite
 * of what happened in the game the chapter contains.
 */
function jieqiChapterName(name) {
  const m = /^Game (\d+): (Red|Black) (mates|wins by stalemate) on move (\d+)$/.exec(name.trim());
  if (!m) return null;
  const [, game, side, outcome, move] = m;
  const hans = side === 'Red' ? '红方' : '黑方';
  const hant = side === 'Red' ? '紅方' : '黑方';
  const verbHans = outcome === 'mates' ? '将死对手' : '困毙对手';
  const verbHant = outcome === 'mates' ? '將死對手' : '困斃對手';
  return {
    'zh-Hans': `第 ${game} 局：${hans}第 ${move} 回合${verbHans}`,
    'zh-Hant': `第 ${game} 局：${hant}第 ${move} 回合${verbHant}`,
  };
}

export { jieqiChapterName };

async function main() {
  if (!STUDY) throw new Error('need --study <id>');
  const rules = STUDIES[STUDY];
  if (!rules) {
    throw new Error(
      `no translations recorded for ${STUDY} (known: ${Object.keys(STUDIES).join(', ')})`,
    );
  }

  const res = await fetch(`${BASE}/api/studies/${STUDY}`);
  if (!res.ok) throw new Error(`GET study ${STUDY} -> ${res.status}`);
  const { study, chapters } = await res.json();
  if (!chapters) throw new Error(`no study ${STUDY} at ${BASE}`);

  const cookie = WRITE
    ? readFileSync(argOf('cookie', join(homedir(), '.mistboard-cookie')), 'utf8').trim()
    : '';

  // Study name and description.
  const nextStudy = JSON.parse(JSON.stringify(study.i18n ?? {}));
  for (const lang of LANGS) {
    nextStudy[lang] = { ...nextStudy[lang], ...rules.study[lang] };
  }
  if (stable(nextStudy) === stable(study.i18n ?? {})) {
    console.log(`= ${study.name}`);
  } else {
    console.log(`~ ${study.name}\n    ${LANGS.map((l) => nextStudy[l].name).join('  |  ')}`);
    if (WRITE) {
      const patched = await fetch(`${BASE}/api/studies/${STUDY}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ i18n: nextStudy }),
      });
      if (!patched.ok) {
        throw new Error(`PATCH study -> ${patched.status} ${(await patched.text()).slice(0, 140)}`);
      }
    }
  }

  let changed = 0;
  const unparsed = [];
  for (const chapter of chapters) {
    const translated = rules.chapter(chapter.name);
    if (!translated) {
      unparsed.push(chapter.name);
      continue;
    }
    const next = JSON.parse(JSON.stringify(chapter.i18n ?? {}));
    for (const lang of LANGS) next[lang] = { ...next[lang], name: translated[lang] };
    if (stable(next) === stable(chapter.i18n ?? {})) {
      console.log(`  = ${chapter.name}`);
      continue;
    }
    console.log(`  ~ ${chapter.name}\n      ${LANGS.map((l) => next[l].name).join('  |  ')}`);
    changed += 1;
    if (!WRITE) continue;
    // The rename path takes name and i18n together; i18n alone would be a rename
    // to nothing.
    const patched = await fetch(`${BASE}/api/studies/${STUDY}/chapters/${chapter.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: chapter.name, i18n: next }),
    });
    if (!patched.ok) {
      throw new Error(
        `PATCH ${chapter.id} -> ${patched.status} ${(await patched.text()).slice(0, 140)}`,
      );
    }
  }

  if (unparsed.length) {
    console.log(`\nleft in English (name did not match the template):`);
    for (const name of unparsed) console.log(`  ${name}`);
  }
  console.log(
    `\n${changed} chapters ${WRITE ? 'written' : 'would change (dry run; --write to apply)'}`,
  );
}

if (process.argv[1]?.endsWith('study-name-i18n.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
