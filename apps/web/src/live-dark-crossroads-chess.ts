// Live multiplayer room client for hidden/dev-only Dark Crossroads Chess (6x8)
// — the FOG sibling of the perfect-information Crossroads Chess client. It
// reuses the already-fog-aware crossroads board renderer
// (crossroads-chess-render.ts) but follows the Dark Xiangqi FOG model, NOT the
// open crossroads client's perfect-info model:
//   * the generic socket client + shared room chrome,
//   * the fog-safe replay CAPTURE controller — it replays only the per-seat fog
//     snapshots the client actually received, and NEVER reconstructs the
//     opponent's hidden state from a canonical board (the open client rebuilds
//     views from full state, which would leak under fog),
//   * the masked move list — only your own moves are notated; opponent plies
//     show a dimmed placeholder, because the server redacts them off the wire,
//   * the bare wire shape — no rematch/roomMode/forfeitDeadline extras, so the
//     chrome's forfeit banner and rematch block simply never arm.
//
// Wire shape pinned by dark-crossroads-chess-golden-wire.test.ts: the tenant
// core snapshot with NO extras, per-seat move-played redaction, own-moves-only
// lastMove.

import type {
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessPlayerView,
  CrossroadsChessSquare,
} from '@mistboard/game';
import './live-crossroads-chess.css';
import './live-dark-crossroads-chess.css';
import {
  CROSSROADS_CHESS_BOARD_PX,
  crossroadsChessPieceGhostSvg,
  readCrossroadsChessAppearance,
  renderCrossroadsChessBoardSvg,
} from './crossroads-chess-render.js';
import { darkCrossroadsChessEnabled } from './feature-flags.js';
import {
  maybePlayCrossroadsChessSnapshotSound,
  resetCrossroadsChessSoundState,
  soundForOwnCrossroadsChessMove,
} from './live-crossroads-chess-sound.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, playSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import { boardAppearanceChangedEvent, setBoardFamily } from './theme.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { syncMoveListScroll } from './variant-tenant/chrome-dom.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';

// ── Wire shapes (the subset this client consumes) ───────────────────────────

type DarkCrossroadsLiveClock = {
  activeColor: CrossroadsChessColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<CrossroadsChessColor, number>;
  runningSince: number | null;
};

type DarkCrossroadsMovePlayed = {
  type: 'move-played';
  color: CrossroadsChessColor;
  move: CrossroadsChessMove;
  at: number;
  ply?: number;
};
type DarkCrossroadsLiveEvent = DarkCrossroadsMovePlayed | { type: string; [key: string]: unknown };
type DarkCrossroadsVisibleMoveRow = {
  fullMove: number;
  white?: string;
  red?: string;
};

type DarkCrossroadsLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: CrossroadsChessColor | 'spectator';
  seats: Partial<Record<CrossroadsChessColor, string>>;
  seatDisplayNames?: Partial<Record<CrossroadsChessColor, string>>;
  state: CrossroadsChessPlayerView;
  clock?: DarkCrossroadsLiveClock | null;
  connectedSeats?: Record<CrossroadsChessColor, boolean>;
  abortDeadline?: number | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: DarkCrossroadsLiveEvent[];
  event?: DarkCrossroadsLiveEvent;
  seq?: number;
};

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as CrossroadsChessColor | 'spectator' | null,
  view: null as CrossroadsChessPlayerView | null,
  clock: null as DarkCrossroadsLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<CrossroadsChessColor, string>>,
  seatDisplayNames: {} as Partial<Record<CrossroadsChessColor, string>>,
  connectedSeats: { white: false, red: false } as Record<CrossroadsChessColor, boolean>,
  events: [] as DarkCrossroadsLiveEvent[],
  abortDeadline: null as number | null,
  selected: null as CrossroadsChessSquare | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let boardHost: HTMLElement | null = null;
// The square a piece is being dragged from (its piece is lifted off the board so
// only the floating ghost shows). Null when not dragging.
let draggingFrom: CrossroadsChessSquare | null = null;
let lastCapturedView: CrossroadsChessPlayerView | null = null;
let lastCapturedPositionKey: string | null = null;

const replay = createTenantReplayController<CrossroadsChessPlayerView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

