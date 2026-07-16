// Unified review layout. Two things live here:
//
//  1. `createReviewScaffold` — the pure LAYOUT: the hugging left/center/right
//     shell, the review-stage (dominant primary board + click-to-promote
//     secondaries), the underboard region, the eval-gauge column, the rail
//     material rows + strip adoption, the board-zoom grip, the uniboard token
//     grid (shared with the live room), and the viewport-fill sizing. It is
//     navigation-agnostic: the caller supplies the right-rail `navigation`
//     element (a linear scrubber, or a tree nav bar) and drives rendering.
//
//  2. `mountReviewLayout` — the LINEAR controller every variant's /game review
//     rides: an integer-ply scrubber + keyboard over the scaffold. Its adapter is
//     unchanged, so every postgame page keeps working untouched. The interactive
//     analysis board rides the SAME scaffold with a path-based (tree) controller,
//     so both surfaces share one layout and size identically.

import { attachBoardResizeGrip, currentBoardScale, restoreBoardScale } from '../board-resize.js';
import { createGameFavoriteButton } from '../game-favorite.js';
import { createReviewControls, REVIEW_MENU_ICONS } from './review-controls.js';
import { type BoardStageHandle, type BoardStageSlot, createBoardStage } from './review-stage.js';
import './review-shell.css';
import { createReviewShell } from './review-shell.js';

export type ReviewBoardEntry = {
  /** Stable identity (e.g. 'truth' | 'white' | 'black' | 'red'). */
  key: string;
  tier: 'primary' | 'secondary';
  /** The board host element (its own label + board) the variant renders into. */
  el: HTMLElement;
};

export type ReviewRenderContext = {
  ply: number;
  flipped: boolean;
  primaryKey: string;
};

export type ReviewLayoutAdapter = {
  /** Root <main> class hook (e.g. 'dark-xiangqi-review'). */
  pageClassName?: string;
  ariaLabel: string;
  title: string;
  summary: string;
  /** Play again / home / room actions row. Optional on review pages with no local actions. */
  actions?: HTMLElement;
  /** Left-rail details panel (result / clock / date …). Optional. */
  details?: HTMLElement;
  /** Lichess-style game meta card (glyph / time control / players / result).
   *  When present it REPLACES the eyebrow/title/summary info card; the actions
   *  row renders beneath it. Build with review/game-meta-card.ts. */
  metaCard?: HTMLElement;
  /** Right-rail move list container (the layout owns the scrubber below it). */
  moves: HTMLElement;
  /** Controls pinned to the bottom of the right rail (e.g. a Reveal toggle).
   *  Kept out of the left rail so it stays button-free and uniform. */
  railFooter?: HTMLElement;
  enginePanel?: HTMLElement;
  analysisSummary?: HTMLElement;
  underboard?: HTMLElement;
  /** Eval gauge (thin vertical bar) — gets its own grid column between the
   *  board and the tools rail (lichess's gauge area). Hidden on col1. */
  gauge?: HTMLElement;
  /** Optional line right below the move list (lichess "Mistake. X was best."). */
  moveComment?: HTMLElement;
  /** Captured-material rows in the right rail (lichess round: mat-top above
   *  the table, mat-bot below). The variant re-fills them per ply/flip. */
  materialTop?: HTMLElement;
  materialBottom?: HTMLElement;
  /** Show captured material / reserves around the board or in the right rail.
   *  Off by default so every review's center column is board-only. */
  showBoardMaterial?: boolean;
  boards: ReviewBoardEntry[];
  /** Board width / height, e.g. 552 / 612 for xiangqi. Drives the fill sizing. */
  boardAspect: number;
  /** Board columns (files). Sizes captured-material tiles to ≈ one board cell so
   *  they match the on-board pieces. Default 12 (small, generic). */
  boardCols?: number;
  /** Extra vertical px each board host adds beyond the board itself (reserve /
   *  hand / capture strips). Budgeted into the fill sizing so the page still
   *  fits without a vertical scroll. Default 0. */
  boardChromePx?: number;
  /** Width (px) of each click-to-promote secondary board. Default 92. */
  secondaryWidthPx?: number;
  /** Absolute primary-board width cap (px). */
  boardMaxPx?: number;
  maxPly: number;
  /** Re-render every board host for the given ply / flip / primary. */
  renderBoards(ctx: ReviewRenderContext): void;
  /** Optional: re-render an interactive move list for the ply; `jump` moves to a
   *  ply when a move row is clicked. Called on every ply change. */
  renderMoves?(ctx: ReviewRenderContext, jump: (ply: number) => void): void;
};

