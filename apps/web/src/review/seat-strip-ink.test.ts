import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seatStripInks } from './seat-strip-ink.js';

// The two shapes every review presentation's `perspective` takes today.
const chess = (flipped: boolean) => (flipped ? 'black' : 'white');
const xiangqi = (flipped: boolean) => (flipped ? 'black' : 'red');

describe('seatStripInks', () => {
  it('gives chess its real inks, not the red/black the seat SLOTS are named', () => {
    // The regression: an `isRed` boolean here painted White's disc red on every
    // fog-chess review page, because "is the first mover" and "is red" are the
    // same question in every variant except this one.
    expect(seatStripInks(chess, false)).toEqual({ bottom: 'white', top: 'black' });
    expect(seatStripInks(chess, true)).toEqual({ bottom: 'black', top: 'white' });
  });

  it('leaves the red/black variants exactly as they were', () => {
    expect(seatStripInks(xiangqi, false)).toEqual({ bottom: 'red', top: 'black' });
    expect(seatStripInks(xiangqi, true)).toEqual({ bottom: 'black', top: 'red' });
  });

  it('always seats opposite inks', () => {
    for (const perspective of [chess, xiangqi]) {
      for (const flipped of [false, true]) {
        const { top, bottom } = seatStripInks(perspective, flipped);
        expect(top).not.toBe(bottom);
      }
    }
  });
});

describe('seat-labels.css', () => {
  // Path relative to apps/web, the convention the other source-reading tests use.
  // Comments are stripped first: this file's own comments NAME the token the rules
  // must not use, and a substring check would otherwise fail on the explanation.
  const css = readFileSync('src/review/seat-labels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('styles every ink a presentation can hand it', () => {
    // tree-review builds the class as `review-seat--${ink}`, so an ink with no rule
    // renders the unstyled base disc and silently says nothing about who is who.
    for (const ink of ['red', 'white', 'black']) {
      expect(css).toContain(`.review-seat--${ink} .review-seat__disc`);
    }
  });

  it('never paints a seat disc with a theme-flipping token', () => {
    // The second half of the same bug: `var(--site-text)` inverts to a light grey
    // in dark mode, so the BLACK seat rendered nearly white. A disc carries an INK
    // and an ink does not change when the page theme does. Fallbacks inside
    // var(--seat-dark-ink, …) are per-variant ink overrides and are fine; the
    // site's own text/surface tokens are not.
    const inkRules = css
      .split('}')
      .filter((block) => block.includes('.review-seat--') && block.includes('.review-seat__disc'));
    expect(inkRules.length).toBeGreaterThan(0);
    for (const block of inkRules) {
      expect(block).not.toContain('var(--site-text)');
      expect(block).not.toContain('var(--site-surface)');
    }
  });
});
