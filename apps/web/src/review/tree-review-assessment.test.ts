// A grafted server-analysis variation ends with a positional-assessment glyph
// (the chess-book verdict), keyed to the LAST move of the line. This mounts the
// real xiangqi review with a one-blunder analysis whose best line is a central
// cannon, and asserts the terminal of that grafted line carries the symbol.
import type { XiangqiMove } from '@mistboard/game';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameAnalysis } from './game-analysis.js';
import { mountXiangqiReview } from './xiangqi-review.js';

// Red plays a quiet edge move (b1a3); the engine says the central cannon (b3e3)
// was far better, reaching a clear red plus. That eval closes the grafted line.
const PLAYED: XiangqiMove[] = [{ from: 'b1', to: 'a3' }];

const ANALYSIS: GameAnalysis = {
  engineId: 'test',
  depth: 12,
  evals: [
    // Before the played move (ply 0): best is b3e3, and best play reaches +250 (a
    // clear red plus → ±). This is the eval the grafted variation resolves to.
    { ply: 0, cp: 250, mate: null, best: 'b3e3', pv: ['b3e3', 'h8e8'] },
    { ply: 1, cp: 20, mate: null, best: 'h8e8', pv: ['h8e8'] },
  ],
  moves: [{ ply: 1, mover: 'red', judgment: 'blunder', accuracy: 20 }],
  chancePlies: [],
  unstablePlies: [],
  bestPlayedPlies: [],
  red: { accuracy: 20, inaccuracies: 0, mistakes: 0, blunders: 1, acpl: 200 },
  black: { accuracy: 100, inaccuracies: 0, mistakes: 0, blunders: 0, acpl: 0 },
};

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  mountXiangqiReview(root, {
    ariaLabel: 'Review',
    title: 'Review',
    summary: '',
    moves: PLAYED,
    analysis: {
      requestLabel: 'Analyse',
      fetchCached: async () => ANALYSIS,
      run: async () => ANALYSIS,
    },
  });
  return root;
}

describe('grafted variation assessment', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('closes the refutation line with an advantage glyph on its last move', async () => {
    const root = mount();
    // fetchCached resolves on mount; let the analysis land and graft.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const assessments = [...root.querySelectorAll('.review-move-list__assessment')]
      .map((el) => el.textContent)
      .filter(Boolean);
    // The +250 red-POV eval is a clear red plus.
    expect(assessments).toContain('±');
    // And exactly one line was grafted, so exactly one verdict shows.
    expect(assessments).toHaveLength(1);
  });
});
