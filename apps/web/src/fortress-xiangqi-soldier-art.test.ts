import { createInitialFortressXiangqiState, getFortressXiangqiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderFortressXiangqiBoardSvg } from './fortress-xiangqi-render.js';

// Rank 5 is the whole bug. Fortress is 7x8 with the river between 4 and 5, but
// the 9x10 predicate the renderer used until 2026-09-03 splits at 5/6 — so on
// rank 5 a black soldier drew promoted a rank early and a red one drew raw a
// rank late. Art only; the kernel was right throughout. Neither the kernel test
// (which tests d7 and d4 and skips 5) nor the crossed-soldier test (10-rank
// only) covered this square, which is why it shipped.

function boardWith(board: Record<string, { color: 'red' | 'black'; role: string }>): string {
  const base = createInitialFortressXiangqiState('soldier-art');
  const state = { ...base, board } as typeof base;
  return renderFortressXiangqiBoardSvg(getFortressXiangqiPlayerView(state, 'red'), 'red', {
    pieceSet: 'international',
    coordinates: false,
  });
}

const GENERALS = {
  b2: { color: 'red', role: 'general' },
  f7: { color: 'black', role: 'general' },
} as const;

describe('fortress soldier art follows the fortress river, not the 9x10 one', () => {
  it('black on rank 5 is still at home: base art', () => {
    const svg = boardWith({ ...GENERALS, f5: { color: 'black', role: 'soldier' } });
    expect(svg).toContain('black-soldier.png');
    expect(svg).not.toContain('black-crossed-soldier.png');
  });

  it('black on rank 4 has crossed: promoted art', () => {
    const svg = boardWith({ ...GENERALS, f4: { color: 'black', role: 'soldier' } });
    expect(svg).toContain('black-crossed-soldier.png');
  });

  it('red on rank 5 has crossed: promoted art', () => {
    const svg = boardWith({ ...GENERALS, d5: { color: 'red', role: 'soldier' } });
    expect(svg).toContain('red-crossed-soldier.png');
  });

  it('red on rank 4 is still at home: base art', () => {
    const svg = boardWith({ ...GENERALS, d4: { color: 'red', role: 'soldier' } });
    expect(svg).toContain('red-soldier.png');
    expect(svg).not.toContain('red-crossed-soldier.png');
  });
});
