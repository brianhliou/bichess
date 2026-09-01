/**
 * Board corner rounding, as a fraction of board WIDTH.
 *
 * Mirrors the --board-corner-radius token (apps/web/src/app-base.css) so an SVG that rounds its
 * own background rect or clip-path lands on the same curve as the CSS boxes that clip it.
 * Unified 2026-08-27 from a spread of rx=10 (in three different viewBox scales) and a fixed
 * 16px, which made two boards side by side round differently.
 *
 * It lives HERE rather than in apps/web because board-svg and grid-board need it too, and a
 * package cannot import from an app. apps/web/src/board-metrics.ts re-exports it, so there is
 * exactly one number. Hand-computing it per board is what let the values drift the first time:
 * jungle carried 6 where 336u wants 6.38, jungle-flip carried 5 where 256u wants 4.86, and
 * banqi carried 6 where its 568u board wants 10.79.
 */
export const BOARD_CORNER_RATIO = 0.019;

/** The `rx` an SVG board background (or clip-path rect) should carry for a board this wide. */
export function boardCornerRadius(boardWidth: number): number {
  return Math.round(boardWidth * BOARD_CORNER_RATIO * 100) / 100;
}