const NAV_AND_PADDING_PX = 122; // site nav + shell top/bottom padding
const VIEWPORT_CHROME_PX = 108;
const RAILS_AND_GUTTERS_PX = 640;
const PRIMARY_LABEL_PX = 30;
const STACK_GAP_PX = 16;
const SECONDARY_LABEL_PX = 24;
const SECONDARY_WIDTH_PX = 92;
const FLANK_GAP_PX = 8;
// Eval gauge footprint beside the board: bar width 20 + gap 8 (eval-bar.ts).
const EVAL_GAUGE_PX = 28;

// ─────────────────────────────────────────────────────────────────────────────
// Scaffold — the shared, navigation-agnostic layout.
// ─────────────────────────────────────────────────────────────────────────────

/** Sizing inputs shared by applyBoardSizing / fitPrimaryToViewport. */
type SizingInput = {
  boards: ReviewBoardEntry[];
  boardAspect: number;
  boardCols?: number;
  boardChromePx?: number;
  secondaryWidthPx?: number;
  boardMaxPx?: number;
};

export type ReviewScaffoldConfig = SizingInput & {
  ariaLabel: string;
  pageClassName?: string;
  /** Info-card eyebrow when no metaCard ('Game review' / 'Analysis'). */
  eyebrow?: string;
  title: string;
  summary: string;
  actions?: HTMLElement;
  details?: HTMLElement;
  metaCard?: HTMLElement;
  underboard?: HTMLElement;
  enginePanel?: HTMLElement;
  moves: HTMLElement;
  moveComment?: HTMLElement;
  /** Study annotation controls (glyph picker + comment editor), below the move
   *  list and above navigation in the rail box. Absent = a read-only review. */
  annotations?: HTMLElement;
  /** The right-rail navigation element: a linear scrubber or a tree nav bar. */
  navigation: HTMLElement;
  analysisSummary?: HTMLElement;
  /** Controls pinned to the bottom of the right rail (e.g. a Reveal toggle). */
  railFooter?: HTMLElement;
  gauge?: HTMLElement;
  materialTop?: HTMLElement;
  materialBottom?: HTMLElement;
  /** Show captured material / reserves around the board or in the right rail.
   *  Off by default so the primary board determines all three column heights. */
  showBoardMaterial?: boolean;
  /** Lichess analyse behavior: the underboard (advantage chart) lives below the
   *  fold instead of shrinking the board to keep everything above it. The board
   *  fills the viewport; the page scrolls to the chart. */
  underboardOverflows?: boolean;
  /** Fires after a secondary board is promoted; the caller re-renders (the
   *  scaffold re-fits afterward). */
  onPromote?(): void;
};

export type ReviewScaffold = {
  stage: BoardStageHandle;
  /** Re-measure and size the primary board to fill the viewport. Call once after
   *  the first render, and whenever the underboard region changes height. */
  refit(): void;
  /** Update the board width/height ratio after an appearance change, then refit. */
  setBoardAspect(aspect: number): void;
};

/** Build the shared review layout into `root`. The caller renders board/move
 *  content and drives navigation; the scaffold owns the shell, stage, sizing,
 *  gauge, material rows, and zoom grip. */