const darkCrossroadsChessWebTenant: WebVariantTenant<CrossroadsChessColor> = {
  displayName: 'Dark Crossroads Chess',
  metaGlyph: '♔',
  colors: ['white', 'red'],
  isColor: isCrossroadsChessColor,
  oppositeColor: (color) => (color === 'white' ? 'red' : 'white'),
  enabled: darkCrossroadsChessEnabled,
  reviewUrl: (roomId) => `/dark-crossroads-chess/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: darkCrossroadsChessEndReasonLabel,
  disabledTitle: 'Dark Crossroads Chess disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody:
    'This Dark Crossroads Chess room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction: 'Select one of your visible pieces, then choose a destination.',
};

const chrome = createTenantRoomChrome(darkCrossroadsChessWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  seatDisplayNames: () => state.seatDisplayNames,
  abortDeadline: () => state.abortDeadline,
  // Not on the Dark Crossroads wire (golden-pinned, no snapshot extras): the
  // forfeit banner and rematch block never arm.
  forfeitDeadline: () => null,
  roomMode: () => 'pvp',
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () => ({
    mode: 'pvp',
    gameSpecId: 'dark-crossroads-chess',
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function darkCrossroadsChessEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'king-captured':
      return 'king capture';
    case 'race':
      return 'the Race';
    case 'stalemate':
      return 'stalemate';
    case 'repetition':
      return 'repetition';
    case 'progress-clock':
      return 'no progress';
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

// ── Entry point ──────────────────────────────────────────────────────────────

export function bootstrapDarkCrossroadsChessLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'ddchess_dev';
  state.room = room;
  state.selected = null;
  draggingFrom = null;
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  replay.reset();
  chrome.resetState();
  initLiveSound();
  resetLiveSoundState();
  resetCrossroadsChessSoundState();

  if (params.get('reset') === '1') {
    clearSeatTokenForRoom(room);
    params.delete('reset');
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    );
  }

  refs = createLiveLayout(app, { debugRequested: false, roomId: room });
  // Reuse the crossroads board layout class — the fog variant renders the same
  // 6x8 board.
  setLiveLayoutGameSpec(app, 'crossroads-chess');
  setBoardFamily('chess');
  boardHost = refs.board;
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    // connect() drops any pending backoff timer and reconnects immediately.
    reconnectNow: () => client?.connect(),
  });

  installBoardInteraction();
  installSelectionClickAway({
    roots: () => [boardHost],
    hasSelection: () => state.selected !== null,
    clearSelection: () => {
      state.selected = null;
      draggingFrom = null;
      if (state.view) renderBoard(replay.currentView(state.view));
    },
  });

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as DarkCrossroadsLiveFrame),
    applySnapshot: (frame) => {
      applyFrame(frame as DarkCrossroadsLiveFrame);
      maybePlayCrossroadsChessSnapshotSound(state.view, state.seat);
    },
    applyEvent: (frame) => applyEventFrame(frame as DarkCrossroadsLiveFrame),
    render: renderAll,
  });
  client.connect();
  client.startPing();
  window.setInterval(() => {
    chrome.tickClocks();
    chrome.tickCountdowns();
  }, 100);
  document.addEventListener('keydown', handleReplayKeyboard);
  window.addEventListener(boardAppearanceChangedEvent, renderAll);
  renderAll();
}

// ── Frame application (connection mechanics live in the tenant socket client) ─

function applyFrame(frame: DarkCrossroadsLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  state.seatDisplayNames = frame.seatDisplayNames ?? state.seatDisplayNames;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: DarkCrossroadsLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) state.events = [...events, frame.event];
  maybePlayCrossroadsChessSnapshotSound(state.view, state.seat);
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  replay.handleKeyboard(event, renderAll);
}

// ── Interaction ──────────────────────────────────────────────────────────────

// Click + drag, delegated to the persistent board container once at mount so they
// survive every innerHTML re-render. Click is the existing select/move; drag
// lifts an own visible piece and drops it on a legal target. A tap that never
// crosses the movement threshold falls through to the click handler.
function installBoardInteraction(): void {
  if (!boardHost) return;
  installBoardDrag({
    board: boardHost,
    ghostSizePx: CROSSROADS_CHESS_BOARD_PX,
    onSquareClick: (square) => handleSquareClick(square as CrossroadsChessSquare),
    canDragFrom: (square) => canDragCrossroadsPiece(square as CrossroadsChessSquare),
    ghostHtml: (square) => crossroadsGhostHtml(square as CrossroadsChessSquare),
    onDragStart: (from) => {
      state.selected = from as CrossroadsChessSquare;
      draggingFrom = from as CrossroadsChessSquare;
      if (state.view) renderBoard(state.view);
    },
    onDrop: (from, to) =>
      dropCrossroadsPiece(from as CrossroadsChessSquare, to as CrossroadsChessSquare | null),
  });
}

function handleSquareClick(square: CrossroadsChessSquare): void {
  const view = state.view;
  if (!view) return;
  if (!replay.isLive()) return;
  if (!iAmPlayer() || !isMyTurn(view)) return;

  if (state.selected === null) {
    if (legalTargets(view, square).length === 0) return;
    state.selected = square;
    renderBoard(view);
    return;
  }
  if (square === state.selected) {
    state.selected = null;
    renderBoard(view);
    return;
  }
  const targets = legalTargets(view, state.selected);
  if (targets.includes(square)) {
    sendCrossroadsMove(view, state.selected, square);
    state.selected = null;
    renderBoard(view);
    return;
  }
  // Clicked elsewhere: reselect if the new square has moves, else clear.
  state.selected = legalTargets(view, square).length > 0 ? square : null;
  renderBoard(view);
}

// Send a move (promotion is mandatory-Queen and derived server-side from the
// destination rank, so the wire move carries only from/to — same as click). The
// click and drag paths both route through here.
function sendCrossroadsMove(
  view: CrossroadsChessPlayerView,
  from: CrossroadsChessSquare,
  to: CrossroadsChessSquare,
): void {
  const move = { from, to };
  if (send({ type: 'move', ...move })) {
    playSound(soundForOwnCrossroadsChessMove(view, move));
  }
}

// An own VISIBLE piece on your turn. Shrouded enemy silhouettes carry no
// identity and are never draggable. Any of your visible pieces can be lifted —
// it snaps back if dropped somewhere it cannot move.
function canDragCrossroadsPiece(square: CrossroadsChessSquare): boolean {
  const view = state.view;
  if (!view || !replay.isLive() || connection() !== 'connected') return false;
  if (!iAmPlayer() || !isMyTurn(view)) return false;
  const entry = view.board[square];
  if (!entry || entry.shrouded) return false;
  return entry.piece.color === state.seat;
}

function crossroadsGhostHtml(square: CrossroadsChessSquare): string | null {
  const entry = state.view?.board[square];
  if (!entry || entry.shrouded) return null;
  return crossroadsChessPieceGhostSvg(entry.piece, readCrossroadsChessAppearance());
}

function dropCrossroadsPiece(from: CrossroadsChessSquare, to: CrossroadsChessSquare | null): void {
  draggingFrom = null;
  const view = state.view;
  const targets = view ? legalTargets(view, from) : [];
  if (view && to && targets.includes(to)) {
    sendCrossroadsMove(view, from, to);
    state.selected = null;
  } else {
    state.selected = null;
  }
  if (state.view) renderBoard(state.view);
}

function legalTargets(
  view: CrossroadsChessPlayerView,
  from: CrossroadsChessSquare,
): CrossroadsChessSquare[] {
  return view.legalMoves.filter((move) => move.from === from).map((move) => move.to);
}

function iAmPlayer(): boolean {
  return isCrossroadsChessColor(state.seat);
}

function isMyTurn(view: CrossroadsChessPlayerView): boolean {
  return view.status.type === 'playing' && view.status.turn === state.seat;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderAll(): void {
  if (!refs) return;
  chrome.resetHostPanels();
  chrome.renderMeta();
  chrome.renderClocks();

  const view = state.view;
  captureReplayView(view);
  const displayedView = replay.currentView(view);
  replay.renderShell(refs, renderAll);
  refs.boardStatus.hidden = view !== null;
  chrome.renderActionStatus();
  chrome.renderGameControls();
  chrome.renderRoomActions();

  if (!darkCrossroadsChessEnabled()) {
    refs.board.className = 'board crossroads-live-board crossroads-live-board--disabled';
    refs.board.replaceChildren();
    state.selected = null;
    return;
  }

  renderBoard(displayedView);
  renderVisibleMoveList(refs);
}

function renderBoard(view: CrossroadsChessPlayerView | null): void {
  if (!refs) return;
  refs.board.className = 'board crossroads-live-board';
  refs.board.setAttribute('aria-label', 'Dark Crossroads Chess board');
  if (!view) {
    refs.board.replaceChildren();
    return;
  }
  const perspective = orientationFor(view);
  // Interaction (selection/targets/hit layer) only on the live position on your
  // own turn; replay positions and the opponent's turn are read-only.
  const interactive = replay.isLive() && iAmPlayer() && isMyTurn(view);
  const selected = interactive ? state.selected : null;
  const targets = selected ? legalTargets(view, selected) : [];
  refs.board.innerHTML = renderCrossroadsChessBoardSvg(view, {
    perspective,
    showFog: true,
    selected,
    targets,
    // The lifted source is omitted only on the interactive live position; replay
    // and the opponent's turn never drag, so draggingFrom is always null there.
    draggingFrom: interactive ? draggingFrom : null,
    interactive,
    ...readCrossroadsChessAppearance(),
  });
}

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is DarkCrossroadsMovePlayed =>
    isMoveEvent(event),
  );
  const plyCount = replay.visiblePlyCount();
  liveRefs.moveList.replaceChildren();
  // The pending-Try banner: shown only to the racer (the server redacts
  // pendingTry from the opponent). Their King reached the far rank and the game
  // is one reply from resolving — Race win unless the opponent captures it.
  if (state.view?.pendingTry === state.seat) {
    const banner = document.createElement('li');
    banner.className = 'ddchess-try-banner';
    banner.textContent =
      'Try pending — your King reached the far rank. You win unless the opponent captures it on their reply.';
    liveRefs.moveList.append(banner);
  }
  if (plyCount === 0) {
    const item = document.createElement('li');
    item.className = 'ddchess-move-row';
    const empty = document.createElement('span');
    empty.className = 'ddchess-move-row__move masked';
    empty.textContent = 'No visible moves yet';
    item.append(empty);
    liveRefs.moveList.append(item);
    return;
  }
  const activePly = replay.activePly();
  for (const row of visibleMoveRows(moves, plyCount)) {
    const item = document.createElement('li');
    item.className = 'ddchess-move-row';
    const number = document.createElement('span');
    number.className = 'ddchess-move-row__number';
    number.textContent = `${row.fullMove}.`;
    item.append(
      number,
      moveCell(row.white, row.fullMove * 2 - 1, activePly, plyCount),
      moveCell(row.red, row.fullMove * 2, activePly, plyCount),
    );
    liveRefs.moveList.append(item);
  }
  syncMoveListScroll(liveRefs.moveList, { live: replay.isLive(), plyCount: replay.latestPly() });
}

function moveCell(
  text: string | undefined,
  ply: number,
  activePly: number | null,
  plyCount: number,
): HTMLElement {
  const span = document.createElement('span');
  // A ply within the played range that we have no notation for is a redacted
  // opponent move: render the masked placeholder, never the move.
  const masked = !text && ply <= plyCount;
  span.className = [
    'ddchess-move-row__move',
    masked ? 'masked' : '',
    activePly === ply ? 'active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  span.textContent = ply > plyCount ? '' : (text ?? '...');
  return span;
}

function visibleMoveRows(
  moves: readonly DarkCrossroadsMovePlayed[],
  plyCount: number,
): DarkCrossroadsVisibleMoveRow[] {
  const rows = new Map<number, DarkCrossroadsVisibleMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = `${event.move.from}${event.move.to}`;
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

function eventPly(event: DarkCrossroadsMovePlayed, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

// ── Fog-safe replay capture ──────────────────────────────────────────────────
// Each distinct fog snapshot the client receives is pushed to the replay
// controller keyed by its derived ply. The client only ever holds its OWN fog
// views, so scrubbing can never surface the opponent's hidden state.

function captureReplayView(view: CrossroadsChessPlayerView | null): void {
  if (!view) return;
  if (view === lastCapturedView) return;
  const positionKey = replayPositionKey(view);
  const nextPly = replayPlyForView(view, positionKey !== lastCapturedPositionKey);
  if (positionKey === lastCapturedPositionKey && nextPly <= replay.latestPly()) {
    lastCapturedView = view;
    return;
  }
  replay.push({ ply: nextPly, view });
  lastCapturedView = view;
  lastCapturedPositionKey = positionKey;
}

function replayPlyForView(view: CrossroadsChessPlayerView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    // White moves first; moveNumber increments after Red completes a full move.
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'red' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: CrossroadsChessPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, entry]) =>
      'piece' in entry
        ? [square, entry.piece.color, entry.piece.role, false]
        : [square, entry.color, true],
    );
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    visibleSquares: [...view.visibleSquares].sort(),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isMoveEvent(event: DarkCrossroadsLiveEvent): event is DarkCrossroadsMovePlayed {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isCrossroadsChessColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function orientationFor(view: CrossroadsChessPlayerView | null): CrossroadsChessColor {
  if (isCrossroadsChessColor(state.seat)) return state.seat;
  return view?.perspective ?? 'white';
}

function isCrossroadsChessColor(value: unknown): value is CrossroadsChessColor {
  return value === 'white' || value === 'red';
}
