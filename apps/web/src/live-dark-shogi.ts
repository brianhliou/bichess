// Live multiplayer room client for hidden/dev-only Dark Shogi (9x9) — a FOG
// tenant on the generic live-client core (variant-tenant/live-client.ts owns
// bootstrap, frame application, renderAll skeleton, the fog-safe replay CAPTURE
// controller, and the masked two-column move list). This module keeps what is
// genuinely Dark Shogi's:
//   * the 9x9 koma board (shogi-render.ts) with the fog mask,
//   * the reserves (hand) strips reusing the capture slots — PRIVATE under fog,
//     so only your own reserve is ever sent,
//   * DROP interaction (select a hand piece, then an empty square) and the
//     PROMOTION choice when a board move can optionally promote,
//   * the parachute BOUNCE (a drop onto a hidden piece comes back as
//     'drop-rejected'), surfaced as a move-list banner via onServerMessage,
//   * shogi move notation and the shogi board-family theme.
//
// Wire shape pinned by dark-shogi-golden-wire.test.ts: tenant core snapshot with
// NO extras, per-seat move-played redaction, own-moves-only lastMove, own-hand
// only.

import {
  isShogiDrop,
  type ShogiColor,
  type ShogiHandRole,
  type ShogiMove,
  type ShogiPlayerView,
  type ShogiSquare,
} from '@mistboard/game';
import './live-dark-shogi.css';
import { darkShogiEnabled } from './feature-flags.js';
import {
  maybePlayDarkShogiSnapshotSound,
  resetDarkShogiSoundState,
  soundForOwnDarkShogiMove,
} from './live-dark-shogi-sound.js';
import { playSound } from './live-sound.js';
import type { LiveRefs } from './live-state.js';
import {
  renderShogiBoardSvg,
  SHOGI_FILES,
  SHOGI_HAND_ORDER,
  shogiBoardPieceScale,
  shogiHandKomaSvg,
  shogiKomaSvg,
  shogiPieceGhostSvg,
} from './shogi-render.js';
import { setBoardFamily, shogiAppearanceChangedEvent } from './theme.js';
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

// ── Wire shapes (the subset this client consumes) ───────────────────────────

type DarkShogiMovePlayed = TenantMovePlayed<ShogiColor, ShogiMove>;

// ── Dark-Shogi-owned interaction/render state ────────────────────────────────

let core: TenantLiveClientContext<ShogiColor, ShogiPlayerView> | null = null;
let selected: ShogiSquare | null = null;
let selectedDrop: ShogiHandRole | null = null;
// The square a board piece is being dragged from (its koma is lifted off the
// board so only the floating ghost shows). Null when not dragging.
let draggingFrom: ShogiSquare | null = null;
let pendingPromotion: { from: ShogiSquare; to: ShogiSquare } | null = null;
// The square a parachute drop bounced off (a probe: it is occupied). Cleared on
// the next action.
let bounce: ShogiSquare | null = null;

// ── Shared tenant room chrome config ─────────────────────────────────────────