export function createReviewScaffold(
  root: HTMLElement,
  config: ReviewScaffoldConfig,
): ReviewScaffold {
  let boardAspect = config.boardAspect;
  const sizingConfig = (): SizingInput => ({ ...config, boardAspect });
  const slots: BoardStageSlot[] = config.boards.map((board) => ({
    key: board.key,
    el: board.el,
    tier: board.tier,
  }));

  const stage = createBoardStage(slots, {
    onPromote: () => {
      config.onPromote?.();
      refit();
    },
  });

  const showBoardMaterial = config.showBoardMaterial ?? false;
  stage.el.classList.toggle('review-stage--board-only', !showBoardMaterial);

  // Material is intentionally absent from the standardized review for now. Keep
  // the old adoption path behind an explicit switch so a future material rework
  // can restore it without changing variant replay adapters.
  let adoptedMaterialTop: HTMLElement | undefined;
  let adoptedMaterialBottom: HTMLElement | undefined;
  const stripsAdopted =
    showBoardMaterial && !config.materialTop && !config.materialBottom && slots.length === 1;
  if (stripsAdopted && slots[0]) {
    const strips = [...slots[0].el.querySelectorAll<HTMLElement>(':scope > .captures-strip')];
    const top = strips.find(
      (strip) =>
        strip.classList.contains('replay-captures-top') ||
        strip.classList.contains('captures-strip-top'),
    );
    const bottom = strips.find((strip) => strip !== top);
    adoptedMaterialTop = top;
    adoptedMaterialBottom = bottom;
  }
  const materialTop = showBoardMaterial ? (config.materialTop ?? adoptedMaterialTop) : undefined;
  const materialBottom = showBoardMaterial
    ? (config.materialBottom ?? adoptedMaterialBottom)
    : undefined;

  applyBoardSizing(
    stage.el,
    sizingConfig(),
    !showBoardMaterial || stripsAdopted,
    !showBoardMaterial,
  );

  const favoriteGameId = root.dataset.favoriteGameId;
  if (favoriteGameId && config.metaCard) {
    config.metaCard.append(createGameFavoriteButton(favoriteGameId, { compact: true }));
  }
  const actions =
    favoriteGameId && !config.metaCard
      ? reviewActionsWithFavorite(config.actions, favoriteGameId)
      : config.actions;
  const left = infoRail({ ...config, actions });
  // Right rail, lichess order: material-top · [analyse table: engine panel ·
  // move list · advice · navigation] · summary · material-bottom. The analyse
  // table is ONE visually connected box (lichess's analyse tools) whose bottom
  // tracks the board bottom; the summary sits below it.
  materialTop?.classList.add('review-material-row');
  materialBottom?.classList.add('review-material-row');
  const railMain = document.createElement('div');
  railMain.className = 'review-rail-main';
  // The box that tracks the board's bottom is MOVES ONLY (engine head + move list +
  // advice + any study annotations). Playback controls live BELOW it (lichess
  // analyse), so the box bottom lines up with the board and the controls sit under
  // both — see config.navigation's position in the rail group below.
  railMain.append(
    ...[config.enginePanel, config.moves, config.moveComment, config.annotations].filter(
      (el): el is HTMLElement => el != null,
    ),
  );
  const right = railGroup(
    [
      materialTop,
      railMain,
      config.navigation,
      config.analysisSummary,
      materialBottom,
      config.railFooter,
    ].filter((el): el is HTMLElement => el != null),
  );
  const center = config.underboard ? centerColumn(stage.el, config.underboard) : stage.el;

  const shell = createReviewShell({
    ariaLabel: config.ariaLabel,
    pageClassName: config.pageClassName,
    left,
    center,
    right,
  });
  if (config.gauge) {
    const cluster = shell.querySelector<HTMLElement>('.review-shell__cluster');
    if (cluster) {
      cluster.classList.add('review-shell__cluster--gauge');
      const gaugeCol = document.createElement('div');
      gaugeCol.className = 'review-shell__gauge';
      gaugeCol.append(config.gauge);
      cluster.append(gaugeCol);
    }
  }
  root.append(shell);

  // Board zoom: restore the persisted scale and glue the drag grip to the primary
  // slot's bottom-right corner (re-anchored after every refit).
  restoreBoardScale();
  const grip = attachBoardResizeGrip(stage.el, () =>
    stage.el.querySelector<HTMLElement>('.review-stage__slot--primary'),
  );
  const GRIP_SIZE_PX = 15;
  const GRIP_INSET_PX = 3;
  const positionGrip = (): void => {
    const slot = stage.el.querySelector<HTMLElement>('.review-stage__slot--primary');
    if (!slot) return;
    const slotRect = slot.getBoundingClientRect();
    const stageRect = stage.el.getBoundingClientRect();
    if (slotRect.width === 0 || stageRect.width === 0) return;
    // Tuck the handle just INSIDE the board's bottom-right corner (lichess), not
    // hanging off the outside edge.
    grip.style.right = `${Math.max(0, stageRect.right - slotRect.right) + GRIP_INSET_PX}px`;
    grip.style.bottom = 'auto';
    grip.style.top = `${slotRect.bottom - stageRect.top - GRIP_SIZE_PX - GRIP_INSET_PX}px`;
  };

  function refit(): void {
    applyBoardSizing(
      stage.el,
      sizingConfig(),
      !showBoardMaterial || stripsAdopted,
      !showBoardMaterial,
    );
    fitPrimaryToViewport(stage.el, boardAspect, config.boardMaxPx, {
      underboardOverflows: config.underboardOverflows,
    });
    setTimeout(positionGrip, 60);
  }

  function setBoardAspect(aspect: number): void {
    boardAspect = aspect;
    refit();
  }

  setTimeout(refit, 60);
  setTimeout(refit, 260);
  window.addEventListener('resize', refit);
  if (typeof ResizeObserver !== 'undefined') {
    let lastViewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const observer = new ResizeObserver(() => {
      if (window.innerHeight === lastViewportHeight) return;
      lastViewportHeight = window.innerHeight;
      refit();
    });
    observer.observe(stage.el);
  }

  return { stage, refit, setBoardAspect };
}

