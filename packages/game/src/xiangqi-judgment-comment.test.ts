import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  judgmentComment,
  parseJudgmentComment,
  type XiangqiJudgment,
} from './xiangqi-judgment-comment.js';

// The writer and the reader of this sentence live in different programs (two
// study builders write it, the article replay renderer reads it), so the only
// thing holding them together is that they are the same two functions and that
// these tests say they agree. `mate in 4` is in the matrix on purpose: the
// renderer's own former copy of the pattern could not match it, and five moves
// on a shipped article page rendered raw English because of it.
const CASES: XiangqiJudgment[] = [];
for (const judgment of ['blunder', 'mistake', 'inaccuracy']) {
  for (const evalText of ['+1.12', '-0.11', 'mate in 4', 'mate in 14', '']) {
    for (const hasLine of [true, false]) {
      CASES.push({ judgment, lost: '12.3', evalText, hasLine });
    }
  }
}

describe('xiangqi judgment comments', () => {
  it('every comment it writes, it can read back', () => {
    for (const source of CASES) {
      const text = judgmentComment(source);
      const parsed = parseJudgmentComment(text);
      assert.ok(parsed, `did not parse: ${text}`);
      assert.deepEqual(parsed, source);
    }
  });

  it('reads the comments already stored in the published studies', () => {
    // Verbatim from `Every Xiangqi Champion`, including the two shapes the
    // template can drop: no refutation branch, and a mate score.
    for (const stored of [
      'blunder: 18.7 win% given up, eval +3.49 after. The engine wanted the line in the sibling branch.',
      'inaccuracy: 6.6 win% given up, eval mate in 14 after.',
      'blunder: 31 win% given up, eval mate in 20 after.',
    ]) {
      const parsed = parseJudgmentComment(stored);
      assert.ok(parsed, `did not parse a stored comment: ${stored}`);
      assert.equal(judgmentComment(parsed), stored);
    }
  });

  it('leaves hand-written prose alone', () => {
    // These chapters carry authored prose in the same field as the generated
    // sentence, and only the generated one may be machine-translated.
    assert.equal(
      parseJudgmentComment('Shanghai against Guangdong, and the handover between them.'),
      null,
    );
    assert.equal(parseJudgmentComment('blunder, but he got away with it'), null);
  });
});
