// Fog Chess review surface: the dark-chess presentation bundle over the generic
// tree-review controller. The chess-family sibling of dark-xiangqi-review.ts —
// project() returns the triptych (truth + each POV), rendered as one interactive
// truth board plus two read-only POV boards.
//
// Fog has no client engine (the fog engine is a separate worker piece), so
// `engine: null`. In analysis the game is fully revealed, so the tree replays and
// branches on the TRUE move history like an open variant.

import type { Color, GameState, Move, PlayerView } from '@mistboard/game';
import { createDarkChessInteractiveBoard } from '../dark-chess-tree-board.js';
import { darkChessTreeAdapter } from './dark-chess-tree-adapter.js';
import type { NodeShape } from './game-tree.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';

/** Config for a Fog Chess review mount. */
export type DarkChessReviewConfig = TreeReviewConfig<Move>;

/** Handle returned by mountDarkChessReview: snapshot the current tree to persist it. */
export type DarkChessReviewHandle = TreeReviewHandle;

// Fog has no client engine and the SVG renderer has no arrow/marker overlay, so
// Arrow/Marker are unused (setArrows/setMarkers are no-ops); the shapeTo* hooks are
// never painted but the type requires them, so they pass the shape through opaquely.
const darkChessPresentation: TreePresentation<
  Move,
  GameState,
  PlayerView,
  Color,
  unknown,
  unknown
> = {
  adapter: darkChessTreeAdapter,
  engine: null,
  boardHostClassName: 'dxq-postgame__board dark-chess-live-board',
  boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
  defaultBoardAriaLabel: 'Fog Chess board',
  boardAspect: 1,
  boardCols: 8,
  perspective: (flipped) => (flipped ? 'black' : 'white'),
  // Review plays BOTH sides on the truth board: the interactive seat is the side
  // to move. Secondary POV boards are read-only (the controller disables input).
  seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
  createBoard: (opts) => createDarkChessInteractiveBoard(opts),
  // No glide animation for fog (the board re-renders on navigation).
  animateMove: () => {},
  shapeToArrow: (s: NodeShape) => s,
  shapeToMarker: (s: NodeShape) => s,
};

export function mountDarkChessReview(
  root: HTMLElement,
  config: DarkChessReviewConfig,
): DarkChessReviewHandle {
  return mountTreeReview(root, darkChessPresentation, config);
}
