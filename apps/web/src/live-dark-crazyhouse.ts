// Live multiplayer room client for hidden/dev-only Dark Crazyhouse (8x8 chess +
// drops) — a FOG tenant on the generic live-client core
// (variant-tenant/live-client.ts owns bootstrap, frame application, renderAll
// skeleton, the fog-safe replay CAPTURE controller, and the masked two-column
// move list). This module keeps what is genuinely Dark Crazyhouse's:
//   * the 8x8 chess board (crazyhouse-render.ts) with the fog mask,
//   * the reserves (hand) strips reusing the capture slots — PRIVATE under fog,
//   * DROP interaction (select a hand piece, then a square) and the 4-way chess
//     PROMOTION picker,
//   * the parachute BOUNCE (a drop into the fog onto a hidden piece comes back
//     as 'drop-rejected'), surfaced as a move-list banner via onServerMessage,
//   * crazyhouse move notation and the chess board-family theme.
//
// Wire shape pinned by dark-crazyhouse-golden-wire.test.ts: tenant core snapshot
// with NO extras, per-seat move-played redaction, own-hand only.

import {
  type Color,
  type CrazyhouseDropRole,
  type CrazyhouseHand,
  type CrazyhouseMove,
  type CrazyhousePlayerView,
  isCrazyhouseDrop,
  type PieceRole,
  type Square,
} from '@mistboard/game';
import './live-dark-crazyhouse.css';
import {
  CRAZYHOUSE_HAND_ORDER,
  CRAZYHOUSE_PIECE_PX,
  crazyhouseHandPieceSvg,
  crazyhousePieceGhostSvg,
  renderCrazyhouseBoardSvg,
} from './crazyhouse-render.js';
import { darkCrazyhouseEnabled } from './feature-flags.js';
import {
  maybePlayDarkCrazyhouseSnapshotSound,
  resetDarkCrazyhouseSoundState,
  soundForOwnDarkCrazyhouseMove,
} from './live-dark-crazyhouse-sound.js';
import { playSound } from './live-sound.js';
import type { LiveRefs } from './live-state.js';
import { boardAppearanceChangedEvent, setBoardFamily } from './theme.js';
import {
  annotationOwner,
  type BoardAnnotations,
  drawnBoardOverlays,
  installBoardAnnotations,
} from './variant-tenant/board-annotations.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { installHandDrag } from './variant-tenant/hand-drag.js';
import {
  createTenantLiveClient,
  type TenantLiveClientContext,
  type TenantLiveEvent,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

type CrazyhousePromotionRole = Exclude<PieceRole, 'king' | 'pawn'>;
const DROP_LETTER: Record<CrazyhouseDropRole, string> = {
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
};

// ── Wire shapes (the subset this client consumes) ───────────────────────────

type DarkCrazyhouseMovePlayed = TenantMovePlayed<Color, CrazyhouseMove>;

// ── Dark-Crazyhouse-owned interaction/render state ───────────────────────────

let core: TenantLiveClientContext<Color, CrazyhousePlayerView> | null = null;
// Right-click arrows/circles the player drew on this board.
let annotations: BoardAnnotations | null = null;
let selected: Square | null = null;
let selectedDrop: CrazyhouseDropRole | null = null;
// The square a board piece is being dragged from. The renderer keeps a dim
// source shadow while the shared drag layer shows the floating ghost.
let draggingFrom: Square | null = null;
let pendingPromotion: { from: Square; to: Square; roles: CrazyhousePromotionRole[] } | null = null;
// The square a parachute drop bounced off (a probe: it is occupied). Cleared on
// the next action.
let bounce: Square | null = null;

// ── Shared tenant room chrome config ─────────────────────────────────────────

const darkCrazyhouseWebTenant: WebVariantTenant<Color> = {
  displayName: 'Dark Crazyhouse',
  metaMarkerId: 'dark-crazyhouse',
  metaGlyph: '♔',
  colors: ['white', 'black'],
  isColor,
  oppositeColor: (color) => (color === 'white' ? 'black' : 'white'),
  enabled: darkCrazyhouseEnabled,
  reviewUrl: (roomId) => `/dark-crazyhouse/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: darkCrazyhouseEndReasonLabel,
  disabledTitle: 'Dark Crazyhouse disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Dark Crazyhouse room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction:
    'Select one of your visible pieces (or a reserve piece to drop), then choose a destination.',
};

function darkCrazyhouseEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'king-captured':
      return 'king capture';
    case 'draw':
      return 'a draw';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'disconnect';
    default:
      return 'the game rules';
  }
}

const client = createTenantLiveClient<Color, CrazyhousePlayerView, CrazyhouseMove>({
  tenant: darkCrazyhouseWebTenant,
  gameSpecId: 'dark-crazyhouse',
  defaultRoomId: 'dczh_dev',
  boardClass: 'crazyhouse-live-board',
  playAgainRequestBody: (state) => ({
    mode: 'pvp',
    gameSpecId: 'dark-crazyhouse',
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  onSnapshotApplied: () => {
    if (core) maybePlayDarkCrazyhouseSnapshotSound(core.state.view, core.state.seat);
  },
  onEventApplied: () => {
    if (core) maybePlayDarkCrazyhouseSnapshotSound(core.state.view, core.state.seat);
  },
  onServerMessage,
  resetSounds: resetDarkCrazyhouseSoundState,
  resetState: () => {
    selected = null;
    selectedDrop = null;
    draggingFrom = null;
    pendingPromotion = null;
    bounce = null;
  },
  renderBoard,
  renderExtras: (liveRefs, view) => {
    renderHands(liveRefs, view);
    renderPromotion(liveRefs, view);
  },
  onDisabled: (liveRefs) => {
    liveRefs.capturesTop.replaceChildren();
    liveRefs.capturesBottom.replaceChildren();
    clearSelection();
  },
  setup: (ctx) => {
    core = ctx;
    setBoardFamily('chess');
    installBoardDragInteraction(ctx.refs);
    installHandDragInteraction(ctx.refs);
    ctx.refs.capturesBottom.addEventListener('click', onHandClick);
    ctx.refs.promotion.addEventListener('click', onPromotionClick);
    installSelectionClickAway({
      roots: () => [core?.refs.board, core?.refs.capturesBottom],
      hasSelection: () => pendingPromotion === null && (selected !== null || selectedDrop !== null),
      clearSelection: () => {
        clearSelection();
        draggingFrom = null;
        core?.renderAll();
      },
    });
    window.addEventListener(boardAppearanceChangedEvent, ctx.renderAll);
  },
  moveList: {
    rowClass: 'dczh-move-row',
    cellPrefix: 'dczh-move-row',
    masked: true,
    notate: notateCrazyhouseMove,
    isMoveEvent,
    banner: () =>
      bounce
        ? {
            className: 'crazyhouse-bounce-banner',
            text: `Drop bounced: ${bounce} is occupied. Try another square.`,
          }
        : null,
  },
  replayCapture: {
    positionKey: replayPositionKey,
    // Fog: derive the ply from moveNumber + turn (white moves first); redacted
    // opponent moves never arrive as events.
    plyForView: (view, ctx) => {
      if (view.status.type === 'playing') {
        const completedFullMoves = Math.max(0, view.moveNumber - 1);
        return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
      }
      if (ctx.positionChanged && view.lastMove) return ctx.latestPly + 1;
      return ctx.latestPly;
    },
  },
});

export function bootstrapDarkCrazyhouseLiveRoom(): void {
  client.bootstrap();
}

// ── Server messages ──────────────────────────────────────────────────────────

function onServerMessage(message: { type: string; [key: string]: unknown }): void {
  // The parachute bounce: a drop landed on a hidden piece. Record the square as a
  // probe (it is occupied) and clear the pending drop so the player can retry.
  if (message.type === 'drop-rejected' && typeof message.to === 'string') {
    bounce = message.to as Square;
    selectedDrop = null;
  }
}

// ── Interaction ──────────────────────────────────────────────────────────────

// Click + drag are delegated to the persistent board container once at mount
// (installBoardDragInteraction) so they survive every innerHTML re-render. Click is
// the existing select/move/drop; drag lifts a visible own piece and drops it on a
// target. A tap that never crosses the movement threshold falls through to click.
// Reserve drops use installHandDragInteraction below.
function installBoardDragInteraction(liveRefs: LiveRefs): void {
  annotations = installBoardAnnotations({
    board: liveRefs.board,
    gameId: () => annotationOwner(core?.state.view),
    repaint: () => {
      if (core?.state.view) renderBoard(liveRefs, core.state.view);
    },
  });
  installBoardDrag({
    board: liveRefs.board,
    ghostSizePx: CRAZYHOUSE_PIECE_PX,
    onSquareClick: (square) => handleSquareClick(square as Square),
    canDragFrom: (square) => canDragBoardPiece(square as Square),
    ghostHtml: (square) => {
      const piece = core?.state.view?.board[square as Square];
      if (!piece) return null;
      return crazyhousePieceGhostSvg(piece.role, piece.color);
    },
    onDragStart: (from) => {
      // Select the piece so legal-target dots show while the shared drag layer
      // floats the picked-up ghost.
      selected = from as Square;
      selectedDrop = null;
      draggingFrom = from as Square;
      core?.renderAll();
    },
    onDrop: (from, to) => dropBoardPiece(from as Square, to as Square | null),
  });
}

function installHandDragInteraction(liveRefs: LiveRefs): void {
  installHandDrag({
    hand: liveRefs.capturesBottom,
    ghostSizePx: CRAZYHOUSE_PIECE_PX,
    isRole: isDropRole,
    canDragRole: canDragHandRole,
    ghostHtml: (role) => {
      const seat = core?.state.seat;
      return isColor(seat) ? crazyhouseHandPieceSvg(role, seat) : null;
    },
    onDragStart: (role) => {
      bounce = null;
      selected = null;
      selectedDrop = role;
      core?.renderAll();
    },
    onDrop: (role, to) => dropHandPiece(role, to),
  });
}

// A visible own board piece can be dragged on your turn (it snaps back if you drop
// it somewhere it cannot move). Your own pieces are always visible under fog, so a
// piece sitting in your view.board with your colour is yours.
function canDragBoardPiece(square: Square): boolean {
  const view = core?.state.view;
  if (!view || !canActNow(view) || pendingPromotion) return false;
  const piece = view.board[square];
  return !!piece && piece.color === core?.state.seat;
}

// A drag ended over `to` (null if dropped off-board or back on the source). Do
// EXACTLY what a click board move from→to does, including opening the promotion
// picker (submitBoardMove). A failed drop clears the selection and target dots.
function dropBoardPiece(from: Square, to: Square | null): void {
  draggingFrom = null;
  const view = core?.state.view;
  bounce = null;
  if (to && view) {
    const matches = boardMovesFromTo(view, from, to);
    if (matches.length > 0) {
      // Routes promotions through the SAME 4-way picker as click (submitBoardMove
      // sets pendingPromotion instead of auto-sending) and clears selection itself.
      submitBoardMove(from, to, matches);
      return;
    }
  }
  selected = null;
  selectedDrop = null;
  core?.renderAll();
}

function handleSquareClick(square: Square): void {
  const view = core?.state.view;
  if (!view) return;
  if (!canActNow(view)) return;
  if (pendingPromotion) return;
  bounce = null;

  if (selectedDrop) {
    if (submitDrop(view, selectedDrop, square)) {
      return;
    }
    selectedDrop = null; // clicked off a drop square: cancel, fall through
  }

  if (selected === null) {
    if (moveTargets(view, square).length === 0) return;
    selected = square;
    core?.renderAll();
    return;
  }
  if (square === selected) {
    clearSelection();
    core?.renderAll();
    return;
  }
  const matches = boardMovesFromTo(view, selected, square);
  if (matches.length > 0) {
    submitBoardMove(selected, square, matches);
    return;
  }
  selected = moveTargets(view, square).length > 0 ? square : null;
  core?.renderAll();
}

function submitBoardMove(from: Square, to: Square, matches: CrazyhouseMove[]): void {
  const promotions = matches
    .map((move) => (isCrazyhouseDrop(move) ? undefined : move.promotion))
    .filter((role): role is CrazyhousePromotionRole => Boolean(role));
  if (promotions.length > 0) {
    pendingPromotion = { from, to, roles: promotions };
    core?.renderAll();
    return;
  }
  if (core?.send({ type: 'move', from, to })) {
    playSound(soundForOwnDarkCrazyhouseMove(core.state.view, { from, to }));
  }
  clearSelection();
  core?.renderAll();
}

function submitDrop(view: CrazyhousePlayerView, role: CrazyhouseDropRole, square: Square): boolean {
  if (!dropTargets(view, role).includes(square)) return false;
  if (core?.send({ type: 'move', from: `*${DROP_LETTER[role]}`, to: square })) {
    playSound('drop');
  }
  clearSelection();
  core?.renderAll();
  return true;
}

function canDragHandRole(role: CrazyhouseDropRole): boolean {
  const view = core?.state.view;
  if (!view || !canActNow(view) || pendingPromotion) return false;
  return (view.hand[role] ?? 0) > 0;
}

function dropHandPiece(role: CrazyhouseDropRole, to: string | null): void {
  const view = core?.state.view;
  if (!view || !canActNow(view) || pendingPromotion) {
    clearSelection();
    core?.renderAll();
    return;
  }
  bounce = null;
  selected = null;
  selectedDrop = role;
  if (to && isSquare(to) && submitDrop(view, role, to)) return;
  clearSelection();
  core?.renderAll();
}

function onHandClick(event: MouseEvent): void {
  const view = core?.state.view;
  if (!view) return;
  if (!canActNow(view)) return;
  if (pendingPromotion) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-drop]');
  if (!target) return;
  const role = target.getAttribute('data-drop') as CrazyhouseDropRole | null;
  if (!role || (view.hand[role] ?? 0) <= 0) return;
  bounce = null;
  selected = null;
  selectedDrop = selectedDrop === role ? null : role;
  core?.renderAll();
}

function onPromotionClick(event: MouseEvent): void {
  const pending = pendingPromotion;
  if (!pending) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-promote]');
  if (!target) return;
  const role = target.getAttribute('data-promote') as CrazyhousePromotionRole | null;
  if (!role || !pending.roles.includes(role)) return;
  if (core?.send({ type: 'move', from: pending.from, to: pending.to, promotion: role })) {
    playSound(
      soundForOwnDarkCrazyhouseMove(core.state.view, { from: pending.from, to: pending.to }),
    );
  }
  clearSelection();
  core?.renderAll();
}

function clearSelection(): void {
  selected = null;
  selectedDrop = null;
  pendingPromotion = null;
}

function boardMovesFromTo(view: CrazyhousePlayerView, from: Square, to: Square): CrazyhouseMove[] {
  return view.legalMoves.filter(
    (move) => !isCrazyhouseDrop(move) && move.from === from && move.to === to,
  );
}

function moveTargets(view: CrazyhousePlayerView, from: Square): Square[] {
  const seen = new Set<Square>();
  for (const move of view.legalMoves) {
    if (!isCrazyhouseDrop(move) && move.from === from) seen.add(move.to);
  }
  return [...seen];
}

function dropTargets(view: CrazyhousePlayerView, role: CrazyhouseDropRole): Square[] {
  const seen = new Set<Square>();
  for (const move of view.legalMoves) {
    if (isCrazyhouseDrop(move) && move.drop === role) seen.add(move.to);
  }
  return [...seen];
}

function isDropRole(value: string): value is CrazyhouseDropRole {
  return CRAZYHOUSE_HAND_ORDER.includes(value as CrazyhouseDropRole);
}

function canActNow(view: CrazyhousePlayerView): boolean {
  return !!core && core.replay.isLive() && iAmPlayer() && isMyTurn(view);
}

function iAmPlayer(): boolean {
  return isColor(core?.state.seat);
}

function isMyTurn(view: CrazyhousePlayerView): boolean {
  return view.status.type === 'playing' && view.status.turn === core?.state.seat;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderBoard(liveRefs: LiveRefs, view: CrazyhousePlayerView | null): void {
  liveRefs.board.className = 'board crazyhouse-live-board';
  liveRefs.board.setAttribute('aria-label', 'Dark Crazyhouse board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  const perspective = core?.orientation() ?? view.perspective;
  const interactive =
    !!core && core.replay.isLive() && iAmPlayer() && isMyTurn(view) && !pendingPromotion;
  const activeSelected = interactive ? selected : null;
  const targets = interactive ? activeTargets(view) : [];
  const drawn = drawnBoardOverlays<Square>(annotations?.shapes() ?? []);
  liveRefs.board.innerHTML = renderCrazyhouseBoardSvg(view, {
    arrows: drawn.arrows,
    markers: drawn.markers,
    perspective,
    showFog: true,
    selected: activeSelected,
    targets,
    interactive,
    draggingFrom: interactive ? draggingFrom : null,
  });
}

function activeTargets(view: CrazyhousePlayerView): Square[] {
  if (selectedDrop) return dropTargets(view, selectedDrop);
  if (selected) return moveTargets(view, selected);
  return [];
}

function renderHands(liveRefs: LiveRefs, view: CrazyhousePlayerView | null): void {
  const seat = core?.state.seat;
  liveRefs.capturesTop.replaceChildren();
  if (!view || !isColor(seat)) {
    liveRefs.capturesBottom.replaceChildren();
    return;
  }
  liveRefs.capturesBottom.replaceChildren(ownReserveStrip(view, seat, canActNow(view)));
}

function ownReserveStrip(view: CrazyhousePlayerView, seat: Color, droppable: boolean): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'crazyhouse-hands crazyhouse-hands--own';
  const entries = CRAZYHOUSE_HAND_ORDER.filter((role) => (view.hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'crazyhouse-hands__empty';
    empty.textContent = 'No pieces in hand';
    strip.append(empty);
    return strip;
  }
  for (const role of entries) {
    strip.append(handPiece(role, seat, view.hand[role] ?? 0, droppable));
  }
  return strip;
}

function handPiece(
  role: CrazyhouseDropRole,
  color: Color,
  count: number,
  droppable: boolean,
): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  const isSelected = selectedDrop === role;
  button.className = [
    'crazyhouse-hand-piece',
    droppable ? 'crazyhouse-hand-piece--droppable' : '',
    isSelected ? 'crazyhouse-hand-piece--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  button.dataset.drop = role;
  button.disabled = !droppable;
  button.draggable = false;
  button.setAttribute('aria-label', `${role} in hand, ${count} available`);
  button.setAttribute('aria-grabbed', isSelected ? 'true' : 'false');
  button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  button.innerHTML = crazyhouseHandPieceSvg(role, color);
  const badge = document.createElement('span');
  badge.className = 'crazyhouse-hand-piece__count';
  badge.textContent = String(count);
  button.append(badge);
  return button;
}

function renderPromotion(liveRefs: LiveRefs, view: CrazyhousePlayerView | null): void {
  const pending = pendingPromotion;
  const seat = core?.state.seat;
  if (!pending || !view || !isColor(seat)) {
    liveRefs.promotion.hidden = true;
    liveRefs.promotion.replaceChildren();
    return;
  }
  const color = seat;
  liveRefs.promotion.hidden = false;
  liveRefs.promotion.className = 'promotion-picker crazyhouse-promotion';
  const choices = pending.roles
    .map(
      (role) =>
        `<button type="button" class="crazyhouse-promotion__choice" data-promote="${role}">${crazyhouseHandPieceSvg(
          role,
          color,
        )}</button>`,
    )
    .join('');
  liveRefs.promotion.innerHTML = `<div class="crazyhouse-promotion__panel"><div class="crazyhouse-promotion__title">Promote to</div><div class="crazyhouse-promotion__choices">${choices}</div></div>`;
}

// ── Notation ─────────────────────────────────────────────────────────────────

function notateCrazyhouseMove(move: CrazyhouseMove): string {
  if (isCrazyhouseDrop(move)) return `${DROP_LETTER[move.drop]}@${move.to}`;
  return `${move.from}${move.to}${move.promotion ? `=${DROP_LETTER[move.promotion]}` : ''}`;
}

// ── Fog-safe replay capture key ──────────────────────────────────────────────

function replayPositionKey(view: CrazyhousePlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece?.color, piece?.role]);
  const hand = CRAZYHOUSE_HAND_ORDER.map((role) => view.hand[role] ?? 0);
  return JSON.stringify({
    board,
    hand,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    visibleSquares: [...view.visibleSquares].sort(),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isMoveEvent(event: TenantLiveEvent): event is DarkCrazyhouseMovePlayed {
  const move = (event as { move?: unknown }).move;
  if (event.type !== 'move-played') return false;
  if (!isColor((event as { color?: unknown }).color)) return false;
  if (typeof move !== 'object' || move === null) return false;
  const candidate = move as { from?: unknown; to?: unknown; drop?: unknown };
  if (typeof candidate.to !== 'string') return false;
  return typeof candidate.from === 'string' || typeof candidate.drop === 'string';
}

function isColor(value: unknown): value is Color {
  return value === 'white' || value === 'black';
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

export type { CrazyhouseHand };
