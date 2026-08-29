import { describe, expect, it } from 'vitest';
import type { GameAnalysis } from './game-analysis.js';
import { createMoveAdvice, formatFlipVariantBestMove } from './move-advice.js';

const analysis: GameAnalysis = {
  engineId: 'pikafish',
  depth: 12,
  evals: [
    { ply: 0, cp: 20, mate: null, best: 'h3e3' }, // engine's pick in the position before ply 1
    { ply: 1, cp: -200, mate: null, best: null },
    { ply: 2, cp: 0, mate: null, best: null },
  ],
  moves: [
    { ply: 1, mover: 'red', judgment: 'blunder', accuracy: 10 },
    { ply: 2, mover: 'black', judgment: null, accuracy: 99 },
  ],
  chancePlies: [],
  unstablePlies: [],
  bestPlayedPlies: [],
  red: { accuracy: 10, inaccuracies: 0, mistakes: 0, blunders: 1, acpl: 200 },
  black: { accuracy: 99, inaccuracies: 0, mistakes: 0, blunders: 0, acpl: 0 },
};

describe('createMoveAdvice', () => {
  it('shows the judgment + best move for a flagged move', () => {
    const advice = createMoveAdvice();
    advice.update(1, analysis);
    expect(advice.el.hidden).toBe(false);
    expect(advice.el.textContent).toContain('Blunder.');
    expect(advice.el.textContent).toContain('h3-e3 was best.');
    expect(advice.el.className).toContain('review-advice--blunder');
  });

  it('hides for a move with no judgment', () => {
    const advice = createMoveAdvice();
    advice.update(2, analysis);
    expect(advice.el.hidden).toBe(true);
  });

  it('hides when analysis is absent', () => {
    const advice = createMoveAdvice();
    advice.update(1, null);
    expect(advice.el.hidden).toBe(true);
  });

  it('uses a supplied formatter for the best move (flip variants)', () => {
    const advice = createMoveAdvice(formatFlipVariantBestMove);
    advice.update(1, analysis); // best at ply 0 is 'h3e3'
    // h3e3 is a board MOVE (from !== to): engine ranks are 0-indexed, so +1 each.
    expect(advice.el.textContent).toContain('h4-e4 was best.');
  });
});

describe('formatFlipVariantBestMove', () => {
  it('labels a flip (from === to) with the +1 board rank', () => {
    // Engine emits 0-indexed ranks; a flip is from === to. Engine "b2b2" -> board "b3 flip".
    expect(formatFlipVariantBestMove('b2b2')).toBe('b3 flip');
    expect(formatFlipVariantBestMove('a0a0')).toBe('a1 flip');
  });

  it('labels a board move as a coordinate pair in board ranks', () => {
    expect(formatFlipVariantBestMove('c3e3')).toBe('c4-e4');
  });

  it('passes through a token it cannot parse', () => {
    expect(formatFlipVariantBestMove('x')).toBe('x');
  });
});
