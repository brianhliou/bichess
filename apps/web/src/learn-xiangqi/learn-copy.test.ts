import { describe, expect, it } from 'vitest';
import { learnCopy, learnCopyKeys } from './learn-copy.js';
import { LEARN_XIANGQI_ZH_HANS, LEARN_XIANGQI_ZH_HANT } from './learn-copy-zh.js';

// Two directions, the pair every other i18n surface in this repo checks.
//
// It matters more here than usual because of how learnCopy fails: an unknown key
// renders as the KEY, so a stage authored with a key the tables do not have puts
// `learn.xiangqi.horse.goal.7` on the page in front of a beginner. The English
// table has that property too; these tests keep the zh tables from adding to it.

const TABLES = { 'zh-Hans': LEARN_XIANGQI_ZH_HANS, 'zh-Hant': LEARN_XIANGQI_ZH_HANT };

describe('xiangqi learn copy coverage', () => {
  it('every English key is translated in both scripts', () => {
    const missing: string[] = [];
    for (const key of learnCopyKeys()) {
      for (const [lang, table] of Object.entries(TABLES)) {
        if (!table[key]?.trim()) missing.push(`[${lang}] ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('neither table carries a key the course cannot ask for', () => {
    // An orphan is the trace an edited key leaves: the rename lands in the stage
    // file, the translation stays behind, and the page silently reverts to
    // English for that one string.
    const live = new Set(learnCopyKeys());
    const orphans: string[] = [];
    for (const [lang, table] of Object.entries(TABLES)) {
      for (const key of Object.keys(table)) {
        if (!live.has(key)) orphans.push(`[${lang}] ${key}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('the two scripts are actually different text', () => {
    // A copy-paste of one table into the other would pass the coverage test and
    // ship Simplified to Traditional readers. The piece names alone differ
    // (车/車, 炮/砲, 马/馬), so a real pair disagrees on most strings.
    const identical = learnCopyKeys().filter(
      (key) => LEARN_XIANGQI_ZH_HANS[key] === LEARN_XIANGQI_ZH_HANT[key],
    );
    // Some strings genuinely are the same in both (数字, 象棋棋子). Most are not.
    expect(identical.length).toBeLessThan(learnCopyKeys().length / 3);
  });

  it('falls back to English rather than rendering the key', () => {
    expect(learnCopy('learn.xiangqi.title')).toBe('Learn xiangqi');
  });
});