function reviewActionsWithFavorite(existing: HTMLElement | undefined, roomId: string): HTMLElement {
  const actions = existing ?? document.createElement('div');
  actions.classList.add('review-actions');
  actions.append(createGameFavoriteButton(roomId));
  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Linear controller — every /game review page. Unchanged behavior.
// ─────────────────────────────────────────────────────────────────────────────

export function mountReviewLayout(root: HTMLElement, adapter: ReviewLayoutAdapter): void {
  let ply = adapter.maxPly;
  let flipped = false;

  // Shared lichess control bar (nav + menu overlay), the SAME component the
  // xiangqi tree surface uses — so every /game review page carries identical
  // chrome. Playback stays integer-ply over server snapshots; only the chrome
  // is standardized. Flip lives in the menu; the deferred analyse tools stay
  // muted placeholders (parity with the tree surface).
  const controls = createReviewControls({
    onFirst: () => go(0),
    onPrevious: () => go(ply - 1),
    onNext: () => go(ply + 1),
    onLast: () => go(adapter.maxPly),
    menuItems: [
      { label: 'Flip board', icon: REVIEW_MENU_ICONS.flip, onClick: () => flip() },
      { label: 'Board editor', icon: REVIEW_MENU_ICONS.editor, disabled: true },
      { label: 'Learn from your mistakes', icon: REVIEW_MENU_ICONS.learn, disabled: true },
      { label: 'Continue from here', icon: REVIEW_MENU_ICONS.continue, disabled: true },
      { label: 'Study', icon: REVIEW_MENU_ICONS.study, disabled: true },
      { label: 'Settings', icon: REVIEW_MENU_ICONS.settings, disabled: true },
    ],
  });
  const scaffold = createReviewScaffold(root, {
    ariaLabel: adapter.ariaLabel,
    pageClassName: adapter.pageClassName,
    eyebrow: 'Game review',
    title: adapter.title,
    summary: adapter.summary,
    actions: adapter.actions,
    details: adapter.details,
    metaCard: adapter.metaCard,
    boards: adapter.boards,
    boardAspect: adapter.boardAspect,
    boardCols: adapter.boardCols,
    boardChromePx: adapter.boardChromePx,
    secondaryWidthPx: adapter.secondaryWidthPx,
    boardMaxPx: adapter.boardMaxPx,
    underboard: adapter.underboard,
    enginePanel: adapter.enginePanel,
    moves: adapter.moves,
    moveComment: adapter.moveComment,
    navigation: controls.el,
    analysisSummary: adapter.analysisSummary,
    railFooter: adapter.railFooter,
    gauge: adapter.gauge,
    materialTop: adapter.materialTop,
    materialBottom: adapter.materialBottom,
    showBoardMaterial: adapter.showBoardMaterial,
    onPromote: () => render(),
  });

  function render(): void {
    const ctx = { ply, flipped, primaryKey: scaffold.stage.primaryKey() };
    adapter.renderBoards(ctx);
    adapter.renderMoves?.(ctx, go);
    controls.setBounds({ atStart: ply <= 0, atEnd: ply >= adapter.maxPly });
  }

  const go = (target: number): void => {
    ply = Math.max(0, Math.min(adapter.maxPly, target));
    render();
  };
  const flip = (): void => {
    flipped = !flipped;
    render();
  };

  installReviewKeyboard({
    stepBack: () => go(ply - 1),
    stepForward: () => go(ply + 1),
    toStart: () => go(0),
    toEnd: () => go(adapter.maxPly),
    flip,
  });

  render();
  scaffold.refit();
}

// Global playback keys (arrows anywhere on the page, lichess-style), ignoring
// typing targets. Shared by the linear scrubber and the tree nav.
export function installReviewKeyboard(
  handlers: {
    stepBack(): void;
    stepForward(): void;
    toStart(): void;
    toEnd(): void;
    flip(): void;
  },
  /** Optional abort signal to remove the listener (e.g. when a surface re-mounts). */
  signal?: AbortSignal,
): void {
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlers.stepBack();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handlers.stepForward();
      } else if (event.key === 'ArrowUp' || event.key === 'Home') {
        event.preventDefault();
        handlers.toStart();
      } else if (event.key === 'ArrowDown' || event.key === 'End') {
        event.preventDefault();
        handlers.toEnd();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        handlers.flip();
      }
    },
    { signal },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Board sizing (viewport-fill). Shared by every scaffold consumer.
