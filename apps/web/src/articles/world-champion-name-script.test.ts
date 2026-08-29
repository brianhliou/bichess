import { WORLD_CHAMPIONS } from '@mistboard/board-render';
import { describe, expect, it } from 'vitest';
import { ARTICLE_LANGS, hasTranslation, translateArticleText } from '../article-i18n.js';
import { articleProse, articleTranslationSourceStrings } from '../article-prose.js';
import { xiangqiWorldChampionshipArticle as article } from './content/xiangqi-world-championship.js';

// A person's name is written in the script that person uses. The national
// champions page could state that as one rule for all twenty-two of its names,
// because every one of them is a mainland player. This page cannot: eleven
// world champions and their opponents include Chinese Taipei, Hong Kong, Macau
// and Vietnam, and for those players traditional characters ARE the name.
//
// So the rule has two halves here, and a test for only the first half would
// pass while the second silently broke.
const MAINLAND = [
  '吕钦',
  '赵国荣',
  '徐天红',
  '许银川',
  '赵鑫鑫',
  '蒋川',
  '王天一',
  '郑惟桐',
  '徐超',
  '孟辰',
  '王廓',
  '殷升',
  '胡荣华',
];

// Simplified rendering -> the traditional rendering that must appear instead.
const NOT_MAINLAND: Array<[string, string]> = [
  ['吴贵临', '吳貴臨'], // Chinese Taipei
  ['李锦欢', '李錦歡'], // Macau
  ['黄学谦', '黃學謙'], // Hong Kong
  ['冯家俊', '馮家俊'], // Hong Kong
  ['赖理兄', '賴理兄'], // Vietnam
];

// The names live in headings and captions (prose) AND inside the replay specs
// and the table, which prose deliberately skips. Both are dictionary keys, so
// both are checked.
const sources = [
  ...new Set([
    ...articleProse(article).map((entry) => entry.text),
    ...articleTranslationSourceStrings([article]),
  ]),
];

describe('world champion names under translation', () => {
  it('keeps a mainland name in simplified for the Traditional reader', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const source of sources) {
      if (!hasTranslation('zh-Hans', source)) continue;
      const hans = translateArticleText('zh-Hans', source);
      for (const name of MAINLAND) {
        if (!hans.includes(name)) continue;
        checked += 1;
        const hant = translateArticleText('zh-Hant', source);
        if (!hant.includes(name)) {
          wrong.push(`${name}: converted in zh-Hant, from "${hans.slice(0, 44)}"`);
        }
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
    // Guards the guard: with no mainland name found, the loop above passes for
    // free, which is exactly what a broken extraction looks like.
    expect(checked, 'no mainland name was found to protect').toBeGreaterThan(MAINLAND.length);
  });

  it('writes a non-mainland name in the script that player uses', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const source of sources) {
      if (!hasTranslation('zh-Hans', source)) continue;
      const hans = translateArticleText('zh-Hans', source);
      for (const [simplified, traditional] of NOT_MAINLAND) {
        if (!hans.includes(simplified)) continue;
        checked += 1;
        const hant = translateArticleText('zh-Hant', source);
        if (!hant.includes(traditional)) {
          wrong.push(
            `${simplified}: expected ${traditional} in zh-Hant, got "${hant.slice(0, 44)}"`,
          );
        }
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
    expect(checked, 'no non-mainland name was found to convert').toBeGreaterThanOrEqual(
      NOT_MAINLAND.length,
    );
  });

  it('names every world champion in both scripts', () => {
    // The chart and the table are built from WORLD_CHAMPIONS, so a champion
    // whose name never reaches the dictionary renders English in a Chinese row.
    const missing = WORLD_CHAMPIONS.filter((champion) =>
      ARTICLE_LANGS.some((lang) => !hasTranslation(lang, champion.name)),
    );
    expect(missing.map((c) => c.name), 'champions with no name translation').toEqual([]);
  });
});
