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
  // Every mainline ply is listed, in the reader's notation setting. The stored
  // default is coordinates; `notationTest` below covers the other styles.
  expect(mainButtons(el)).toHaveLength(4);
  expect(mainButtons(el)[0]?.textContent).toContain('h3-e3');
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

test('move labels follow the notation preference and relabel when it changes', () => {
  // The widget hardcoded WXF, so an article embed ignored the setting every
  // other xiangqi surface on the site obeys.
  // This environment has no localStorage; the preference reader swallows that
  // and falls back to the default, which would make the assertions below pass
  // for the wrong reason.
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  const setNotation = (value: string) => {
    store.set('mistboard.xiangqiNotation', value);
    store.set('mistboard.xiangqiNotationVersion', '1');
  };
  setNotation('wxf');
  const c = mountXiangqiReplay(el, { ...base, annotations: { byPly: {} } });
  expect(mainButtons(el)[0]?.textContent).toContain('C2.5');

  setNotation('iccs');
  window.dispatchEvent(new CustomEvent('mistboard:xiangqi-notation-changed'));
  expect(mainButtons(el)[0]?.textContent).toContain('h2e2');

  setNotation('coordinate');
  window.dispatchEvent(new CustomEvent('mistboard:xiangqi-notation-changed'));
  expect(mainButtons(el)[0]?.textContent).toContain('h3-e3');

  c.destroy();
  if (original) Object.defineProperty(window, 'localStorage', original);
  else Reflect.deleteProperty(window, 'localStorage');
});

test('the study layout drops the scrubber and the ply counter', () => {
  // The move list is the position indicator and it is clickable, so a slider
  // and a "12 / 156" readout were a second, worse copy of it.
  const c = mountXiangqiReplay(el, { ...base, annotations: { byPly: {} } });
  expect(el.querySelector('.xq-replay-slider')).toBeNull();
  expect(el.querySelector('.stepper-counter')).toBeNull();
  c.destroy();

  // The plain stepper keeps both.
  const plain = mountXiangqiReplay(el, base);
  expect(el.querySelector('.xq-replay-slider')).not.toBeNull();
  expect(el.querySelector('.stepper-counter')).not.toBeNull();
  plain.destroy();
});

test('a generated judgment note is summarised, not repeated under its own label', () => {
  // Our analysis writes a fixed template. Rendered verbatim under a head that
  // already said "Mistake" it read "Mistakemistake: 12.6 win% given up ...",
  // and its closing sentence pointed at a line now drawn inline beside it.
  const c = mountXiangqiReplay(el, {
    ...base,
    annotations: {
      byPly: {
        1: {
          glyph: '?',
          note: 'mistake: 12.6 win% given up, eval +0.10 after. The engine wanted the line in the sibling branch.',
        },
      },
    },
  });
  (mainButtons(el)[0] as HTMLButtonElement | undefined)?.click();
  const box = el.querySelector('.xq-replay-line');
  expect(box?.textContent).toContain('Mistake');
  expect(box?.textContent).toContain('12.6% win chance given up');
  expect(box?.textContent).toContain('eval +0.10');
  expect(box?.textContent).not.toContain('sibling branch');
  expect(box?.textContent?.toLowerCase().match(/mistake/g)).toHaveLength(1);
  // The engine credit is stated once in the article prose, never on a board:
  // repeated under all sixteen embeds it was noise.
  expect(el.querySelector('.xq-replay-engine')).toBeNull();
  c.destroy();
});

test('prose we did not generate is shown as written', () => {
  const c = mountXiangqiReplay(el, {
    ...base,
    annotations: {
      byPly: { 1: { glyph: '!!', note: 'Brilliant: the cannon cannot be taken.' } },
    },
  });
  (mainButtons(el)[0] as HTMLButtonElement | undefined)?.click();
  const box = el.querySelector('.xq-replay-line');
  expect(box?.textContent).toContain('the cannon cannot be taken');
  c.destroy();
});

test('the control bar gives its four buttons equal width and identical icons', () => {
  // Both halves of a real regression: the grid kept a five-column template from
  // when a ply counter sat in the middle, so the next button landed in the
  // `auto` column and rendered 13px wide against its 92px neighbours; and the
  // labels were text glyphs (U+23EE/U+23ED vs U+2190/U+2192) that resolve from
  // different fallback fonts and never match in weight or optical size.
  const c = mountXiangqiReplay(el, { ...base, annotations: { byPly: {} } });
  const controls = el.querySelector('.stepper-controls');
  const buttons = [...el.querySelectorAll('.stepper-button')];

  expect(buttons).toHaveLength(4);
  expect(controls?.children).toHaveLength(4);
  for (const button of buttons) {
    expect(button.textContent?.trim()).toBe('');
    const icon = button.querySelector('svg.stepper-icon');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(icon?.getAttribute('width')).toBe('16');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    // The icon is decoration; the button carries the name.
    expect(button.getAttribute('aria-label')).toBeTruthy();
  }
  c.destroy();
});
