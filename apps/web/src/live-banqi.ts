// Live multiplayer room client for banqi (半棋 / Chinese Dark Chess) — a
// SYMMETRIC-information tenant on the generic live-client core
// (variant-tenant/live-client.ts owns bootstrap, frame application, the
// renderAll skeleton, replay capture, and the two-column move list).
//
// Banqi positions are fully PUBLIC and a face-down tile carries NO colour or
// identity to anyone (the deal is the only hidden state, hidden from both seats
// equally). So this client carries NO fog: no fog mask, no visibleSquares, no
// opponent-move stripping, and the move list is unmasked. It renders the masked
// BanqiPlayerView the server sends; there is NO hidden-info logic client-side.
//
// This module keeps what is genuinely banqi's: the wire view type, board
// rendering (face-down tile-backs vs revealed pieces), click-to-flip / drag
// interaction (live-banqi-interaction.ts), the captured-pool panel, sounds, and
// the flip-aware move notation. Seats are first/second mover and the ink is
// bound by the opening flip — so player labels come from tenant.seatLabel and
// the captured pool groups by bound ink, not by seat name.

import type {
  BanqiColor,
  BanqiGameStatus,
  BanqiMove,
  BanqiPieceRole,
  BanqiSeat,
  BanqiSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import { banqiEnabled } from './feature-flags.js';
import { banqiClickResult } from './live-banqi-interaction.js';
import {
  BANQI_PIECE_PX,
  banqiPieceGhostSvg,
  installBanqiBoardStyles,
  renderBanqiBoardSvg,
} from './live-banqi-render.js';
import {
  maybePlayBanqiSnapshotSound,
  resetBanqiSoundState,
  soundForOwnBanqiMove,
} from './live-banqi-sound.js';
import { playSound } from './live-sound.js';
import type { LiveRefs } from './live-state.js';
import { xiangqiAppearanceChangedEvent } from './theme.js';
import {
  annotationOwner,
  type BoardAnnotations,
  drawnBoardOverlays,
  installBoardAnnotations,
} from './variant-tenant/board-annotations.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import {
  createTenantLiveClient,
  type TenantLiveClientContext,
  type TenantLiveEvent,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

// ── Wire shapes (mirror BanqiPlayerView; board entries are faceDown-tagged) ──

type BanqiWireBoardEntry =
  | { color: BanqiColor; role: BanqiPieceRole; faceDown: false }
  | { faceDown: true };

type BanqiWireCaptured = { owner: BanqiColor; role: BanqiPieceRole };

export type BanqiWireView = {
  id: string;
  perspective: BanqiSeat;
  board: Partial<Record<BanqiSquare, BanqiWireBoardEntry>>;
  legalMoves: BanqiMove[];
  captured: BanqiWireCaptured[];
  status: BanqiGameStatus;
  ply: number;
  firstColor: BanqiColor | null;
  moveNumber: number;
  lastMove?: BanqiMove;
};

type BanqiMoveEvent = TenantMovePlayed<BanqiSeat, BanqiMove>;

// ── Banqi-owned interaction/render state ─────────────────────────────────────

let core: TenantLiveClientContext<BanqiSeat, BanqiWireView> | null = null;
let selectedSquare: BanqiSquare | null = null;
// Right-click arrows/circles the player drew on this board.
let annotations: BoardAnnotations | null = null;
// The square a piece is being dragged from (its piece is lifted off the board so
// only the floating ghost shows). Null when not dragging.
let draggingFrom: BanqiSquare | null = null;
// Snapshot extras that ride the frame (read by the chrome + play-again body).
let roomMode: 'pve' | 'pvp' = 'pvp';
let pveEngineId: string | null = null;

// Banqi seats are first/second mover ('red' seat = first); the actual ink is bound by the
// opening flip (view.firstColor). The first-mover seat plays firstColor; the second-mover
// seat plays the opposite. Null until the flip binds.
export function banqiSeatInk(seat: BanqiSeat, view: BanqiWireView | null): BanqiColor | null {
  if (!view || view.firstColor === null) return null;
  return seat === 'red' ? view.firstColor : view.firstColor === 'red' ? 'black' : 'red';
}

// A seat's player label. Banqi's seat names are NOT colors, so labeling by seat shows the
// engine as "Red" even when it flipped black. Label by the bound ink once the flip
// assigns it, else by move order ("First"/"Second") — colors do not exist pre-flip.
function banqiSeatLabel(seat: BanqiSeat): string {
  const ink = banqiLiveSeatInk(seat);
  if (ink) return ink === 'red' ? 'Red' : 'Black';
  return seat === 'red' ? 'First' : 'Second';
}

// The ink for the CURRENT live view — what the meta card's player disc renders.
function banqiLiveSeatInk(seat: BanqiSeat): BanqiColor | null {
  return banqiSeatInk(seat, core?.state.view ?? null);
}

const banqiWebTenant: WebVariantTenant<BanqiSeat> = {
  displayName: 'Banqi',
  metaMarkerId: 'banqi',
  metaGlyph: '象',
  colors: ['red', 'black'],
  isColor: isBanqiSeat,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: banqiEnabled,
  reviewUrl: (roomId) => `/banqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: banqiReasonPhrase,
  disabledTitle: 'Banqi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Banqi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction: 'Tap a face-down tile to flip it, or select one of your pieces to move.',
  // Banqi colors are assigned by the opening flip; label players by ink (or move order
  // before the flip), and surface the opening "to move" before the clock arms.
  seatLabel: banqiSeatLabel,
  seatInk: banqiLiveSeatInk,
  showPregameTurn: true,
};

const client = createTenantLiveClient<BanqiSeat, BanqiWireView, BanqiMove>({
  tenant: banqiWebTenant,
  gameSpecId: 'banqi',
  defaultRoomId: 'bq_dev',
  boardClass: 'banqi-live-board',
  chrome: {
    roomMode: () => roomMode,
  },
  playAgainRequestBody: (state) => ({
    mode: roomMode,
    gameSpecId: 'banqi',
    // Swap who opens each rematch: the 'red' seat moves first, so request the seat opposite
    // this game's to alternate the opener (you and the engine take turns going first).
    preferredColor: isBanqiSeat(state.seat) ? (state.seat === 'red' ? 'black' : 'red') : 'random',
    ...(roomMode === 'pve' && pveEngineId ? { engineId: pveEngineId } : {}),
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  onFrame: (frame) => {
    if (frame.roomMode === 'pve' || frame.roomMode === 'pvp') roomMode = frame.roomMode;
    if (typeof frame.pveEngineId === 'string') pveEngineId = frame.pveEngineId;
  },
  onSnapshotApplied: () => {
    if (core) maybePlayBanqiSnapshotSound(core.state.view, core.state.seat);
  },
  onEventApplied: () => {
    if (core) maybePlayBanqiSnapshotSound(core.state.view, core.state.seat);
  },
  resetSounds: resetBanqiSoundState,
  resetState: () => {
    selectedSquare = null;
    draggingFrom = null;
    roomMode = 'pvp';
    pveEngineId = null;
  },
  renderBoard,
  renderExtras: (refs, view) => renderCapturedPools(refs, view),
  onDisabled: (refs) => {
    // renderCapturedPools ran before the enabled guard in the original, so it
    // paints even when the flag is off; then the selection clears.
    renderCapturedPools(refs, core?.displayedView() ?? null);
    selectedSquare = null;
  },
  setup: (ctx) => {
    core = ctx;
    installBanqiBoardStyles();
    installBanqiBoardInteraction(ctx.refs);
    // Repaint when the viewer changes their xiangqi piece set in settings — the
    // board and captured pool both render from the stored set, so a live game
    // must hot-reload it (mirrors the chess family's boardAppearanceChangedEvent
    // hook). Without this the room keeps the piece set it mounted with.
    window.addEventListener(xiangqiAppearanceChangedEvent, ctx.renderAll);
    installSelectionClickAway({
      roots: () => [core?.refs.board],
      hasSelection: () => selectedSquare !== null,
      clearSelection: () => {
        selectedSquare = null;
        draggingFrom = null;
        if (core) renderBoard(core.refs, core.displayedView());
      },
    });
  },
  moveList: {
    rowClass: 'move-row xiangqi-move-row',
    cellPrefix: 'xiangqi-move-row',
    listClass: 'xiangqi-move-list',
    masked: false,
    // A flip (self-move) shows as the flipped square; a board move as from-to.
    // The notation is per-move (never per-seat), so it rides the standard
    // two-column move list keyed by seat.
    notate: banqiMoveLabel,
    isMoveEvent: isBanqiMoveEvent,
  },
  replayCapture: {
    positionKey: replayPositionKey,
    plyForView: (view, ctx) => replayPlyForView(view, ctx.positionChanged, ctx.latestPly),
  },
});

export function bootstrapBanqiLiveRoom(): void {
  client.bootstrap();
}

function banqiReasonPhrase(reason: string): string {
  switch (reason) {
    case 'stalemate':
      return 'no legal move';
    case 'no-progress':
      return 'no progress';
    case 'repetition':
      return 'repetition';
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

// ── Rendering ────────────────────────────────────────────────────────────────

function renderBoard(liveRefs: LiveRefs, view: BanqiWireView | null): void {
  liveRefs.board.className = 'board banqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Banqi board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }

  const perspective = orientationFor(view);
  const drawn = drawnBoardOverlays<BanqiSquare>(annotations?.shapes() ?? []);
  liveRefs.board.innerHTML = renderBanqiBoardSvg(view, perspective, {
    arrows: drawn.arrows,
    markers: drawn.markers,
    interactive: true,
    selectedSquare,
    draggingFrom,
    // A face-down tile is clicked directly to flip, so the renderer wants only
    // the selected piece's board moves (it already excludes self-move flips).
    legalMoves: selectedSquare
      ? view.legalMoves.filter((move) => move.from === selectedSquare && move.to !== move.from)
      : [],
  });
  // Click + drag are delegated to the persistent board container once at mount
  // (installBanqiBoardInteraction), so they survive these innerHTML re-renders.
}

function handleSquareClick(view: BanqiWireView, square: BanqiSquare): void {
  if (!core?.replay.isLive() || core.connection() !== 'connected') return;
  const result = banqiClickResult(view, core.state.seat, selectedSquare, square);
  if (result.kind === 'noop') return;
  if (result.kind === 'select') {
    selectedSquare = result.square;
    return;
  }
  if (result.kind === 'clear') {
    selectedSquare = null;
    return;
  }
  selectedSquare = null;
  if (core.send({ type: 'move', from: result.move.from, to: result.move.to })) {
    playSound(soundForOwnBanqiMove(view, result.move));
  }
}

// Click + drag, delegated to the persistent board container once at mount so they
// survive every innerHTML re-render. Click is the existing flip/select/move; drag
// lifts a revealed piece and drops it on a legal target. A tap that never crosses
// the movement threshold falls through to the click handler.
function installBanqiBoardInteraction(liveRefs: LiveRefs): void {
  annotations = installBoardAnnotations({
    board: liveRefs.board,
    gameId: () => annotationOwner(core?.state.view),
    repaint: () => {
      if (core?.state.view) renderBoard(liveRefs, core.state.view);
    },
  });
  installBoardDrag({
    board: liveRefs.board,
    ghostSizePx: BANQI_PIECE_PX,
    onSquareClick: (square) => {
      const view = core?.state.view;
      if (!view) return;
      handleSquareClick(view, square as BanqiSquare);
      renderBoard(liveRefs, view);
    },
    canDragFrom: (square) => canDragBanqiPiece(square as BanqiSquare),
    ghostHtml: (square) => {
      const entry = core?.state.view?.board[square as BanqiSquare];
      if (!entry || entry.faceDown) return null;
      return banqiPieceGhostSvg({ color: entry.color, role: entry.role });
    },
    onDragStart: (from) => {
      selectedSquare = from as BanqiSquare;
      draggingFrom = from as BanqiSquare;
      if (core?.state.view) renderBoard(liveRefs, core.state.view);
    },
    onDrop: (from, to) => dropBanqiPiece(liveRefs, from as BanqiSquare, to as BanqiSquare | null),
  });
}

// A revealed own piece with a board move can be dragged; face-down tiles stay
// click-only (a flip is a self-move, not a drag to another square).
function canDragBanqiPiece(square: BanqiSquare): boolean {
  const view = core?.state.view;
  if (!view || !core?.replay.isLive() || core.connection() !== 'connected') return false;
  if (!isBanqiSeat(core.state.seat)) return false;
  if (view.status.type !== 'playing' || view.status.turn !== core.state.seat) return false;
  const entry = view.board[square];
  if (!entry || entry.faceDown) return false;
  // Any of your face-up pieces can be lifted on your turn (it snaps back if you
  // drop it somewhere it cannot move), not just ones with a legal move right now.
  return entry.color === banqiSeatInk(core.state.seat, view);
}

function dropBanqiPiece(liveRefs: LiveRefs, from: BanqiSquare, to: BanqiSquare | null): void {
  draggingFrom = null;
  const view = core?.state.view;
  const move =
    to && view
      ? view.legalMoves.find((m) => m.from === from && m.to === to && m.to !== m.from)
      : undefined;
  if (move && view && core) {
    selectedSquare = null;
    if (core.send({ type: 'move', from: move.from, to: move.to })) {
      playSound(soundForOwnBanqiMove(view, move));
    }
  } else {
    selectedSquare = null;
  }
  if (core?.state.view) renderBoard(liveRefs, core.state.view);
}

// ── Captured pool ─────────────────────────────────────────────────────────────

// Lichess convention: a player's captured material sits next to that player.
// The bottom strip is the viewer's side, so it shows the pieces the viewer has
// captured (the opponent's lost pieces); the top strip is the opponent's side,
// so it shows the pieces the opponent has captured (the viewer's lost pieces).
// fillCapturedPool filters by former owner, so top filters the viewer's ink and
// bottom filters the opponent's ink. Captures are always REVEALED in banqi
// (adjacency and cannon both require a revealed target), so every captured piece
// has a known identity — there is no "?" case. Reuses the existing
// .captures-strip / .mini-xq-capture-piece styling (no new CSS).
function renderCapturedPools(liveRefs: LiveRefs, view: BanqiWireView | null): void {
  liveRefs.capturesTop.replaceChildren();
  liveRefs.capturesBottom.replaceChildren();
  if (!view) return;
  const viewerInk = viewerInkFor(view);
  if (viewerInk === null) return; // no ink bound yet → nothing captured
  const opponentInk = viewerInk === 'red' ? 'black' : 'red';
  fillCapturedPool(liveRefs.capturesTop, view.captured, viewerInk);
  fillCapturedPool(liveRefs.capturesBottom, view.captured, opponentInk);
}

// The viewer's INK (glyph colour), once the first flip binds it. Falls back to
// the seated viewer's ink via firstColor; spectators and pre-binding return null.
function viewerInkFor(view: BanqiWireView): BanqiColor | null {
  if (view.firstColor === null) return null;
  const seat = orientationFor(view);
  return seat === 'red' ? view.firstColor : view.firstColor === 'red' ? 'black' : 'red';
}

// Exported for unit testing the captured-pool data path without a live socket —
// same extraction rationale as live-banqi-render / live-banqi-interaction.
export function fillCapturedPool(
  host: HTMLElement,
  captured: readonly BanqiWireCaptured[],
  owner: BanqiColor,
): void {
  const mine = captured.filter((entry) => entry.owner === owner);
  host.classList.toggle('has-captures', mine.length > 0);
  if (mine.length === 0) return;
  // Group repeats of the same role into one glyph + a count badge so a full pool
  // (banqi tops out at 16 captures per side) stays inside the board width instead
  // of overflowing the fixed-height strip. Keep first-capture order (no ladder
  // sort) so the row reads as material taken over time.
  const order: BanqiPieceRole[] = [];
  const counts = new Map<BanqiPieceRole, number>();
  for (const entry of mine) {
    if (!counts.has(entry.role)) order.push(entry.role);
    counts.set(entry.role, (counts.get(entry.role) ?? 0) + 1);
  }
  const pieceSet = readStoredXiangqiPieceSet();
  const row = document.createElement('div');
  row.className = 'captures-row mini-xq-captures-row';
  for (const role of order) {
    const count = counts.get(role) ?? 1;
    const span = document.createElement('span');
    span.className = count > 1 ? 'mini-xq-capture-piece has-count' : 'mini-xq-capture-piece';
    span.setAttribute('aria-label', count > 1 ? `${owner} ${role} x${count}` : `${owner} ${role}`);
    span.innerHTML = renderXiangqiPieceGlyphed({ color: owner, role }, pieceSet, {
      ariaLabel: `${owner} ${role}`,
    });
    if (count > 1) {
      const badge = document.createElement('span');
      badge.className = 'captures-count-badge';
      badge.textContent = String(count);
      badge.setAttribute('aria-hidden', 'true');
      span.append(badge);
    }
    row.append(span);
  }
  host.append(row);
}

// ── Replay capture (no fog to redact; capture every distinct position) ────────

// Banqi's view carries its own ply count, so the live ply is just view.ply while
// playing; a finished frame appends a final ply only when the position changed.
function replayPlyForView(
  view: BanqiWireView,
  positionChanged: boolean,
  latestPly: number,
): number {
  if (view.status.type === 'playing') return view.ply;
  if (positionChanged && view.lastMove) return latestPly + 1;
  return latestPly;
}

function replayPositionKey(view: BanqiWireView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, entry]) =>
      entry.faceDown ? [square, true] : [square, entry.color, entry.role, false],
    );
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    ply: view.ply,
    perspective: view.perspective,
    firstColor: view.firstColor,
    captured: view.captured,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// A flip (self-move) is shown as the flipped square; a board move as from-to.
function banqiMoveLabel(move: BanqiMove): string {
  return move.from === move.to ? `${move.from}↑` : `${move.from}-${move.to}`;
}

function isBanqiMoveEvent(event: TenantLiveEvent): event is BanqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isBanqiSeat((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function orientationFor(view: BanqiWireView | null): BanqiSeat {
  const seat = core?.state.seat;
  if (isBanqiSeat(seat)) return seat;
  return view?.perspective ?? 'red';
}

function isBanqiSeat(value: unknown): value is BanqiSeat {
  return value === 'red' || value === 'black';
}
