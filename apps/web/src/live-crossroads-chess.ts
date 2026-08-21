// Live multiplayer room client for perfect-information Crossroads Chess (中西象棋)
// — an OPEN-INFORMATION tenant on the generic live-client core
// (variant-tenant/live-client.ts owns bootstrap, frame application, the
// renderAll skeleton, replay state, and the replay shell). Migrated onto the
// core (#84) once it grew the two capabilities this client needed:
//   * replayHistory — the full per-ply view list is rebuilt through the OPEN
//     kernel from the event log on mount and after every reconnect, so late
//     joiners and reconnects scrub the entire game (#80);
//   * moveList.render — the Crossroads clickable move list (every move is a
//     ply-jump button) replaces the core's standard two-column list.
// This module keeps what is genuinely Crossroads': the open board rendering,
// click/drag interaction, sounds, lifecycle analytics, rematch block, and the
// PvE play-again request shape.
//
// Wire protocol locked by server-ws-crossroads-chess.test.ts: hello / snapshot
// carry the full open view + events; event-appended is the steady-state delta.
// The server re-validates every move, so the client can be optimistic about
// input.

import {
  applyCrossroadsChessOpenMove,
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessColor,
  type CrossroadsChessMove,
  type CrossroadsChessPlayerView,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessState,
  getCrossroadsChessOpenView,
} from '@mistboard/game';
import './live-crossroads-chess.css';
import {
  classifyTimeControl,
  createGameLifecycleTracker,
  type GameLifecycleStatusType,
  gameSpecAnalyticsPropsForId,
} from './analytics.js';
import {
  CROSSROADS_CHESS_BOARD_PX,
  crossroadsChessPieceGhostSvg,
  readCrossroadsChessAppearance,
  renderCrossroadsChessBoardSvg,
} from './crossroads-chess-render.js';
import { crossroadsChessEnabled } from './feature-flags.js';
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
  type TenantMoveListRenderContext,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

type CrossroadsChessLiveTimeControl = { initialMs: number; incrementMs: number };
type CrossroadsMoveEvent = TenantMovePlayed<CrossroadsChessColor, CrossroadsChessMove>;
type CrossroadsLiveRematch = {
  offers: Partial<Record<CrossroadsChessColor, boolean>>;
  finalizedRoomId: string | null;
};

// ── Crossroads-owned interaction/render state ────────────────────────────────

let core: TenantLiveClientContext<CrossroadsChessColor, CrossroadsChessPlayerView> | null = null;
// Right-click arrows/circles the player drew on this board.
let annotations: BoardAnnotations | null = null;
let selected: CrossroadsChessSquare | null = null;
// The square a piece is being dragged from (its piece is lifted off the board so
// only the floating ghost shows). Null when not dragging.
let draggingFrom: CrossroadsChessSquare | null = null;
// Snapshot extras the tenant wire carries beyond the core frame.
let roomMode: 'pvp' | 'pve' = 'pvp';
let pveEngineId: string | null = null;
let forfeitDeadline: number | null = null;
let rematch: CrossroadsLiveRematch & { declined: boolean } = {
  offers: {},
  finalizedRoomId: null,
  declined: false,
};
let rematchCancelIntent = false;
const lifecycleTracker = createGameLifecycleTracker();

// ── Shared tenant room chrome config ─────────────────────────────────────────

const crossroadsChessWebTenant: WebVariantTenant<CrossroadsChessColor> = {
  displayName: 'Crossroads Chess',
  metaMarkerId: 'crossroads',
  metaGlyph: '♔',
  colors: ['white', 'red'],
  isColor: isCrossroadsChessColor,
  oppositeColor: (color) => (color === 'white' ? 'red' : 'white'),
  enabled: crossroadsChessEnabled,
  reviewUrl: crossroadsChessReviewUrl,
  reasonPhrase: crossroadsChessEndReasonLabel,
  disabledTitle: 'Crossroads Chess disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Crossroads Chess room is not active.',
  spectatorBody: 'Watching the full board.',
  selectInstruction: 'Select one of your pieces, then choose a destination.',
};

type CrossroadsLiveClientConfig = TenantLiveClientConfig<
  CrossroadsChessColor,
  CrossroadsChessPlayerView,
  CrossroadsChessMove
