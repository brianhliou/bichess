// Fortress Xiangqi review surface: the fortress presentation bundle over the
// generic tree-review controller (mountTreeReview). Fortress is perfect-information,
// so the tree reconstructs every position (including drops) from the move list.
//
// SLICE 2 (this file): interactive BOARD moves + branching tree + CLIENT CEVAL
// engine (Fairy-Stockfish 'fortressxiangqi' — ceval loads the custom
// fortress-xiangqi.ini). The eval gauge + engine panel + Share FEN are live; the
// engine reads the tree's FSF move list (startpos + moves), so no server round-trip.
// On-board PV arrows are deferred (the fortress board has no overlay layer yet), so
// engineArrowsFromLines/bestMoveArrow return []. Still no reserve strips / drop
// gesture (drops replay in the mainline but are not a user affordance yet).

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
import { animateFortressXiangqiBoardMove } from '../fortress-xiangqi-render.js';
import { fortressXiangqiMoveLabel } from '../fortress-xiangqi-view.js';
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

/** Config for a Fortress Xiangqi review mount. */
export type FortressXiangqiReviewConfig = TreeReviewConfig<FortressXiangqiMove>;

/** Handle returned by mountFortressXiangqiReview: snapshot the tree to persist it. */
export type FortressXiangqiReviewHandle = TreeReviewHandle;

const fortressPresentation: TreePresentation<
  FortressXiangqiMove,
  FortressXiangqiGameState,
  FortressXiangqiPlayerView,
  FortressXiangqiColor,
  unknown,
  unknown
> = {
  adapter: fortressXiangqiTreeAdapter,
  engine: {
    panelVariant: 'fortressxiangqi',
    fen: fortressXiangqiEngineFen,
    formatPvMove: formatFortressEngineMove,
    // No board overlay layer yet, so PV lines are not drawn as on-board arrows; the
    // eval gauge + engine panel still read from the ceval search.
    engineArrowsFromLines: () => [],
    bestMoveArrow: () => [],
  },
  boardHostClassName: 'fortress-xiangqi-postgame-board fortress-xiangqi-live-board',
  boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
  defaultBoardAriaLabel: 'Fortress Xiangqi board',
  boardAspect: 516 / 588,
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
  shapeToArrow: (s: NodeShape) => s,
  shapeToMarker: (s: NodeShape) => s,
};

export function mountFortressXiangqiReview(
  root: HTMLElement,
  config: FortressXiangqiReviewConfig,
): FortressXiangqiReviewHandle {
  return mountTreeReview(root, fortressPresentation, config);
}
