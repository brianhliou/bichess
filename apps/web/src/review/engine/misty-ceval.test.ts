// Unit coverage for the Misty (banqi) client-engine backend's pure logic: JSON→update
// parsing, variant dispatch, and the support/name helpers. The worker+wasm path is
// exercised by the in-browser review board, not here (happy-dom has no real Worker+wasm).
import { describe, expect, it } from 'vitest';
import { cevalEngineName, cevalSupported } from './ceval.js';
import { isMistyCevalVariant, mistyEngineName, parseMistyUpdate } from './misty-ceval.js';

describe('parseMistyUpdate', () => {
  it('maps ranked lines to MultiPV, best-first, with side-to-move cp', () => {
    const json = '{"lines":[{"uci":"a0b0","cp":-220,"depth":1},{"uci":"d3d3","cp":-50,"depth":1}]}';
    const update = parseMistyUpdate(json, 360_000);
    expect(update.lines).toHaveLength(2);
    expect(update.lines[0]).toMatchObject({
      multipv: 1,
      scoreCp: -220,
      mate: null,
      pvUci: ['a0b0'],
    });
    expect(update.lines[1]).toMatchObject({ multipv: 2, scoreCp: -50, pvUci: ['d3d3'] });
    expect(update.depth).toBe(1);
    expect(update.nodes).toBe(360_000);
  });

  it('returns an empty update for an engine error or malformed JSON', () => {
    expect(parseMistyUpdate('{"error":"bad_fen"}', 1000).lines).toEqual([]);
    expect(parseMistyUpdate('not json', 1000).lines).toEqual([]);
    expect(parseMistyUpdate('{"lines":[]}', 1000).lines).toEqual([]);
  });
});

describe('variant dispatch', () => {
  it('routes the Misty variants (banqi, jungleflip, jungle) to the Misty backend', () => {
    expect(isMistyCevalVariant('banqi')).toBe(true);
    expect(isMistyCevalVariant('jungleflip')).toBe(true);
    expect(isMistyCevalVariant('jungle')).toBe(true);
    expect(isMistyCevalVariant('xiangqi')).toBe(false);
    expect(isMistyCevalVariant('fortressxiangqi')).toBe(false);
  });

  it('names the engine per backend', () => {
    expect(mistyEngineName('banqi')).toBe('MistyBanqi');
    expect(mistyEngineName('jungleflip')).toBe('MistyJungleFlip');
    expect(mistyEngineName('jungle')).toBe('MistyJungle');
    expect(mistyEngineName('xiangqi')).toBeNull();
    expect(cevalEngineName('banqi')).toBe('MistyBanqi');
    expect(cevalEngineName('jungleflip')).toBe('MistyJungleFlip');
    expect(cevalEngineName('jungle')).toBe('MistyJungle');
    expect(cevalEngineName('xiangqi')).toBe('Fairy-Stockfish');
  });

  it('reports the Misty variants as supported without cross-origin isolation', () => {
    // happy-dom is not cross-origin isolated: FSF variants are unsupported here, but the
    // single-threaded Misty wasm needs no SharedArrayBuffer, so the Misty variants are supported.
    expect(cevalSupported('banqi')).toBe(true);
    expect(cevalSupported('jungleflip')).toBe(true);
    expect(cevalSupported('jungle')).toBe(true);
    expect(cevalSupported('xiangqi')).toBe(false);
  });
});
