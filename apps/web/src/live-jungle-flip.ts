// Live multiplayer room client for Flip Jungle (兽棋 / 翻翻棋) — a self-contained tenant
// client on the socket-client + chrome stack, modeled on live-banqi.ts (symmetric
// hidden-identity, flip-or-move) reusing the Flip Jungle renderer.
//
// Symmetric information: the server sends the IDENTICAL masked board to both seats (a
// face-down tile carries no ink/identity; the only hidden state is the deal). Seat is
// the move order ('red' = first); the ink binds on the opening flip (view.firstColor).
// Interaction: tap a face-down tile to flip it, or select one of your revealed animals
// and tap a legal target. Board rendering comes from jungle-flip-render.ts.

import type {
  JungleFlipColor,
  JungleFlipGameStatus,
  JungleFlipMove,
  JungleFlipPieceRole,
  JungleFlipSeat,
  JungleFlipSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import { jungleFlipEnabled } from './feature-flags.js';
import {
  JUNGLE_FLIP_BOARD_VIEW,
  type JungleFlipRenderBoard,
  jungleFlipPieceGhostSvg,
  renderJungleFlipBoardSvg,
} from './jungle-flip-render.js';
import {
  maybePlayJungleFlipSnapshotSound,
  resetJungleFlipSoundState,
  soundForOwnJungleFlipMove,
} from './live-jungle-flip-sound.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, playSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
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

// ── Wire shapes (mirror JungleFlipPlayerView) ─────────────────────────────────

type JungleFlipWireBoardEntry =
  | { faceDown: true }
  | { color: JungleFlipColor; role: JungleFlipPieceRole; faceDown: false };

export type JungleFlipWireView = {
  id: string;
  perspective: JungleFlipSeat;
  board: Partial<Record<JungleFlipSquare, JungleFlipWireBoardEntry>>;
  legalMoves: JungleFlipMove[];
  captured: { owner: JungleFlipColor; role: JungleFlipPieceRole }[];
  status: JungleFlipGameStatus;
  ply: number;
  firstColor: JungleFlipColor | null;
  moveNumber: number;
  lastMove?: JungleFlipMove;
};

type JungleFlipWireEvent =
  | { type: 'move-played'; color: JungleFlipSeat; move: JungleFlipMove; at: number; ply?: number }
  | { type: string; [key: string]: unknown };
type JungleFlipMoveEvent = Extract<JungleFlipWireEvent, { type: 'move-played' }>;
type JungleFlipVisibleMoveRow = { fullMove: number; red?: string; black?: string };

type JungleFlipLiveClock = {
  activeColor: JungleFlipSeat | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<JungleFlipSeat, number>;
  runningSince: number | null;
};

type JungleFlipLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: JungleFlipSeat | 'spectator';
  seats: Partial<Record<JungleFlipSeat, string>>;
  state: JungleFlipWireView;
  clock?: JungleFlipLiveClock | null;
  connectedSeats?: Record<JungleFlipSeat, boolean>;
  abortDeadline?: number | null;
  roomMode?: 'pve' | 'pvp';
  timeControl?: { initialMs: number; incrementMs: number } | null;
  events?: JungleFlipWireEvent[];
  event?: JungleFlipWireEvent;
  seq?: number;
};

// ── Module state ──────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as JungleFlipSeat | 'spectator' | null,
  view: null as JungleFlipWireView | null,
  clock: null as JungleFlipLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<JungleFlipSeat, string>>,
  connectedSeats: { red: false, black: false } as Record<JungleFlipSeat, boolean>,
  events: [] as JungleFlipWireEvent[],
  abortDeadline: null as number | null,
  roomMode: 'pvp' as 'pve' | 'pvp',
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let selectedSquare: JungleFlipSquare | null = null;
let draggingFrom: JungleFlipSquare | null = null;
let lastCapturedView: JungleFlipWireView | null = null;
let lastCapturedKey: string | null = null;

const replay = createTenantReplayController<JungleFlipWireView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