>;

function createCrossroadsChessLiveClient(
  socketFactory?: CrossroadsLiveClientConfig['socketFactory'],
): TenantLiveClient<CrossroadsChessColor, CrossroadsChessPlayerView> {
  return createTenantLiveClient<
    CrossroadsChessColor,
    CrossroadsChessPlayerView,
    CrossroadsChessMove
  >({
    tenant: crossroadsChessWebTenant,
    gameSpecId: CROSSROADS_CHESS_SPEC_ID,
    defaultRoomId: 'dchess_dev',
    boardClass: 'crossroads-live-board',
    chrome: {
      forfeitDeadline: () => forfeitDeadline,
      roomMode: () => roomMode,
      rematchControls: () =>
        isCrossroadsChessColor(core?.state.seat) ? rematchControls(core.state.seat) : null,
      variantDetail: () => crossroadsLiveTimeControlLabel(core?.state.timeControl ?? null),
    },
    playAgainRequestBody: (state) =>
      crossroadsLivePlayAgainRequestBody(state.timeControl, {
        mode: roomMode,
        pveEngineId,
        seat: state.seat,
      }),
    // Every frame kind (hello, snapshot, event) updates the tenant extras and
    // feeds sounds + lifecycle analytics — matching the pre-migration client,
    // which ran both on all three frame paths.
    onFrame: (frame) => {
      if (frame.roomMode === 'pve' || frame.roomMode === 'pvp') roomMode = frame.roomMode;
      if (typeof frame.pveEngineId === 'string') pveEngineId = frame.pveEngineId;
      forfeitDeadline = typeof frame.forfeitDeadline === 'number' ? frame.forfeitDeadline : null;
      const frameRematch = frame.rematch as CrossroadsLiveRematch | undefined;
      if (frameRematch) rematch = { ...frameRematch, declined: rematch.declined };
      if (core) {
        maybePlayCrossroadsChessSnapshotSound(core.state.view, core.state.seat);
        trackCrossroadsChessLifecycle(core.state.view);
      }
    },
    onRematchState: (message) => applyRematchState(message as unknown as CrossroadsLiveRematch),
    resetSounds: resetCrossroadsChessSoundState,
    resetState: () => {
      selected = null;
      draggingFrom = null;
      roomMode = 'pvp';
      pveEngineId = null;
      forfeitDeadline = null;
      rematch = { offers: {}, finalizedRoomId: null, declined: false };
      rematchCancelIntent = false;
      lifecycleTracker.reset();
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
      rowClass: 'move-row',
      cellPrefix: 'move',
      masked: false,
      notate: uci,
      isMoveEvent: isCrossroadsMoveEvent,
      // Crossroads keeps its clickable move list: every move is a ply-jump
      // button (the capability the core grew for #84).
      render: renderCrossroadsMoveList,
    },
    replayCapture: {
      positionKey: replayPositionKey,
      // Ply = number of moves played so far; the initial position is ply 0.
      plyForView: (_view, ctx) => ctx.events.filter(isCrossroadsMoveEvent).length,
    },
    // Perfect information: the event log carries every move unredacted, so the
    // full per-ply history is rebuilt through the OPEN kernel on mount and
    // after every reconnect (#80). Same client-held data, no new server
    // payload.
    replayHistory: {
      rebuild: ({ events, view, state }) => {
        const perspective = isCrossroadsChessColor(state.seat) ? state.seat : view.perspective;
        let gameState = createInitialCrossroadsChessState(view.id);
        const snapshots = [{ ply: 0, view: getCrossroadsChessOpenView(gameState, perspective) }];
        for (const event of events) {
          if (!isCrossroadsMoveEvent(event)) continue;
          const next = applyCrossroadsChessOpenMove(gameState, event.move);
          if (next === gameState) return null; // kernel rejected: keep captured history
          gameState = next;
          snapshots.push({
            ply: snapshots.length,
            view: getCrossroadsChessOpenView(gameState, perspective),
          });
        }
        return snapshots;
      },
    },
    ...(socketFactory ? { socketFactory } : {}),
  });
}

const client = createCrossroadsChessLiveClient();

export function bootstrapCrossroadsChessLiveRoom(): void {
  client.bootstrap();
}

