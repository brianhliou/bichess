import {
  applyJungleFlipMove,
  createInitialJungleFlipState,
  getJungleFlipLegalMoves,
  type JungleFlipMove,
  STANDARD_JUNGLE_FLIP_DEAL,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { computeGameAnalysis } from './game-analysis.js';
import { mountJungleFlipReview } from './jungle-flip-review.js';
import type { DecisionOverlay } from './tree-review.js';

// End-to-end wiring test (jsdom): mount the flip-jungle review with a fake analysis + decision
// overlay and assert the visual outputs the decomposition adds — the flip glyph + per-move luck
// badge on the move list, and the headline accuracy summary re-graded luck-free (the flip counted
// as a mistake) with a luck caption instead of a separate decision block. Mirrors the banqi UI test.

function firstMoves(count: number): JungleFlipMove[] {
  let state = createInitialJungleFlipState('t', STANDARD_JUNGLE_FLIP_DEAL);
  const moves: JungleFlipMove[] = [];
  for (let i = 0; i < count; i += 1) {
    const move = getJungleFlipLegalMoves(state)[0]!;
    moves.push(move);
    state = applyJungleFlipMove(state, move);
  }
  return moves;
}

function fakeAnalysis(plyCount: number) {
  const plies = Array.from({ length: plyCount + 1 }, (_, ply) => ({
    ply,
    cp: 0,
    mate: null,
    best: null,
  }));
  // Mark ply 1 as a chance (flip) ply so its basic judgment is null — the decision overlay owns it.
  return computeGameAnalysis({ engineId: 'test', depth: 10, plies, chancePlies: [1] });
}

function overlayWithFlaggedFlip(): DecisionOverlay {
  return {
    byPly: new Map([[1, { judgment: 'mistake', accuracy: 71, luck: -12, playedRank: 5 }]]),
    red: { reveals: 1, decisionAccuracy: 71 },
    black: { reveals: 0, decisionAccuracy: 100 },
  };
}

describe('jungle-flip decision overlay wiring', () => {
  it('renders the two-number summary, the flip glyph, and the luck readout', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const moves = firstMoves(3);

    mountJungleFlipReview(root, 'room-x', STANDARD_JUNGLE_FLIP_DEAL, {
      ariaLabel: 'test',
      title: 'Flip Jungle',
      summary: 'test',
      moves,
      analysis: {
        requestLabel: 'Analyse',
        fetchCached: async () => fakeAnalysis(moves.length),
        run: async () => fakeAnalysis(moves.length),
      },
      decisions: {
        fetchCached: async () => overlayWithFlaggedFlip(),
        run: async () => overlayWithFlaggedFlip(),
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const summary = root.querySelector('.analysis-summary');
    expect(summary).not.toBeNull();
    const redBlock = summary!.querySelector('.analysis-summary__player');
    expect(redBlock!.textContent).toContain('Mistake');
    expect(summary!.textContent).not.toContain('Non-reveal');
    expect(summary!.textContent).not.toContain('centipawn');
    const caption = root.querySelector('.review-decision-summary__caption');
    expect(caption).not.toBeNull();
    expect(caption!.textContent).toContain('🎲');

    expect(root.textContent).toContain('?');

    const luckBadges = [...root.querySelectorAll('.review-move-list__luck')].filter((el) =>
      el.textContent?.includes('🎲'),
    );
    expect(luckBadges.length).toBeGreaterThan(0);
    expect(luckBadges.some((el) => el.textContent?.includes('-12%'))).toBe(true);
    expect(luckBadges.some((el) => el.classList.contains('review-move-list__luck--unlucky'))).toBe(
      true,
    );

    root.remove();
  });
});
