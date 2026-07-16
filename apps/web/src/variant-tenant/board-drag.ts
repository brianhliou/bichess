// Shared drag-to-move for the self-rendered SVG variant boards.
//
// Extracted from the Dark Mini Xiangqi client (the first SVG drag implementation)
// so every tenant gets the same lichess-style feel: pick a piece up, drag it, drop
// it on the target. CLICK-TO-MOVE IS PRESERVED — a pointerdown that never crosses
// the movement threshold falls through to the click handler, and a completed drag
// swallows the trailing click so it does not double-fire.
//
// Listeners are delegated to the persistent board container (not the per-square
// hit rects), so they are attached ONCE at mount and survive every board
// re-render. The caller supplies the per-variant policy (which squares are
// draggable, the ghost markup, what a drop does); the mechanics live here.

export interface BoardDragHandlers {
  // The persistent container that holds the `[data-square]` hit elements. Its
  // inner SVG is replaced on every render, but the container itself stays.
  board: HTMLElement;
  // Pixel size of the floating ghost piece. A function lets responsive boards
  // match the currently rendered cell size instead of their internal SVG units.
  ghostSizePx: number | (() => number);
  // A click (tap) on `square` — the existing click-to-move handler.
  onSquareClick: (square: string) => void;
  // Whether a drag may begin from `square` (an own, movable piece on your turn).
  canDragFrom: (square: string) => boolean;
  // Inner markup (SVG) for the ghost piece lifted from `square`, or null.
  ghostHtml: (square: string) => string | null;
  // A drag crossed the threshold and began at `from`: the caller should select it
  // and lift its piece off the origin (render with that square emptied) so only
  // the ghost shows.
  onDragStart: (from: string) => void;
  // A drag ended over `to` (null if dropped off-board or back on `from`). The
  // caller attempts the move (legality / promotion / send), clears the drag-origin
  // state, and re-renders.
  onDrop: (from: string, to: string | null) => void;
}

const MOVE_THRESHOLD_PX = 4;

function ghostSizePx(handlers: BoardDragHandlers): number {
  const size = handlers.ghostSizePx;
  return typeof size === 'function' ? size() : size;
}

function squareOf(target: EventTarget | null): string | null {
  const el = (target as Element | null)?.closest('[data-square]') as HTMLElement | null;
  return el?.dataset.square ?? null;
}

function squareUnderPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-square]') as HTMLElement | null;
  return el?.dataset.square ?? null;
}

export function installBoardDrag(handlers: BoardDragHandlers): void {
  let suppressNextClick = false;
  let ghost: HTMLDivElement | null = null;

  const removeGhost = (): void => {
    ghost?.remove();
    ghost = null;
  };
  const positionGhost = (x: number, y: number): void => {
    if (!ghost) return;
    const size = ghostSizePx(handlers);
    ghost.style.left = `${x - size / 2}px`;
    ghost.style.top = `${y - size / 2}px`;
  };

  handlers.board.addEventListener('click', (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return; // trailing click from a completed drag — already handled
    }
    const square = squareOf(event.target);
    if (square) handlers.onSquareClick(square);
  });

  handlers.board.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const from = squareOf(event.target);
    if (!from || !handlers.canDragFrom(from)) return;

    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;

    const onMove = (move: PointerEvent): void => {
      if (!dragging) {
        if (
          Math.abs(move.clientX - startX) + Math.abs(move.clientY - startY) <=
          MOVE_THRESHOLD_PX
        ) {
          return; // still within tap tolerance — leave it to the click handler
        }
        dragging = true;
        handlers.onDragStart(from);
        const html = handlers.ghostHtml(from);
        if (html) {
          const size = ghostSizePx(handlers);
          ghost = document.createElement('div');
          ghost.className = 'board-drag-ghost';
          ghost.style.width = `${size}px`;
          ghost.style.height = `${size}px`;
          ghost.innerHTML = html;
          document.body.append(ghost);
        }
      }
      move.preventDefault();
      positionGhost(move.clientX, move.clientY);
    };

    const onUp = (up: PointerEvent): void => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (!dragging) return; // a tap — let the click handler run click-to-move
      removeGhost();
      suppressNextClick = true;
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
      const to = squareUnderPoint(up.clientX, up.clientY);
      handlers.onDrop(from, to && to !== from ? to : null);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

export interface BoardDrawHandlers {
  // Same persistent `[data-square]` container as installBoardDrag.
  board: HTMLElement;
  // A right-button gesture completed: `orig` is the square pressed; `dest` is the
  // square released over (null off-board, or equal to `orig` for a tap). `alt` =
  // a modifier was held (Shift/Ctrl/Meta/Alt) selecting the secondary brush. The
  // caller decides shape kind (dest==orig|null → circle at orig; else arrow) and
  // toggles it on the current node. The context menu is suppressed while enabled.
  onDraw: (orig: string, dest: string | null, opts: { alt: boolean }) => void;
  // Outer gate; default always on. Drawing is an annotation affordance, so review
  // surfaces enable it always; a live board can leave it off.
  enabled?: () => boolean;
}

// Right-button draw for the self-rendered SVG boards — the shape-annotation
// counterpart to installBoardDrag. Left button is untouched (installBoardDrag owns
// it); this listens only to button 2, so click-to-move and draw never collide.
export function installBoardDraw(handlers: BoardDrawHandlers): void {
  const gate = (): boolean => handlers.enabled?.() ?? true;

  handlers.board.addEventListener('contextmenu', (event) => {
    if (gate()) event.preventDefault();
  });

  handlers.board.addEventListener('pointerdown', (event) => {
    if (event.button !== 2 || !gate()) return;
    const orig = squareOf(event.target);
    if (!orig) return;
    const alt = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    event.preventDefault();
    const onUp = (up: PointerEvent): void => {
      document.removeEventListener('pointerup', onUp);
      handlers.onDraw(orig, squareUnderPoint(up.clientX, up.clientY), { alt });
    };
    document.addEventListener('pointerup', onUp);
  });
}
