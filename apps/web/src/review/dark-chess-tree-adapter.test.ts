import type { Move } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { darkChessTreeAdapter } from './dark-chess-tree-adapter.js';

// Web-side half of the fog hidden-info guarantee for Fog Chess: the adapter projects
// a FULLY REVEALED truth board plus each seat's fogged POV. Dark-chess fog masks by
// ABSENCE — a POV board omits every square the seat cannot see, so it can never leak
// a hidden piece's identity or existence.

const uci = (s: string): Move => {
  const m = darkChessTreeAdapter.fromUci(s, darkChessTreeAdapter.initialTruth());
  if (!m) throw new Error(`bad uci ${s}`);
  return m;
};

/** Truth after a short opening (1.e4 e5 2.Nf3). */
function sampleTruth() {
  let truth = darkChessTreeAdapter.initialTruth();
  for (const m of ['e2e4', 'e7e5', 'g1f3']) {
    truth = darkChessTreeAdapter.applyMove(truth, uci(m));
  }
  return truth;
}

describe('darkChessTreeAdapter.project', () => {
  it('projects the triptych: one primary truth board + two secondary POV boards', () => {
    const views = darkChessTreeAdapter.project(sampleTruth());
    expect(views.map((v) => v.key)).toEqual(['truth', 'white', 'black']);
    expect(views.map((v) => v.tier)).toEqual(['primary', 'secondary', 'secondary']);
  });

  it('reveals the whole board on the truth projection', () => {
    const truth = sampleTruth();
    const truthView = darkChessTreeAdapter.project(truth).find((v) => v.key === 'truth')!.view;
    // No captures in the sample line, so all 32 pieces are on the truth board, and
    // the whole board is "visible" so the fog layer paints nothing.
    expect(Object.keys(truthView.board)).toHaveLength(32);
    expect(truthView.visibleSquares.length).toBe(64);
  });

  it('hides unseen enemy pieces on the POV boards (fog masks by absence)', () => {
    const truth = sampleTruth();
    const views = darkChessTreeAdapter.project(truth);
    const truthBoard = views.find((v) => v.key === 'truth')!.view.board;

    for (const key of ['white', 'black'] as const) {
      const view = views.find((v) => v.key === key)!.view;
      const visible = new Set(view.visibleSquares);
      // Every piece the seat sees is a real piece at a square it can actually see.
      for (const [square, piece] of Object.entries(view.board)) {
        expect(visible.has(square as never)).toBe(true);
        expect(piece).toBeTruthy();
      }
      // Fog actually hides something: fewer pieces than the full truth board.
      expect(Object.keys(view.board).length).toBeLessThan(Object.keys(truthBoard).length);
      // The seat always sees its own pieces (16 at the start of this line).
      const own = Object.values(view.board).filter((p) => p?.color === key).length;
      expect(own).toBe(16);
    }
  });

  it('labels moves in SAN and round-trips move UCI', () => {
    const truth = darkChessTreeAdapter.initialTruth();
    expect(darkChessTreeAdapter.moveLabel(uci('e2e4'), truth)).toBe('e4');
    expect(darkChessTreeAdapter.moveLabel(uci('g1f3'), truth)).toBe('Nf3');
    const move = uci('e7e8q');
    expect(darkChessTreeAdapter.moveKey(move)).toBe('e7e8q');
    expect(darkChessTreeAdapter.fromUci('e7e8q', truth)).toEqual({
      from: 'e7',
      to: 'e8',
      promotion: 'queen',
    });
  });
});
