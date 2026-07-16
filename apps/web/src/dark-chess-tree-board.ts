// Interactive Fog Chess (dark-chess) board for the review/analysis surface: a
// factory-wrapped select-and-move / drag board over the shared descriptor-driven
// grid renderer, mirroring createJungleFlipInteractiveBoard (jungle-flip-board.ts).
// It stands on the SAME shared primitives (installBoardDrag DOM hit-testing +
// installSelectionClickAway) and holds its OWN selection/drag state, so the fog
// triptych can mount three independent boards (truth + each POV) at once.
//
// Fog has no client engine and the renderer has no arrow/marker overlay, so
// setArrows/setMarkers are no-ops. Pawn promotion auto-queens (the common case);
// a promotion picker is a later refinement.

import type { Color, Move, PlayerView, Square } from '@mistboard/game';
import { darkChessPieceGhostSvg, renderDarkChessInteractiveBoardSvg } from './dark-chess-render.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

// 8 files; used only to size the drag ghost to the currently rendered cell width.
const CHESS_FILES = 8;

export interface DarkChessInteractiveBoardOptions {
  board: HTMLElement;
  getInteractionView: () => PlayerView | null;
  getPerspective: () => Color;
  /** Whose pieces are interactive: the side to move (review plays both sides).
   *  Null = nobody (game over / a read-only POV board). */
  seatFor: (view: PlayerView) => Color | null;
  enabled: () => boolean;
  onMove: (move: Move, view: PlayerView) => void;
}

export interface DarkChessInteractiveBoard {
  render(view: PlayerView | null, perspective: Color): void;
  clearSelection(): void;
  setArrows(): void;
  setMarkers(): void;
}

/** Legal move from → to, auto-queening a promotion (the legal set carries one
 *  entry per promotion piece; the review surface picks queen). */
function findMove(view: PlayerView, from: Square, to: Square): Move | undefined {
  const candidates = view.legalMoves.filter((move) => move.from === from && move.to === to);
  return candidates.find((move) => move.promotion === 'queen') ?? candidates[0];
}

export function createDarkChessInteractiveBoard(
  opts: DarkChessInteractiveBoardOptions,
): DarkChessInteractiveBoard {
  let selectedSquare: Square | null = null;
  let draggingFrom: Square | null = null;

  function render(view: PlayerView | null, perspective: Color): void {
    if (!view) {
      opts.board.replaceChildren();
      return;
    }
    const targets = selectedSquare
      ? view.legalMoves.filter((move) => move.from === selectedSquare).map((move) => move.to)
      : [];
    opts.board.innerHTML = renderDarkChessInteractiveBoardSvg(view, {
      perspective,
      // The interactive board IS the fully-revealed truth board, so no fog; the
      // read-only POV secondaries keep theirs. In fog analysis the board you can
      // play on is the one with full information.
      showFog: !opts.enabled(),
      selected: selectedSquare,
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

  function canSelect(view: PlayerView, seat: Color | null, square: Square): boolean {
    const piece = view.board[square];
    if (!piece || piece.color !== seat) return false;
    return view.legalMoves.some((move) => move.from === square);
  }

  function handleClick(square: Square): void {
    if (opts.enabled()) {
      const view = opts.getInteractionView();
      if (view) {
        const seat = opts.seatFor(view);
        draggingFrom = null;
        if (selectedSquare && selectedSquare !== square) {
          const move = findMove(view, selectedSquare, square);
          if (move) {
            selectedSquare = null;
            opts.onMove(move, view);
            rerender();
            return;
          }
        }
        // Toggle off when re-clicking the selection; otherwise select an own piece.
        if (selectedSquare === square) {
          selectedSquare = null;
        } else if (canSelect(view, seat, square)) {
          selectedSquare = square;
        } else {
          selectedSquare = null;
        }
      }
    }
    rerender();
  }

  function canDrag(square: Square): boolean {
    if (!opts.enabled()) return false;
    const view = opts.getInteractionView();
    if (!view || view.status.type !== 'playing') return false;
    const seat = opts.seatFor(view);
    const piece = view.board[square];
    if (!piece || piece.color !== seat) return false;
    return view.legalMoves.some((move) => move.from === square);
  }

  function handleDrop(from: Square, to: Square | null): void {
    draggingFrom = null;
    const view = opts.getInteractionView();
    const move = to && view ? findMove(view, from, to) : undefined;
    selectedSquare = null;
    if (move && view) opts.onMove(move, view);
    rerender();
  }

  installBoardDrag({
    board: opts.board,
    ghostSizePx: () => opts.board.getBoundingClientRect().width / CHESS_FILES,
    onSquareClick: (square) => handleClick(square as Square),
    canDragFrom: (square) => canDrag(square as Square),
    ghostHtml: (square) => {
      const piece = opts.getInteractionView()?.board[square as Square];
      return piece ? darkChessPieceGhostSvg(piece.role, piece.color) : null;
    },
    onDragStart: (from) => {
      selectedSquare = from as Square;
      draggingFrom = from as Square;
      rerender();
    },
    onDrop: (from, to) => handleDrop(from as Square, to as Square | null),
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
