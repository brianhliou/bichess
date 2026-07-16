// Shared xiangqi board geometry — the single source of truth for where points,
// grid lines, and the board viewBox sit under each layout. Both the live board
// renderer (xiangqi-board.ts, CELL=60) and the article/rules-page diagram
// renderer (articles/diagrams.ts, a smaller scale) consume these so the
// 'intersection' vs 'cell' (Square grid) layouts stay in lockstep across every
// surface. Pure math: no DOM, no SVG, no storage reads.

import type { XiangqiColor } from '@mistboard/game';
import type { XiangqiBoardLayout } from './xiangqi-appearance-storage.js';

/** Board dimensions in board units + the pixel scale, so one transform serves
 *  every scale (live board, article diagram) by swapping the config. `margin` is
 *  the gap from the viewBox origin to the first intersection; `riverGap` is the
 *  extra vertical space the 'cell' layout opens between the two halves. */
export interface XiangqiBoardGeometry {
  fileCount: number;
  rankCount: number;
  cell: number;
  margin: number;
  riverGap: number;
}

/** The 0-indexed row (from the top) that a 1-indexed rank occupies under a given
 *  perspective. Red sits at the bottom, so its back rank (1) is the last row. */
export function xiangqiDisplayRow(
  rank: number,
  perspective: XiangqiColor,
  rankCount: number,
): number {
  return perspective === 'red' ? rankCount - rank : rank - 1;
}

/** Pixel center of a (file, rank) point. In 'cell' layout the bottom half is
 *  pushed down by `riverGap` to open the river band; `originX/Y` shifts the whole
 *  board (used when several boards are composited into one SVG). */
export function xiangqiBoardPoint(
  file: number,
  rank: number,
  perspective: XiangqiColor,
  layout: XiangqiBoardLayout,
  geo: XiangqiBoardGeometry,
  originX = 0,
  originY = 0,
): { x: number; y: number } {
  const row = xiangqiDisplayRow(rank, perspective, geo.rankCount);
  const riverShift = layout === 'cell' && row >= geo.rankCount / 2 ? geo.riverGap : 0;
  return {
    x: originX + geo.margin + file * geo.cell,
    y: originY + geo.margin + row * geo.cell + riverShift,
  };
}

/** The board's own viewBox rectangle. 'intersection' spans the outer lines;
 *  'cell' spans full squares (half a cell beyond the outer intersections) plus
 *  the river gap. Mirrors the live renderer's viewBox math exactly. */
export function xiangqiBoardViewBox(
  layout: XiangqiBoardLayout,
  geo: XiangqiBoardGeometry,
): { minX: number; minY: number; width: number; height: number } {
  if (layout === 'cell') {
    return {
      minX: geo.margin - geo.cell / 2,
      minY: geo.margin - geo.cell / 2,
      width: geo.fileCount * geo.cell,
      height: geo.rankCount * geo.cell + geo.riverGap,
    };
  }
  return {
    minX: 0,
    minY: 0,
    width: geo.margin * 2 + (geo.fileCount - 1) * geo.cell,
    height: geo.margin * 2 + (geo.rankCount - 1) * geo.cell,
  };
}
