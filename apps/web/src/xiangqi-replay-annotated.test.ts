import { beforeEach, expect, test } from 'vitest';
import { mountXiangqiReplay, type XiangqiReplaySpec } from './xiangqi-replay.js';

// 1.C2.5 H8+7 2.H2+3 P7+1 — four real plies, enough to judge one of them.
const ICCS = 'h2e2 h9g7 h0g2 g6g5';

function host(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const base: XiangqiReplaySpec = {
  iccs: ICCS,
  red: 'Red',
  black: 'Black',
  event: 'Test',
  resultText: '1-0',
};

const mainButtons = (el: HTMLElement) => [
  ...el.querySelectorAll('.xq-replay-row .xq-replay-move-button'),
];
const branchButtons = (el: HTMLElement) => [
  ...el.querySelectorAll('.xq-replay-branch .xq-replay-move-button'),
];

let el: HTMLElement;
beforeEach(() => {
  el = host();
});

// The annotated surface is additive. An existing article passing no
// annotations must render exactly the stepper it always did.
test('a spec without annotations attaches no study nodes', () => {
  const c = mountXiangqiReplay(el, base);
  expect(el.classList.contains('xq-replay-annotated')).toBe(false);
  expect(el.querySelector('.xq-replay-grid')).toBeNull();
  expect(el.querySelector('.xq-replay-moves')).toBeNull();
  c.destroy();
});

test('annotations lay the board and the move tree out in two columns', () => {
  const c = mountXiangqiReplay(el, { ...base, annotations: { byPly: {} } });
  const grid = el.querySelector('.xq-replay-grid');
  expect(grid).not.toBeNull();
  expect(grid?.querySelector('.xq-replay-board-col .raw-svg-stepper-frame-xq')).not.toBeNull();
  expect(grid?.querySelector('.xq-replay-move-col .xq-replay-moves')).not.toBeNull();
  // Every mainline ply is listed, in WXF rather than raw squares.
  expect(mainButtons(el)).toHaveLength(4);
  expect(mainButtons(el)[0]?.textContent).toContain('C2.5');
  c.destroy();
});

test('a judged move carries its glyph and draws the engine line inline beneath it', () => {
  const c = mountXiangqiReplay(el, {
    ...base,
    annotations: { byPly: { 3: { glyph: '??', cp: -420, line: 'b0c2 c9e7' } } },
  });
  const glyphs = [...el.querySelectorAll('.xq-replay-glyph')].map((n) => n.textContent);
  expect(glyphs).toEqual(['??']);
  expect(el.querySelector('.xq-replay-glyph')?.className).toContain('blunder');

  // The variation is a branch in the tree, not a separate panel, and it is
  // visible without being opened first.
  const branch = el.querySelector('.xq-replay-branch');
  expect(branch).not.toBeNull();
  expect(branchButtons(el)).toHaveLength(2);
  expect(mainButtons(el)).toHaveLength(4);
  c.destroy();
});

test('clicking into the line steps the board, and arrows walk the line not the game', () => {
  const c = mountXiangqiReplay(el, {
    ...base,
    annotations: { byPly: { 3: { glyph: '?', cp: -180, line: 'b0c2 c9e7 a0b0' } } },
  });
  (branchButtons(el)[0] as HTMLButtonElement).click();
  expect(branchButtons(el)[0]?.className).toContain('is-current');

  (el.querySelector('.stepper-button-next') as HTMLButtonElement).click();
  expect(branchButtons(el)[1]?.className).toContain('is-current');

  (el.querySelector('.xq-replay-line-exit') as HTMLButtonElement).click();
  expect(el.querySelector('.xq-replay-branch .is-current')).toBeNull();
  c.destroy();
});

// A line that does not replay legally (a stale annotation against a corrected
// record) must truncate rather than throw or notate a move that cannot be made.
test('an illegal continuation truncates the branch', () => {
  const c = mountXiangqiReplay(el, {
    ...base,
    annotations: { byPly: { 3: { glyph: '?!', cp: 0, line: 'b0c2 a0a9 a0b0' } } },
  });
  // Only the legal first move survives; the rest of the line is dropped.
  expect(branchButtons(el)).toHaveLength(1);
  expect(el.querySelector('.raw-svg-stepper-frame-xq')?.innerHTML).toContain('<svg');
  c.destroy();
});
