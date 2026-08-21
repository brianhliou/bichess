// Right-click annotations (arrows + circles) for the self-rendered SVG live
// boards — the counterpart to the chessground room's built-in drawable layer.
//
// The gesture and the geometry already exist elsewhere: installBoardDraw
// (board-drag.ts) owns the right-button drag, and every variant renderer owns
// its own arrow/marker SVG. This module owns the part between them — which
// shapes exist, when they are toggled off, and when they stop belonging to the
// board at all — so all fifteen tenants share one behaviour instead of fifteen
// near-copies.
//
// Shapes never leave the browser. They are not sent, stored, or replayed, so a
// fog board cannot leak anything through them.

import { installBoardDraw } from './board-drag.js';
import './board-annotations.css';

export type BoardShapeBrush = 'green' | 'red';

/** A drawn annotation. `dest` absent (or equal to `orig`) is a circle on one
 *  square; otherwise an arrow between two. Mirrors review's NodeShape so a
 *  variant's existing shapeToArrow/shapeToMarker mappers accept it as-is. */
export interface BoardShape {
  kind: 'arrow' | 'circle';
  brush: BoardShapeBrush;
  orig: string;
  dest?: string;
}

export interface BoardAnnotationsHandlers {
  /** Same persistent `[data-square]` container installBoardDraw takes. */
  board: HTMLElement;
  /** Redraw the board. Called after the shape set changes; the client reads
   *  shapes() while building its SVG, so no layer patching happens here. */
  repaint: () => void;
  /** Identity of the game that owns the current shapes, or null when no game is
   *  in play. Shapes are per-game working memory: they survive every turn of one
   *  game and are dropped when it ends or a rematch swaps in a new id. */
  gameId: () => string | null;
  /** Outer gate; default always on. */
  enabled?: () => boolean;
}

/** Which game owns a board's annotations: its id while a game is in play, null
 *  otherwise. Shapes are dropped when this changes, so they survive every turn
 *  of one game and neither a finish nor a rematch's new id. Shared with the
 *  chessground room so both board families use one rule. */
export function annotationOwner(
  view: { id: string; status: { type: string } } | null | undefined,
): string | null {
  return view?.status.type === 'playing' ? view.id : null;
}

/** Drawn shapes in the overlay shape every SVG board's renderer already takes:
 *  arrows carry from/to, circle markers carry a square, and the brush rides in
 *  on a class the shared stylesheet colours. Variants differ only in their
 *  square type, so one mapper serves all of them. */
export function drawnBoardOverlays<S extends string>(
  shapes: readonly BoardShape[],
): {
  arrows: { from: S; to: S; className: string }[];
  markers: { square: S; kind: 'circle'; className: string }[];
} {
  const arrows: { from: S; to: S; className: string }[] = [];
  const markers: { square: S; kind: 'circle'; className: string }[] = [];
  for (const shape of shapes) {
    if (shape.kind === 'arrow' && shape.dest) {
      arrows.push({
        from: shape.orig as S,
        to: shape.dest as S,
        className: `xq-arrow--draw xq-shape--${shape.brush}`,
      });
    } else {
      markers.push({
        square: shape.orig as S,
        kind: 'circle',
        className: `xq-shape--${shape.brush}`,
      });
    }
  }
  return { arrows, markers };
}

export interface BoardAnnotations {
  /** Call while building each board render. Drops shapes the current game no
   *  longer owns, then returns what should be drawn. */
  shapes: () => readonly BoardShape[];
}

function sameShape(a: BoardShape, b: BoardShape): boolean {
  return a.kind === b.kind && a.orig === b.orig && a.dest === b.dest && a.brush === b.brush;
}

export function installBoardAnnotations(handlers: BoardAnnotationsHandlers): BoardAnnotations {
  let shapes: readonly BoardShape[] = [];
  let ownerGameId: string | null = null;

  const clear = (): boolean => {
    if (shapes.length === 0) return false;
    shapes = [];
    return true;
  };

  installBoardDraw({
    board: handlers.board,
    enabled: handlers.enabled,
    onDraw: (orig, dest, { alt }) => {
      const brush: BoardShapeBrush = alt ? 'red' : 'green';
      const shape: BoardShape =
        !dest || dest === orig
          ? { kind: 'circle', brush, orig }
          : { kind: 'arrow', brush, orig, dest };
      // Re-drawing the same shape erases it, matching the review board.
      shapes = shapes.some((s) => sameShape(s, shape))
        ? shapes.filter((s) => !sameShape(s, shape))
        : [...shapes, shape];
      // Stamp the owner HERE, not on the next read: a shape belongs to the game
      // that was on the board when it was drawn. Reading it first would compare
      // against a stale owner and erase the shape the player just made.
      ownerGameId = handlers.gameId();
      handlers.repaint();
    },
  });

  // Left-click wipes the board, the way chessground's eraseOnClick does on the
  // chess room. Runs on pointerdown so the board is already clean by the time
  // the click lands on a piece and the client re-renders for the selection.
  handlers.board.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (clear()) handlers.repaint();
  });

  return {
    shapes: () => {
      if (handlers.gameId() !== ownerGameId) shapes = [];
      return shapes;
    },
  };
}
