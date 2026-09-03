import { describe, expect, it } from 'vitest';
import { type JungleFlipWireView, renderJungleFlipMaterial } from './live-jungle-flip.js';

// Locks the material picture the Flip Jungle room builds. Until 2026-09-02 this
// room rendered no captures at all (the data was on the wire, the render hook
// was never defined), so a player had to remember which of sixteen tiles were
// gone. Captures only ever remove REVEALED animals, so the pool is exact for
// both seats; a 同归于尽 trade puts one animal in each strip.

function slots() {
  return {
    capturesTop: document.createElement('div'),
    capturesBottom: document.createElement('div'),
    hiddenPool: document.createElement('div'),
  };
}

function labels(el: HTMLElement): (string | null)[] {
  return [...el.querySelectorAll<HTMLElement>('.review-capture-piece')].map((span) =>
    span.getAttribute('aria-label'),
  );
}

// The red elephant and the blue rat are face-up; the two cats traded.
const afterTrade: JungleFlipWireView = {
  id: 'jungle-flip-material',
  perspective: 'black',
  board: {
    a1: { color: 'red', role: 'elephant', faceDown: false },
    b1: { color: 'black', role: 'rat', faceDown: false },
    c1: { faceDown: true },
  },
  legalMoves: [],
  captured: [
    { owner: 'red', role: 'cat' },
    { owner: 'black', role: 'cat' },
  ],
  status: { type: 'playing', turn: 'red' },
  ply: 5,
  firstColor: 'black',
  moveNumber: 3,
};

describe('renderJungleFlipMaterial', () => {
  it('shows both sides of a trade, viewer losses on top, and brands navy as Blue', () => {
    const s = slots();
    renderJungleFlipMaterial(s, afterTrade, 'black');
    expect(labels(s.capturesTop)).toEqual(['black cat']);
    expect(labels(s.capturesBottom)).toEqual(['red cat']);
    const rows = [...s.hiddenPool.querySelectorAll<HTMLElement>('.hidden-pool__row')];
    expect(rows.map((row) => row.dataset.ink)).toEqual(['red', 'black']);
    expect(rows.map((row) => row.querySelector('.hidden-pool__label')?.textContent)).toEqual([
      'Red',
      'Blue',
    ]);
    // Red: eight animals minus the revealed elephant minus the traded cat.
    expect(labels(rows[0]!)).toEqual([
      'Red lion',
      'Red tiger',
      'Red leopard',
      'Red wolf',
      'Red dog',
      'Red rat',
    ]);
    // Blue: minus the revealed rat minus the traded cat.
    expect(labels(rows[1]!)).toEqual([
      'Blue elephant',
      'Blue lion',
      'Blue tiger',
      'Blue leopard',
      'Blue wolf',
      'Blue dog',
    ]);
    expect(s.hiddenPool.querySelectorAll('.captures-count-badge')).toHaveLength(0);
  });

  it('before the opening flip binds an ink, the strips stay empty and both full pools show', () => {
    const s = slots();
    const opening: JungleFlipWireView = {
      ...afterTrade,
      board: { a1: { faceDown: true } },
      captured: [],
      ply: 0,
      firstColor: null,
    };
    renderJungleFlipMaterial(s, opening, null);
    expect(s.capturesTop.childElementCount).toBe(0);
    expect(s.capturesBottom.childElementCount).toBe(0);
    const rows = [...s.hiddenPool.querySelectorAll<HTMLElement>('.hidden-pool__row')];
    expect(rows.map((row) => row.dataset.ink)).toEqual(['red', 'black']);
    expect(labels(rows[0]!)).toHaveLength(8);
    expect(labels(rows[1]!)).toHaveLength(8);
  });
});
