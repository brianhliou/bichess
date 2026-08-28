// The fortress board draws its grid lines through the shared xiangqi surface,
// which stamps `class="xq-live-line"` on them, but its palace diagonals come
// through unclassed and land on the board's own `.fxq-grid line` fallback. The
// two therefore have to agree on stroke-width or the four diagonals inside each
// palace render visibly heavier than every other line on the board.
//
// This shipped once: the shared-surface refactor moved the grid onto
// `.xq-live-line` (1.2) and left `.fxq-grid line` at its old 2, so the palace
// diagonals were 67% thicker in production. The values live in two different
// files, so nothing but this test ties them together.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

function strokeWidthOf(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  if (!rule) throw new Error(`no rule for ${selector}`);
  const width = /stroke-width:\s*([^;]+);/.exec(rule[1]);
  if (!width) throw new Error(`no stroke-width in ${selector}`);
  return width[1].trim().replace(/px$/, '');
}

describe('fortress board line weights', () => {
  it('gives the palace diagonals the same stroke-width as the shared grid lines', () => {
    const renderer = readFileSync(resolve(HERE, 'fortress-xiangqi-render.ts'), 'utf8');
    const liveCss = readFileSync(resolve(HERE, 'live-xiangqi.css'), 'utf8');

    // The fallback the unclassed palace diagonals resolve through.
    const palaceFallback = strokeWidthOf(renderer, '.fxq-grid line');
    // The class the shared surface stamps on every grid line.
    const sharedGrid = strokeWidthOf(liveCss, '.xq-live-line');

    expect(palaceFallback).toBe(sharedGrid);
  });
});
