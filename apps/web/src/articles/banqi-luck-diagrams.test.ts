import { describe, expect, it } from 'vitest';
import { BANQI_LUCK_FLIP_AFTER, BANQI_LUCK_FLIP_BEFORE } from './banqi-luck-diagrams.js';

const countFaceDown = (svg: string) => (svg.match(/face-down Banqi piece/g) ?? []).length;

describe('banqi-luck flip diagrams', () => {
  it('renders the before/after pair around the ply-6 flip', () => {
    const before = BANQI_LUCK_FLIP_BEFORE();
    const after = BANQI_LUCK_FLIP_AFTER();
    expect(before).toContain('<svg');
    expect(before).toContain('BEFORE: THE G3 TILE, FACE DOWN');
    expect(after).toContain('AFTER: MY OWN SOLDIER');
    // Both carry the highlight ring on the flip square.
    expect(before).toContain('stroke="var(--site-accent');
    expect(after).toContain('stroke="var(--site-accent');
    // The flip reveals exactly one tile: the after board has one fewer face-down piece.
    expect(countFaceDown(after)).toBe(countFaceDown(before) - 1);
  });
});
