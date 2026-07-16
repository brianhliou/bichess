import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBoardSvg } from './board-svg.js';
import { renderXiangqiOgBoardSvg } from './xiangqi-og-board.js';

test('static chess boards do not append a decorative outer outline', () => {
  const svg = renderBoardSvg([], [], 0, 0, 320, 'white', { clipId: 'outline-policy' });
  assert.doesNotMatch(svg, /<rect[^>]*fill="none"[^>]*stroke=/);
});

test('xiangqi OG boards do not append a decorative outer outline', () => {
  const svg = renderXiangqiOgBoardSvg({
    files: 9,
    ranks: 10,
    pieces: [],
    riverBetweenRanks: [5, 6],
    palaces: [
      { fileLo: 3, fileHi: 5, rankLo: 1, rankHi: 3 },
      { fileLo: 3, fileHi: 5, rankLo: 8, rankHi: 10 },
    ],
    centerX: 300,
    y: 0,
    height: 360,
  });
  assert.doesNotMatch(svg, /<rect[^>]*fill="none"[^>]*stroke=/);
});
