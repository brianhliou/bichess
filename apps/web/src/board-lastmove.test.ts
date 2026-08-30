import { describe, expect, it } from 'vitest';
import { boardLastMoveMarkersSvg, boardLastMoveOuterRadius } from './board-lastmove.js';
import { TOKEN_PIECE_RATIO, tokenPieceSize } from './board-metrics.js';

// A move between adjacent intersections puts the origin wash one cell from the
// destination halo. The two used to need 63 units where a cell gives 60, so the
// pair visibly collided on every one-step move on every token board. Sizing both
// to half a cell fixed the collision and left them exactly tangent, which reads
// as one merged lozenge rather than two marks -- so the origin now stops at the
// piece radius and the daylight is asserted, not just the absence of overlap.
describe('the shared last-move marks', () => {
  const radiusOf = (svg: string, cls: string) => {
    const m = svg.match(new RegExp(`class="[^"]*${cls}[^"]*"[^>]*r="([\\d.]+)"`));
    return m ? Number(m[1]) : Number.NaN;
  };
  // Stroke is centred on the circle, so each mark reaches half a stroke past its
  // radius. Stroke widths scale with the piece (see boardLastMoveStyleAttr).
  const outerEdges = (cell: number) => {
    const pieceSize = tokenPieceSize(cell);
    const scale = pieceSize / tokenPieceSize(60);
    const svg = boardLastMoveMarkersSvg({ from: { x: 0, y: 0 }, to: { x: cell, y: 0 } }, pieceSize);
    return {
      pieceSize,
      scale,
      origin: radiusOf(svg, 'xq-live-lastmove-from') + (2 * scale) / 2,
      ring: radiusOf(svg, 'xq-live-lastmove-ring') + (4 * scale) / 2,
    };
  };

  for (const cell of [72, 60, 44, 31]) {
    it(`leaves daylight on a one-step move at cell ${cell}`, () => {
      const { origin, ring, scale } = outerEdges(cell);
      // Touching is not clearing: assert a real gap, in canonical units so the
      // claim means the same thing on every board size we ship. 3 units by
      // construction, less up to ~0.6 wherever tokenPieceSize rounds the piece
      // UP and the cell derived back out of it comes up short (cell 44).
      expect((cell - origin - ring) / scale).toBeGreaterThanOrEqual(2.4);
    });

    it(`stops the origin wash at the piece that left, at cell ${cell}`, () => {
      const { origin, pieceSize, scale } = outerEdges(cell);
      expect(origin).toBeCloseTo(pieceSize / 2, Math.abs(scale - 1) < 0.01 ? 5 : 0);
    });

    it(`still clears the piece it sits under at cell ${cell}`, () => {
      // A halo entirely under the piece is not a marker; this is the regression
      // that hid for six weeks when the ring went from 29 to 26. The origin
      // shrinking must not be taken out of the halo as well.
      const { ring, pieceSize, scale } = outerEdges(cell);
      expect(ring - pieceSize / 2).toBeGreaterThanOrEqual(2 * scale);
    });
  }

  it('derives the outer edge from the piece ratio, not a tuned number', () => {
    const pieceSize = tokenPieceSize(60);
    expect(boardLastMoveOuterRadius(pieceSize)).toBeCloseTo(pieceSize / 2 / TOKEN_PIECE_RATIO, 2);
  });
});
