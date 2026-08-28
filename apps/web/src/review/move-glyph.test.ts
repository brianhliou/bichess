import { describe, expect, it } from 'vitest';
import { moveGlyphTone } from './move-glyph.js';

describe('moveGlyphTone', () => {
  it('maps each engine judgment class to its own tone', () => {
    expect(moveGlyphTone('??', 'blunder')).toBe('blunder');
    expect(moveGlyphTone('?', 'mistake')).toBe('mistake');
    expect(moveGlyphTone('?!', 'inaccuracy')).toBe('inaccuracy');
  });

  it('falls back to the symbol for user NAGs, which carry no class', () => {
    // tree-review's GLYPH_LABEL path clears suffixClass on purpose, so the
    // symbol is the only tone signal an authored glyph has.
    expect(moveGlyphTone('??', undefined)).toBe('blunder');
    expect(moveGlyphTone('?', undefined)).toBe('mistake');
    expect(moveGlyphTone('?!', undefined)).toBe('inaccuracy');
    expect(moveGlyphTone('!', undefined)).toBe('good');
    expect(moveGlyphTone('!!', undefined)).toBe('brilliant');
    expect(moveGlyphTone('!!', 'brilliant')).toBe('brilliant');
    expect(moveGlyphTone('!', 'great')).toBe('good');
    expect(moveGlyphTone('!?', undefined)).toBe('speculative');
  });

  it('does not trust an unrecognised class', () => {
    expect(moveGlyphTone('??', 'bogus')).toBe('blunder');
  });

  it('returns null for an absent or unknown glyph rather than a default colour', () => {
    expect(moveGlyphTone(undefined, undefined)).toBeNull();
    expect(moveGlyphTone('', undefined)).toBeNull();
    expect(moveGlyphTone('#', undefined)).toBeNull();
    expect(moveGlyphTone('N', undefined)).toBeNull();
  });
});
