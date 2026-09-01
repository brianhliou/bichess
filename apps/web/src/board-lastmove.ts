// The shared last-move layer for token boards (xiangqi, fog xiangqi, jieqi,
// mini/drop mini, fortress). Every one of these renderers used to emit its own marker geometry
// and inject its own style, which is how the homepage game viewer and the daily
// puzzle widget ended up drawing the same event two different ways. The markup
// and the CSS now live here; a renderer supplies only its own centers and piece
// size, so the marks scale with the board instead of being retuned per variant.
//
// The canonical proportions come from the standard xiangqi board (CELL 60,
// PIECE_SIZE 54): origin wash at the piece radius, destination ring in the
// 3 units of board between the piece and the cell edge, 4-unit stroke.
// Everything below is that ratio, so a board with a different cell renders the
// same picture at its own scale.
import { TOKEN_PIECE_RATIO } from './board-metrics.js';
import './board-lastmove.css';

/** Piece size the canonical radii/stroke were tuned against (xiangqi, CELL 60). */
const CANONICAL_PIECE_SIZE = 54;
const CANONICAL_STROKE = 4;
/**
 * How far the destination halo reaches. A piece is TOKEN_PIECE_RATIO of a cell,
 * so pieceRadius / TOKEN_PIECE_RATIO is exactly half a cell: at canonical scale
 * 30 against a 27 piece radius, using every one of the 3 units of board that
 * exist between the piece and the cell edge. The halo needs all of them (it is
 * drawn UNDER the pieces, so only the part outside the piece is visible), which
 * is why the clearance below is taken out of the origin mark instead.
 *
 * Do not push this past half a cell. The numbers before 2026-08-27 put the
 * origin's outer edge at 32 and the ring's at 31, needing 63 units where a cell
 * gives 60, so every one-step move drew the origin wash through the halo.
 */
const CANONICAL_MARK_OUTER_EDGE = round2(CANONICAL_PIECE_SIZE / 2 / TOKEN_PIECE_RATIO);
/**
 * How far the origin wash reaches: the radius of the piece that left, and no
 * further. That is what buys the daylight on a one-step move.
 *
 * Both marks used to end on this same outer edge, on the reasoning that the
 * pair should read as one size. Half a cell each means they are exactly
 * TANGENT one point apart, and tangent circles do not read as two marks: on a
 * one-step move (which in xiangqi is most moves) they merged into a single
 * amber lozenge. tokenPieceSize also rounds, so deriving the cell back from the
 * piece overshoots at CELL 72 and the pair genuinely overlapped on fortress and
 * jieqi.
 *
 * Stopping the origin at the piece radius gives back a full 3 canonical units
 * between the two marks without taking a single unit off the halo, which is the
 * mark that has to survive being drawn under a piece. The pair is no longer the
 * same size, and that is fine: they never appear concentric, and the smaller
 * mark being the one the piece LEFT reinforces the direction the pair exists to
 * show.
 */
const CANONICAL_ORIGIN_OUTER_EDGE = CANONICAL_PIECE_SIZE / 2;
/** Outline weight on the origin marker, in canonical units (see the CSS). */
const CANONICAL_ORIGIN_STROKE = 2;

/**
 * What `drawMarkerOnArrival` targets. `-to` is the square-grid layout's
 * destination rect, `-ring` the intersection layout's halo, and
 * `.banqi-lastmove-to` banqi's cell tint (it draws its own marks -- see the
 * geometry note in live-banqi-render.ts -- but shares the arrival fade).
 */
export const BOARD_LASTMOVE_MARKER_SELECTOR =
  '.xq-live-lastmove-to, .xq-live-lastmove-ring, .banqi-lastmove-to';

export type BoardPoint = { x: number; y: number };

/**
 * The `--board-lastmove-stroke` declaration a renderer puts on its board root so
 * the ring reads at the same weight as every other board. Boards whose cell is
 * larger than xiangqi's need a proportionally thicker stroke to render the same
 * picture, and mini takes its piece size per render, so this is an attribute
 * rather than a static rule. Returns '' at the canonical size (the CSS default
 * already matches), which keeps the xiangqi board's markup untouched.
 */
export function boardLastMoveStyleAttr(pieceSize: number): string {
  if (pieceSize === CANONICAL_PIECE_SIZE) return '';
  const scale = pieceSize / CANONICAL_PIECE_SIZE;
  const ring = round2(CANONICAL_STROKE * scale);
  const origin = round2(CANONICAL_ORIGIN_STROKE * scale);
  return ` style="--board-lastmove-stroke:${ring};--board-lastmove-origin-stroke:${origin}"`;
}

/**
 * One canonical unit at this board's scale. Lets a renderer place a mark of its
 * own just outside the shared ones (banqi's reveal ring) without copying the
 * constants above.
 */
export function boardLastMoveUnit(pieceSize: number): number {
  return round2(pieceSize / CANONICAL_PIECE_SIZE);
}

/**
 * The outermost radius any shared mark reaches (the destination halo's outer
 * stroke edge). Callers use it to size a box that has to contain the marks.
 */
export function boardLastMoveOuterRadius(pieceSize: number): number {
  return round2(CANONICAL_MARK_OUTER_EDGE * (pieceSize / CANONICAL_PIECE_SIZE));
}

/**
 * Origin disc + destination halo for one move. Either endpoint may be null: a
 * drop has no origin, and a fog board passes only the endpoints the viewer can
 * actually see. Returns '' when there is nothing to mark.
 */
export function boardLastMoveMarkersSvg(
  endpoints: { from?: BoardPoint | null; to?: BoardPoint | null },
  pieceSize: number,
): string {
  const scale = pieceSize / CANONICAL_PIECE_SIZE;
  // A stroke is centred on its circle, so a mark's centre line sits half its
  // own stroke inside the edge it is meant to reach. Get this wrong and the
  // outline, not the fill, is what collides with the neighbouring mark.
  const originRadius = round2((CANONICAL_ORIGIN_OUTER_EDGE - CANONICAL_ORIGIN_STROKE / 2) * scale);
  const ringRadius = round2((CANONICAL_MARK_OUTER_EDGE - CANONICAL_STROKE / 2) * scale);
  const parts: string[] = [];
  if (endpoints.from) {
    parts.push(
      `<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="${endpoints.from.x}" cy="${endpoints.from.y}" r="${originRadius}"/>`,
    );
  }
  if (endpoints.to) {
    parts.push(
      `<circle class="xq-live-lastmove-ring" cx="${endpoints.to.x}" cy="${endpoints.to.y}" r="${ringRadius}"/>`,
    );
  }
  return parts.join('');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
