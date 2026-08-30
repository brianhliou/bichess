// Interactive Fog Xiangqi board for the review/analysis surface. It stands on the
// SAME shared primitives the live board uses (installBoardDrag DOM hit-testing +
// installSelectionClickAway) and delegates the click decision to the pure
// darkXiangqiClickResult, so the review board and the live board agree on
// select-vs-move exactly. Unlike the live board it holds its OWN selection/drag
// state (not this module's live-room globals), so the fog triptych can mount three
// independent boards (truth + each POV) at once.
//
// Fog has no client engine and the SVG renderer has no arrow/marker overlay, so
// setArrows/setMarkers are no-ops (a user-drawn shape is still recorded on the
// tree node; it just is not painted on this board yet).
//
// The truth (primary) board is projected with EVERY square visible, so the fog
// layer produces full cutouts and shows no fog — the same renderer masks the POV
// secondaries because their views carry a limited visibleSquares set.

import { coordOf, type XiangqiColor, type XiangqiMove, type XiangqiSquare } from '@mistboard/game';
import {
  type DarkXiangqiWireView,
  darkXiangqiClickResult,
  darkXiangqiInteractivePieceGhostSvg,
  renderDarkXiangqiInteractiveBoardSvg,
} from './live-dark-xiangqi.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';
import { drawsCrossedSoldier } from './xiangqi-crossed-soldier.js';

// 9 files; used only to size the drag ghost to the currently rendered cell width.
const XIANGQI_FILES = 9;

export interface DarkXiangqiInteractiveBoardOptions {
  board: HTMLElement;
  getInteractionView: () => DarkXiangqiWireView | null;
  getPerspective: () => XiangqiColor;
  /** Whose pieces are interactive: the side to move (review plays both sides).
   *  Null = nobody (game over / a read-only POV board). */
  seatFor: (view: DarkXiangqiWireView) => XiangqiColor | null;
  enabled: () => boolean;
  onMove: (move: XiangqiMove, view: DarkXiangqiWireView) => void;
}

export interface DarkXiangqiInteractiveBoard {
  render(view: DarkXiangqiWireView | null, perspective: XiangqiColor): void;
  clearSelection(): void;
  setArrows(): void;
  setMarkers(): void;
}

export function createDarkXiangqiInteractiveBoard(
  opts: DarkXiangqiInteractiveBoardOptions,
): DarkXiangqiInteractiveBoard {
  let selectedSquare: XiangqiSquare | null = null;
  let draggingFrom: XiangqiSquare | null = null;

  function render(view: DarkXiangqiWireView | null, perspective: XiangqiColor): void {
    if (!view) {
      opts.board.replaceChildren();
      return;
    }
    opts.board.innerHTML = renderDarkXiangqiInteractiveBoardSvg(view, perspective, {
      selectedSquare,
      draggingFrom,
      // The interactive board IS the fully-revealed truth board, so it carries no
      // fog layer; the read-only POV secondaries keep theirs. In fog analysis the
      // board you can play on is the one with full information.
      showFog: !opts.enabled(),
    });
  }

  function rerender(): void {
    render(opts.getInteractionView(), opts.getPerspective());
  }

  function clearSelection(): void {
    selectedSquare = null;
    draggingFrom = null;
  }

  function handleClick(square: XiangqiSquare): void {
    if (opts.enabled()) {
      const view = opts.getInteractionView();
      if (view) {
        const seat = opts.seatFor(view);
        const result = darkXiangqiClickResult(view, seat, selectedSquare, square);
        draggingFrom = null;
        switch (result.kind) {
          case 'move':
            selectedSquare = null;
            opts.onMove(result.move, view);
            rerender();
            return;
          case 'select':
            selectedSquare = result.square;
            break;
          case 'clear':
          case 'noop':
            selectedSquare = null;
            break;
        }
      }
    }
    rerender();
  }

  // Only the side-to-move's own VISIBLE pieces with a legal board move are
  // draggable (legalMoves already carries only the mover's moves; a shrouded
  // entry is enemy occupancy with no piece type, so it is never a drag source).
  function canDrag(square: XiangqiSquare): boolean {
    if (!opts.enabled()) return false;
    const view = opts.getInteractionView();
    if (view?.status.type !== 'playing') return false;
    const seat = opts.seatFor(view);
    const entry = view.board[square];
    if (!entry || entry.shrouded || entry.piece.color !== seat) return false;
    return view.legalMoves.some((move) => move.from === square && move.to !== square);
  }

  function handleDrop(from: XiangqiSquare, to: XiangqiSquare | null): void {
    draggingFrom = null;
    const view = opts.getInteractionView();
    const move =
      to && view
        ? view.legalMoves.find((candidate) => candidate.from === from && candidate.to === to)
        : undefined;
    selectedSquare = null;
    if (move && view) opts.onMove(move, view);
    rerender();
  }

  installBoardDrag({
    board: opts.board,
    ghostSizePx: () => opts.board.getBoundingClientRect().width / XIANGQI_FILES,
    onSquareClick: (square) => handleClick(square as XiangqiSquare),
    canDragFrom: (square) => canDrag(square as XiangqiSquare),
    ghostHtml: (square) => {
      const entry = opts.getInteractionView()?.board[square as XiangqiSquare];
      if (!entry || entry.shrouded) return null;
      return darkXiangqiInteractivePieceGhostSvg(
        entry.piece,
        drawsCrossedSoldier(entry.piece, coordOf(square as XiangqiSquare).rank),
      );
    },
    onDragStart: (from) => {
      selectedSquare = from as XiangqiSquare;
      draggingFrom = from as XiangqiSquare;
      rerender();
    },
    onDrop: (from, to) => handleDrop(from as XiangqiSquare, to as XiangqiSquare | null),
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