const darkShogiWebTenant: WebVariantTenant<ShogiColor> = {
  displayName: 'Fog Shogi',
  metaGlyph: '☗',
  colors: ['black', 'white'],
  isColor: isShogiColor,
  oppositeColor: (color) => (color === 'black' ? 'white' : 'black'),
  enabled: darkShogiEnabled,
  reviewUrl: (roomId) => `/dark-shogi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: darkShogiEndReasonLabel,
  disabledTitle: 'Dark Shogi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Dark Shogi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction:
    'Select one of your visible pieces (or a reserve piece to drop), then choose a destination.',
};

function darkShogiEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'king-captured':
      return 'king capture';
    case 'repetition':
      return 'repetition';
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

const client = createTenantLiveClient<ShogiColor, ShogiPlayerView, ShogiMove>({
  tenant: darkShogiWebTenant,
  gameSpecId: 'dark-shogi',
  defaultRoomId: 'dsg_dev',
  boardClass: 'shogi-live-board',
  // Not on the Dark Shogi wire (golden-pinned, no snapshot extras): the forfeit
  // banner and rematch block never arm. Chrome defaults (pvp, no forfeit, no
  // rematch) match the original, so no chrome overrides are needed.
  playAgainRequestBody: (state) => ({
    mode: 'pvp',
    gameSpecId: 'dark-shogi',
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  onSnapshotApplied: () => {
    if (core) maybePlayDarkShogiSnapshotSound(core.state.view, core.state.seat);
  },
  onEventApplied: () => {
    if (core) maybePlayDarkShogiSnapshotSound(core.state.view, core.state.seat);
  },
  onServerMessage,
  resetSounds: resetDarkShogiSoundState,
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
    setBoardFamily('shogi');
    installBoardInteraction(ctx.refs);
    installHandInteraction(ctx.refs);
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
    window.addEventListener(shogiAppearanceChangedEvent, ctx.renderAll);
  },
  moveList: {
    rowClass: 'dsg-move-row',
    cellPrefix: 'dsg-move-row',
    masked: true,
    notate: notateShogiMove,
    isMoveEvent,
    banner: () =>
      bounce
        ? {
            className: 'dsg-bounce-banner',
            text: `Drop bounced: ${bounce} is occupied. Try another square.`,
          }
        : null,
  },
  replayCapture: {
    positionKey: replayPositionKey,
    // Fog: derive the ply from moveNumber + turn (black moves first); redacted
    // opponent moves never arrive as events. On a finished position, advance by
    // one when the last own move is newly visible.
    plyForView: (view, ctx) => {
      if (view.status.type === 'playing') {
        const completedFullMoves = Math.max(0, view.moveNumber - 1);
        return completedFullMoves * 2 + (view.status.turn === 'white' ? 1 : 0);
      }
      if (ctx.positionChanged && view.lastMove) return ctx.latestPly + 1;
      return ctx.latestPly;
    },
  },
});

export function bootstrapDarkShogiLiveRoom(): void {
  client.bootstrap();
}

// ── Server messages ──────────────────────────────────────────────────────────

function onServerMessage(message: { type: string; [key: string]: unknown }): void {
  // The parachute bounce: a drop landed on a hidden piece. Record the square as a
  // probe (it is occupied) and clear the pending drop so the player can retry.
  if (message.type === 'drop-rejected' && typeof message.to === 'string') {
    bounce = message.to as ShogiSquare;
    selectedDrop = null;
  }
}

// ── Interaction ──────────────────────────────────────────────────────────────

// Click + drag, delegated to the persistent board container once at mount so they
// survive every innerHTML re-render. Click is the existing select/drop/move/
// promotion flow; drag lifts a visible own koma and drops it on a legal target,
// routing through the SAME submit path (so an optional promotion still prompts).
// A tap that never crosses the movement threshold falls through to the click
// handler. Reserve drops use installHandInteraction below.
function installBoardInteraction(liveRefs: LiveRefs): void {
  installBoardDrag({
    board: liveRefs.board,
    ghostSizePx: shogiDragPieceSizePx,
    onSquareClick: (square) => {
      const view = core?.state.view;
      if (!view) return;
      handleSquareClick(view, square as ShogiSquare);
    },
    canDragFrom: (square) => canDragShogiPiece(square as ShogiSquare),
    ghostHtml: (square) => {
      const piece = core?.state.view?.board[square as ShogiSquare];
      if (!piece) return null;
      return shogiPieceGhostSvg(piece);
    },
    onDragStart: (from) => {
      // Lift the koma: select it while dragging and hide it from the board so
      // only the ghost shows.
      bounce = null;
      selectedDrop = null;
      selected = from as ShogiSquare;
      draggingFrom = from as ShogiSquare;
      core?.renderAll();
    },
    onDrop: (from, to) => dropShogiPiece(from as ShogiSquare, to as ShogiSquare | null),
  });
}

function installHandInteraction(liveRefs: LiveRefs): void {
  installHandDrag({
    hand: liveRefs.capturesBottom,
    ghostSizePx: shogiDragPieceSizePx,
    isRole: isHandRole,
    canDragRole: canDragHandRole,
    ghostHtml: (role) => {
      const seat = core?.state.seat;
      return isShogiColor(seat) ? shogiHandKomaSvg(role, seat, true) : null;
    },
    onDragStart: (role) => {
      bounce = null;
      selected = null;
      selectedDrop = role;
      core?.renderAll();
    },
    onDrop: (role, to) => dropHandKoma(role, to),
  });
}

function shogiDragPieceSizePx(): number {
  const rect = core?.refs.board.getBoundingClientRect();
  return rect && rect.width > 0
    ? (rect.width / SHOGI_FILES) * shogiBoardPieceScale()
    : 48 * shogiBoardPieceScale();
}

// A drag may begin from a visible own board piece on your turn (replay live +
// connected). Any of your visible pieces can be lifted (it snaps back if dropped
// where it cannot move), not just ones with a legal move right now.
function canDragShogiPiece(square: ShogiSquare): boolean {
  const view = core?.state.view;
  if (!view || !canActNow(view)) return false;
  if (pendingPromotion) return false;
  const piece = view.board[square];
  return !!piece && piece.color === core?.state.seat;
}

// A drop ended over `to` (null if off-board or back on `from`). Do EXACTLY what a
// click from→to does: find the matching legal move(s) and route through
// submitBoardMove, which opens the optional-promotion prompt when needed. A
// failed drop clears the selection and target dots.
function dropShogiPiece(from: ShogiSquare, to: ShogiSquare | null): void {
  draggingFrom = null;
  const view = core?.state.view;
  if (!view || !canActNow(view)) {
    clearSelection();
    core?.renderAll();
    return;
  }
  const matches = to
    ? view.legalMoves.filter(
        (move): move is Extract<ShogiMove, { from: ShogiSquare }> =>
          !isShogiDrop(move) && move.from === from && move.to === to,
      )
    : [];
  if (matches.length > 0) {
    submitBoardMove(from, to as ShogiSquare, matches);
    return;
  }
  selected = null;
  core?.renderAll();
}

function canDragHandRole(role: ShogiHandRole): boolean {
  const view = core?.state.view;
  if (!view || !canActNow(view) || pendingPromotion) return false;
  return (view.hand[role] ?? 0) > 0;
}

function dropHandKoma(role: ShogiHandRole, to: string | null): void {
  const view = core?.state.view;
  if (!view || !canActNow(view) || pendingPromotion) {
    clearSelection();
    core?.renderAll();
    return;
  }
  bounce = null;
  selected = null;
  selectedDrop = role;
  if (to && isShogiSquare(to) && dropTargets(view, role).includes(to)) {
    if (core?.send({ type: 'move', from: `*${role}`, to })) {
      playSound('drop');
    }
    clearSelection();
  }
  if (!to || !isShogiSquare(to) || !dropTargets(view, role).includes(to)) clearSelection();
  core?.renderAll();
}

function handleSquareClick(view: ShogiPlayerView, square: ShogiSquare): void {
  if (!canActNow(view)) return;
  if (pendingPromotion) return; // resolve the promotion choice first
  bounce = null;

  // Drop mode: the next board click places the selected reserve piece.
  if (selectedDrop) {
    if (dropTargets(view, selectedDrop).includes(square)) {
      if (core?.send({ type: 'move', from: `*${selectedDrop}`, to: square })) {
        playSound('drop');
      }
      clearSelection();
      core?.renderAll();
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
  const matches = view.legalMoves.filter(
    (move): move is Extract<ShogiMove, { from: ShogiSquare }> =>
      !isShogiDrop(move) && move.from === selected && move.to === square,
  );
  if (matches.length > 0) {
    submitBoardMove(selected, square, matches);
    return;
  }
  // Clicked elsewhere: reselect if the new square has moves, else clear.
  selected = moveTargets(view, square).length > 0 ? square : null;
  core?.renderAll();
}

function submitBoardMove(
  from: ShogiSquare,
  to: ShogiSquare,
  matches: Array<Extract<ShogiMove, { from: ShogiSquare }>>,
): void {
  const canPromote = matches.some((move) => move.promote);
  const canStay = matches.some((move) => !move.promote);
  if (canPromote && canStay) {
    // Optional promotion: ask. Keep the selection until the choice resolves.
    pendingPromotion = { from, to };
    core?.renderAll();
    return;
  }
  if (core?.send({ type: 'move', from, to, ...(canPromote ? { promotion: 'promote' } : {}) })) {
    playSound(soundForOwnDarkShogiMove(core.state.view, { from, to }));
  }
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
  const role = target.getAttribute('data-drop') as ShogiHandRole | null;
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
  const choice = target.getAttribute('data-promote');
  if (choice !== 'yes' && choice !== 'no') return;
  if (
    core?.send({
      type: 'move',
      from: pending.from,
      to: pending.to,
      ...(choice === 'yes' ? { promotion: 'promote' } : {}),
    })
  ) {
    playSound(soundForOwnDarkShogiMove(core.state.view, { from: pending.from, to: pending.to }));
  }
  clearSelection();
  core?.renderAll();
}

function clearSelection(): void {
  selected = null;
  selectedDrop = null;
  draggingFrom = null;
  pendingPromotion = null;
}

function moveTargets(view: ShogiPlayerView, from: ShogiSquare): ShogiSquare[] {
  const seen = new Set<ShogiSquare>();
  for (const move of view.legalMoves) {
    if (!isShogiDrop(move) && move.from === from) seen.add(move.to);
  }
  return [...seen];
}

function dropTargets(view: ShogiPlayerView, role: ShogiHandRole): ShogiSquare[] {
  const seen = new Set<ShogiSquare>();
  for (const move of view.legalMoves) {
    if (isShogiDrop(move) && move.drop === role) seen.add(move.to);
  }
  return [...seen];
}

function canActNow(view: ShogiPlayerView): boolean {
  return !!core && core.replay.isLive() && iAmPlayer() && isMyTurn(view);
}

function iAmPlayer(): boolean {
  return isShogiColor(core?.state.seat);
}

function isMyTurn(view: ShogiPlayerView): boolean {
  return view.status.type === 'playing' && view.status.turn === core?.state.seat;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderBoard(liveRefs: LiveRefs, view: ShogiPlayerView | null): void {
  liveRefs.board.className = 'board shogi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Dark Shogi board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  const perspective = core?.orientation() ?? view.perspective;
  const interactive =
    !!core && core.replay.isLive() && iAmPlayer() && isMyTurn(view) && !pendingPromotion;
  const activeSelected = interactive ? selected : null;
  const targets = interactive ? activeTargets(view) : [];
  liveRefs.board.innerHTML = renderShogiBoardSvg(view, {
    perspective,
    showFog: true,
    showCoords: false,
    selected: activeSelected,
    targets,
    interactive,
    draggingFrom: interactive ? draggingFrom : null,
  });
}

function activeTargets(view: ShogiPlayerView): ShogiSquare[] {
  if (selectedDrop) return dropTargets(view, selectedDrop);
  if (selected) return moveTargets(view, selected);
  return [];
}

// The reserves strips. Your hand (bottom) is droppable on your turn; the
// opponent's reserve is PRIVATE under fog, so the top strip is a hidden note.
function renderHands(liveRefs: LiveRefs, view: ShogiPlayerView | null): void {
  const seat = core?.state.seat;
  liveRefs.capturesTop.replaceChildren();
  if (!view || !isShogiColor(seat)) {
    liveRefs.capturesBottom.replaceChildren();
    return;
  }
  const droppable = canActNow(view);
  liveRefs.capturesBottom.replaceChildren(ownReserveStrip(view, seat, droppable));
}

function ownReserveStrip(view: ShogiPlayerView, seat: ShogiColor, droppable: boolean): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'shogi-hands shogi-hands--own';
  const entries = SHOGI_HAND_ORDER.filter((role) => (view.hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'shogi-hands__empty';
    empty.textContent = 'No pieces in hand';
    strip.append(empty);
    return strip;
  }
  for (const role of entries) {
    strip.append(handKoma(role, seat, view.hand[role] ?? 0, droppable));
  }
  return strip;
}

function handKoma(
  role: ShogiHandRole,
  color: ShogiColor,
  count: number,
  droppable: boolean,
): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  const isSelected = selectedDrop === role;
  button.className = [
    'shogi-hand-koma',
    droppable ? 'shogi-hand-koma--droppable' : '',
    isSelected ? 'shogi-hand-koma--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  button.dataset.drop = role;
  button.disabled = !droppable;
  button.setAttribute('aria-grabbed', isSelected ? 'true' : 'false');
  button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  button.innerHTML = shogiHandKomaSvg(role, color);
  const badge = document.createElement('span');
  badge.className = 'shogi-hand-koma__count';
  badge.textContent = String(count);
  button.append(badge);
  return button;
}

function renderPromotion(liveRefs: LiveRefs, view: ShogiPlayerView | null): void {
  const pending = pendingPromotion;
  if (!pending || !view) {
    liveRefs.promotion.hidden = true;
    liveRefs.promotion.replaceChildren();
    return;
  }
  const piece = view.board[pending.from];
  if (!piece) {
    liveRefs.promotion.hidden = true;
    return;
  }
  liveRefs.promotion.hidden = false;
  liveRefs.promotion.className = 'promotion-picker shogi-promotion';
  liveRefs.promotion.innerHTML = `
    <div class="shogi-promotion__panel">
      <div class="shogi-promotion__title">Promote?</div>
      <div class="shogi-promotion__choices">
        <button type="button" class="shogi-promotion__choice" data-promote="yes">
          ${shogiKomaSvg({ color: piece.color, role: piece.role, promoted: true })}
          <span>Promote</span>
        </button>
        <button type="button" class="shogi-promotion__choice" data-promote="no">
          ${shogiKomaSvg({ color: piece.color, role: piece.role, promoted: false })}
          <span>Keep</span>
        </button>
      </div>
    </div>`;
}

// ── Notation ─────────────────────────────────────────────────────────────────

function notateShogiMove(move: ShogiMove): string {
  if (isShogiDrop(move)) return `${move.drop}*${move.to}`;
  return `${move.from}${move.to}${move.promote ? '+' : ''}`;
}

// ── Fog-safe replay capture key ──────────────────────────────────────────────
// The client only ever holds its OWN fog views, so scrubbing can never surface
// the opponent's hidden state.

function replayPositionKey(view: ShogiPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece?.color, piece?.role, Boolean(piece?.promoted)]);
  const hand = SHOGI_HAND_ORDER.map((role) => view.hand[role] ?? 0);
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

function isMoveEvent(event: TenantLiveEvent): event is DarkShogiMovePlayed {
  const move = (event as { move?: unknown }).move;
  if (event.type !== 'move-played') return false;
  if (!isShogiColor((event as { color?: unknown }).color)) return false;
  if (typeof move !== 'object' || move === null) return false;
  const candidate = move as { from?: unknown; to?: unknown; drop?: unknown };
  if (typeof candidate.to !== 'string') return false;
  return typeof candidate.from === 'string' || typeof candidate.drop === 'string';
}

function isHandRole(value: string): value is ShogiHandRole {
  return SHOGI_HAND_ORDER.includes(value as ShogiHandRole);
}

function isShogiSquare(value: string): value is ShogiSquare {
  return /^[1-9][a-i]$/.test(value);
}

function isShogiColor(value: unknown): value is ShogiColor {
  return value === 'black' || value === 'white';
}
