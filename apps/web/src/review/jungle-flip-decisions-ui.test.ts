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
        canRun: true,
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
    // The luck caption was removed 2026-08-22: the summary carries the luck-free
    // grade and the per-move 🎲 badges carry the luck, with no legend under them.
    expect(root.querySelector('.review-decision-summary__caption')).toBeNull();

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

  // Regression (jgf_c61b057f, prod): a game whose analysis is cached but whose decomposition
  // never was (analysed before the decomposition shipped) must not wedge on "Grading reveals…".
  // A viewer who may compute gets an auto-run; one who may not falls back to the base summary.
  it('auto-runs the decomposition on a decisions cache miss when the viewer can compute', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const moves = firstMoves(3);
    let ran = 0;

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
        fetchCached: async () => null,
        canRun: true,
        run: async () => {
          ran += 1;
          return overlayWithFlaggedFlip();
        },
      },
    });

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(ran).toBe(1);
    expect(root.textContent).not.toContain('Grading reveals');
    expect(root.querySelector('.review-decision-summary__caption')).toBeNull();
    root.remove();
  });

  it('falls back to the base summary on a cache miss when the viewer cannot compute', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const moves = firstMoves(3);
    let ran = 0;

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
        fetchCached: async () => null,
        canRun: false,
        run: async () => {
          ran += 1;
          return overlayWithFlaggedFlip();
        },
      },
    });

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(ran).toBe(0);
    expect(root.textContent).not.toContain('Grading reveals');
    expect(root.querySelector('.analysis-summary')).not.toBeNull();
    const caption = root.querySelector('.review-decision-summary__caption');
    expect(caption!.textContent).toContain('Reveals are not graded');
    root.remove();
  });

  it('falls back to the base summary when the decomposition compute fails', async () => {
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
        fetchCached: async () => null,
        canRun: true,
        run: async () => {
          throw new Error('decisions_request_failed');
        },
      },
    });

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(root.textContent).not.toContain('Grading reveals');
    expect(root.querySelector('.analysis-summary')).not.toBeNull();
    const caption = root.querySelector('.review-decision-summary__caption');
    expect(caption!.textContent).toContain('Reveals are not graded');
    root.remove();
  });
});
