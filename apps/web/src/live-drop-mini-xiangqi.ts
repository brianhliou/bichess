// Live multiplayer room client for Drop Mini Xiangqi — an OPEN-INFORMATION
// tenant with reserves + drops, on the generic live-client core
// (variant-tenant/live-client.ts owns bootstrap, frame application, the
// renderAll skeleton, replay capture, and the two-column move list). This
// module keeps what is genuinely Drop Mini Xiangqi's: the wire view type, board
// + reserve rendering, click/drag/drop interaction, the in-check notice,
// sounds, and the drop-aware move notation.

import {
  DROP_MINI_XIANGQI_DROP_ROLES,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiPlayerView,
  type MiniXiangqiColor,
  type MiniXiangqiSquare,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import {
  dropMiniXiangqiBoardMoves,
  dropMiniXiangqiBoardView,
  dropMiniXiangqiDropTargets,
  dropMiniXiangqiMoveLabel,
  dropMiniXiangqiTargetMoves,
  fillDropMiniXiangqiReserve,
} from './drop-mini-xiangqi-view.js';
import { dropMiniXiangqiEnabled } from './feature-flags.js';
import {
  maybePlayDropMiniXiangqiSnapshotSound,
  resetDropMiniXiangqiSoundState,
  soundForOwnDropMiniXiangqiMove,
} from './live-drop-mini-xiangqi-sound.js';
import {
  installMiniXiangqiBoardStyles,
  MINI_XIANGQI_PIECE_PX,
  miniXiangqiPieceGhostSvg,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { playSound } from './live-sound.js';
import type { LiveRefs } from './live-state.js';
import { setBoardFamily, xiangqiAppearanceChangedEvent } from './theme.js';
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

type DropMiniMoveEvent = TenantMovePlayed<MiniXiangqiColor, DropMiniXiangqiMove>;

// ── Drop Mini Xiangqi-owned interaction/render state ─────────────────────────

let core: TenantLiveClientContext<MiniXiangqiColor, DropMiniXiangqiPlayerView> | null = null;
let selectedSquare: MiniXiangqiSquare | null = null;
let selectedDropRole: DropMiniXiangqiDropRole | null = null;
let draggingFrom: MiniXiangqiSquare | null = null;
// Snapshot extras that ride the frame (read by the chrome + play-again body).
let roomMode: 'pvp' | 'pve' = 'pvp';
let pveEngineId: string | null = null;
let forfeitDeadline: number | null = null;

const dropMiniWebTenant: WebVariantTenant<MiniXiangqiColor> = {
  displayName: 'Drop Mini Xiangqi',
  metaGlyph: '象',
  colors: ['red', 'black'],
  isColor: isMiniColor,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: dropMiniXiangqiEnabled,
  reviewUrl: (roomId) => `/drop-mini-xiangqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: dropMiniReasonPhrase,
  disabledTitle: 'Drop Mini Xiangqi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Drop Mini Xiangqi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching the full board.',
  selectInstruction: 'Select a piece, or select a reserve and then a drop square.',
};

const client = createTenantLiveClient<
  MiniXiangqiColor,
  DropMiniXiangqiPlayerView,
  DropMiniXiangqiMove
>({
  tenant: dropMiniWebTenant,
  gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
  defaultRoomId: 'dmxqd_dev',
  boardClass: 'mini-xiangqi-live-board',
  chrome: {
    roomMode: () => roomMode,
    forfeitDeadline: () => forfeitDeadline,
  },
  playAgainRequestBody: (state) => ({
    mode: roomMode,
    gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
    preferredColor: 'random',
    ...(roomMode === 'pvp' ? { rated: false } : {}),
    ...(roomMode === 'pve' && pveEngineId ? { engineId: pveEngineId } : {}),
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  onFrame: (frame) => {
    if (frame.roomMode === 'pve' || frame.roomMode === 'pvp') roomMode = frame.roomMode;
    if (typeof frame.pveEngineId === 'string') pveEngineId = frame.pveEngineId;
    else if (frame.roomMode !== 'pve') pveEngineId = null;
    forfeitDeadline = typeof frame.forfeitDeadline === 'number' ? frame.forfeitDeadline : null;
  },
  onSnapshotApplied: () => {
    if (core) maybePlayDropMiniXiangqiSnapshotSound(core.state.view, core.state.seat);
  },
  onEventApplied: () => {
    if (core) maybePlayDropMiniXiangqiSnapshotSound(core.state.view, core.state.seat);
  },
  resetSounds: resetDropMiniXiangqiSoundState,
  resetState: () => {
    selectedSquare = null;
    selectedDropRole = null;
    draggingFrom = null;
    roomMode = 'pvp';
    pveEngineId = null;
    forfeitDeadline = null;
  },
  renderBoard: renderBoardReconciled,
  renderExtras: (refs, view) => {
    renderReserves(refs, view);
    renderCheckStatus(refs, view);
  },
  onDisabled: (refs) => {
    // Mirror the pre-guard renderAll steps the original ran even when the flag
    // was off: reconcile, then paint the reserve strips + check notice, then
    // clear the selection.
    reconcileInteractionState(core?.state.view ?? null);
    const view = core?.displayedView() ?? null;
    renderReserves(refs, view);
    renderCheckStatus(refs, view);
    selectedSquare = null;
    selectedDropRole = null;
  },
  setup: (ctx) => {
    core = ctx;
    installMiniXiangqiBoardStyles();
    setBoardFamily('xiangqi');
    installBoardInteraction(ctx.refs);
    // Hot-reload the viewer's xiangqi piece set mid-game (board + captured pool
    // render from the stored set); mirrors the chess family's appearance hook.
    window.addEventListener(xiangqiAppearanceChangedEvent, ctx.renderAll);
    installSelectionClickAway({
      roots: () => [core?.refs.board, core?.refs.capturesBottom],
      hasSelection: () => selectedSquare !== null || selectedDropRole !== null,
      clearSelection: () => {
        selectedSquare = null;
        selectedDropRole = null;
        core?.renderAll();
      },
    });
  },
  moveList: {
    rowClass: 'move-row xiangqi-move-row',
    cellPrefix: 'xiangqi-move-row',
    listClass: 'xiangqi-move-list',
    masked: false,
    notate: dropMiniXiangqiMoveLabel,
    isMoveEvent: isDropMiniMoveEvent,
  },
  replayCapture: {
    positionKey: replayPositionKey,
    plyForView: (view, ctx) => replayPlyForView(view, ctx.positionChanged, ctx.latestPly),
  },
});

export function bootstrapDropMiniXiangqiLiveRoom(): void {
  client.bootstrap();
}

// ── Rendering ────────────────────────────────────────────────────────────────

// The core calls this exactly once per renderAll, before the reserve strip
// reads the selection, so reconcile the selection against the LIVE view here.
// Interaction re-renders call the raw renderBoard directly, so a mid-drag
// selection is never reconciled away (matching the pre-migration behavior where
// reconcile ran only inside renderAll).
function renderBoardReconciled(liveRefs: LiveRefs, view: DropMiniXiangqiPlayerView | null): void {
  reconcileInteractionState(core?.state.view ?? null);
  renderBoard(liveRefs, view);
}

function renderCheckStatus(liveRefs: LiveRefs, view: DropMiniXiangqiPlayerView | null): void {
  if (view?.status.type !== 'playing' || !view.inCheck || !core?.replay.isLive()) return;

  liveRefs.actionSection.hidden = false;
  liveRefs.actionStatus.replaceChildren();

  const notice = document.createElement('div');
  notice.className = 'action-notice danger';

  const title = document.createElement('strong');
  title.textContent = 'Check';

  const body = document.createElement('p');
  body.textContent =
    core?.state.seat === view.perspective
      ? 'Your general is in check. Answer the threat.'
      : `${capitalize(view.perspective)} general is in check.`;

  notice.append(title, body);
  liveRefs.actionStatus.append(notice);
}

function renderBoard(liveRefs: LiveRefs, view: DropMiniXiangqiPlayerView | null): void {
  liveRefs.board.className = 'board mini-xiangqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Drop Mini Xiangqi board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  const perspective = orientationFor(view);
  const hints = selectedDropRole
    ? dropMiniXiangqiTargetMoves(dropMiniXiangqiDropTargets(view, selectedDropRole))
    : selectedSquare
      ? dropMiniXiangqiBoardMoves(view, selectedSquare)
      : [];
  liveRefs.board.innerHTML = renderMiniXiangqiBoardSvg(
    dropMiniXiangqiBoardView(view, hints),
    perspective,
    {
      interactive: true,
      showFog: false,
      selectedSquare,
      legalMoves: hints,
      draggingFrom,
    },
  );
}

function renderReserves(liveRefs: LiveRefs, view: DropMiniXiangqiPlayerView | null): void {
  liveRefs.capturesTop.replaceChildren();
  liveRefs.capturesBottom.replaceChildren();
  if (!view) return;
  const bottom = orientationFor(view);
  const top = bottom === 'red' ? 'black' : 'red';
  fillDropMiniXiangqiReserve(liveRefs.capturesTop, view, top);
  fillDropMiniXiangqiReserve(liveRefs.capturesBottom, view, bottom, {
    interactive: canInteract(view) && core?.state.seat === bottom,
    selectedRole: selectedDropRole,
    onSelect: (role) => {
      if (!canInteract(view) || core?.state.seat !== bottom) return;
      selectedSquare = null;
      selectedDropRole = selectedDropRole === role ? null : role;
      core?.renderAll();
    },
  });
}

// ── Interaction ──────────────────────────────────────────────────────────────

function installBoardInteraction(liveRefs: LiveRefs): void {
  installBoardDrag({
    board: liveRefs.board,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    onSquareClick: (square) => handleSquareClick(square as MiniXiangqiSquare),
    canDragFrom: (square) => canDragPiece(square as MiniXiangqiSquare),
    ghostHtml: (square) => {
      const piece = core?.state.view?.board[square as MiniXiangqiSquare];
      return piece ? miniXiangqiPieceGhostSvg(piece) : null;
    },
    onDragStart: (from) => {
      selectedDropRole = null;
      selectedSquare = from as MiniXiangqiSquare;
      draggingFrom = from as MiniXiangqiSquare;
      renderBoard(liveRefs, core?.state.view ?? null);
    },
    onDrop: (from, to) => dropPiece(from as MiniXiangqiSquare, to as MiniXiangqiSquare | null),
  });
  installHandDrag({
    hand: liveRefs.capturesBottom,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    isRole: isDropRole,
    canDragRole: canDragDropRole,
    ghostHtml: (role) => {
      const seat = core?.state.seat;
      return isMiniColor(seat) ? miniXiangqiPieceGhostSvg({ color: seat, role }) : null;
    },
    onDragStart: (role) => {
      selectedSquare = null;
      selectedDropRole = role;
      core?.renderAll();
    },
    onDrop: (role, to) => dropReservePiece(role, to),
  });
}

function handleSquareClick(square: MiniXiangqiSquare): void {
  const view = core?.state.view;
  if (!view || !canInteract(view)) return;
  if (selectedDropRole) {
    const targets = dropMiniXiangqiDropTargets(view, selectedDropRole);
    if (targets.includes(square)) {
      core?.send({ type: 'move', drop: selectedDropRole, to: square });
      playSound('drop');
      selectedDropRole = null;
      selectedSquare = null;
      core?.renderAll();
      return;
    }
    selectedDropRole = null;
  }

  if (!selectedSquare) {
    if (canSelect(view, square)) selectedSquare = square;
    renderBoardIfMounted();
    return;
  }
  if (selectedSquare === square) {
    selectedSquare = null;
    renderBoardIfMounted();
    return;
  }
  const move = dropMiniXiangqiBoardMoves(view, selectedSquare).find(
    (candidate) => candidate.to === square,
  );
  if (move) {
    selectedSquare = null;
    core?.send({ type: 'move', from: move.from, to: move.to });
    playSound(soundForOwnDropMiniXiangqiMove(view, move));
    core?.renderAll();
    return;
  }
  selectedSquare = canSelect(view, square) ? square : null;
  renderBoardIfMounted();
}

function canDragPiece(square: MiniXiangqiSquare): boolean {
  const view = core?.state.view;
  if (!view || !canInteract(view)) return false;
  const piece = view.board[square];
  return !!piece && piece.color === core?.state.seat;
}

function dropPiece(from: MiniXiangqiSquare, to: MiniXiangqiSquare | null): void {
  draggingFrom = null;
  const view = core?.state.view;
  const move =
    to && view
      ? dropMiniXiangqiBoardMoves(view, from).find((candidate) => candidate.to === to)
      : undefined;
  if (move && view) {
    selectedSquare = null;
    core?.send({ type: 'move', from: move.from, to: move.to });
    playSound(soundForOwnDropMiniXiangqiMove(view, move));
  } else {
    selectedSquare = null;
  }
  core?.renderAll();
}

function canDragDropRole(role: DropMiniXiangqiDropRole): boolean {
  const view = core?.state.view;
  const seat = core?.state.seat;
  if (!view || !canInteract(view) || !isMiniColor(seat)) return false;
  return (view.hands[seat][role] ?? 0) > 0;
}

function dropReservePiece(role: DropMiniXiangqiDropRole, to: string | null): void {
  const view = core?.state.view;
  if (!view || !canInteract(view)) {
    selectedDropRole = null;
    core?.renderAll();
    return;
  }
  selectedSquare = null;
  selectedDropRole = role;
  const targets = dropMiniXiangqiDropTargets(view, role);
  if (to && isMiniSquare(to) && targets.includes(to)) {
    core?.send({ type: 'move', drop: role, to });
    playSound('drop');
  }
  selectedDropRole = null;
  core?.renderAll();
}

function canInteract(view: DropMiniXiangqiPlayerView): boolean {
  return (
    !!core &&
    core.replay.isLive() &&
    core.connection() === 'connected' &&
    view.status.type === 'playing' &&
    isMiniColor(core.state.seat) &&
    view.status.turn === core.state.seat
  );
}

function canSelect(view: DropMiniXiangqiPlayerView, square: MiniXiangqiSquare): boolean {
  if (!canInteract(view)) return false;
  const piece = view.board[square];
  return (
    !!piece &&
    piece.color === core?.state.seat &&
    dropMiniXiangqiBoardMoves(view, square).length > 0
  );
}

function reconcileInteractionState(view: DropMiniXiangqiPlayerView | null): void {
  if (!view || !canInteract(view)) {
    selectedSquare = null;
    selectedDropRole = null;
    return;
  }
  if (selectedSquare && dropMiniXiangqiBoardMoves(view, selectedSquare).length === 0) {
    selectedSquare = null;
  }
  if (
    selectedDropRole &&
    (view.hands[core?.state.seat as MiniXiangqiColor][selectedDropRole] ?? 0) <= 0
  ) {
    selectedDropRole = null;
  }
}

function renderBoardIfMounted(): void {
  if (core?.refs) renderBoard(core.refs, core.displayedView());
}

// ── Replay capture ─────────────────────────────────────────────────────────

function replayPlyForView(
  view: DropMiniXiangqiPlayerView,
  positionChanged: boolean,
  latestPly: number,
): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return latestPly + 1;
  return latestPly;
}

function replayPositionKey(view: DropMiniXiangqiPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece.color, piece.role]);
  return JSON.stringify({
    board,
    hands: view.hands,
    cooldownHands: view.cooldownHands,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    turn: view.status.type === 'playing' ? view.status.turn : view.status.type,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isDropMiniMoveEvent(event: TenantLiveEvent): event is DropMiniMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isMiniColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    ((typeof (move as { from?: unknown }).from === 'string' &&
      typeof (move as { to?: unknown }).to === 'string') ||
      (typeof (move as { drop?: unknown }).drop === 'string' &&
        typeof (move as { to?: unknown }).to === 'string'))
  );
}

function orientationFor(view: DropMiniXiangqiPlayerView | null): MiniXiangqiColor {
  const seat = core?.state.seat;
  if (isMiniColor(seat)) return seat;
  return view?.perspective ?? 'red';
}

function dropMiniReasonPhrase(reason: string): string {
  switch (reason) {
    case 'checkmate':
      return 'checkmate';
    case 'general-captured':
      return 'general capture';
    case 'stalemate':
      return 'stalemate';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'abandonment';
    case 'repetition':
      return 'threefold repetition';
    case 'progress-clock':
      return 'the no-capture rule';
    default:
      return 'the game rules';
  }
}

function isMiniColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
}

function isMiniSquare(value: string): value is MiniXiangqiSquare {
  return /^[a-g][1-7]$/.test(value);
}

function isDropRole(value: string): value is DropMiniXiangqiDropRole {
  return (DROP_MINI_XIANGQI_DROP_ROLES as readonly string[]).includes(value);
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
