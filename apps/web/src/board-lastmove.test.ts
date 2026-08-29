import { describe, expect, it } from 'vitest';
import { boardLastMoveMarkersSvg, boardLastMoveOuterRadius } from './board-lastmove.js';
import { TOKEN_PIECE_RATIO, tokenPieceSize } from './board-metrics.js';

// A move between adjacent intersections puts the origin wash one cell from the
// destination halo. The two used to need 63 units where a cell gives 60, so the
// pair visibly collided on every one-step move on every token board.
describe('the shared last-move marks', () => {
  const radiusOf = (svg: string, cls: string) => {
    const m = svg.match(new RegExp(`class="[^"]*${cls}[^"]*"[^>]*r="([\\d.]+)"`));
    return m ? Number(m[1]) : Number.NaN;
  };

  for (const cell of [60, 44, 31]) {
    const pieceSize = tokenPieceSize(cell);

    it(`clears itself on a one-step move at cell ${cell}`, () => {
      const svg = boardLastMoveMarkersSvg(
        { from: { x: 0, y: 0 }, to: { x: cell, y: 0 } },
        pieceSize,
      );
      // Stroke is centred on the circle, so each mark reaches half a stroke past
      // its radius. Stroke widths scale with the piece.
      const scale = pieceSize / tokenPieceSize(60);
      const originOuter = radiusOf(svg, 'xq-live-lastmove-from') + (2 * scale) / 2;
      const ringOuter = radiusOf(svg, 'xq-live-lastmove-ring') + (4 * scale) / 2;
      // tokenPieceSize rounds, so deriving the cell back from the piece is
      // lossy by up to 0.5 units, which reaches the outer edge as ~0.3 per
      // mark. Sub-pixel at every board size we ship, against the 3 units of
      // real overlap this replaced.
      expect(originOuter + ringOuter).toBeLessThanOrEqual(cell + 0.6);
    });

    it(`ends both marks on the same radius at cell ${cell}`, () => {
      const svg = boardLastMoveMarkersSvg(
        { from: { x: 0, y: 0 }, to: { x: cell, y: 0 } },
        pieceSize,
      );
      const scale = pieceSize / tokenPieceSize(60);
      const originOuter = radiusOf(svg, 'xq-live-lastmove-from') + (2 * scale) / 2;
      const ringOuter = radiusOf(svg, 'xq-live-lastmove-ring') + (4 * scale) / 2;
      expect(Math.abs(originOuter - ringOuter)).toBeLessThan(0.05);
      expect(originOuter).toBeCloseTo(boardLastMoveOuterRadius(pieceSize), 1);
    });

    it(`still clears the piece it sits under at cell ${cell}`, () => {
      // A halo entirely under the piece is not a marker; this is the regression
      // that hid for six weeks when the ring went from 29 to 26.
      const svg = boardLastMoveMarkersSvg({ to: { x: 0, y: 0 } }, pieceSize);
      const scale = pieceSize / tokenPieceSize(60);
      const ringOuter = radiusOf(svg, 'xq-live-lastmove-ring') + (4 * scale) / 2;
      expect(ringOuter - pieceSize / 2).toBeGreaterThanOrEqual(2 * scale);
    });
  }

  it('derives the outer edge from the piece ratio, not a tuned number', () => {
    const pieceSize = tokenPieceSize(60);
    expect(boardLastMoveOuterRadius(pieceSize)).toBeCloseTo(pieceSize / 2 / TOKEN_PIECE_RATIO, 2);
  });
});