/** Test seam: a fresh client wired to a fake socket (shares module UI state). */
export function createCrossroadsChessLiveClientForTest(
  socketFactory: CrossroadsLiveClientConfig['socketFactory'],
): TenantLiveClient<CrossroadsChessColor, CrossroadsChessPlayerView> {
  return createCrossroadsChessLiveClient(socketFactory);
}

// ── Move list (clickable ply-jump buttons; replaces the core's standard list) ─

function renderCrossroadsMoveList(
  ctx: TenantMoveListRenderContext<CrossroadsChessColor, CrossroadsChessMove>,
): void {
  ctx.refs.moveList.replaceChildren();
  // Zero moves renders an empty list (lichess parity): no placeholder row.
  if (ctx.moves.length === 0) return;
  // When live the latest move stays highlighted (pre-migration behavior).
  const highlightPly = ctx.activePly ?? ctx.latestPly;
  for (let i = 0; i < ctx.moves.length; i += 2) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const n = document.createElement('span');
    n.className = 'move-number';
    n.textContent = `${i / 2 + 1}.`;
    row.append(
      n,
      crossroadsMoveCell(ctx.moves[i], i + 1, highlightPly, ctx.jumpToPly),
      crossroadsMoveCell(ctx.moves[i + 1], i + 2, highlightPly, ctx.jumpToPly),
    );
    ctx.refs.moveList.append(row);
  }
}

