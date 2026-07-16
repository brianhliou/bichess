// Fog Xiangqi review surface: the dark-xiangqi presentation bundle over the
// generic tree-review controller (mountTreeReview). This is the FIRST fog consumer
// of the tree spine — project() returns the triptych (truth + each POV), which the
// controller renders as one interactive truth board plus two read-only POV boards.
//
// Fog has no client engine (the fog engine is a separate server/worker piece), so
// `engine: null`: the eval gauge and engine panel are omitted, but the interactive
// branching truth board, the POV projections, the move tree, control bar, and
// replay all work. In analysis the game is fully revealed, so the tree replays and
// branches on the TRUE move history like an open variant.

import type { XiangqiColor, XiangqiGameState, XiangqiMove } from '@mistboard/game';
import { createDarkXiangqiInteractiveBoard } from '../dark-xiangqi-tree-board.js';
import type { DarkXiangqiWireView } from '../live-dark-xiangqi.js';
import { darkXiangqiTreeAdapter } from './dark-xiangqi-tree-adapter.js';
import type { NodeShape } from './game-tree.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';

/** Config for a Fog Xiangqi review mount. */
export type DarkXiangqiReviewConfig = TreeReviewConfig<XiangqiMove>;

/** Handle returned by mountDarkXiangqiReview: snapshot the current tree to persist it. */
export type DarkXiangqiReviewHandle = TreeReviewHandle;

// Fog has no client engine and the SVG renderer has no arrow/marker overlay, so
// Arrow/Marker are unused (setArrows/setMarkers are no-ops); the shapeTo* hooks are
// never painted but the type requires them, so they pass the shape through opaquely.
const darkXiangqiPresentation: TreePresentation<
  XiangqiMove,
  XiangqiGameState,
  DarkXiangqiWireView,
  XiangqiColor,
  unknown,
  unknown
> = {
  adapter: darkXiangqiTreeAdapter,
  engine: null,
  boardHostClassName: 'dxq-postgame__board xiangqi-live-board',
  boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
  defaultBoardAriaLabel: 'Fog Xiangqi board',
  boardAspect: 552 / 612,
  boardCols: 9,
  perspective: (flipped) => (flipped ? 'black' : 'red'),
  // Review plays BOTH sides on the truth board: the interactive seat is the side
  // to move. Secondary POV boards are read-only (the controller disables input).
  seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
  createBoard: (opts) => createDarkXiangqiInteractiveBoard(opts),
  // No glide animation for fog (the board re-renders on navigation).
  animateMove: () => {},
  shapeToArrow: (s: NodeShape) => s,
  shapeToMarker: (s: NodeShape) => s,
};

export function mountDarkXiangqiReview(
  root: HTMLElement,
  config: DarkXiangqiReviewConfig,
): DarkXiangqiReviewHandle {
  return mountTreeReview(root, darkXiangqiPresentation, config);
}
