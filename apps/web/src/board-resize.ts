// Shared board resize grip (lichess-style). A small handle at the board's
// bottom-right corner drags the board size continuously between MIN_SCALE and
// the max viewport fit; the uniboard grid re-centers the columns around it.
// The scale is one global token (--uni-board-scale on <html>), consumed by the
// room and review sizing formulas alike, and persisted per browser so every
// board surface opens at the user's chosen size. Double-click resets to max.

import { embedRouteFromPath } from './embed/embed-route.js';
import './board-resize.css';

const STORAGE_KEY = 'mistboard-board-scale';
const MIN_SCALE = 0.5;
const MAX_SCALE = 1;

/**
 * An embed is sized by the page that frames it, not by the viewer.
 *
 * The grip and the persisted scale are both wrong inside someone else's
 * document. The grip because the embedder chose the iframe's dimensions and a
 * drag handle inside it fights them; the persisted scale because
 * `mistboard-board-scale` is a value the visitor set on Mistboard proper, and
 * restoring it renders the board at up to half size inside an iframe the
 * embedder sized for a full one. Two of the five embed routes reach this
 * module: /embed/puzzle (puzzles.ts) and /embed/analysis (review-layout.ts).
 *
 * Same import-free path check main.ts uses to gate analytics and the account
 * nav, rather than `documentElement.dataset.embed`, which each embed page sets
 * itself and is therefore order-dependent.
 */
function inEmbed(): boolean {
  return embedRouteFromPath(window.location.pathname.replace(/\/+$/, '') || '/') !== null;
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return MAX_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function currentBoardScale(): number {
  const raw = document.documentElement.style.getPropertyValue('--uni-board-scale');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_SCALE;
}

function applyBoardScale(scale: number): void {
  const value = clampScale(scale);
  // Once a drag passes either bound, pointermove keeps firing with values that
  // clamp to the same scale. Avoid repeatedly writing storage and dispatching
  // synthetic resize events, which otherwise churn layout while the grip sits
  // at its maximum or minimum.
  if (Math.abs(currentBoardScale() - value) < 0.0005) return;
  document.documentElement.style.setProperty('--uni-board-scale', value.toFixed(3));
  try {
    localStorage.setItem(STORAGE_KEY, value.toFixed(3));
  } catch {
    // Storage unavailable (private mode); the scale still applies this session.
  }
  // The review layout's viewport fit and the eval gauge both re-measure on
  // window resize; reuse that path so a scale change re-fits everything.
  window.dispatchEvent(new Event('resize'));
}

/** Restore the persisted scale. Call once per page mount before boards render. */
export function restoreBoardScale(): void {
  if (inEmbed()) return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return;
  document.documentElement.style.setProperty('--uni-board-scale', clampScale(parsed).toFixed(3));
}

/**
 * Attach a resize grip inside `host` (which must be positioned) and size
 * against the resolved board element's rendered width. Dragging right grows
 * the board up to its max fit; left shrinks it. Returns the grip element so
 * callers can reposition it (the review stage aligns it to the primary slot's
 * corner). `board` may be a resolver when the target element changes over time
 * (fog review promotes secondaries into the primary slot).
 */
export function attachBoardResizeGrip(
  host: HTMLElement,
  board: HTMLElement | (() => HTMLElement | null),
): HTMLElement {
  const resolveBoard = (): HTMLElement | null => (typeof board === 'function' ? board() : board);
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'board-resize-grip';
  grip.title = 'Drag to resize the board (double-click to reset)';
  grip.setAttribute('aria-label', 'Resize board');
  // Returned but never appended and never wired inside an embed. Callers
  // either ignore the return value (puzzles.ts) or only reposition it
  // (review-layout.ts, whose positionGrip tolerates an unmounted node), so
  // neither needs to know.
  if (inEmbed()) return grip;
  host.append(grip);

  let baseWidth = 0;
  let startX = 0;
  let startScale = 1;
  let activePointerId: number | null = null;

  const endPointerDrag = (event: PointerEvent): void => {
    endDrag(event.pointerId);
  };
  const endDragOnBlur = (): void => {
    endDrag();
  };
  const endDragWhenHidden = (): void => {
    if (document.visibilityState === 'hidden') endDrag();
  };
  const removeFallbackListeners = (): void => {
    window.removeEventListener('pointerup', endPointerDrag);
    window.removeEventListener('pointercancel', endPointerDrag);
    window.removeEventListener('blur', endDragOnBlur);
    document.removeEventListener('visibilitychange', endDragWhenHidden);
  };
  const endDrag = (pointerId?: number, releaseCapture = true): void => {
    if (activePointerId === null || (pointerId !== undefined && pointerId !== activePointerId)) {
      return;
    }
    const capturedPointerId = activePointerId;
    activePointerId = null;
    baseWidth = 0;
    document.documentElement.classList.remove('board-resizing');
    removeFallbackListeners();
    // Clear our state before releasePointerCapture: browsers fire
    // lostpointercapture synchronously in some cases, and cleanup must remain
    // idempotent when that event comes back through the grip.
    if (releaseCapture && grip.hasPointerCapture(capturedPointerId)) {
      grip.releasePointerCapture(capturedPointerId);
    }
  };

  grip.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = resolveBoard()?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    endDrag();
    startScale = currentBoardScale();
    baseWidth = rect.width / startScale;
    startX = event.clientX;
    grip.setPointerCapture(event.pointerId);
    activePointerId = event.pointerId;
    document.documentElement.classList.add('board-resizing');
    // Pointer capture normally routes the terminal event back to the grip, but
    // these fallbacks cover implicit capture loss, focus changes, and a route
    // replacing the grip mid-drag.
    window.addEventListener('pointerup', endPointerDrag);
    window.addEventListener('pointercancel', endPointerDrag);
    window.addEventListener('blur', endDragOnBlur);
    document.addEventListener('visibilitychange', endDragWhenHidden);
  });
  grip.addEventListener('pointermove', (event) => {
    if (
      baseWidth === 0 ||
      activePointerId !== event.pointerId ||
      !grip.hasPointerCapture(event.pointerId)
    ) {
      return;
    }
    applyBoardScale(startScale + (event.clientX - startX) / baseWidth);
  });
  grip.addEventListener('pointerup', endPointerDrag);
  grip.addEventListener('pointercancel', endPointerDrag);
  grip.addEventListener('lostpointercapture', (event) => {
    endDrag(event.pointerId, false);
  });
  grip.addEventListener('dblclick', (event) => {
    event.preventDefault();
    applyBoardScale(MAX_SCALE);
  });

  return grip;
}