function crossroadsMoveCell(
  move: CrossroadsMoveEvent | undefined,
  ply: number,
  highlightPly: number,
  jumpToPly: (ply: number) => void,
): HTMLElement {
  if (!move) {
    const empty = document.createElement('span');
    empty.className = 'move-empty';
    return empty;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = highlightPly === ply ? 'active' : '';
  button.textContent = uci(move.move);
  button.title = `${capitalize(move.color)} move ${Math.ceil(ply / 2)}`;
  button.addEventListener('click', () => {
    selected = null;
    jumpToPly(ply);
  });
  return button;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderBoard(liveRefs: LiveRefs, view: CrossroadsChessPlayerView | null): void {
  liveRefs.board.className = 'board crossroads-live-board';
  liveRefs.board.setAttribute('aria-label', 'Crossroads Chess board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  const targets = selected ? legalTargets(selected) : [];
  const drawn = drawnBoardOverlays<CrossroadsChessSquare>(annotations?.shapes() ?? []);
  liveRefs.board.innerHTML = renderCrossroadsChessBoardSvg(view, {
    arrows: drawn.arrows,
    markers: drawn.markers,
    perspective: view.perspective,
    showFog: false,
    interactive: (core?.replay.isLive() ?? false) && iAmPlayer(),
    selected,
    targets,
    draggingFrom,
    lastMove: view.lastMove ?? null,
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
  if (core) renderBoard(core.refs, core.displayedView());
}

function handleSquareClick(square: CrossroadsChessSquare): void {
  const view = core?.state.view;
  if (!view) return;
  if (!core?.replay.isLive()) return;
  if (!iAmPlayer() || !isMyTurn()) return;

  if (selected === null) {
    // Select only a square that has at least one legal move.
    if (legalTargets(square).length === 0) return;
    selected = square;
    rerenderBoard();
    return;
  }
  if (square === selected) {
    selected = null;
    rerenderBoard();
    return;
  }
  const targets = legalTargets(selected);
  if (targets.includes(square)) {
    sendCrossroadsMove(view, selected, square);
    selected = null;
    rerenderBoard();
    return;
  }
  // Clicked elsewhere: reselect if the new square has moves, else clear.
  selected = legalTargets(square).length > 0 ? square : null;
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

// An own VISIBLE piece on your turn (open client: no shrouded entries exist).
// Any of your visible pieces can be lifted — it snaps back if dropped somewhere
// it cannot move, not just ones with a legal move right now.
function canDragCrossroadsPiece(square: CrossroadsChessSquare): boolean {
  const view = core?.state.view;
  if (!view || !core?.replay.isLive() || core.connection() !== 'connected') return false;
  if (!iAmPlayer() || !isMyTurn()) return false;
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
  const targets = view ? legalTargets(from) : [];
  if (view && to && targets.includes(to)) {
    sendCrossroadsMove(view, from, to);
  }
  selected = null;
  rerenderBoard();
}

function legalTargets(from: CrossroadsChessSquare): CrossroadsChessSquare[] {
  const view = core?.state.view;
  if (!view) return [];
  return view.legalMoves.filter((move) => move.from === from).map((move) => move.to);
}

function iAmPlayer(): boolean {
  return isCrossroadsChessColor(core?.state.seat);
}

function isMyTurn(): boolean {
  const view = core?.state.view;
  return (
    !!view &&
    view.status.type === 'playing' &&
    view.status.turn === core?.state.seat &&
    view.legalMoves.length > 0
  );
}

// ── Rematch block ────────────────────────────────────────────────────────────

function applyRematchState(message: CrossroadsLiveRematch): void {
  const mySeat = core?.state.seat;
  const hadMyOffer = isCrossroadsChessColor(mySeat) && Boolean(rematch.offers[mySeat]);
  const stillMyOffer = isCrossroadsChessColor(mySeat) && Boolean(message.offers[mySeat]);
  const anyOffer = Boolean(message.offers.white || message.offers.red);
  const iCancelled = rematchCancelIntent;
  rematchCancelIntent = false;
  const declined =
    hadMyOffer && !stillMyOffer && !message.finalizedRoomId && !iCancelled
      ? true
      : anyOffer
        ? false
        : rematch.declined;
  rematch = {
    offers: message.offers,
    finalizedRoomId: message.finalizedRoomId,
    declined,
  };
}

function rematchControls(mySeat: CrossroadsChessColor): HTMLElement {
  const theirSeat = mySeat === 'white' ? 'red' : 'white';
  const iOffered = Boolean(rematch.offers[mySeat]);
  const theyOffered = Boolean(rematch.offers[theirSeat]);

  const block = document.createElement('div');
  block.className = 'room-rematch';

  if (iOffered && theyOffered) {
    block.append(rematchButtonRow(disabledButton('Starting rematch...')));
    return block;
  }
  if (iOffered) {
    block.append(
      rematchNote('Waiting for opponent...'),
      rematchButtonRow(
        actionButton('Cancel rematch', () => {
          rematchCancelIntent = true;
          core?.send({ type: 'rematch:cancel' });
        }),
      ),
    );
    return block;
  }
  if (theyOffered) {
    block.append(
      rematchNote('Your opponent wants a rematch'),
      rematchButtonRow(
        actionButton('Decline', () => core?.send({ type: 'rematch:decline' })),
        actionButton('Accept', () => core?.send({ type: 'rematch:offer' }), 'primary'),
      ),
    );
    return block;
  }
  if (rematch.declined) {
    block.append(rematchNote('Your opponent declined the rematch.'));
  }
  block.append(
    rematchButtonRow(actionButton('Rematch', () => core?.send({ type: 'rematch:offer' }))),
  );
  return block;
}

function rematchNote(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'room-rematch-note';
  p.textContent = text;
  return p;
}

function rematchButtonRow(...buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'room-rematch-buttons';
  row.append(...buttons);
  return row;
}

function actionButton(label: string, onClick: () => void, variant?: 'primary'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  if (variant) button.className = variant;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function disabledButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = true;
  button.textContent = label;
  return button;
}

// ── Lifecycle analytics ──────────────────────────────────────────────────────

function trackCrossroadsChessLifecycle(view: CrossroadsChessPlayerView | null): void {
  lifecycleTracker.update(
    crossroadsChessLifecycleAnalyticsInput(view, {
      roomMode,
      timeControl: core?.state.timeControl ?? null,
    }),
  );
}

export function crossroadsChessLifecycleAnalyticsInput(
  view: CrossroadsChessPlayerView | null,
  context: {
    roomMode: 'pvp' | 'pve';
    timeControl: CrossroadsChessLiveTimeControl | null;
  },
): {
  statusType: GameLifecycleStatusType;
  baseProps: Record<string, unknown>;
  outcome: { winner: CrossroadsChessColor | null; reason: string; moveNumber: number } | null;
} | null {
  if (!view) return null;
  const tc = context.timeControl;
  const baseProps = {
    gameId: view.id,
    ...gameSpecAnalyticsPropsForId(CROSSROADS_CHESS_SPEC_ID),
    rated: false,
    roomMode: context.roomMode,
    initialMs: tc?.initialMs ?? null,
    incrementMs: tc?.incrementMs ?? null,
    time_class: tc ? classifyTimeControl(tc.initialMs, tc.incrementMs) : null,
  };
  const outcome =
    view.status.type === 'finished'
      ? { winner: view.status.winner, reason: view.status.reason, moveNumber: view.moveNumber }
      : null;
  return { statusType: view.status.type, baseProps, outcome };
}

// ── Play again / room requests ───────────────────────────────────────────────

export async function createCrossroadsLivePlayAgainRoom(
  timeControl: CrossroadsChessLiveTimeControl | null,
  options: CrossroadsLivePlayAgainOptions = {},
): Promise<string> {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(crossroadsLivePlayAgainRequestBody(timeControl, options)),
  });
  if (!response.ok) throw new Error('crossroads_live_play_again_failed');
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('crossroads_live_play_again_missing_url');
  return body.url;
}

type CrossroadsLivePlayAgainOptions = {
  mode?: 'pvp' | 'pve';
  pveEngineId?: string | null;
  seat?: CrossroadsChessColor | 'spectator' | null;
};

export function crossroadsLivePlayAgainRequestBody(
  timeControl: CrossroadsChessLiveTimeControl | null,
  options: CrossroadsLivePlayAgainOptions = {},
): {
  mode: 'pvp' | 'pve';
  gameSpecId: 'crossroads-chess';
  timeControl: CrossroadsChessLiveTimeControl;
  rated: false;
  preferredColor: 'white' | 'red' | 'random';
  engineId?: string;
} {
  const mode = options.mode === 'pve' ? 'pve' : 'pvp';
  const preferredColor =
    mode === 'pve' && options.seat === 'white'
      ? 'red'
      : mode === 'pve' && options.seat === 'red'
        ? 'white'
        : 'random';
  return {
    mode,
    gameSpecId: 'crossroads-chess',
    timeControl: timeControl ?? defaultTimeControl(),
    rated: false,
    preferredColor,
    ...(mode === 'pve' && options.pveEngineId ? { engineId: options.pveEngineId } : {}),
  };
}

function defaultTimeControl(): CrossroadsChessLiveTimeControl {
  return { initialMs: 300_000, incrementMs: 5_000 };
}

export function crossroadsLiveTimeControlLabel(
  timeControl: CrossroadsChessLiveTimeControl | null,
): string | null {
  if (!timeControl) return null;
  const minutes = Math.round(timeControl.initialMs / 60_000);
  const incrementSeconds = Math.round(timeControl.incrementMs / 1000);
  return incrementSeconds > 0 ? `${minutes}+${incrementSeconds}` : `${minutes}+0`;
}

// ── Labels / URLs / markup ───────────────────────────────────────────────────

function crossroadsChessEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'race':
      return 'the Race';
    case 'checkmate':
      return 'checkmate';
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
    case 'king-captured':
      return 'king capture';
    default:
      return 'game end';
  }
}

export function crossroadsChessTerminalActionsMarkup(
  roomId: string,
  statusType: 'finished' | 'aborted',
): string {
  const review =
    statusType === 'finished'
      ? `<a class="crossroads-live-btn" href="${crossroadsChessReviewUrl(roomId)}">Review game</a>`
      : '';
  const playAgain =
    statusType === 'finished' ? '<button class="crossroads-live-btn">Play again</button>' : '';
  return `<div class="crossroads-live-actions">${review}${playAgain}<a class="crossroads-live-btn" href="/">Home</a></div>`;
}

export function crossroadsChessReviewUrl(roomId: string): string {
  return `/crossroads-chess/game/${encodeURIComponent(roomId)}`;
}

// ── Notation + replay capture key ────────────────────────────────────────────

function uci(move: CrossroadsChessMove): string {
  return `${move.from}${move.to}${move.promotion ? 'Q' : ''}`;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function isCrossroadsMoveEvent(event: TenantLiveEvent): event is CrossroadsMoveEvent {
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
    turn: view.status.type === 'playing' ? view.status.turn : view.status.type,
  });
}

function isCrossroadsChessColor(value: unknown): value is CrossroadsChessColor {
  return value === 'white' || value === 'red';
}
