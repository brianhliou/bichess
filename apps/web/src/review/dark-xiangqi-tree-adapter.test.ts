import { fsfUciToXiangqiSquares, type XiangqiMove } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { darkXiangqiTreeAdapter } from './dark-xiangqi-tree-adapter.js';

// Web-side half of the fog hidden-info guarantee: the fog tree adapter projects a
// FULLY REVEALED truth board plus each seat's fogged POV, and a POV must never leak
// a hidden piece's identity — a shrouded square carries color only, never the piece.

const move = (uci: string): XiangqiMove => {
  const m = fsfUciToXiangqiSquares(uci);
  if (!m) throw new Error(`bad uci ${uci}`);
  return m;
};

/** Truth after a couple of real opening moves from the initial position. */
function sampleTruth() {
  let truth = darkXiangqiTreeAdapter.initialTruth();
  for (const uci of ['b3b4', 'b8b7', 'h3h4']) {
    truth = darkXiangqiTreeAdapter.applyMove(truth, move(uci));
  }
  return truth;
}

describe('darkXiangqiTreeAdapter.project', () => {
  it('projects the triptych: one primary truth board + two secondary POV boards', () => {
    const views = darkXiangqiTreeAdapter.project(sampleTruth());
    expect(views.map((v) => v.key)).toEqual(['truth', 'red', 'black']);
    expect(views.map((v) => v.tier)).toEqual(['primary', 'secondary', 'secondary']);
  });

  it('reveals every piece on the truth board with full identity', () => {
    const truth = sampleTruth();
    const truthView = darkXiangqiTreeAdapter.project(truth).find((v) => v.key === 'truth')!.view;
    // Every occupied square carries a full piece (never a color-only shroud), and
    // the whole board is "visible" so the fog layer paints nothing.
    for (const entry of Object.values(truthView.board)) {
      expect(entry && 'piece' in entry && entry.shrouded === false).toBe(true);
    }
    // Full 32-piece opening (no captures in the sample line).
    expect(Object.keys(truthView.board)).toHaveLength(32);
    expect(truthView.visibleSquares.length).toBe(90);
  });

  it('masks shrouded piece identity to color-only on both POV boards', () => {
    const views = darkXiangqiTreeAdapter.project(sampleTruth());
    for (const key of ['red', 'black'] as const) {
      const view = views.find((v) => v.key === key)!.view;
      // Fog is active: a seat cannot see the entire 32-piece board.
      expect(Object.keys(view.board).length).toBeLessThan(32);
      // The core guarantee: no shrouded entry ever carries a piece identity.
      for (const entry of Object.values(view.board)) {
        if (entry?.shrouded) {
          expect('piece' in entry).toBe(false);
          expect(entry).toHaveProperty('color');
        } else {
          expect(entry && 'piece' in entry).toBe(true);
        }
      }
    }
  });

  it('gives each projected board a distinct fog-mask id so masks cannot collide', () => {
    const views = darkXiangqiTreeAdapter.project(sampleTruth());
    const ids = views.map((v) => v.view.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
