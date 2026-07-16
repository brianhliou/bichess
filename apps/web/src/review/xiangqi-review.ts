// Standard-xiangqi review surface: the xiangqi presentation bundle over the
// generic tree-review controller (mountTreeReview, tree-review.ts). All the
// board/engine/tree/analysis machinery lives in the controller; this file only
// supplies the xiangqi-specific presentation seam. Both callers ride it:
//   - xiangqi-analysis.ts  — bare move list / empty start position (client views,
//     client ceval sweep). The lichess.org/analysis surface.
//   - xiangqi-postgame.ts  — a specific played/ingested game with a meta card
//     (server views, server Pikafish analysis). The lichess.org/{gameId} surface.
// The two callers differ only in ingress + metadata. The board is INTERACTIVE
// (play a move → it branches the tree, promote/delete variations).

import {
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  standardXiangqiEngineFen,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import { readStoredXiangqiBoardLayout, xiangqiAppearanceChangedEvent } from '../theme.js';
import {
  animateXiangqiBoardMove,
  createXiangqiInteractiveBoard,
  type XiangqiBoardArrow,
  type XiangqiBoardMarker,
} from '../xiangqi-board.js';
import { bestMoveArrow, engineArrowsFromLines } from './engine/engine-arrows.js';
import type { NodeShape } from './game-tree.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';

/** Whole-game analysis source (variant-neutral; re-exported for the callers). */
export type { AnalysisSource as XiangqiAnalysisSource } from './tree-review.js';

/** Config for a standard-xiangqi review mount. */
export type XiangqiReviewConfig = TreeReviewConfig<XiangqiMove>;

/** Handle returned by mountXiangqiReview: snapshot the current tree to persist it. */
export type XiangqiReviewHandle = TreeReviewHandle;

const xiangqiPresentation: TreePresentation<
  XiangqiMove,
  XiangqiGameState,
  StandardXiangqiPlayerView,
  XiangqiColor,
  XiangqiBoardArrow,
  XiangqiBoardMarker
> = {
  adapter: xiangqiTreeAdapter,
  engine: {
    panelVariant: 'xiangqi',
    fen: standardXiangqiEngineFen,
    formatPvMove: formatXiangqiEngineMove,
    engineArrowsFromLines,
    bestMoveArrow,
  },
  boardHostClassName: 'dxq-postgame__board xiangqi-live-board',
  boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
  defaultBoardAriaLabel: 'Xiangqi board',
  boardAspect: () => (readStoredXiangqiBoardLayout() === 'cell' ? 540 / 612 : 552 / 612),
  boardCols: 9,
  // The xiangqi board renders pieces as inline SVG, so a piece-set change needs a
  // re-render (the chess board picks up its set via CSS and does not).
  appearanceEvent: xiangqiAppearanceChangedEvent,
  perspective: (flipped) => (flipped ? 'black' : 'red'),
  // Review plays BOTH sides: the interactive seat is the side to move.
  seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
  createBoard: (opts) => createXiangqiInteractiveBoard(opts),
  animateMove: animateXiangqiBoardMove,
  shapeToArrow: (s: NodeShape): XiangqiBoardArrow => ({
    from: s.orig as XiangqiSquare,
    to: (s.dest ?? s.orig) as XiangqiSquare,
    className: `xq-arrow--draw xq-shape--${s.brush}`,
  }),
  shapeToMarker: (s: NodeShape): XiangqiBoardMarker => ({
    square: s.orig as XiangqiSquare,
    kind: 'circle',
    className: `xq-shape--${s.brush}`,
  }),
};

export function mountXiangqiReview(
  root: HTMLElement,
  config: XiangqiReviewConfig,
): XiangqiReviewHandle {
  return mountTreeReview(root, xiangqiPresentation, config);
}

// Fairy-Stockfish xiangqi UCI back to our `from-to` notation for readable PV
// lines. FSF is 1-indexed like us, so this is a plain square split.
function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}
