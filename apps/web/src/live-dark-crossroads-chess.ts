// Live multiplayer room client for hidden/dev-only Dark Crossroads Chess (6x8)
// — the FOG sibling of the perfect-information Crossroads Chess client, now a
// tenant on the generic live-client core (variant-tenant/live-client.ts owns
// bootstrap, frame application, renderAll, the replay CAPTURE controller, and
// the masked two-column move list). It reuses the already-fog-aware crossroads
// board renderer (crossroads-chess-render.ts) but follows the Dark Xiangqi FOG
// model, NOT the open crossroads client's perfect-info model:
//   * the fog-safe replay CAPTURE policy — it replays only the per-seat fog
//     snapshots the client actually received. It deliberately does NOT adopt
//     the core's replayHistory rebuild: the server strips opponent moves from
//     this seat's event log (golden-pinned), so per-ply views CANNOT be
//     rebuilt client-side, and doing so server-side would widen the payload
//     with hidden information. After a reconnect the replay holds only the
//     latest fog view; full postgame replay lives on the revealing
//     /game/:id review page, never in /room/.
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
import {
  createTenantLiveClient,
  type TenantLiveClient,
  type TenantLiveClientConfig,
  type TenantLiveClientContext,
  type TenantLiveEvent,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

type DarkCrossroadsMoveEvent = TenantMovePlayed<CrossroadsChessColor, CrossroadsChessMove>;

// ── Dark-Crossroads-owned interaction/render state ───────────────────────────

let core: TenantLiveClientContext<CrossroadsChessColor, CrossroadsChessPlayerView> | null = null;
// Right-click arrows/circles the player drew on this board.
let annotations: BoardAnnotations | null = null;
let selected: CrossroadsChessSquare | null = null;
// The square a piece is being dragged from (its piece is lifted off the board so
// only the floating ghost shows). Null when not dragging.
let draggingFrom: CrossroadsChessSquare | null = null;

// ── Shared tenant room chrome config ─────────────────────────────────────────

const darkCrossroadsChessWebTenant: WebVariantTenant<CrossroadsChessColor> = {
  displayName: 'Dark Crossroads Chess',
  metaMarkerId: 'dark-crossroads',
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

type DarkCrossroadsLiveClientConfig = TenantLiveClientConfig<
  CrossroadsChessColor,
  CrossroadsChessPlayerView,
  CrossroadsChessMove
>;

function createDarkCrossroadsChessLiveClient(
  socketFactory?: DarkCrossroadsLiveClientConfig['socketFactory'],
): TenantLiveClient<CrossroadsChessColor, CrossroadsChessPlayerView> {
  return createTenantLiveClient<
    CrossroadsChessColor,
    CrossroadsChessPlayerView,
    CrossroadsChessMove
  >({
    tenant: darkCrossroadsChessWebTenant,
    gameSpecId: 'dark-crossroads-chess',
    // Reuse the crossroads board layout sizing — the fog variant renders the
    // same 6x8 board.
    layoutGameSpecId: 'crossroads-chess',
    defaultRoomId: 'ddchess_dev',
    boardClass: 'crossroads-live-board',
    playAgainRequestBody: (state) => ({
      mode: 'pvp',
      gameSpecId: 'dark-crossroads-chess',
      preferredColor: 'random',
      ...(state.timeControl ? { timeControl: state.timeControl } : {}),
    }),
    // Not on the Dark Crossroads wire (golden-pinned, no snapshot extras): the
    // forfeit banner and rematch block never arm — chrome defaults cover it.
    onSnapshotApplied: () => {
      if (core) maybePlayCrossroadsChessSnapshotSound(core.state.view, core.state.seat);
    },
    onEventApplied: () => {
      if (core) maybePlayCrossroadsChessSnapshotSound(core.state.view, core.state.seat);
    },
    resetSounds: resetCrossroadsChessSoundState,
    resetState: () => {
      selected = null;
      draggingFrom = null;
    },
    renderBoard,
    onDisabled: () => {
      selected = null;
    },
    setup: (ctx) => {
      core = ctx;
      setBoardFamily('chess');
      installBoardInteraction(ctx.refs);
      // Repaint when the viewer changes their chess appearance in settings.
      window.addEventListener(boardAppearanceChangedEvent, ctx.renderAll);
      installSelectionClickAway({
        roots: () => [core?.refs.board],
        hasSelection: () => selected !== null,
        clearSelection: () => {
          selected = null;
          draggingFrom = null;
          if (core) renderBoard(core.refs, core.displayedView());
        },
      });
    },
    moveList: {
      rowClass: 'ddchess-move-row',
      cellPrefix: 'ddchess-move-row',
      // Fog: opponent plies are redacted off the wire; the standard masked
      // list renders them as dimmed placeholders and trims to the scrubbed ply.
      masked: true,
      notate: (move) => `${move.from}${move.to}`,
      isMoveEvent: isDarkCrossroadsMoveEvent,
      banner: moveListBanner,
    },
    // ── Fog-safe replay capture ──────────────────────────────────────────────
    // Each distinct fog snapshot the client receives is pushed to the replay
    // controller keyed by its derived ply. The client only ever holds its OWN
    // fog views, so scrubbing can never surface the opponent's hidden state.
    // NO replayHistory config here — see the module header.
    replayCapture: {
      positionKey: replayPositionKey,
      plyForView: (view, ctx) => replayPlyForView(view, ctx.positionChanged, ctx.latestPly),
    },
    ...(socketFactory ? { socketFactory } : {}),
  });
}

const client = createDarkCrossroadsChessLiveClient();

export function bootstrapDarkCrossroadsChessLiveRoom(): void {
  client.bootstrap();
}

/** Test seam: a fresh client wired to a fake socket (shares module UI state). */
export function createDarkCrossroadsChessLiveClientForTest(
  socketFactory: DarkCrossroadsLiveClientConfig['socketFactory'],
): TenantLiveClient<CrossroadsChessColor, CrossroadsChessPlayerView> {
  return createDarkCrossroadsChessLiveClient(socketFactory);
}

// ── Move-list banner ─────────────────────────────────────────────────────────

// The pending-Try banner: shown only to the racer (the server redacts
// pendingTry from the opponent). Their King reached the far rank and the game
// is one reply from resolving — Race win unless the opponent captures it.
// With no banner and no visible plies yet, a dimmed placeholder row keeps the
// list from looking broken under fog.
function moveListBanner(): { className: string; text: string } | null {
  const view = core?.state.view;
  if (view && view.pendingTry === core?.state.seat) {
    return {
      className: 'ddchess-try-banner',
      text: 'Try pending: your King reached the far rank. You win unless the opponent captures it on their reply.',
    };
  }
  if (view && (core?.replay.visiblePlyCount() ?? 0) === 0) {
    return { className: 'ddchess-move-row ddchess-move-placeholder', text: 'No visible moves yet' };
  }
  return null;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderBoard(liveRefs: LiveRefs, view: CrossroadsChessPlayerView | null): void {
  liveRefs.board.className = 'board crossroads-live-board';
  liveRefs.board.setAttribute('aria-label', 'Dark Crossroads Chess board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  const perspective = core?.orientation() ?? view.perspective;
  // Interaction (selection/targets/hit layer) only on the live position on your
  // own turn; replay positions and the opponent's turn are read-only.
  const interactive = (core?.replay.isLive() ?? false) && iAmPlayer() && isMyTurn(view);
  const shownSelected = interactive ? selected : null;
  const targets = shownSelected ? legalTargets(view, shownSelected) : [];
  const drawn = drawnBoardOverlays<CrossroadsChessSquare>(annotations?.shapes() ?? []);
  liveRefs.board.innerHTML = renderCrossroadsChessBoardSvg(view, {
    arrows: drawn.arrows,
    markers: drawn.markers,
    perspective,
    showFog: true,
    selected: shownSelected,
    targets,
    // The lifted source is omitted only on the interactive live position; replay
    // and the opponent's turn never drag, so draggingFrom is always null there.
    draggingFrom: interactive ? draggingFrom : null,
    interactive,
    ...readCrossroadsChessAppearance(),
  });
}

// ── Interaction ──────────────────────────────────────────────────────────────

// Click + drag, delegated to the persistent board container once at mount so they
// survive every innerHTML re-render. Click is the existing select/move; drag
// lifts an own visible piece and drops it on a legal target. A tap that never
// crosses the movement threshold falls through to the click handler.
function installBoardInteraction(liveRefs: LiveRefs): void {
  annotations = installBoardAnnotations({
    board: liveRefs.board,
    gameId: () => annotationOwner(core?.state.view),
    repaint: () => {
      if (core?.state.view) renderBoard(liveRefs, core.state.view);
    },
  });
  installBoardDrag({
    board: liveRefs.board,
    ghostSizePx: CROSSROADS_CHESS_BOARD_PX,
    onSquareClick: (square) => handleSquareClick(square as CrossroadsChessSquare),
    canDragFrom: (square) => canDragCrossroadsPiece(square as CrossroadsChessSquare),
    ghostHtml: (square) => crossroadsGhostHtml(square as CrossroadsChessSquare),
    onDragStart: (from) => {
      selected = from as CrossroadsChessSquare;
      draggingFrom = from as CrossroadsChessSquare;
      rerenderBoard();
    },
    onDrop: (from, to) =>
      dropCrossroadsPiece(from as CrossroadsChessSquare, to as CrossroadsChessSquare | null),
  });
}

function rerenderBoard(): void {
  if (core?.state.view) renderBoard(core.refs, core.displayedView());
}

function handleSquareClick(square: CrossroadsChessSquare): void {
  const view = core?.state.view;
  if (!view) return;
  if (!core?.replay.isLive()) return;
  if (!iAmPlayer() || !isMyTurn(view)) return;

  if (selected === null) {
    if (legalTargets(view, square).length === 0) return;
    selected = square;
    rerenderBoard();
    return;
  }
  if (square === selected) {
    selected = null;
    rerenderBoard();
    return;
  }
  const targets = legalTargets(view, selected);
  if (targets.includes(square)) {
    sendCrossroadsMove(view, selected, square);
    selected = null;
    rerenderBoard();
    return;
  }
  // Clicked elsewhere: reselect if the new square has moves, else clear.
  selected = legalTargets(view, square).length > 0 ? square : null;
  rerenderBoard();
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
  if (core?.send({ type: 'move', ...move })) {
    playSound(soundForOwnCrossroadsChessMove(view, move));
  }
}

// An own VISIBLE piece on your turn. Shrouded enemy silhouettes carry no
// identity and are never draggable. Any of your visible pieces can be lifted —
// it snaps back if dropped somewhere it cannot move.
function canDragCrossroadsPiece(square: CrossroadsChessSquare): boolean {
  const view = core?.state.view;
  if (!view || !core?.replay.isLive() || core.connection() !== 'connected') return false;
  if (!iAmPlayer() || !isMyTurn(view)) return false;
  const entry = view.board[square];
  if (!entry || entry.shrouded) return false;
  return entry.piece.color === core.state.seat;
}

function crossroadsGhostHtml(square: CrossroadsChessSquare): string | null {
  const entry = core?.state.view?.board[square];
  if (!entry || entry.shrouded) return null;
  return crossroadsChessPieceGhostSvg(entry.piece, readCrossroadsChessAppearance());
}

function dropCrossroadsPiece(from: CrossroadsChessSquare, to: CrossroadsChessSquare | null): void {
  draggingFrom = null;
  const view = core?.state.view;
  const targets = view ? legalTargets(view, from) : [];
  if (view && to && targets.includes(to)) {
    sendCrossroadsMove(view, from, to);
  }
  selected = null;
  rerenderBoard();
}

function legalTargets(
  view: CrossroadsChessPlayerView,
  from: CrossroadsChessSquare,
): CrossroadsChessSquare[] {
  return view.legalMoves.filter((move) => move.from === from).map((move) => move.to);
}

function iAmPlayer(): boolean {
  return isCrossroadsChessColor(core?.state.seat);
}

function isMyTurn(view: CrossroadsChessPlayerView): boolean {
  return view.status.type === 'playing' && view.status.turn === core?.state.seat;
}

// ── Fog replay capture policy ────────────────────────────────────────────────

function replayPlyForView(
  view: CrossroadsChessPlayerView,
  positionChanged: boolean,
  latestPly: number,
): number {
  if (view.status.type === 'playing') {
    // White moves first; moveNumber increments after Red completes a full move.
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'red' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return latestPly + 1;
  return latestPly;
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

function isDarkCrossroadsMoveEvent(event: TenantLiveEvent): event is DarkCrossroadsMoveEvent {
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

function isCrossroadsChessColor(value: unknown): value is CrossroadsChessColor {
  return value === 'white' || value === 'red';
}
