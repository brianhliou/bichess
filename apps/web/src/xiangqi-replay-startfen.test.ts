import { beforeEach, expect, test } from 'vitest';
import { mountXiangqiReplay, type XiangqiReplaySpec } from './xiangqi-replay.js';

// A chariot against a horse and cannon, the drawing fortress from the basic
// endgames study. Five pieces, and nothing about it is reachable from the
// opening: that is the point. A chapter set from a FEN used to replay onto a
// board of 32 pieces, so the position under the moves was simply the wrong one.
const ENDGAME = '5c3/5k3/9/3n5/9/R8/9/9/9/4K4 r - - 0 1';
const BLACK_FIRST = ENDGAME.replace(' r ', ' b ');

function host(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const base: XiangqiReplaySpec = {
  iccs: '',
  red: 'Red',
  black: 'Black',
  event: 'Basic endgames',
  resultText: '*',
  // The move list only renders for an annotated spec.
  annotations: { byPly: {} },
};

/** Each piece is drawn as a nested <svg>, so this counts the men on the board. */
const pieces = (el: HTMLElement) => el.querySelectorAll('svg svg').length;
const numbers = (el: HTMLElement) =>
  [...el.querySelectorAll('.xq-replay-move-n')].map((n) => n.textContent ?? '');

let el: HTMLElement;
beforeEach(() => {
  el = host();
});

// ICCS a4a8 f8f7 is engine a5-a9 then f9-f8: chariot up the file, king steps down.
test('a chapter rooted at a FEN replays from its own position', () => {
  const c = mountXiangqiReplay(el, { ...base, iccs: 'a4a8 f8f7', startFen: ENDGAME });
  expect(pieces(el)).toBe(5);
  expect(numbers(el)).toEqual(['1.']);
  c.destroy();
});

test('a spec with no start position still opens at the opening', () => {
  const c = mountXiangqiReplay(el, { ...base, iccs: 'h2e2 h9g7' });
  expect(pieces(el)).toBe(32);
  c.destroy();
});

test('a chapter with Black to move numbers and columns from Black', () => {
  // Black opens, so the line reads 1... , 2. and not 1. , 1...
  const c = mountXiangqiReplay(el, { ...base, iccs: 'f8f7 a4a8', startFen: BLACK_FIRST });
  expect(numbers(el)).toEqual(['1…', '2.']);
  expect(el.querySelectorAll('.xq-replay-row-black')).toHaveLength(1);
  c.destroy();
});

test('an unparseable start position falls back to the opening, not an empty board', () => {
  const c = mountXiangqiReplay(el, { ...base, iccs: 'h2e2', startFen: 'not-a-fen' });
  expect(pieces(el)).toBe(32);
  c.destroy();
});

test('a position with no moves still draws its board', () => {
  // What a position-only study chapter reduces to. The stepper has nothing to
  // step, and the board is the whole point.
  const c = mountXiangqiReplay(el, { ...base, iccs: '', startFen: ENDGAME });
  expect(pieces(el)).toBe(5);
  expect(numbers(el)).toEqual([]);
  c.destroy();
});
