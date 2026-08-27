// Canonical piece-to-cell proportion for token boards: discs and tiles that
// sit on a grid, whether anchored to intersections (xiangqi family) or cell
// centers (banqi, jungle). Unified 2026-07-02 from a per-renderer spread of
// 75-90%; the placement convention only moves the anchor point, never the
// proportion. Out of scope: chess-family sprite boards (inset is baked into
// the sprite assets and chessground CSS) and shogi koma (traditional near-fill
// at 90%).
// 2026-07-04: bumped 0.83 -> 0.90. The discs read too small with too much dead
// space between them on the xiangqi + jungle boards; 0.90 tightens the gaps
// while keeping a hair of breathing room around each token.
export const TOKEN_PIECE_RATIO = 0.9;

export function tokenPieceSize(cell: number): number {
  return Math.round(cell * TOKEN_PIECE_RATIO);
}

/**
 * Board corner rounding, as a fraction of board WIDTH. Mirrors the
 * --board-corner-radius token (app-base.css) so an SVG that rounds its own
 * background rect lands on the same curve as the CSS boxes that clip it.
 * Unified 2026-08-27 from a spread of rx=10 (in three different viewBox scales)
 * and a fixed 16px, which made two boards side by side round differently.
 */
export const BOARD_CORNER_RATIO = 0.019;

/** The `rx` an SVG board background should carry for a board this wide. */
export function boardCornerRadius(boardWidth: number): number {
  return Math.round(boardWidth * BOARD_CORNER_RATIO * 100) / 100;
}

export type RectangularGridMetrics = {
  cell: number;
  files: number;
  ranks: number;
};

/** Width / height for a plain rectangular grid with no inter-rank strips. */
export function rectangularGridAspect(metrics: RectangularGridMetrics): number {
  return (metrics.files * metrics.cell) / (metrics.ranks * metrics.cell);
}