function isJungleFlipSeat(value: unknown): value is JungleFlipSeat {
  return value === 'red' || value === 'black';
}

// The ink a seat owns, once the opening flip binds it (null before).
function jungleFlipSeatInk(
  seat: JungleFlipSeat,
  view: JungleFlipWireView | null,
): JungleFlipColor | null {
  if (!view || view.firstColor === null) return null;
  return seat === 'red' ? view.firstColor : view.firstColor === 'red' ? 'black' : 'red';
}

function orientationFor(view: JungleFlipWireView | null): JungleFlipSeat {
  if (isJungleFlipSeat(state.seat)) return state.seat;
  return view?.perspective ?? 'red';
}

// ── Shared tenant room chrome ─────────────────────────────────────────────────

function jungleFlipSeatLabel(seat: JungleFlipSeat): string {
  const ink = jungleFlipSeatInk(seat, state.view);
  if (ink) return ink === 'red' ? 'Red' : 'Black';
  return seat === 'red' ? 'First' : 'Second';
}

const jungleFlipWebTenant: WebVariantTenant<JungleFlipSeat> = {
  displayName: 'Flip Jungle',
  colors: ['red', 'black'],
  isColor: isJungleFlipSeat,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: jungleFlipEnabled,
  reviewUrl: (roomId) => `/jungle-flip/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: jungleFlipReasonPhrase,
  disabledTitle: 'Flip Jungle disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Flip Jungle room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching the game.',
  selectInstruction: 'Tap a face-down tile to flip it, or select one of your animals to move.',
  seatLabel: jungleFlipSeatLabel,
  showPregameTurn: true,
};

const chrome = createTenantRoomChrome(jungleFlipWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  abortDeadline: () => state.abortDeadline,
  forfeitDeadline: () => null,
  roomMode: () => state.roomMode,
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () => ({
    mode: state.roomMode,
    gameSpecId: 'jungle-flip',
    // The 'red' seat moves first; request the opposite seat to alternate the opener.
    preferredColor: isJungleFlipSeat(state.seat)
      ? state.seat === 'red'
        ? 'black'
        : 'red'
      : 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function jungleFlipReasonPhrase(reason: string): string {
  switch (reason) {
    case 'stalemate':
      return 'no legal move';
    case 'no-progress':
      return 'no progress';
    case 'repetition':
      return 'repetition';
    case 'dead-position':
      return 'a dead position';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'abandonment';
    default:
      return 'the game rules';
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function bootstrapJungleFlipLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'jgf_dev';
  state.room = room;
  selectedSquare = null;
  draggingFrom = null;
  lastCapturedView = null;
  lastCapturedKey = null;
  replay.reset();
  chrome.resetState();
  initLiveSound();
  resetLiveSoundState();
  resetJungleFlipSoundState();

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

  refs = createLiveLayout(app, { debugRequested: false });
  setLiveLayoutGameSpec(app, 'jungle-flip');
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    reconnectNow: () => client?.connect(),
  });
  installJungleFlipBoardInteraction(refs);
  installSelectionClickAway({
    roots: () => [refs?.board],
    hasSelection: () => selectedSquare !== null,
    clearSelection: () => {
      selectedSquare = null;
      draggingFrom = null;
      if (refs) renderBoard(refs, replay.currentView(state.view));
    },
  });

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as JungleFlipLiveFrame),
    applySnapshot: (frame) => {
      applyFrame(frame as JungleFlipLiveFrame);
      maybePlayJungleFlipSnapshotSound(state.view, state.seat);
    },
    applyEvent: (frame) => applyEventFrame(frame as JungleFlipLiveFrame),
    render: renderAll,
  });
  client.connect();
  client.startPing();
  window.setInterval(() => {
    chrome.tickClocks();
    chrome.tickCountdowns();
  }, 100);
  document.addEventListener('keydown', handleReplayKeyboard);
  renderAll();
}

// ── Frame application ─────────────────────────────────────────────────────────

function applyFrame(frame: JungleFlipLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  state.roomMode = frame.roomMode ?? state.roomMode;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: JungleFlipLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) state.events = [...events, frame.event];
  maybePlayJungleFlipSnapshotSound(state.view, state.seat);
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  replay.handleKeyboard(event, renderAll);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderAll(): void {
  if (!refs) return;
  chrome.resetHostPanels();
  chrome.renderMeta();
  chrome.renderClocks();

  const view = state.view;
  captureReplayView(view);
  const displayedView = replay.currentView(view);
  refs.moveList.classList.add('xiangqi-move-list');
  replay.renderShell(refs, renderAll);
  refs.boardStatus.hidden = view !== null;
  chrome.renderActionStatus();
  chrome.renderGameControls();
  chrome.renderRoomActions();

  if (!jungleFlipEnabled()) {
    refs.board.className = 'board jungle-flip-live-board jungle-flip-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, displayedView);
  renderVisibleMoveList(refs);
}

function renderBoard(liveRefs: LiveRefs, view: JungleFlipWireView | null): void {
  liveRefs.board.className = 'board jungle-flip-live-board';
  liveRefs.board.setAttribute('aria-label', 'Flip Jungle board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  // Target dots are for board MOVES only; a flip is clicked on the tile directly.
  const targets = selectedSquare
    ? view.legalMoves.filter((m) => m.from === selectedSquare && m.to !== m.from).map((m) => m.to)
    : [];
  liveRefs.board.innerHTML = renderJungleFlipBoardSvg(view.board as JungleFlipRenderBoard, {
    interactive: true,
    selected: selectedSquare,
    targets,
    draggingFrom,
    lastMove: view.lastMove ?? null,
  });
}

function installJungleFlipBoardInteraction(liveRefs: LiveRefs): void {
  installBoardDrag({
    board: liveRefs.board,
    // The board scales above its SVG units, so size the ghost to the on-screen cell.
    ghostSizePx: () => {
      const width = liveRefs.board.getBoundingClientRect().width;
      return width > 0 ? width / JUNGLE_FLIP_BOARD_VIEW.files : JUNGLE_FLIP_BOARD_VIEW.cell;
    },
    onSquareClick: (square) => {
      const view = state.view;
      if (!view) return;
      handleSquareClick(view, square as JungleFlipSquare);
      renderBoard(liveRefs, view);
    },
    canDragFrom: (square) => canDragFlipPiece(square as JungleFlipSquare),
    ghostHtml: (square) => {
      const entry = state.view?.board[square as JungleFlipSquare];
      return entry && !entry.faceDown ? jungleFlipPieceGhostSvg(entry) : null;
    },
    onDragStart: (from) => {
      selectedSquare = from as JungleFlipSquare;
      draggingFrom = from as JungleFlipSquare;
      if (state.view) renderBoard(liveRefs, state.view);
    },
    onDrop: (from, to) =>
      dropFlipPiece(liveRefs, from as JungleFlipSquare, to as JungleFlipSquare | null),
  });
}

// Only a revealed own animal can be lifted (face-down tiles are clicked to flip, not
// dragged). It snaps back if dropped somewhere it cannot move.
function canDragFlipPiece(square: JungleFlipSquare): boolean {
  if (!replay.isLive() || connection() !== 'connected') return false;
  const seat = state.seat;
  const view = state.view;
  if (!view || !isJungleFlipSeat(seat)) return false;
  if (view.status.type !== 'playing' || view.status.turn !== seat) return false;
  const entry = view.board[square];
  const ink = jungleFlipSeatInk(seat, view);
  return !!entry && !entry.faceDown && !!ink && entry.color === ink;
}

function dropFlipPiece(
  liveRefs: LiveRefs,
  from: JungleFlipSquare,
  to: JungleFlipSquare | null,
): void {
  draggingFrom = null;
  const view = state.view;
  const move =
    to && view
      ? view.legalMoves.find((m) => m.from === from && m.to === to && m.to !== m.from)
      : undefined;
  if (move && view) {
    selectedSquare = null;
    send({ type: 'move', from: move.from, to: move.to });
    playSound(soundForOwnJungleFlipMove(view, move));
  } else {
    selectedSquare = null;
  }
  if (state.view) renderBoard(liveRefs, state.view);
}

function handleSquareClick(view: JungleFlipWireView, square: JungleFlipSquare): void {
  if (!replay.isLive() || connection() !== 'connected') return;
  const seat = state.seat;
  if (!isJungleFlipSeat(seat) || view.status.type !== 'playing' || view.status.turn !== seat) {
    selectedSquare = null;
    return;
  }
  const entry = view.board[square];
  // Flip a face-down tile (the self-move from === to).
  if (entry?.faceDown) {
    selectedSquare = null;
    send({ type: 'move', from: square, to: square });
    playSound('flip');
    return;
  }
  const ink = jungleFlipSeatInk(seat, view);
  // Select your own revealed animal.
  if (entry && !entry.faceDown && ink && entry.color === ink) {
    selectedSquare = square;
    return;
  }
  // Move/capture to a legal target of the selected piece.
  if (selectedSquare) {
    const move = view.legalMoves.find(
      (m) => m.from === selectedSquare && m.to === square && m.to !== m.from,
    );
    if (move) {
      selectedSquare = null;
      send({ type: 'move', from: move.from, to: move.to });
      playSound(soundForOwnJungleFlipMove(view, move));
      return;
    }
  }
  selectedSquare = null;
}

// ── Move list (positions are public, so every move shows) ─────────────────────

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is JungleFlipMoveEvent =>
    isJungleFlipMoveEvent(event),
  );
  const totalPly = replay.latestPly();
  liveRefs.moveList.replaceChildren();
  if (totalPly === 0) {
    const item = document.createElement('li');
    item.className = 'move-row';
    item.textContent = 'No moves yet';
    liveRefs.moveList.append(item);
    return;
  }
  const activePly = replay.activePly();
  for (const row of visibleMoveRows(moves, totalPly)) {
    const item = document.createElement('li');
    item.className = 'move-row xiangqi-move-row';
    const number = document.createElement('span');
    number.className = 'xiangqi-move-row__number';
    number.textContent = `${row.fullMove}.`;
    const red = document.createElement('span');
    red.className = ['xiangqi-move-row__move', activePly === row.fullMove * 2 - 1 ? 'active' : '']
      .filter(Boolean)
      .join(' ');
    red.textContent = row.red ?? '...';
    const black = document.createElement('span');
    const blackPly = row.fullMove * 2;
    black.className = ['xiangqi-move-row__move', activePly === blackPly ? 'active' : '']
      .filter(Boolean)
      .join(' ');
    black.textContent = blackPly <= totalPly ? (row.black ?? '...') : '';
    item.append(number, red, black);
    liveRefs.moveList.append(item);
  }
  syncMoveListScroll(liveRefs.moveList, { live: replay.isLive(), plyCount: replay.latestPly() });
}

function visibleMoveRows(
  moves: readonly JungleFlipMoveEvent[],
  plyCount: number,
): JungleFlipVisibleMoveRow[] {
  const rows = new Map<number, JungleFlipVisibleMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    // A flip (self-move) shows as the flipped square; a board move as from-to.
    row[event.color] =
      event.move.from === event.move.to
        ? `${event.move.from}↑`
        : `${event.move.from}-${event.move.to}`;
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

function eventPly(event: JungleFlipMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

// ── Replay capture ────────────────────────────────────────────────────────────

function captureReplayView(view: JungleFlipWireView | null): void {
  if (!view || view === lastCapturedView) return;
  const key = JSON.stringify({
    board: view.board,
    lastMove: view.lastMove ?? null,
    status: view.status,
    ply: view.ply,
    firstColor: view.firstColor,
  });
  if (key === lastCapturedKey) {
    lastCapturedView = view;
    return;
  }
  replay.push({ ply: view.ply, view });
  lastCapturedView = view;
  lastCapturedKey = key;
}

function isJungleFlipMoveEvent(event: JungleFlipWireEvent): event is JungleFlipMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isJungleFlipSeat((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}
