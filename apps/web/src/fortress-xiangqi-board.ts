// Interactive Fortress Xiangqi board for the review/analysis surface: a
// factory-wrapped click-to-select + drag-to-move board, mirroring
// createJungleInteractiveBoard / createXiangqiInteractiveBoard. It stands on the
// SHARED installBoardDrag (`[data-square]` hit-testing) + installSelectionClickAway,
// and delegates rendering to renderFortressXiangqiBoardSvg with its
// interactive/selectedSquare/targets/draggingFrom options.
//
// SCOPE (board-moves-first): only BOARD moves are interactive here. Fortress also
// has crazyhouse DROP moves from a reserve hand; drops in the mainline replay apply
// correctly (the tree reconstructs them), but dropping from hand is not yet a user
// gesture and the reserve strips are not rendered — that is a scoped follow-up
// (needs installHandDrag + a reserve host + the two-headed selection machine).
//
// No overlay layer, so setArrows/setMarkers are no-ops (engine PV / drawn shapes
// are not surfaced here yet).

import type {
  FortressXiangqiColor,
  FortressXiangqiMove,
  FortressXiangqiPlayerView,
  FortressXiangqiSquare,
} from '@mistboard/game';
import {
  FORTRESS_XIANGQI_PIECE_PX,
  fortressXiangqiPieceGhostSvg,
  installFortressXiangqiBoardStyles,
  renderFortressXiangqiBoardSvg,
} from './fortress-xiangqi-render.js';
import { fortressXiangqiBoardMoves } from './fortress-xiangqi-view.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

export interface FortressXiangqiInteractiveBoardOptions {
  board: HTMLElement;
  getInteractionView: () => FortressXiangqiPlayerView | null;
  getPerspective: () => FortressXiangqiColor;
  seatFor: (view: FortressXiangqiPlayerView) => FortressXiangqiColor | null;
  enabled: () => boolean;
  onMove: (move: FortressXiangqiMove, view: FortressXiangqiPlayerView) => void;
}

export interface FortressXiangqiInteractiveBoard {
  render(view: FortressXiangqiPlayerView | null, perspective: FortressXiangqiColor): void;
  clearSelection(): void;
  setArrows(): void;
  setMarkers(): void;
}

export function createFortressXiangqiInteractiveBoard(
  opts: FortressXiangqiInteractiveBoardOptions,
): FortressXiangqiInteractiveBoard {
  installFortressXiangqiBoardStyles();

  let selectedSquare: FortressXiangqiSquare | null = null;
  let draggingFrom: FortressXiangqiSquare | null = null;

  function render(view: FortressXiangqiPlayerView | null, perspective: FortressXiangqiColor): void {
    if (!view) {
      opts.board.replaceChildren();
      return;
    }
    const targets = selectedSquare
      ? fortressXiangqiBoardMoves(view, selectedSquare).map((m) => m.to)
      : [];
    opts.board.innerHTML = renderFortressXiangqiBoardSvg(view, perspective, {
      interactive: true,
      selectedSquare,
      targets,
      draggingFrom,
    });
  }

  function rerender(): void {
    render(opts.getInteractionView(), opts.getPerspective());
  }

  function clearSelection(): void {
    selectedSquare = null;
    draggingFrom = null;
  }

  function handleClick(square: FortressXiangqiSquare): void {
    if (opts.enabled()) {
      const view = opts.getInteractionView();
      if (view) {
        const seat = opts.seatFor(view);
        if (selectedSquare) {
          const move = fortressXiangqiBoardMoves(view, selectedSquare).find((m) => m.to === square);
          if (move) {
            selectedSquare = null;
            opts.onMove(move, view);
            rerender();
            return;
          }
          if (square === selectedSquare) {
            selectedSquare = null;
            rerender();
            return;
          }
        }
        const piece = view.board[square];
        selectedSquare = seat && piece && piece.color === seat ? square : null;
        draggingFrom = null;
      }
    }
    rerender();
  }

  function canDrag(square: FortressXiangqiSquare): boolean {
    if (!opts.enabled()) return false;
    const view = opts.getInteractionView();
    if (!view) return false;
    const seat = opts.seatFor(view);
    if (!seat) return false;
    if (view.status.type !== 'playing' || view.status.turn !== seat) return false;
    const piece = view.board[square];
    return !!piece && piece.color === seat;
  }

  function handleDrop(from: FortressXiangqiSquare, to: FortressXiangqiSquare | null): void {
    draggingFrom = null;
    const view = opts.getInteractionView();
    const move =
      to && view ? fortressXiangqiBoardMoves(view, from).find((m) => m.to === to) : undefined;
    selectedSquare = null;
    if (move && view) opts.onMove(move, view);
    rerender();
  }

  installBoardDrag({
    board: opts.board,
    ghostSizePx: FORTRESS_XIANGQI_PIECE_PX,
    onSquareClick: (square) => handleClick(square as FortressXiangqiSquare),
    canDragFrom: (square) => canDrag(square as FortressXiangqiSquare),
    ghostHtml: (square) => {
      const piece = opts.getInteractionView()?.board[square as FortressXiangqiSquare];
      return piece ? fortressXiangqiPieceGhostSvg(piece) : null;
    },
    onDragStart: (from) => {
      selectedSquare = from as FortressXiangqiSquare;
      draggingFrom = from as FortressXiangqiSquare;
      rerender();
    },
    onDrop: (from, to) =>
      handleDrop(from as FortressXiangqiSquare, to as FortressXiangqiSquare | null),
  });

  installSelectionClickAway({
    roots: () => [opts.board],
    hasSelection: () => selectedSquare !== null,
    clearSelection: () => {
      clearSelection();
      rerender();
    },
  });

  return { render, clearSelection, setArrows: () => {}, setMarkers: () => {} };
}
