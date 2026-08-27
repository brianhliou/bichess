// Fortress Xiangqi review surface: the fortress presentation bundle over the
// generic tree-review controller (mountTreeReview). Fortress is perfect-information,
// so the tree reconstructs every position (including drops) from the move list.
//
// SLICE 2 (this file): interactive BOARD moves + branching tree + CLIENT CEVAL
// engine (Fairy-Stockfish 'fortressxiangqi' — ceval loads the custom
// fortress-xiangqi.ini). The eval gauge + engine panel + Share FEN are live; the
// engine reads the tree's FSF move list (startpos + moves), so no server round-trip.
// Board-move PV arrows are live. A drop has no origin square, so its destination
// marker remains a separate slice. Drop reserves and the drop gesture are both
// absent here by choice; drops still replay in the mainline.

import {
  type FortressXiangqiColor,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiPlayerView,
  fortressXiangqiEngineFen,
  fsfUciToFortressXiangqiMove,
  isFortressXiangqiDropMove,
} from '@mistboard/game';
import { createFortressXiangqiInteractiveBoard } from '../fortress-xiangqi-board.js';
import {
  animateFortressXiangqiBoardMove,
  type FortressXiangqiBoardArrow,
  type FortressXiangqiBoardMarker,
  FXQ_GEO,
} from '../fortress-xiangqi-render.js';
import { fortressXiangqiMoveLabel } from '../fortress-xiangqi-view.js';
import { xiangqiAppearanceChangedEvent } from '../theme.js';
import { xiangqiBoardAspect } from '../xiangqi-board-aspect.js';
import { xiangqiNotationChangedEvent } from '../xiangqi-notation.js';
import {
  bestMoveArrowWithParser,
  bestMoveMarkerWithParser,
  engineArrowsFromLinesWithParser,
  engineMarkersFromLinesWithParser,
} from './engine/engine-arrows.js';
import { fortressXiangqiTreeAdapter } from './fortress-xiangqi-tree-adapter.js';
import type { NodeShape } from './game-tree.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';

// Fairy-Stockfish fortress UCI back to our readable label for the PV lines (board
// 'a1b2' → 'a1-b2', drop 'Q@e5' → the treasure-drop label); fall back to the raw
// UCI if a PV token does not parse.
function formatFortressEngineMove(uci: string): string {
  const move = fsfUciToFortressXiangqiMove(uci);
  return move ? fortressXiangqiMoveLabel(move) : uci;
}

function parseFortressBoardMove(
  uci: string,
): { from?: FortressXiangqiBoardArrow['from']; to: FortressXiangqiBoardArrow['to'] } | null {
  const move = fsfUciToFortressXiangqiMove(uci);
  if (!move) return null;
  return isFortressXiangqiDropMove(move) ? { to: move.to } : move;
}

/** Config for a Fortress Xiangqi review mount. */
export type FortressXiangqiReviewConfig = TreeReviewConfig<
  FortressXiangqiMove,
  FortressXiangqiGameState
>;

/** Handle returned by mountFortressXiangqiReview: snapshot the tree to persist it. */
export type FortressXiangqiReviewHandle = TreeReviewHandle;

const fortressPresentation: TreePresentation<
  FortressXiangqiMove,
  FortressXiangqiGameState,
  FortressXiangqiPlayerView,
  FortressXiangqiColor,
  FortressXiangqiBoardArrow,
  FortressXiangqiBoardMarker
> = {
  adapter: fortressXiangqiTreeAdapter,
  engine: {
    panelVariant: 'fortressxiangqi',
    fen: fortressXiangqiEngineFen,
    formatPvMove: formatFortressEngineMove,
    moveFromEngineUci: fsfUciToFortressXiangqiMove,
    engineArrowsFromLines: (lines) =>
      engineArrowsFromLinesWithParser(lines, parseFortressBoardMove),
    engineMarkersFromLines: (lines) =>
      engineMarkersFromLinesWithParser(lines, parseFortressBoardMove),
    bestMoveArrow: (best) => bestMoveArrowWithParser(best, parseFortressBoardMove),
    bestMoveMarker: (best) => bestMoveMarkerWithParser(best, parseFortressBoardMove),
  },
  boardHostClassName: 'fortress-xiangqi-postgame-board fortress-xiangqi-live-board',
  boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
  defaultBoardAriaLabel: 'Fortress Xiangqi board',
  boardAspect: () => xiangqiBoardAspect(FXQ_GEO),
  // Both events matter now that coordinates are drawn ON the board: a notation
  // change relabels them, and toggling them changes the board's geometry. Before
  // that, this surface needed neither -- its pieces pick up their set via CSS --
  // which is why /analysis/{variant} ignored every appearance change until 2026-08-27.
  appearanceEvent: xiangqiAppearanceChangedEvent,
  labelsEvent: xiangqiNotationChangedEvent,
  boardCols: 7,
  perspective: (flipped) => (flipped ? 'black' : 'red'),
  seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
  createBoard: (opts) => createFortressXiangqiInteractiveBoard(opts),
  // Only board moves glide; a drop has no origin square, so it renders discretely.
  animateMove: (boardEl, move, perspective, opts) => {
    if (!isFortressXiangqiDropMove(move)) {
      animateFortressXiangqiBoardMove(boardEl, move, perspective, opts);
    }
  },
  shapeToArrow: (s: NodeShape): FortressXiangqiBoardArrow => ({
    from: s.orig as FortressXiangqiBoardArrow['from'],
    to: (s.dest ?? s.orig) as FortressXiangqiBoardArrow['to'],
    className: `xq-arrow--draw xq-shape--${s.brush}`,
  }),
  shapeToMarker: (s: NodeShape): FortressXiangqiBoardMarker => ({
    square: s.orig as FortressXiangqiBoardMarker['square'],
    kind: 'circle',
    className: `xq-shape--${s.brush}`,
  }),
  // Judgment badge on the square the move landed on, so the board states the
  // same verdict the move list does (lila pins its glyphs the same way). A drop
  // has no `from`, but it still HAS a destination, so both union members work.
  moveGlyphMarker: (move: FortressXiangqiMove, glyph): FortressXiangqiBoardMarker => ({
    square: move.to,
    kind: 'glyph',
    text: glyph.text,
    className: `xq-marker--${glyph.tone}`,
  }),
  // Drop reserves are deliberately NOT rendered here (product call): drops
  // replay in the mainline instead. To turn them back on, supply the controller's
  // `material` hook — it hands you the mat-top / mat-bot rows and a per-ply
  // updater, and fortress is perfect-information so ONE projection
  // (getFortressXiangqiPlayerView) carries both seats' pockets for
  // fillFortressXiangqiReserve. The live room keeps showing them either way.
};

export function mountFortressXiangqiReview(
  root: HTMLElement,
  config: FortressXiangqiReviewConfig,
): FortressXiangqiReviewHandle {
  return mountTreeReview(root, fortressPresentation, config);
}