// ─────────────────────────────────────────────────────────────────────────────

function fitPrimaryToViewport(
  stageEl: HTMLElement,
  aspect: number,
  maxPx?: number,
  opts?: { underboardOverflows?: boolean },
): void {
  scheduleAnimationFrame(() => {
    if (typeof window === 'undefined') return;
    const centerCol = stageEl.parentElement;
    const underboard = centerCol?.classList.contains('review-center-column')
      ? centerCol.querySelector<HTMLElement>('.review-underboard')
      : null;
    // Below-the-fold underboards (lichess analyse chart) don't shrink the board:
    // they contribute 0 to the height budget and the page scrolls to them.
    const underboardPx =
      underboard && !opts?.underboardOverflows
        ? underboard.getBoundingClientRect().height + STACK_GAP_PX
        : 0;
    const cluster = stageEl.closest<HTMLElement>('.review-shell__cluster');
    if (cluster) {
      const baseChrome = Number(cluster.dataset.uniBaseChrome ?? '0') || 0;
      cluster.style.setProperty(
        '--uni-board-chrome-h',
        `${baseChrome + Math.round(underboardPx)}px`,
      );
    }
    const available = window.innerHeight - VIEWPORT_CHROME_PX - underboardPx;
    const slot = stageEl.querySelector<HTMLElement>('.review-stage__slot--primary');
    if (available <= 0 || !slot) return;
    const visibleStageRows = [...stageEl.children].filter(
      (child) => child.getBoundingClientRect().height > 0,
    );
    const gaps = Math.max(0, visibleStageRows.length - 1) * STACK_GAP_PX;
    const contentHeight =
      visibleStageRows.reduce((h, child) => h + child.getBoundingClientRect().height, 0) + gaps;
    const currentWidth = slot.getBoundingClientRect().width;
    const flankBoard = slot.querySelector<HTMLElement>('.review-flank__board');
    const boardWidth = flankBoard ? flankBoard.getBoundingClientRect().width : currentWidth;
    const flankCols = flankBoard
      ? [...slot.querySelectorAll<HTMLElement>('.review-flank__col')]
      : [];
    const flankPx = flankCols.reduce(
      (width, col) => width + col.getBoundingClientRect().width + FLANK_GAP_PX,
      0,
    );
    const nonBoardChrome = Math.max(0, contentHeight - boardWidth / aspect);
    const centerEl = stageEl.closest<HTMLElement>('.review-shell__center');
    const gaugePx = stageEl.querySelector('.review-eval-bar') ? EVAL_GAUGE_PX : 0;
    const measuredCap = centerEl ? centerEl.getBoundingClientRect().width - gaugePx : 0;
    const widthCap =
      measuredCap > 0 ? measuredCap : Math.max(240, window.innerWidth - RAILS_AND_GUTTERS_PX);
    const targetBoardWidth = Math.floor(
      (available - nonBoardChrome - 6) * aspect * currentBoardScale(),
    );
    const targetWidth = Math.max(
      160,
      Math.min(widthCap, maxPx ?? Number.POSITIVE_INFINITY, targetBoardWidth + flankPx),
    );
    stageEl.style.setProperty('--review-stage-primary-max', `${targetWidth}px`);
    stageEl
      .closest<HTMLElement>('.review-shell__cluster')
      ?.style.setProperty('--uni-board-fit-w', `${targetWidth}px`);
  });
}

function scheduleAnimationFrame(callback: () => void): void {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}

