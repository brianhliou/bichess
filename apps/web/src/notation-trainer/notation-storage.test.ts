import { beforeEach, describe, expect, it } from 'vitest';
import { bestKey, bestScore, loadNotationBests, saveNotationScore } from './notation-storage.js';

// happy-dom gives us a window but no localStorage, so every storage test in
// this app installs its own (see account-preferences.test.ts).
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('notation bests', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
  });

  it('starts empty and reads zero for an unplayed setup', () => {
    expect(bestScore(loadNotationBests(), 'point', 'find', 'both')).toBe(0);
  });

  it('keeps the higher score', () => {
    saveNotationScore('point', 'find', 'both', 12);
    saveNotationScore('point', 'find', 'both', 7);
    expect(bestScore(loadNotationBests(), 'point', 'find', 'both')).toBe(12);
    saveNotationScore('point', 'find', 'both', 15);
    expect(bestScore(loadNotationBests(), 'point', 'find', 'both')).toBe(15);
  });

  it('scores each target and direction separately', () => {
    saveNotationScore('point', 'find', 'both', 20);
    const bests = saveNotationScore('file', 'name', 'red', 5);
    expect(bestScore(bests, 'point', 'find', 'both')).toBe(20);
    expect(bestScore(bests, 'file', 'name', 'red')).toBe(5);
    expect(bestScore(bests, 'point', 'name', 'both')).toBe(0);
    expect(bestScore(bests, 'file', 'name', 'both')).toBe(0);
  });

  // Points are absolute, so folding the side into their key would split one
  // best across three settings that are the same drill.
  it('ignores the side for points and keeps it for files', () => {
    expect(bestKey('point', 'find', 'red')).toBe(bestKey('point', 'find', 'both'));
    expect(bestKey('file', 'find', 'red')).not.toBe(bestKey('file', 'find', 'both'));
    saveNotationScore('point', 'find', 'red', 9);
    expect(bestScore(loadNotationBests(), 'point', 'find', 'black')).toBe(9);
  });

  it('survives a corrupt stored value rather than throwing', () => {
    window.localStorage.setItem('mistboard:notation:xiangqi', '{not json');
    expect(loadNotationBests()).toEqual({ bests: {} });
    window.localStorage.setItem('mistboard:notation:xiangqi', '[]');
    expect(loadNotationBests()).toEqual({ bests: {} });
  });
});
