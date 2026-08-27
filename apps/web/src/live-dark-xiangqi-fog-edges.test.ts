// Fog cutouts bleed to the board edge only for squares that are ACTUALLY on the
// screen edge. The test is on the display column, not the logical file: black
// sees the board rotated 180, so file a renders on the right.
//
// This was latent until the board started rotating rather than mirroring the
// rank alone (2026-08-27). With the logical file, a visible piece on file a seen
// from black cut fog from x=0 across to its own square, tearing a band open down
// the wrong side of the board.

import { describe, expect, it } from 'vitest';
import { xiangqiDisplayFile } from './xiangqi-board-geometry.js';

const FILE_COUNT = 9;

describe('fog cutout edge test', () => {
  it('puts file a on the LEFT edge for red and the RIGHT edge for black', () => {
    expect(xiangqiDisplayFile(0, 'red', FILE_COUNT)).toBe(0);
    expect(xiangqiDisplayFile(0, 'black', FILE_COUNT)).toBe(FILE_COUNT - 1);
  });

  it('puts file i on the RIGHT edge for red and the LEFT edge for black', () => {
    expect(xiangqiDisplayFile(8, 'red', FILE_COUNT)).toBe(FILE_COUNT - 1);
    expect(xiangqiDisplayFile(8, 'black', FILE_COUNT)).toBe(0);
  });

  it('leaves interior files off both edges from either side', () => {
    for (const file of [1, 2, 3, 4, 5, 6, 7]) {
      for (const p of ['red', 'black'] as const) {
        const col = xiangqiDisplayFile(file, p, FILE_COUNT);
        expect(col).not.toBe(0);
        expect(col).not.toBe(FILE_COUNT - 1);
      }
    }
  });

  it('maps exactly one logical file onto each display column', () => {
    for (const p of ['red', 'black'] as const) {
      const cols = new Set(
        Array.from({ length: FILE_COUNT }, (_, f) => xiangqiDisplayFile(f, p, FILE_COUNT)),
      );
      expect(cols.size).toBe(FILE_COUNT);
    }
  });
});
