// Live multiplayer room client for Flip Jungle (兽棋 / 翻翻棋) — a SYMMETRIC-information
// tenant on the generic live-client core (variant-tenant/live-client.ts owns
// bootstrap, frame application, the renderAll skeleton, replay capture, and the
// two-column move list). Modeled on live-banqi.ts (symmetric hidden identity,
// flip-or-move).
//
// Symmetric information: the server sends the IDENTICAL masked board to both seats (a
// face-down tile carries no ink/identity; the only hidden state is the deal). Seat is
// the move order ('red' = first); the ink binds on the opening flip (view.firstColor).
// So this client carries NO fog and the move list is unmasked.
//
// This module keeps what is genuinely Flip Jungle's: the wire view type, board
// rendering (jungle-flip-render.ts), tap-to-flip / select-and-move interaction, the
// flip-aware move notation, and sounds. Seats are first/second mover and the ink is
// bound by the opening flip, so player labels come from tenant.seatLabel.

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
import { playSound } from './live-sound.js';
import type { LiveRefs } from './live-state.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import {
  createTenantLiveClient,
  type TenantLiveClientContext,
  type TenantLiveEvent,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

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

type JungleFlipMoveEvent = TenantMovePlayed<JungleFlipSeat, JungleFlipMove>;

// ── Flip-Jungle-owned interaction/render state ────────────────────────────────

let core: TenantLiveClientContext<JungleFlipSeat, JungleFlipWireView> | null = null;
let selectedSquare: JungleFlipSquare | null = null;
// The square a piece is being dragged from (its piece is lifted off the board so
// only the floating ghost shows). Null when not dragging.
let draggingFrom: JungleFlipSquare | null = null;
// Snapshot extra that rides the frame (read by the chrome + play-again body).
let roomMode: 'pve' | 'pvp' = 'pvp';

function isJungleFlipSeat(value: unknown): value is JungleFlipSeat {
  return value === 'red' || value === 'black';
}

// The ink a seat owns, once the opening flip binds it (null before). The 'red' seat plays
// firstColor; the 'black' seat plays the opposite.
function jungleFlipSeatInk(
  seat: JungleFlipSeat,
  view: JungleFlipWireView | null,
): JungleFlipColor | null {
  if (!view || view.firstColor === null) return null;
  return seat === 'red' ? view.firstColor : view.firstColor === 'red' ? 'black' : 'red';
}

// A seat's player label. Flip Jungle's seat names are NOT colors, so label by the bound ink
// once the flip assigns it, else by move order ("First"/"Second").
function jungleFlipSeatLabel(seat: JungleFlipSeat): string {
  const ink = jungleFlipSeatInk(seat, core?.state.view ?? null);
  if (ink) return ink === 'red' ? 'Red' : 'Black';
  return seat === 'red' ? 'First' : 'Second';
}

