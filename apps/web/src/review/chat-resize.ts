// Desktop game-chat height control. The chat fills its rail automatically until
// a user drags the bottom separator, then keeps that preferred height across
// live and review pages. Viewport changes clamp the rendered height without
// discarding the preference, so growing the window restores the chosen size.

const STORAGE_KEY = 'mistboard-game-chat-height';
const MIN_HEIGHT = 180;
const KEYBOARD_STEP = 24;

export function attachChatResize(panel: HTMLElement): HTMLElement {
  panel.classList.add('review-spectator-chat--resizable');

  const separator = document.createElement('div');
  separator.className = 'review-spectator-chat__resize';
  separator.tabIndex = 0;
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-label', 'Resize chat');
  separator.setAttribute('aria-orientation', 'horizontal');
  separator.title = 'Drag to resize chat (double-click to reset)';
  const rule = document.createElement('span');
  rule.className = 'review-spectator-chat__resize-rule';
  rule.setAttribute('aria-hidden', 'true');
  separator.append(rule);
  panel.append(separator);

  let preferredHeight = readStoredHeight();
  let dragStartY = 0;
  let dragStartHeight = 0;

  // The ceiling is whatever the panel's PARENT has left over. That makes the
  // parent's height a contract: it must be sized by the rail, not by the panel.
  // A rail group that content-sizes around this panel (no siblings, no height of
  // its own) turns the ceiling into a mirror of the current height, and the
  // handle ratchets shut — each shrink lowers the ceiling to match, and nothing
  // can grow back. Give the CHAT a height in that case, never the group.
  const maxHeight = (): number => {
    const parent = panel.parentElement;
    if (!parent) return Math.max(MIN_HEIGHT, window.innerHeight - 120);
    const parentHeight = parent.getBoundingClientRect().height;
    if (parentHeight <= 0) return Math.max(MIN_HEIGHT, window.innerHeight - 120);

    const siblings = Array.from(parent.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== panel,
    );
    const visibleSiblings = siblings.filter(
      (sibling) => sibling.getBoundingClientRect().height > 0,
    );
    const occupied = visibleSiblings.reduce(
      (total, sibling) => total + sibling.getBoundingClientRect().height,
      0,
    );
    const gap = Number.parseFloat(getComputedStyle(parent).gap) || 0;
    return Math.max(MIN_HEIGHT, parentHeight - occupied - gap * visibleSiblings.length);
  };

  const setAriaHeight = (height: number): void => {
    separator.setAttribute('aria-valuemin', String(MIN_HEIGHT));
    separator.setAttribute('aria-valuemax', String(Math.round(maxHeight())));
    separator.setAttribute('aria-valuenow', String(Math.round(height)));
  };

  const renderPreferredHeight = (): void => {
    if (preferredHeight === null) {
      panel.classList.remove('review-spectator-chat--manual-height');
      panel.style.removeProperty('--review-chat-manual-height');
      setAriaHeight(panel.getBoundingClientRect().height);
      return;
    }
    const renderedHeight = clamp(preferredHeight, MIN_HEIGHT, maxHeight());
    panel.classList.add('review-spectator-chat--manual-height');
    panel.style.setProperty('--review-chat-manual-height', `${Math.round(renderedHeight)}px`);
    setAriaHeight(renderedHeight);
  };

  const chooseHeight = (height: number, persist = true): void => {
    preferredHeight = Math.round(clamp(height, MIN_HEIGHT, maxHeight()));
    if (persist) writeStoredHeight(preferredHeight);
    renderPreferredHeight();
  };

  const resetHeight = (): void => {
    preferredHeight = null;
    removeStoredHeight();
    renderPreferredHeight();
  };

  separator.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragStartY = event.clientY;
    dragStartHeight = panel.getBoundingClientRect().height;
    separator.setPointerCapture(event.pointerId);
    separator.classList.add('is-dragging');
    document.documentElement.classList.add('chat-resizing');
  });
  separator.addEventListener('pointermove', (event) => {
    if (!separator.hasPointerCapture(event.pointerId)) return;
    chooseHeight(dragStartHeight + event.clientY - dragStartY, false);
  });
  const endDrag = (event: PointerEvent): void => {
    if (separator.hasPointerCapture(event.pointerId))
      separator.releasePointerCapture(event.pointerId);
    if (preferredHeight !== null) writeStoredHeight(preferredHeight);
    separator.classList.remove('is-dragging');
    document.documentElement.classList.remove('chat-resizing');
  };
  separator.addEventListener('pointerup', endDrag);
  separator.addEventListener('pointercancel', endDrag);
  separator.addEventListener('dblclick', (event) => {
    event.preventDefault();
    resetHeight();
  });
  separator.addEventListener('keydown', (event) => {
    const current = panel.getBoundingClientRect().height || MIN_HEIGHT;
    if (event.key === 'ArrowUp') chooseHeight(current - KEYBOARD_STEP);
    else if (event.key === 'ArrowDown') chooseHeight(current + KEYBOARD_STEP);
    else if (event.key === 'Home') chooseHeight(MIN_HEIGHT);
    else if (event.key === 'End') chooseHeight(maxHeight());
    else if (event.key === 'Escape') resetHeight();
    else return;
    event.preventDefault();
  });

  const onViewportResize = (): void => {
    if (!panel.isConnected) {
      window.removeEventListener('resize', onViewportResize);
      return;
    }
    renderPreferredHeight();
  };
  window.addEventListener('resize', onViewportResize);

  // The rail's leftover space is not settled at mount: the board refits on a
  // timer (review-layout.ts), so the rail bottom moves long after the panel
  // first measured its parent. A preference clamped against that early
  // measurement stays too tall, and the rail clips its overflow — the composer
  // and this separator end up below the cut, leaving a feed nobody can type
  // into. The viewport listener above never fires for that, so watch the space
  // itself. The panel is capped at the parent's height in CSS, so re-rendering
  // here cannot grow the parent back and loop.
  if (typeof ResizeObserver !== 'undefined' && panel.parentElement) {
    const spaceObserver = new ResizeObserver(() => {
      if (!panel.isConnected) {
        spaceObserver.disconnect();
        return;
      }
      renderPreferredHeight();
    });
    spaceObserver.observe(panel.parentElement);
  }

  queueMicrotask(renderPreferredHeight);
  return separator;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readStoredHeight(): number | null {
  try {
    const value = Number.parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
    return Number.isFinite(value) && value >= MIN_HEIGHT ? value : null;
  } catch {
    return null;
  }
}

function writeStoredHeight(height: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(height)));
  } catch {
    // Storage unavailable (private mode); the height still applies this session.
  }
}

function removeStoredHeight(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable; resetting the current page still succeeds.
  }
}

export const chatResizeStorageKey = STORAGE_KEY;
