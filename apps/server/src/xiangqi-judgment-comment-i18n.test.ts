import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgmentComment, parseJudgmentComment, type XiangqiJudgment } from '@mistboard/game';
import { JUDGMENT_LANGS, judgmentCommentI18n } from './xiangqi-judgment-comment-i18n.js';

// The two study builders reach this dictionary from opposite directions:
// seed-xiangqi-champions-study.ts has the analysis row and builds the sentence,
// scripts/world-title-study.mjs has the finished sentence (committed in the
// article) and parses it back. The extraction is only safe while those two agree.
const CASES: XiangqiJudgment[] = [];
for (const judgment of ['blunder', 'mistake', 'inaccuracy']) {
  for (const evalText of ['+1.12', 'mate in 4', '']) {
    for (const hasLine of [true, false]) {
      CASES.push({ judgment, lost: '12.3', evalText, hasLine });
    }
  }
}

describe('judgment comment translations', () => {
  it('the two builders produce the same overlay for the same comment', () => {
    for (const source of CASES) {
      const fromFields = judgmentCommentI18n(source);
      const parsed = parseJudgmentComment(judgmentComment(source));
      assert.ok(parsed);
      assert.deepEqual(judgmentCommentI18n(parsed), fromFields);
    }
  });

  it('translates into both scripts, leaving no English behind', () => {
    for (const source of CASES) {
      const i18n = judgmentCommentI18n(source);
      for (const lang of JUDGMENT_LANGS) {
        assert.ok(i18n[lang].length > 0, `${lang} is empty`);
        // A judgment word or an eval that fell through to English would leave
        // Latin letters in an otherwise Chinese sentence. That is exactly what
        // `eval mate in 14` did in five published comments.
        assert.ok(!/[A-Za-z]/.test(i18n[lang]), `${lang} is half English: ${i18n[lang]}`);
      }
      assert.notEqual(i18n['zh-Hans'], i18n['zh-Hant']);
    }
  });
});
