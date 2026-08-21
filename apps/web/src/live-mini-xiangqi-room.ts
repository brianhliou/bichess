import {
  DARK_MINI_XIANGQI_SPEC_ID,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameEndReason,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
} from '@mistboard/game';
import {
  classifyTimeControl,
  createGameLifecycleTracker,
  gameSpecAnalyticsPropsForId,
} from './analytics.js';
import { darkMiniXiangqiEnabled } from './feature-flags.js';
import { setLiveLayoutGameSpec } from './live-layout.js';
import {
  installMiniXiangqiBoardStyles,
  MINI_XIANGQI_PIECE_PX,
  miniXiangqiPieceGhostSvg,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import {
  resetDarkMiniXiangqiSoundState,
  soundForOwnMiniXiangqiMove,
} from './live-mini-xiangqi-sound.js';
import { playSound } from './live-sound.js';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';
import { rematchControls } from './rematch-controls.js';
import { setBoardFamily, xiangqiAppearanceChangedEvent } from './theme.js';
import type { VariantMiniId } from './variant-mini-boards.js';
import {
  annotationOwner,
  type BoardAnnotations,
  drawnBoardOverlays,
  installBoardAnnotations,
} from './variant-tenant/board-annotations.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { syncMoveListScroll } from './variant-tenant/chrome-dom.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

// Live-room shell for Dark Mini Xiangqi — the web reference tenant of the
// Layer-3 extraction. The variant-agnostic chrome (clocks, countdowns, action
// status, room actions) and the replay index live in variant-tenant/; this
// module owns what is genuinely DMX: the fog board (render + click/drag
// interaction over visible pieces), the fog-safe replay CAPTURE (per-recipient
// snapshot history with hidden-move ply derivation), the masked move list,
// sounds, and lifecycle analytics.

type MiniXiangqiSquare = MiniXiangqiMove['from'];
type MiniXiangqiWireEvent =
  | {
      type: 'move-played';
      color: MiniXiangqiColor;
      move: { from: string; to: string };
      ply?: number;
    }
  | { type: string; [key: string]: unknown };
type MiniXiangqiMoveEvent = Extract<MiniXiangqiWireEvent, { type: 'move-played' }>;
type MiniXiangqiVisibleMoveRow = { fullMove: number; red?: string; black?: string };

let selectedSquare: MiniXiangqiSquare | null = null;
// Right-click arrows/circles the player drew on this board.
let annotations: BoardAnnotations | null = null;
// Drag-and-drop state. Click-to-move stays the primary path; a real drag (moved
// past a small threshold) commits on drop, via the shared installBoardDrag helper.
let dragFrom: MiniXiangqiSquare | null = null;
// The board element the shared drag is installed on. DMX has no single mount
// point (renderDarkMiniXiangqiRoom runs per render), so the drag is installed
// once per distinct board element and re-used across innerHTML re-renders.
let dragBoardEl: HTMLElement | null = null;
let uninstallClickAway: (() => void) | null = null;
// Installed once: repaint when the viewer changes their xiangqi piece set in
// settings, so a live DMX board hot-reloads the set instead of keeping the one
// it mounted with (mirrors the chess family's boardAppearanceChangedEvent hook).
let appearanceListenerInstalled = false;
let lastCapturedView: MiniXiangqiPlayerView | null = null;
let lastCapturedPositionKey: string | null = null;
let renderCallbacks: { reconnectNow: () => void; sendSocket: (payload: unknown) => boolean } = {
  reconnectNow: () => {},
  sendSocket: () => false,
};
// Last refs handed to renderDarkMiniXiangqiRoom, so replay keyboard handling
// can trigger a full re-render.
let lastRefs: LiveRefs | null = null;
// System-health funnel (queue -> match -> start -> finish). Own instance so the
// chess tracker never bleeds transitions into DMX. See analytics.ts.
const lifecycleTracker = createGameLifecycleTracker();

const replay = createTenantReplayController<MiniXiangqiPlayerView>();

const darkMiniXiangqiWebTenant: WebVariantTenant<MiniXiangqiColor> = {
  get displayName() {
    return isOpenMiniXiangqiLiveRoom() ? 'Mini Xiangqi' : 'Dark Mini Xiangqi';
  },
  get metaMarkerId(): VariantMiniId {
    return isOpenMiniXiangqiLiveRoom() ? 'mini-xiangqi' : 'dark-mini-xiangqi';
  },
  metaGlyph: '象',
  colors: ['red', 'black'],
  isColor: isMiniColor,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: miniXiangqiShellEnabled,
  reviewUrl: (roomId) =>
    `/${isOpenMiniXiangqiLiveRoom() ? 'mini-xiangqi' : 'dark-mini-xiangqi'}/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: (reason) => miniXiangqiReasonPhrase(reason as MiniXiangqiGameEndReason),
  get disabledTitle() {
    return `${isOpenMiniXiangqiLiveRoom() ? 'Mini Xiangqi' : 'Dark Mini Xiangqi'} disabled`;
  },
  disabledBody: 'This client build has the room renderer off.',
  get rejectedBody() {
    return `This ${isOpenMiniXiangqiLiveRoom() ? 'Mini Xiangqi' : 'Dark Mini Xiangqi'} room is not active. Create a new invite to start a game.`;
  },
  get spectatorBody() {
    return isOpenMiniXiangqiLiveRoom()
      ? 'Watching the full board.'
      : 'Watching without private information.';
  },
  get selectInstruction() {
    return isOpenMiniXiangqiLiveRoom()
      ? 'Select one of your pieces, then choose a destination.'
      : 'Select one of your visible pieces, then choose a destination.';
  },
};

const chrome = createTenantRoomChrome(darkMiniXiangqiWebTenant, {
  view: currentMiniView,
  seat: () => liveState.seat,
  connectionState: () => liveState.connectionState,
  clock: () => liveState.clock,
  timeControl: () => liveState.timeControl,
  connectedSeats: () => liveState.connectedSeats,
  seatDisplayNames: () => liveState.seatDisplayNames,
  abortDeadline: () => liveState.abortDeadline,
  forfeitDeadline: () => liveState.forfeitDeadline,
  roomMode: () => liveState.roomMode,
  room: () => liveState.room,
  debugRequested: () => liveState.debugRequested,
  isReplayLive: () => replay.isLive(),
  orientation: () => {
    const view = currentMiniView();
    if (view) return orientationFor(view);
    return isMiniColor(liveState.seat) ? liveState.seat : 'red';
  },
  playAgainRequestBody: buildPlayAgainRoomRequestBody,
  rematchControls: (sendSocket) => {
    const seat = liveState.seat;
    if (seat !== 'red' && seat !== 'black') return null;
    const theirSeat = seat === 'red' ? 'black' : 'red';
    return rematchControls(seat, theirSeat, sendSocket);
  },
});

export function isDarkMiniXiangqiLiveRoom(): boolean {
  return isMiniXiangqiShellRoom();
}

export function isDarkMiniXiangqiReplayLive(): boolean {
  return replay.isLive();
}

export function resetDarkMiniXiangqiReplayState(): void {
  selectedSquare = null;
  replay.reset();
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  chrome.resetState();
  lifecycleTracker.reset();
  resetDarkMiniXiangqiSoundState();
}

export function reconcileDarkMiniXiangqiInteractionState(): void {
  const view = currentMiniView();
  if (view?.status.type !== 'playing') {
    selectedSquare = null;
    return;
  }
  if (selectedSquare && !view.legalMoves.some((move) => move.from === selectedSquare)) {
    selectedSquare = null;
  }
}

export function renderDarkMiniXiangqiRoom(
  refs: LiveRefs,
  callbacks: { reconnectNow: () => void; sendSocket: (payload: unknown) => boolean },
): void {
  setLiveLayoutGameSpec(
    refs.board.closest('#app') ?? refs.board.ownerDocument.body,
    liveState.gameSpecId,
  );
  setBoardFamily('xiangqi');
  installMiniXiangqiBoardStyles();
  renderCallbacks = callbacks;
  lastRefs = refs;
  if (!appearanceListenerInstalled) {
    window.addEventListener(xiangqiAppearanceChangedEvent, () => {
      if (lastRefs) renderDarkMiniXiangqiRoom(lastRefs, renderCallbacks);
    });
    appearanceListenerInstalled = true;
  }
  if (dragBoardEl !== refs.board) {
    uninstallClickAway?.();
    installMiniXiangqiBoardDrag(refs);
    annotations = installBoardAnnotations({
      board: refs.board,
      gameId: () => annotationOwner(currentMiniView()),
      repaint: () => renderBoard(refs, replay.currentView(currentMiniView())),
    });
    uninstallClickAway = installSelectionClickAway({
      roots: () => [refs.board],
      hasSelection: () => selectedSquare !== null,
      clearSelection: () => {
        selectedSquare = null;
        dragFrom = null;
        renderBoard(refs, replay.currentView(currentMiniView()));
      },
    });
    dragBoardEl = refs.board;
  }
  chrome.setRenderTarget(refs, callbacks);
  chrome.resetHostPanels();
  chrome.renderClocks();
  chrome.renderMeta();
  chrome.renderRoomActions();

  const view = currentMiniView();
  trackMiniXiangqiLifecycle(view);
  captureReplayView(view);
  const displayedView = replay.currentView(view);
  refs.moveList.classList.add('xiangqi-move-list');
  replay.renderShell(refs, () => {
    renderDarkMiniXiangqiRoom(refs, renderCallbacks);
  });
  refs.boardStatus.hidden = view !== null;
  chrome.renderActionStatus();
  chrome.renderGameControls();

  if (!miniXiangqiShellEnabled()) {
    refs.board.className = 'board mini-xiangqi-live-board mini-xiangqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, displayedView);
  renderVisibleMoveList(refs);
}

function currentMiniView(): MiniXiangqiPlayerView | null {
  return liveState.state as unknown as MiniXiangqiPlayerView | null;
}

// Feeds the shared start/finish funnel from the live DMX state (never the
// scrubbed replay view). Postgame review is a separate module, so this only ever
// runs for a live room — no isLive() gate needed. Tagged with the DMX game spec
// so the funnel is sliceable from the chess one in PostHog.
function trackMiniXiangqiLifecycle(view: MiniXiangqiPlayerView | null): void {
  if (!view) return;
  const tc = liveState.timeControl;
  const baseProps = {
    gameId: view.id,
    ...gameSpecAnalyticsPropsForId(currentMiniXiangqiSpecId()),
    rated: liveState.rated,
    roomMode: liveState.roomMode,
    initialMs: tc?.initialMs ?? null,
    incrementMs: tc?.incrementMs ?? null,
    time_class: tc ? classifyTimeControl(tc.initialMs, tc.incrementMs) : null,
  };
  const outcome =
    view.status.type === 'finished'
      ? { winner: view.status.winner, reason: view.status.reason, moveNumber: view.moveNumber }
      : null;
  lifecycleTracker.update({ statusType: view.status.type, baseProps, outcome });
}

// Lightweight per-tick refresh (100ms), delegated to the tenant chrome.
export function tickDarkMiniXiangqiClocks(): void {
  chrome.tickClocks();
}

export function tickDarkMiniXiangqiCountdowns(): void {
  chrome.tickCountdowns();
}

export function handleDarkMiniXiangqiReplayKeyboard(event: KeyboardEvent): void {
  replay.handleKeyboard(event, () => {
    if (lastRefs) renderDarkMiniXiangqiRoom(lastRefs, renderCallbacks);
  });
}

// Human phrasing for a finished-game reason, so "Draw" always says WHY (the two
// draw reasons are threefold repetition and the no-capture/progress rule).
function miniXiangqiReasonPhrase(reason: MiniXiangqiGameEndReason): string {
  switch (reason) {
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

function buildPlayAgainRoomRequestBody(): Record<string, unknown> {
  if (isOpenMiniXiangqiLiveRoom()) {
    return {
      mode: 'pvp',
      gameSpecId: MINI_XIANGQI_SPEC_ID,
      preferredColor: 'random',
      rated: false,
      ...(liveState.timeControl ? { timeControl: liveState.timeControl } : {}),
    };
  }
  const mode = liveState.roomMode === 'pve' ? 'pve' : 'pvp';
  const preferredColor =
    mode === 'pve' && (liveState.seat === 'red' || liveState.seat === 'black')
      ? liveState.seat === 'red'
        ? 'black'
        : 'red'
      : 'random';
  return {
    mode,
    gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
    preferredColor,
    ...(mode === 'pve' && liveState.pveEngineId ? { engineId: liveState.pveEngineId } : {}),
    ...(liveState.timeControl ? { timeControl: liveState.timeControl } : {}),
  };
}

function renderBoard(refs: LiveRefs, view: MiniXiangqiPlayerView | null): void {
  refs.board.className = 'board mini-xiangqi-live-board';
  refs.board.setAttribute(
    'aria-label',
    `${isOpenMiniXiangqiLiveRoom() ? 'Mini Xiangqi' : 'Dark Mini Xiangqi'} board`,
  );
  if (!view) {
    refs.board.replaceChildren();
    return;
  }

  const perspective = orientationFor(view);
  const hints = selectedSquare
    ? view.legalMoves.filter((move) => move.from === selectedSquare)
    : [];
  // Only ever highlight the viewer's own last move. The server already redacts
  // an opponent's move, but gating on board ownership here makes the fog
  // guarantee hold for every rendered view — live, replayed, or reconnected.
  const renderView =
    isOpenMiniXiangqiLiveRoom() || viewerOwnsLastMove(view)
      ? view
      : { ...view, lastMove: undefined };
  const drawn = drawnBoardOverlays<MiniXiangqiSquare>(annotations?.shapes() ?? []);
  refs.board.innerHTML = renderMiniXiangqiBoardSvg(renderView, perspective, {
    arrows: drawn.arrows,
    markers: drawn.markers,
    interactive: true,
    showFog: !isOpenMiniXiangqiLiveRoom(),
    selectedSquare,
    legalMoves: hints,
    draggingFrom: dragFrom,
  });
  // Click + drag are delegated to the persistent board container once per board
  // element (installMiniXiangqiBoardDrag), so they survive these innerHTML
  // re-renders.
}

// Click + drag, delegated to the persistent board container via the shared
// installBoardDrag helper. Click is the existing click-to-move; drag lifts a
// visible own piece and drops it on a legal target. A tap that never crosses the
// movement threshold falls through to the click handler.
function installMiniXiangqiBoardDrag(refs: LiveRefs): void {
  installBoardDrag({
    board: refs.board,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    onSquareClick: (square) => {
      const view = currentMiniView();
      if (!view) return;
      handleSquareClick(view, square as MiniXiangqiSquare, renderCallbacks.sendSocket);
      if (lastRefs) renderBoard(lastRefs, view);
    },
    canDragFrom: (square) => canDragMiniPiece(square as MiniXiangqiSquare),
    ghostHtml: (square) => {
      const entry = currentMiniView()?.board[square as MiniXiangqiSquare];
      if (entry?.shrouded !== false) return null;
      return miniXiangqiPieceGhostSvg(entry.piece);
    },
    onDragStart: (from) => {
      selectedSquare = from as MiniXiangqiSquare;
      dragFrom = from as MiniXiangqiSquare;
      const view = currentMiniView();
      if (lastRefs && view) renderBoard(lastRefs, view);
    },
    onDrop: (from, to) => dropMiniPiece(from as MiniXiangqiSquare, to as MiniXiangqiSquare | null),
  });
}

// Any of your visible pieces can be lifted on your turn (it snaps back if you
// drop it somewhere it cannot move), not just ones with a legal move right now.
// Distinct from canSelect (which click-to-move uses and DOES require a move).
function canDragMiniPiece(square: MiniXiangqiSquare): boolean {
  const view = currentMiniView();
  if (!view || !canInteract(view)) return false;
  const entry = view.board[square];
  return !!entry && entry.shrouded === false && entry.piece.color === liveState.seat;
}

function dropMiniPiece(from: MiniXiangqiSquare, to: MiniXiangqiSquare | null): void {
  dragFrom = null;
  const view = currentMiniView();
  const move = to && view ? view.legalMoves.find((m) => m.from === from && m.to === to) : undefined;
  if (move && view) {
    selectedSquare = null;
    if (renderCallbacks.sendSocket({ type: 'move', from: move.from, to: move.to })) {
      playSound(soundForOwnMiniXiangqiMove(view, move));
    }
  } else {
    selectedSquare = null;
  }
  if (lastRefs && view) renderBoard(lastRefs, view);
}

function handleSquareClick(
  view: MiniXiangqiPlayerView,
  square: MiniXiangqiSquare,
  sendSocket: (payload: unknown) => boolean,
): void {
  if (!canInteract(view)) return;
  if (!selectedSquare) {
    if (canSelect(view, square)) selectedSquare = square;
    return;
  }
  if (selectedSquare === square) {
    selectedSquare = null;
    return;
  }
  const move = view.legalMoves.find(
    (candidate) => candidate.from === selectedSquare && candidate.to === square,
  );
  if (move) {
    selectedSquare = null;
    if (sendSocket({ type: 'move', from: move.from, to: move.to })) {
      playSound(soundForOwnMiniXiangqiMove(view, move));
    }
    return;
  }
  selectedSquare = canSelect(view, square) ? square : null;
}

function canInteract(view: MiniXiangqiPlayerView): boolean {
  return (
    replay.isLive() &&
    liveState.connectionState === 'connected' &&
    view.status.type === 'playing' &&
    isMiniColor(liveState.seat) &&
    view.status.turn === liveState.seat
  );
}

function canSelect(view: MiniXiangqiPlayerView, square: MiniXiangqiSquare): boolean {
  if (!canInteract(view)) return false;
  const entry = view.board[square];
  if (entry?.shrouded !== false || entry.piece.color !== liveState.seat) return false;
  return view.legalMoves.some((move) => move.from === square);
}

function renderVisibleMoveList(refs: LiveRefs): void {
  const moves = (liveState.events as unknown as MiniXiangqiWireEvent[]).filter(
    (event): event is MiniXiangqiMoveEvent => isMiniXiangqiMoveEvent(event),
  );
  // Render every move that has been played, always. Stepping back only moves the
  // active highlight (replay.activePly()); it must never drop rows. The ceiling
  // is the full game length, not the scrubbed ply.
  const totalPly = replay.latestPly();
  refs.moveList.replaceChildren();
  // Zero moves renders an empty list (lichess parity): no placeholder row.
  if (totalPly === 0) return;
  const activePly = replay.activePly();
  for (const row of visibleMoveRows(moves, totalPly)) {
    const item = document.createElement('li');
    item.className = 'move-row xiangqi-move-row';
    const number = document.createElement('span');
    number.className = 'xiangqi-move-row__number';
    number.textContent = `${row.fullMove}.`;
    const red = document.createElement('span');
    red.className = [
      'xiangqi-move-row__move',
      row.red ? '' : 'masked',
      activePly === row.fullMove * 2 - 1 ? 'active' : '',
    ]
      .filter(Boolean)
      .join(' ');
    red.textContent = row.red ?? '...';
    const black = document.createElement('span');
    const blackPly = row.fullMove * 2;
    black.className = [
      'xiangqi-move-row__move',
      row.black ? '' : 'masked',
      activePly === blackPly ? 'active' : '',
    ]
      .filter(Boolean)
      .join(' ');
    black.textContent = blackPly <= totalPly ? (row.black ?? '...') : '';
    item.append(number, red, black);
    refs.moveList.append(item);
  }
  syncMoveListScroll(refs.moveList, { live: replay.isLive(), plyCount: replay.latestPly() });
}

function visibleMoveRows(
  moves: readonly MiniXiangqiMoveEvent[],
  plyCount: number,
): MiniXiangqiVisibleMoveRow[] {
  const rows = new Map<number, MiniXiangqiVisibleMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = `${event.move.from}-${event.move.to}`;
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

function eventPly(event: MiniXiangqiMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

function captureReplayView(view: MiniXiangqiPlayerView | null): void {
  if (!view) return;
  if (view === lastCapturedView) return;
  const positionKey = replayPositionKey(view);
  // Dedup by position key alone. The key includes the side to move (and the
  // terminal status), so every ply is a distinct snapshot even when an opponent's
  // hidden move leaves this player's board, vision, and moveNumber unchanged —
  // that case previously collapsed plies and truncated the back-scroll.
  if (positionKey === lastCapturedPositionKey) {
    lastCapturedView = view;
    return;
  }
  replay.push({ ply: replayPlyForView(view), view });
  lastCapturedView = view;
  lastCapturedPositionKey = positionKey;
}

// Absolute game ply for a view. Derived from moveNumber/turn for live positions
// (so it is correct even when the client joined mid-game), and one past the last
// captured ply for a terminal frame (the finishing move).
function replayPlyForView(view: MiniXiangqiPlayerView): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  return replay.latestPly() + 1;
}

function replayPositionKey(view: MiniXiangqiPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, entry]) =>
      entry.shrouded === false
        ? [square, entry.piece.color, entry.piece.role, false]
        : [square, entry.color, true],
    );
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    visibleSquares: [...view.visibleSquares].sort(),
    // Side to move for live positions; status type once the game is over. This is
    // the per-ply discriminator that keeps hidden-move plies from collapsing.
    turn: view.status.type === 'playing' ? view.status.turn : view.status.type,
  });
}

function isMiniXiangqiMoveEvent(event: MiniXiangqiWireEvent): event is MiniXiangqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isMiniColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function orientationFor(view: MiniXiangqiPlayerView): MiniXiangqiColor {
  return isMiniColor(liveState.seat) ? liveState.seat : view.perspective;
}

function viewerOwnsLastMove(view: MiniXiangqiPlayerView): boolean {
  const lastMove = view.lastMove;
  if (!lastMove) return false;
  // After a move the moving piece sits on `to`; a visible own piece there means
  // the viewer made this move. An opponent move shows the opponent's piece (or a
  // shrouded/absent square), so it is never highlighted.
  const entry = view.board[lastMove.to];
  return entry?.shrouded === false && entry.piece.color === liveState.seat;
}

function isMiniColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
}

function isOpenMiniXiangqiLiveRoom(): boolean {
  return liveState.gameSpecId === MINI_XIANGQI_SPEC_ID;
}

function isMiniXiangqiShellRoom(): boolean {
  return liveState.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID || isOpenMiniXiangqiLiveRoom();
}

function currentMiniXiangqiSpecId():
  | typeof DARK_MINI_XIANGQI_SPEC_ID
  | typeof MINI_XIANGQI_SPEC_ID {
  return isOpenMiniXiangqiLiveRoom() ? MINI_XIANGQI_SPEC_ID : DARK_MINI_XIANGQI_SPEC_ID;
}

function miniXiangqiShellEnabled(): boolean {
  return isOpenMiniXiangqiLiveRoom() ? true : darkMiniXiangqiEnabled();
}