const jungleFlipWebTenant: WebVariantTenant<JungleFlipSeat> = {
  displayName: 'Flip Jungle',
  metaGlyph: '虎',
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

const client = createTenantLiveClient<JungleFlipSeat, JungleFlipWireView, JungleFlipMove>({
  tenant: jungleFlipWebTenant,
  gameSpecId: 'jungle-flip',
  defaultRoomId: 'jgf_dev',
  boardClass: 'jungle-flip-live-board',
  chrome: {
    roomMode: () => roomMode,
  },
  playAgainRequestBody: (state) => ({
    mode: roomMode,
    gameSpecId: 'jungle-flip',
    // The 'red' seat moves first; request the opposite seat to alternate the opener.
    preferredColor: isJungleFlipSeat(state.seat)
      ? state.seat === 'red'
        ? 'black'
        : 'red'
      : 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  onFrame: (frame) => {
    if (frame.roomMode === 'pve' || frame.roomMode === 'pvp') roomMode = frame.roomMode;
  },
  onSnapshotApplied: () => {
    if (core) maybePlayJungleFlipSnapshotSound(core.state.view, core.state.seat);
  },
  onEventApplied: () => {
    if (core) maybePlayJungleFlipSnapshotSound(core.state.view, core.state.seat);
  },
  resetSounds: resetJungleFlipSoundState,
  resetState: () => {
    selectedSquare = null;
    draggingFrom = null;
    roomMode = 'pvp';
  },
  renderBoard,
  onDisabled: () => {
    selectedSquare = null;
  },
  setup: (ctx) => {
    core = ctx;
    installJungleFlipBoardInteraction(ctx.refs);
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
    notate: jungleFlipMoveLabel,
    isMoveEvent: isJungleFlipMoveEvent,
  },
  replayCapture: {
    positionKey: (view) =>
      JSON.stringify({
        board: view.board,
        lastMove: view.lastMove ?? null,
        status: view.status,
        ply: view.ply,
        firstColor: view.firstColor,
      }),
    // Flip Jungle's view carries its own ply count; capture every distinct position at it.
    plyForView: (view) => view.ply,
  },
});

export function bootstrapJungleFlipLiveRoom(): void {
  client.bootstrap();
}

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

// ── Rendering ────────────────────────────────────────────────────────────────

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

// ── Interaction ──────────────────────────────────────────────────────────────

// Click + drag, delegated to the persistent board container once at mount so they
// survive every innerHTML re-render.
function installJungleFlipBoardInteraction(liveRefs: LiveRefs): void {
  installBoardDrag({
    board: liveRefs.board,
    // The board scales above its SVG units, so size the ghost to the on-screen cell.
    ghostSizePx: () => {
      const width = liveRefs.board.getBoundingClientRect().width;
      return width > 0 ? width / JUNGLE_FLIP_BOARD_VIEW.files : JUNGLE_FLIP_BOARD_VIEW.cell;
    },
    onSquareClick: (square) => {
      const view = core?.state.view;
      if (!view) return;
      handleSquareClick(view, square as JungleFlipSquare);
      renderBoard(liveRefs, view);
    },
    canDragFrom: (square) => canDragFlipPiece(square as JungleFlipSquare),
    ghostHtml: (square) => {
      const entry = core?.state.view?.board[square as JungleFlipSquare];
      return entry && !entry.faceDown ? jungleFlipPieceGhostSvg(entry) : null;
    },
    onDragStart: (from) => {
      selectedSquare = from as JungleFlipSquare;
      draggingFrom = from as JungleFlipSquare;
      if (core?.state.view) renderBoard(liveRefs, core.state.view);
    },
    onDrop: (from, to) =>
      dropFlipPiece(liveRefs, from as JungleFlipSquare, to as JungleFlipSquare | null),
  });
}

// Only a revealed own animal can be lifted (face-down tiles are clicked to flip, not
// dragged). It snaps back if dropped somewhere it cannot move.
function canDragFlipPiece(square: JungleFlipSquare): boolean {
  if (!core || !core.replay.isLive() || core.connection() !== 'connected') return false;
  const seat = core.state.seat;
  const view = core.state.view;
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
  const view = core?.state.view;
  const move =
    to && view
      ? view.legalMoves.find((m) => m.from === from && m.to === to && m.to !== m.from)
      : undefined;
  if (move && view) {
    selectedSquare = null;
    core?.send({ type: 'move', from: move.from, to: move.to });
    playSound(soundForOwnJungleFlipMove(view, move));
  } else {
    selectedSquare = null;
  }
  if (core?.state.view) renderBoard(liveRefs, core.state.view);
}

function handleSquareClick(view: JungleFlipWireView, square: JungleFlipSquare): void {
  if (!core || !core.replay.isLive() || core.connection() !== 'connected') return;
  const seat = core.state.seat;
  if (!isJungleFlipSeat(seat) || view.status.type !== 'playing' || view.status.turn !== seat) {
    selectedSquare = null;
    return;
  }
  const entry = view.board[square];
  // Flip a face-down tile (the self-move from === to).
  if (entry?.faceDown) {
    selectedSquare = null;
    core.send({ type: 'move', from: square, to: square });
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
      core.send({ type: 'move', from: move.from, to: move.to });
      playSound(soundForOwnJungleFlipMove(view, move));
      return;
    }
  }
  selectedSquare = null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// A flip (self-move) is shown as the flipped square; a board move as from-to.
function jungleFlipMoveLabel(move: JungleFlipMove): string {
  return move.from === move.to ? `${move.from}↑` : `${move.from}-${move.to}`;
}

function isJungleFlipMoveEvent(event: TenantLiveEvent): event is JungleFlipMoveEvent {
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
