// Lichess-style playback control bar that sits BELOW the move-list box (not inside
// it): opening-book + practice affordances on the left, the four ply-nav buttons in
// the middle, and a hamburger that opens a menu overlay (Flip board, and deferred
// analyse tools) over the move list. Replaces the plain in-box scrubber on the
// xiangqi review surface; the shared linear scrubber (review-layout.ts) is untouched
// for the other variants.
import './review-controls.css';

export type ReviewMenuItem = {
  label: string;
  icon: string; // inline SVG markup
  onClick?: () => void;
  /** Not yet built — rendered muted + non-interactive with a "Coming soon" hint. */
  disabled?: boolean;
};

export type ReviewControlsOptions = {
  onFirst(): void;
  onPrevious(): void;
  onNext(): void;
  onLast(): void;
  /** Menu overlay rows (2-col grid). Flip lives here on the review surface. */
  menuItems: ReviewMenuItem[];
};

export type ReviewControls = {
  el: HTMLElement;
  setBounds(state: { atStart: boolean; atEnd: boolean }): void;
};

// Minimal inline icons (currentColor). Kept tiny; the CSS sizes them.
const ICONS = {
  // Lucide "book-open" and "target" (MIT).
  book: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
  practice:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  first:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h2v14H6zM19 5v14l-9-7z"/></svg>',
  previous:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15 5v14l-9-7z"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 5v14l9-7z"/></svg>',
  last: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 5h2v14h-2zM5 5v14l9-7z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
} as const;

function iconButton(icon: string, label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = icon;
  return button;
}

export function createReviewControls(opts: ReviewControlsOptions): ReviewControls {
  const el = document.createElement('div');
  el.className = 'review-controls';

  // Left cluster: opening book + practice (placeholders until those land).
  const book = iconButton(ICONS.book, 'Opening explorer (coming soon)', 'review-controls__tool');
  book.disabled = true;
  const practice = iconButton(
    ICONS.practice,
    'Practice with computer (coming soon)',
    'review-controls__tool',
  );
  practice.disabled = true;

  // Center cluster: ply navigation.
  const first = iconButton(ICONS.first, 'First move', 'review-controls__nav');
  const previous = iconButton(ICONS.previous, 'Previous move', 'review-controls__nav');
  const next = iconButton(ICONS.next, 'Next move', 'review-controls__nav');
  const last = iconButton(ICONS.last, 'Last move', 'review-controls__nav');
  first.addEventListener('click', opts.onFirst);
  previous.addEventListener('click', opts.onPrevious);
  next.addEventListener('click', opts.onNext);
  last.addEventListener('click', opts.onLast);

  // Right: hamburger toggles the menu overlay.
  const menuButton = iconButton(ICONS.menu, 'Menu', 'review-controls__menu-button');
  menuButton.setAttribute('aria-expanded', 'false');

  const left = document.createElement('div');
  left.className = 'review-controls__group review-controls__group--tools';
  left.append(book, practice);
  const center = document.createElement('div');
  center.className = 'review-controls__group review-controls__group--nav';
  center.append(first, previous, next, last);
  const rightGroup = document.createElement('div');
  rightGroup.className = 'review-controls__group review-controls__group--menu';
  rightGroup.append(menuButton);

  const overlay = buildMenuOverlay(opts.menuItems, () => closeMenu());
  el.append(left, center, rightGroup, overlay);

  function openMenu(): void {
    overlay.hidden = false;
    menuButton.classList.add('review-controls__menu-button--open');
    menuButton.setAttribute('aria-expanded', 'true');
  }
  function closeMenu(): void {
    overlay.hidden = true;
    menuButton.classList.remove('review-controls__menu-button--open');
    menuButton.setAttribute('aria-expanded', 'false');
  }
  menuButton.addEventListener('click', () => (overlay.hidden ? openMenu() : closeMenu()));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) closeMenu();
  });

  return {
    el,
    setBounds({ atStart, atEnd }) {
      first.disabled = atStart;
      previous.disabled = atStart;
      next.disabled = atEnd;
      last.disabled = atEnd;
    },
  };
}

function buildMenuOverlay(items: ReviewMenuItem[], onAction: () => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'review-menu';
  overlay.hidden = true;

  const header = document.createElement('div');
  header.className = 'review-menu__header';
  header.textContent = 'Analysis board';

  const grid = document.createElement('div');
  grid.className = 'review-menu__grid';
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-menu__item';
    if (item.disabled) {
      button.disabled = true;
      button.title = `${item.label} (coming soon)`;
    }
    const icon = document.createElement('span');
    icon.className = 'review-menu__item-icon';
    icon.innerHTML = item.icon;
    const label = document.createElement('span');
    label.className = 'review-menu__item-label';
    label.textContent = item.label;
    button.append(icon, label);
    if (!item.disabled && item.onClick) {
      button.addEventListener('click', () => {
        item.onClick?.();
        onAction();
      });
    }
    grid.append(button);
  }

  overlay.append(header, grid);
  return overlay;
}

/** Icon set for the menu items, so callers don't hand-write SVG. */
export const REVIEW_MENU_ICONS = {
  flip: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
  editor:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  learn:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 3 2 6 2s6-1 6-2v-5"/></svg>',
  continue:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 14 8-14 8z"/></svg>',
  study:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
  clear:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.8 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 19.4 11h.1a2 2 0 1 1 0 4z"/></svg>',
} as const;
