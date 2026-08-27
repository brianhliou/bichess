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
const CANONICAL_RING_INSET = 1;
const CANONICAL_STROKE = 4;

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
  const stroke = round2((CANONICAL_STROKE * pieceSize) / CANONICAL_PIECE_SIZE);
  return ` style="--board-lastmove-stroke:${stroke}"`;
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
  const originRadius = round2(pieceSize / 2);
  const ringRadius = round2(pieceSize / 2 - CANONICAL_RING_INSET * scale);
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
