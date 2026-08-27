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
import './board-lastmove.css';

/** Piece size the canonical radii/stroke were tuned against (xiangqi, CELL 60). */
const CANONICAL_PIECE_SIZE = 54;
const CANONICAL_STROKE = 4;
/**
 * How far the destination ring's CENTRE line sits outside the piece radius. The
 * marker layer is painted UNDER the pieces, so what the eye sees is only the
 * part of the stroke clearing the disc: at +2 with a 4-wide stroke the ring
 * spans 27..31 against a 27 piece radius, showing a full 4-unit halo.
 *
 * This was r=29 (a 4-unit halo) when the treatment shipped, went to r=26 in a
 * broad polish commit on 2026-07-10, and nobody noticed because the CSS comment
 * still described r=29: at 26 the ring spans 24..28, so 1 unit of a 4-unit
 * stroke clears the piece and the destination marker is ~0.6px of gold at
 * homepage size. Restored 2026-08-27 — a marker you cannot see is not a marker.
 */
const CANONICAL_RING_OUTSET = 2;
/**
 * The origin marker sits OUTSIDE where the piece stood, not flush with it: the
 * square is empty now, so a piece-sized disc read as a smaller, heavier mark
 * than the ring opposite it. +4 with the pale fill below is the treatment the
 * jieqi board carried before the 2026-08-27 unification, chosen for every board
 * on 2026-08-27 because it is the one that reads at a glance.
 */
const CANONICAL_ORIGIN_OUTSET = 4;
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
 * Origin disc + destination halo for one move. Either endpoint may be null: a
 * drop has no origin, and a fog board passes only the endpoints the viewer can
 * actually see. Returns '' when there is nothing to mark.
 */
export function boardLastMoveMarkersSvg(
  endpoints: { from?: BoardPoint | null; to?: BoardPoint | null },
  pieceSize: number,
): string {
  const scale = pieceSize / CANONICAL_PIECE_SIZE;
  const originRadius = round2(pieceSize / 2 + CANONICAL_ORIGIN_OUTSET * scale);
  const ringRadius = round2(pieceSize / 2 + CANONICAL_RING_OUTSET * scale);
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
