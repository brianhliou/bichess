// Reveal Xiangqi (jieqi) review surface: the jieqi presentation bundle over the
// generic tree-review controller (mountTreeReview). Jieqi has a hidden deal but no
// client engine, so `engine: null`. Like banqi the adapter is DEAL-BOUND (a factory
// over the reconstructed deal), so the presentation is built per-game rather than
// held as a module constant.

import type {
  JieqiColor,
  JieqiDeal,
  JieqiGameState,
  JieqiMove,
  JieqiPlayerView,
} from '@mistboard/game';
import { createJieqiInteractiveBoard } from '../jieqi-board.js';
import type { NodeShape, VariantTreeAdapter } from './game-tree.js';
import { makeJieqiTreeAdapter } from './jieqi-tree-adapter.js';
import { formatJieqiBestMove } from './move-advice.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';

/** Config for a jieqi review mount. */
export type JieqiReviewConfig = TreeReviewConfig<JieqiMove>;

/** Handle returned by mountJieqiReview: snapshot the current tree to persist it. */
export type JieqiReviewHandle = TreeReviewHandle;

// No client engine and no overlay layer, so Arrow/Marker are unused; the shapeTo*
// hooks pass the shape through opaquely. Unlike banqi/jungle-flip, jieqi is on the
// 9×10 xiangqi board and DOES orient per side, so the Flip control flips the board.
function makeJieqiPresentation(
  adapter: VariantTreeAdapter<JieqiMove, JieqiGameState, JieqiPlayerView>,
): TreePresentation<JieqiMove, JieqiGameState, JieqiPlayerView, JieqiColor, unknown, unknown> {
  return {
    adapter,
    engine: null,
    // The analysis engine's best move is Pikafish UCI (0-indexed ranks, no flips); render it in
    // board coords ("e8-a8") for the "… was best" advice line, not the raw "e7a7".
    formatBestMove: formatJieqiBestMove,
    boardHostClassName: 'jieqi-postgame-board jieqi-live-board',
    boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
    defaultBoardAriaLabel: 'Reveal Xiangqi board',
    // 9×10 board (WIDTH 660 / HEIGHT 732 from live-jieqi-render).
    boardAspect: 660 / 732,
    boardCols: 16,
    // Xiangqi pieces pick up their look from the render call; a full re-render
    // happens on every navigation, so no appearance event.
    perspective: (flipped) => (flipped ? 'black' : 'red'),
    // Review plays BOTH sides: the interactive seat is the side to move.
    seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
    createBoard: (opts) => createJieqiInteractiveBoard(opts),
    // No glide animation wired for jieqi yet; the board re-renders on nav.
    animateMove: () => {},
    shapeToArrow: (s: NodeShape) => s,
    shapeToMarker: (s: NodeShape) => s,
  };
}

export function mountJieqiReview(
  root: HTMLElement,
  gameId: string,
  deal: JieqiDeal,
  config: JieqiReviewConfig,
): JieqiReviewHandle {
  const adapter = makeJieqiTreeAdapter(gameId, deal);
  return mountTreeReview(root, makeJieqiPresentation(adapter), config);
}