function applyBoardSizing(
  stageEl: HTMLElement,
  config: SizingInput,
  materialOutsideBoard = false,
  primaryChromeHidden = false,
): void {
  const aspect = config.boardAspect;
  const extraPerBoard = materialOutsideBoard ? 0 : (config.boardChromePx ?? 0);
  const secondaryWidth = config.secondaryWidthPx ?? SECONDARY_WIDTH_PX;
  const hasSecondaries = config.boards.some((board) => board.tier === 'secondary');
  const secondaryStackPx = hasSecondaries
    ? STACK_GAP_PX + SECONDARY_LABEL_PX + Math.round(secondaryWidth / aspect) + extraPerBoard
    : 0;
  const primaryChromePx = primaryChromeHidden ? 0 : PRIMARY_LABEL_PX;
  const chromePx = NAV_AND_PADDING_PX + primaryChromePx + extraPerBoard + secondaryStackPx;
  const cluster = stageEl.closest<HTMLElement>('.review-shell__cluster');
  if (cluster) {
    cluster.style.setProperty('--uni-board-aspect', aspect.toFixed(4));
    const baseChrome = Math.max(0, chromePx - VIEWPORT_CHROME_PX);
    cluster.dataset.uniBaseChrome = String(baseChrome);
    cluster.style.setProperty('--uni-board-chrome-h', `${baseChrome}px`);
    cluster.style.removeProperty('--uni-board-fit-w');
  }
  stageEl.style.setProperty(
    '--review-stage-primary-max',
    `calc(min(max(240px, calc(100vw - ${RAILS_AND_GUTTERS_PX}px)), calc((100svh - ${chromePx}px) * ${aspect.toFixed(4)})) * var(--uni-board-scale, 1))`,
  );
  stageEl.style.setProperty('--review-stage-secondary-max', `${secondaryWidth}px`);
  stageEl.style.setProperty('--capture-cols', String(config.boardCols ?? 12));
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail composition.
// ─────────────────────────────────────────────────────────────────────────────

function infoRail(config: {
  metaCard?: HTMLElement;
  eyebrow?: string;
  title: string;
  summary: string;
  actions?: HTMLElement;
  details?: HTMLElement;
}): HTMLElement {
  if (config.metaCard) {
    const actions = config.actions;
    const actionsCard = actions ? document.createElement('div') : null;
    if (actionsCard && actions) {
      actionsCard.className = 'review-actions review-actions--rail';
      actionsCard.append(actions);
    }
    return railGroup(
      config.details
        ? [config.metaCard, ...(actionsCard ? [actionsCard] : []), config.details]
        : [config.metaCard, ...(actionsCard ? [actionsCard] : [])],
    );
  }
  const card = document.createElement('section');
  card.className = 'review-info-card';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'review-info-card__eyebrow';
  eyebrow.textContent = config.eyebrow ?? 'Game review';
  const title = document.createElement('h1');
  title.className = 'review-info-card__title';
  title.textContent = config.title;
  const summary = document.createElement('p');
  summary.className = 'review-info-card__summary';
  summary.textContent = config.summary;
  card.append(eyebrow, title, summary);
  if (config.actions) card.append(config.actions);
  return railGroup(config.details ? [card, config.details] : [card]);
}

function railGroup(children: HTMLElement[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'review-rail-group';
  group.append(...children);
  return group;
}

function centerColumn(stageEl: HTMLElement, underboard: HTMLElement): HTMLElement {
  const col = document.createElement('div');
  col.className = 'review-center-column';
  underboard.classList.add('review-underboard');
  col.append(stageEl, underboard);
  return col;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation bars.
// ─────────────────────────────────────────────────────────────────────────────

function scrubButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'review-scrubber__button';
  button.setAttribute('aria-label', label);
  button.textContent = text;
  return button;
}

/** A scrubber-styled nav bar for a non-linear (tree) controller: the same
 *  |< < > >| Flip chrome as the postgame, with a free-form status label. */
export function createReviewNavBar(handlers: {
  first(): void;
  previous(): void;
  next(): void;
  last(): void;
  flip(): void;
}): {
  el: HTMLElement;
  status: HTMLElement;
  setBounds(state: { atStart: boolean; atEnd: boolean }): void;
} {
  const el = document.createElement('div');
  el.className = 'review-scrubber';
  const status = document.createElement('span');
  status.className = 'review-scrubber__status';
  status.setAttribute('aria-live', 'polite');
  const first = scrubButton('|<', 'First move');
  const previous = scrubButton('<', 'Previous move');
  const next = scrubButton('>', 'Next move');
  const last = scrubButton('>|', 'End of line');
  const flip = scrubButton('Flip', 'Flip board');
  flip.title = 'Flip board (f)';
  first.addEventListener('click', handlers.first);
  previous.addEventListener('click', handlers.previous);
  next.addEventListener('click', handlers.next);
  last.addEventListener('click', handlers.last);
  flip.addEventListener('click', handlers.flip);
  el.append(status, first, previous, next, last, flip);
  return {
    el,
    status,
    setBounds({ atStart, atEnd }) {
      first.disabled = atStart;
      previous.disabled = atStart;
      next.disabled = atEnd;
      last.disabled = atEnd;
    },
  };
}
