import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createInitialXiangqiState } from './variants-xiangqi.js';
import { applyStandardXiangqiMove } from './variants-xiangqi-standard.js';
import { classifyXiangqiMove, type XiangqiPositiveGlyph } from './xiangqi-move-classification.js';
import { pikafishUciToXiangqiSquares } from './xiangqi-uci.js';

// Plies from the national/world championship games that the classifier MUST
// mark, each hand-verified against the board and the engine (see the fixture's
// `why`). They carry the engine numbers that decided them, so this test pins
// the rule to real positions rather than to the diagrams in the sibling test.
// A threshold change that drops one of these is a change to what `!!` and `!`
// mean, and should be argued, not tuned.

type PositiveCase = {
  key: string;
  ply: number;
  wxf: string;
  expect: XiangqiPositiveGlyph;
  iccs: string;
  evals: {
    winBefore: number;
    winAfter: number;
    playedBest: boolean;
    secondBestWin?: number;
    winTwoPliesAgo?: number;
  };
  pvAfter: string;
  pvAfterCapture?: string;
};

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/xiangqi-move-classification/positive-cases.json', import.meta.url),
    'utf8',
  ),
) as { cases: PositiveCase[] };

const decodeLine = (line: string) =>
  line
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const move = pikafishUciToXiangqiSquares(token);
      assert.ok(move, `bad engine token ${token}`);
      return move;
    });

test('the positive fixture covers both glyphs', () => {
  const glyphs = new Set(fixture.cases.map((c) => c.expect));
  assert.ok(glyphs.has('brilliant') && glyphs.has('great'));
});

for (const c of fixture.cases) {
  test(`${c.key} ply ${c.ply} (${c.wxf}) is marked ${c.expect}`, () => {
    const moves = decodeLine(c.iccs);
    assert.equal(moves.length, c.ply, 'the fixture line runs through the ply itself');
    let state = createInitialXiangqiState(`positive-${c.key}`);
    for (let i = 0; i < c.ply - 1; i += 1) {
      const next = applyStandardXiangqiMove(state, moves[i]!);
      assert.notEqual(next, state, `${c.key}: ply ${i + 1} is not legal`);
      state = next;
    }
    const result = classifyXiangqiMove({
      before: state,
      move: moves[c.ply - 1]!,
      ...c.evals,
      pvAfter: decodeLine(c.pvAfter),
      pvAfterCapture: c.pvAfterCapture ? decodeLine(c.pvAfterCapture) : null,
    });
    assert.equal(result.glyph, c.expect, `${c.key}: ${result.reason}`);
  });
}
