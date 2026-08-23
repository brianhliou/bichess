import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleSummary } from './adapter.js';
import { loadSeenPuzzles, rotatePuzzleOrder, saveSeenPuzzles } from './storage.js';

function puzzle(id: string, rating: number, theme: string): PuzzleSummary {
  return {
    id,
    variant: 'xiangqi',
    title: id,
    sideToMove: 'red',
    goal: { type: 'winning-advantage', winner: 'red' },
    themes: [theme],
    solutionPlyCount: 3,
    rating,
    ratingProvisional: false,
  };
}

describe('adaptive puzzle rotation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts near the player rating, explores, then appends oldest seen puzzles', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const puzzles = [
      puzzle('far', 2100, 'mate'),
      puzzle('near', 1510, 'fork'),
      puzzle('nearer', 1495, 'pin'),
      puzzle('mid', 1650, 'capture'),
      puzzle('explore', 2300, 'quiet'),
      puzzle('seen-new', 1500, 'fork'),
      puzzle('seen-old', 1500, 'fork'),
    ];
    const ordered = rotatePuzzleOrder(
      puzzles,
      new Map([
        ['seen-new', 20],
        ['seen-old', 10],
      ]),
      new Map([['xiangqi', 1500]]),
    );

    expect(ordered[0]?.id).toBe('nearer');
    expect(ordered.slice(0, 5).map(({ id }) => id)).toContain('explore');
    expect(ordered.slice(-2).map(({ id }) => id)).toEqual(['seen-old', 'seen-new']);
  });
});

describe('seen-set capacity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('remembers more puzzles than the served corpus so rotation does not recycle', () => {
    // The cap bounds localStorage, but if it falls below the corpus then
    // eviction re-serves puzzles the visitor has already seen while genuinely
    // unseen ones wait. At 200 against a 1,605-puzzle corpus that happened
    // after 200 puzzles with ~1,400 untouched.
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    });

    const CORPUS = 1_605;
    const seen = new Map<string, number>();
    for (let index = 0; index < CORPUS; index += 1) seen.set(`puzzle-${index}`, index);
    saveSeenPuzzles(seen);

    const reloaded = loadSeenPuzzles();
    expect(reloaded.size).toBe(CORPUS);
    // The oldest entry must survive: it is the one eviction drops first, and
    // dropping it is what makes an already-seen puzzle look unseen.
    expect(reloaded.has('puzzle-0')).toBe(true);
    expect(reloaded.has(`puzzle-${CORPUS - 1}`)).toBe(true);
  });
});
