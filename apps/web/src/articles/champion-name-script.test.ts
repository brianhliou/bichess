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

describe('champion names under translation', () => {
  it('keeps each name in its own script wherever a translation exists', () => {
    const wrong: string[] = [];
    for (const champ of CHAMPIONS) {
      for (const source of strings) {
        if (!source.includes(champ.zh)) continue;
        for (const lang of ARTICLE_LANGS) {
          if (!hasTranslation(lang, source)) continue;
          const translated = translateArticleText(lang, source);
          if (!translated.includes(champ.zh)) {
            wrong.push(`[${lang}] ${champ.name}: expected ${champ.zh} to survive translation`);
          }
        }
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
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
