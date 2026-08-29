// The shared last-move layer for token boards (xiangqi, jieqi, mini/drop mini,
// fortress). Every one of these renderers used to emit its own marker geometry
// and inject its own style, which is how the homepage game viewer and the daily
// puzzle widget ended up drawing the same event two different ways. The markup
// and the CSS now live here; a renderer supplies only its own centers and piece
// size, so the marks scale with the board instead of being retuned per variant.
//
// The canonical proportions come from the standard xiangqi board (CELL 60,
// PIECE_SIZE 54): origin disc at the piece radius, destination ring one unit
// inside it, 4-unit stroke. Everything below is that ratio, so a board with a
// different cell renders the same picture at its own scale.
import { TOKEN_PIECE_RATIO } from './board-metrics.js';
import './board-lastmove.css';

/** Piece size the canonical radii/stroke were tuned against (xiangqi, CELL 60). */
const CANONICAL_PIECE_SIZE = 54;
const CANONICAL_STROKE = 4;
/**
 * Both marks end on the same radius, and that radius is chosen so a one-step
 * move does not collide with itself. Adjacent intersections are one CELL apart
 * and a piece is TOKEN_PIECE_RATIO of a cell, so the marks meet exactly when
 * each outer edge sits at CELL / 2 = pieceRadius / TOKEN_PIECE_RATIO.
 *
 * At canonical scale that is 30 against a 27 piece radius: 3 units beyond the
 * piece. The previous numbers put the origin's outer edge at 32 and the ring's
 * at 31, needing 63 units where a cell gives 60, so every move between adjacent
 * intersections drew the origin wash through the destination ring.
 *
 * The two outsets are DERIVED from that shared edge rather than tuned
 * separately. They were separate constants before and drifted: the ring went
 * from 29 to 26 in an unrelated polish commit and nobody noticed for six weeks
 * because the comment still described 29.
 */
const CANONICAL_MARK_OUTER_EDGE = round2(CANONICAL_PIECE_SIZE / 2 / TOKEN_PIECE_RATIO);
/** Outline weight on the origin marker, in canonical units (see the CSS). */
const CANONICAL_ORIGIN_STROKE = 2;

/**
 * What `drawMarkerOnArrival` targets. `-to` is the square-grid layout's
 * destination rect; `-ring` is the intersection layout's halo.
 */
export const BOARD_LASTMOVE_MARKER_SELECTOR = '.xq-live-lastmove-to, .xq-live-lastmove-ring';

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
 * Where both shared marks end: the origin wash's rim and the destination ring's
 * outer stroke edge land on the same radius, so the pair reads as one size.
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
  // own stroke inside the shared outer edge. That is what makes the origin
  // wash and the destination halo finish on the same radius.
  const originRadius = round2((CANONICAL_MARK_OUTER_EDGE - CANONICAL_ORIGIN_STROKE / 2) * scale);
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
