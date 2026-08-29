import { CHAMPIONS, championsWithNonDefaultScript } from '@mistboard/board-render';
import { describe, expect, it } from 'vitest';
import { ARTICLE_LANGS, hasTranslation, translateArticleText } from '../article-i18n.js';
import { articleProse } from '../article-prose.js';
import { xiangqiChampionsArticle } from './content/xiangqi-champions.js';

// A person's name is written in the script that person uses. It is not a word
// to be converted along with the sentence around it: a mainland player stays in
// simplified for a Traditional reader, because that is his name.
//
// This matters at exactly one moment, and it has not arrived yet: when this
// article is translated, a zh-Hant pass over "Yang Guanlin 杨官璘, 1956" will be
// tempted to render 楊官璘. These tests are vacuous until the dictionary exists
// and start biting the moment it does, which is the point of writing them now
// rather than after the translation lands.

const strings = articleProse(xiangqiChampionsArticle).map((entry) => entry.text);

// The rule is about people, not about the champion list, and this article names
// mainland people who never won the title: Wang Yubo's opponent and his coach.
// Protecting only CHAMPIONS put "王禹博對蘇奕霖" in the Traditional text, two
// mainland players in one game caption with one name converted and one not.
//
// Pre-simplification figures are deliberately absent. 謝俠遜 died in 1987 and
// 周恩來 in 1976, and their names are conventionally written in traditional
// characters, so converting those is the correct treatment rather than a miss.
const OTHER_MAINLAND_NAMES = ['苏奕霖', '张强'];

describe('champion names under translation', () => {
  it('keeps each name in its own script wherever a translation exists', () => {
    const wrong: string[] = [];
    const people = [
      ...CHAMPIONS.map((c) => ({ label: c.name, zh: c.zh })),
      ...OTHER_MAINLAND_NAMES.map((zh) => ({ label: zh, zh })),
    ];
    for (const person of people) {
      for (const source of strings) {
        if (!source.includes(person.zh)) continue;
        for (const lang of ARTICLE_LANGS) {
          if (!hasTranslation(lang, source)) continue;
          const translated = translateArticleText(lang, source);
          if (!translated.includes(person.zh)) {
            wrong.push(`[${lang}] ${person.label}: expected ${person.zh} to survive translation`);
          }
        }
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  // The loop above reads the ENGLISH source, which only carries hanzi for the
  // champions: the article writes every other person in romanization, so
  // "Su Yilin" has no 苏奕霖 to find and the check never fires for him. The name
  // exists only inside the translation, so the comparison has to be between the
  // two translations: whatever Simplified writes, Traditional must not convert.
  it('does not convert a mainland name that exists only in the translation', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const source of strings) {
      if (!hasTranslation('zh-Hans', source) || !hasTranslation('zh-Hant', source)) continue;
      const hans = translateArticleText('zh-Hans', source);
      const hant = translateArticleText('zh-Hant', source);
      for (const zh of OTHER_MAINLAND_NAMES) {
        if (!hans.includes(zh)) continue;
        checked++;
        if (!hant.includes(zh)) wrong.push(`${zh}: converted in zh-Hant, from "${hans.slice(0, 40)}"`);
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
    expect(checked, 'no protected non-champion name was found to check').toBeGreaterThanOrEqual(
      OTHER_MAINLAND_NAMES.length,
    );
  });

  it('records a script for anyone whose name is not in the page default', () => {
    // Every champion to date is from the mainland. When that stops being true,
    // the record has to say so, and this is what makes the omission loud.
    for (const champ of championsWithNonDefaultScript()) {
      expect(champ.zhScript, `${champ.name} needs an explicit script`).toBeTruthy();
    }
    expect(CHAMPIONS.every((c) => c.zh.length > 0)).toBe(true);
  });

  it('has at least one champion name in the prose to protect', () => {
    // Guards the guard: if the headings stop carrying hanzi, the first test
    // passes by having nothing to check.
    const named = CHAMPIONS.filter((c) => strings.some((s) => s.includes(c.zh)));
    expect(named.length).toBeGreaterThanOrEqual(CHAMPIONS.length / 2);
  });
});
