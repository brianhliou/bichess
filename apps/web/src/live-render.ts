import { fogPatternDefs, type PieceOnBoard, renderBoardSvg } from '@mistboard/board-render';
import { boardFen, mountBoard } from '@mistboard/board-render/interactive';
import type {
  Color,
  GameEvent,
  GameProjection,
  Move,
  PieceRole,
  PlayerView,
  Square,
} from '@mistboard/game';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type * as cg from 'chessground/types';
import { readAccountPreferences } from './account-preferences.js';
import {
  classifyTimeControl,
  createGameLifecycleTracker,
  gameSpecAnalyticsProps,
} from './analytics.js';
import { chessgroundAnimation } from './board-anim.js';
import {
  boardHighlightClasses,
  boardResultClass,
  castlingKingDestinationFromView,
  legalDests,
  squareFileIndex,
} from './live-board.js';
import { renderCaptures as renderCaptureRows } from './live-captures.js';
import {
  renderClocks as renderClockRows,
  resetClockState,
  tickClockTimers as tickClockRows,
} from './live-clocks.js';
import { renderDevViews as renderDevViewRows } from './live-dev-views.js';
import {
  renderGameControls as renderGameControlRows,
  updateAbortCountdown as updateGameControlCountdown,
} from './live-game-controls.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { renderReplay, resetMoveListState } from './live-move-list.js';
import { captureFogView, initReplay, isLive, resetReplayState } from './live-replay.js';
import {
  renderRoomActions as renderRoomActionRows,
  shouldShowPostGameRoomActions as shouldShowPostGameRoomActionRows,
} from './live-room-actions.js';
import { initLiveSound, playSound, resetLiveSoundState, soundForOwnMove } from './live-sound.js';
import {
  type InfoTone,
  type LiveRefs,
  liveState,
  type PendingPromotion,
  type PromotionRole,
} from './live-state.js';
import {
  actionBody,
  actionTitle,
  actionTone,
  boardStatusLabel,
  boardStatusTone,
  connectionNoticeMode,
  modeLabel,
  seatLabel,
} from './live-status.js';
import { currentCaptures, currentProjection, currentView } from './live-view.js';
import { createGameMetaCard } from './review/game-meta-card.js';
import { activeLiveShellTenant, liveShellTenants } from './variant-tenant/live-shell.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';
import { escapeHtml, isColor } from './web-utils.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const promotionRoles: PromotionRole[] = ['queen', 'rook', 'bishop', 'knight'];

// ── Module-scope render-only state ────────────────────────────────────────────

let refs!: LiveRefs;
let sendSocket: (payload: unknown) => boolean = () => false;
let reconnectNow: () => void = () => {};
let ground: Api | null = null;
let pendingPromotion: PendingPromotion | null = null;
let orientation: Color = 'white';

// Fog squares for the Draft960 pick overlay — opponent's half is always hidden.
const PICKER_FOG_WHITE: Square[] = [
  'a5',
  'b5',
  'c5',
  'd5',
  'e5',
  'f5',
  'g5',
  'h5',
  'a6',
  'b6',
  'c6',
  'd6',
  'e6',
  'f6',
  'g6',
  'h6',
  'a7',
  'b7',
  'c7',
  'd7',
  'e7',
  'f7',
  'g7',
  'h7',
  'a8',
  'b8',
  'c8',
  'd8',
  'e8',
  'f8',
  'g8',
  'h8',
];
const PICKER_FOG_BLACK: Square[] = [
  'a1',
  'b1',
  'c1',
  'd1',
  'e1',
  'f1',
  'g1',
  'h1',
  'a2',
  'b2',
  'c2',
  'd2',
  'e2',
  'f2',
  'g2',
  'h2',
  'a3',
  'b3',
  'c3',
  'd3',
  'e3',
  'f3',
  'g3',
  'h3',
  'a4',
  'b4',
  'c4',
  'd4',
  'e4',
  'f4',
  'g4',
  'h4',
];
const FEN_CHAR_TO_ROLE: Partial<Record<string, PieceRole>> = {
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
};

function fenToPickerPieces(fenPlacement: string, color: Color): PieceOnBoard[] {
  const pieces: PieceOnBoard[] = [];
  const backRank = color === 'white' ? 0 : 7;
  const pawnRank = color === 'white' ? 1 : 6;
  for (let i = 0; i < 8; i++) {
    const role = FEN_CHAR_TO_ROLE[fenPlacement[i] ?? ''];
    if (role) pieces.push({ file: i, rank: backRank, color, role });
    pieces.push({ file: i, rank: pawnRank, color, role: 'pawn' });
  }
  return pieces;
}
const lifecycleTracker = createGameLifecycleTracker();

// ── Init ──────────────────────────────────────────────────────────────────────

export function initRender(
  target: HTMLDivElement,
  callbacks: { sendSocket: (payload: unknown) => boolean; reconnectNow: () => void },
): void {
  sendSocket = callbacks.sendSocket;
  reconnectNow = callbacks.reconnectNow;
  resetReplayState();
  for (const tenant of liveShellTenants()) tenant.resetReplayState();
  initReplay({
    onStateChange: () => {
      reconcileInteractionState();
      render();
    },
  });
  lifecycleTracker.reset();
  resetMoveListState();
  resetClockState();
  refs = createLiveLayout(target, {
    debugRequested: liveState.debugRequested,
    roomId: liveState.room,
  });
  installSelectionClickAway({
    roots: () => [refs.board, refs.promotion],
    hasSelection: () => pendingPromotion === null && ground !== null,
    clearSelection: () => ground?.selectSquare(null),
  });
  initLiveSound();
  resetLiveSoundState();
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(): void {
  setLiveLayoutGameSpec(refs.board.closest('#app') ?? document.body, liveState.gameSpecId);
  const shellTenant = activeLiveShellTenant();
  if (shellTenant) {
    destroyChessBoardForAlternateRenderer();
    captureFogView();
    shellTenant.render(refs, { sendSocket, reconnectNow });
    return;
  }
  captureFogView();
  const view = currentView();
  const projection = currentProjection();
  trackGameLifecycle(view);
  // For seated players, lock orientation to their own seat regardless of what
  // the view's perspective field says — fog history views can carry a stale or
  // mismatched perspective if the server state was captured before the seat was
  // confirmed. Spectators fall back to the view's perspective.
  const nextOrientation = isColor(liveState.seat) ? liveState.seat : (view?.perspective ?? 'white');
  orientation = nextOrientation;
  const showDraft = shouldShowDraftControls(view, projection);
  const showPickerOverlay =
    !liveState.solo &&
    isColor(liveState.seat) &&
    view?.status.type === 'pregame' &&
    draftOfferForColor(liveState.seat, projection).length > 0;

  if (liveState.debugRequested) refs.roomMeta.innerHTML = roomMetaHtml();
  renderBoardStatus(view);
  refs.offerSection.hidden = !showDraft || showPickerOverlay;
  refs.selectionSection.hidden = !showDraft;

  renderActionStatus(view);
  renderGameInfo(view);
  renderClockRows(refs, view);
  renderCaptureRows(refs, view);
  renderRoomActionRows(refs, {
    sendSocket,
    shouldRequestHiddenDraft960ForPlayAgain,
  });
  renderGameControlRows(refs, view, sendSocket);
  renderDevViewRows(refs);
  renderOffer(projection);
  renderSelections(projection);
  renderDraftPicker();
  renderReplay(refs);
  renderBoard(view);
  renderBoardResult(view);
  renderPromotion();
}

function trackGameLifecycle(view: PlayerView | null): void {
  if (!view || !isLive()) return;
  const statusType = view.status.type;
  const baseProps = {
    gameId: view.id,
    variant: view.variant,
    ...gameSpecAnalyticsProps({
      variant: view.variant,
      hiddenDraft960: isDraft960RoomForAnalytics(),
    }),
    rated: liveState.rated,
    roomMode: liveState.roomMode,
    initialMs: view.clock?.initialMs ?? null,
    incrementMs: view.clock?.incrementMs ?? null,
    time_class:
      view.clock != null ? classifyTimeControl(view.clock.initialMs, view.clock.incrementMs) : null,
  };
  const outcome =
    statusType === 'finished'
      ? (() => {
          const finished = view.status as {
            type: 'finished';
            winner: 'white' | 'black' | null;
            reason: string;
          };
          return { winner: finished.winner, reason: finished.reason, moveNumber: view.moveNumber };
        })()
      : null;
  lifecycleTracker.update({ statusType, baseProps, outcome });
}

function isDraft960RoomForAnalytics(): boolean {
  if (
    liveState.variantRequested === 'draft960' ||
    liveState.variantRequested === 'fog-draft960' ||
    liveState.variantRequested === 'dark-draft960'
  ) {
    return true;
  }
  return hasVisibleDraftData(currentProjection());
}

// ── Offer / draft ─────────────────────────────────────────────────────────────

function renderOffer(projection: GameProjection | null): void {
  refs.starts.replaceChildren();
  const view = currentView();

  if (liveState.solo) {
    refs.starts.append(
      draftOfferGroup('White offer', 'white', draftOfferForColor('white', projection), projection),
      draftOfferGroup('Black offer', 'black', draftOfferForColor('black', projection), projection),
    );
    return;
  }

  if (liveState.seat === 'spectator') {
    refs.starts.append(infoNotice('pending', 'Draft choices are private while the game is live.'));
    return;
  }

  const color = pickColorForSeat();
  const visibleOffer = draftOfferForColor(color, projection);
  if (visibleOffer.length === 0) {
    refs.starts.append(infoNotice('pending', 'Waiting for the draft offer.'));
    return;
  }

  for (const start of visibleOffer) {
    const row = document.createElement('div');
    row.className = 'start-row';

    const button = document.createElement('button');
    const selected = selectedStartId(color, projection) === start.id;
    const resolved =
      resolvedStartIdForColor(color, projection) === start.id ||
      sharedResolvedStartId(projection) === start.id;
    button.type = 'button';
    button.className = ['start-card', selected ? 'selected' : '', resolved ? 'resolved' : '']
      .filter(Boolean)
      .join(' ');
    button.disabled = !isLive() || view?.status.type !== 'pregame';
    button.dataset.start = String(start.id);
    button.addEventListener('click', () => {
      sendSocket({ type: 'select-start', startId: start.id });
    });

    const id = document.createElement('strong');
    id.textContent = `#${start.id}`;
    const placement = document.createElement('span');
    placement.textContent = start.fenPlacement.toUpperCase();
    button.append(id, placement);
    row.append(button);

    refs.starts.append(row);
  }
}

function draftOfferGroup(
  label: string,
  color: Color,
  starts: ReturnType<typeof draftOfferForColor>,
  projection: GameProjection | null,
): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'start-group';

  const heading = document.createElement('h3');
  heading.textContent = label;
  group.append(heading);

  if (starts.length === 0) {
    group.append(infoNotice('pending', 'No offer visible.'));
    return group;
  }

  for (const start of starts) {
    const button = draftPickButton(color, start, projection);
    group.append(button);
  }

  return group;
}

function draftPickButton(
  color: Color,
  start: { id: number; fenPlacement: string },
  projection: GameProjection | null,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    'start-card',
    selectedStartId(color, projection) === start.id ? 'selected' : '',
    resolvedStartIdForColor(color, projection) === start.id ||
    sharedResolvedStartId(projection) === start.id
      ? 'resolved'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  button.disabled = !isLive() || currentView()?.status.type !== 'pregame';
  const id = document.createElement('strong');
  id.textContent = `#${start.id}`;
  const placement = document.createElement('span');
  placement.textContent = start.fenPlacement.toUpperCase();
  button.append(id, placement);
  button.addEventListener('click', () => {
    sendSocket({ type: 'select-start', color, startId: start.id });
  });
  return button;
}

function renderSelections(projection: GameProjection | null): void {
  const view = currentView();
  if (
    !liveState.solo &&
    liveState.seat !== 'spectator' &&
    view?.variant === 'dark-chess' &&
    hasVisibleDraftData(projection)
  ) {
    const color = pickColorForSeat();
    refs.selectionList.replaceChildren(
      selectionItem('Your pick', selectedStartId(color, projection)),
      selectionItem('Your start', resolvedStartIdForColor(color, projection)),
    );
    return;
  }

  const resolvedWhite = resolvedStartIdForColor('white', projection);
  const resolvedBlack = resolvedStartIdForColor('black', projection);
  refs.selectionList.replaceChildren(
    selectionItem('White', selectedStartId('white', projection)),
    selectionItem('Black', selectedStartId('black', projection)),
    resolvedWhite !== undefined || resolvedBlack !== undefined
      ? selectionItem('Resolved White', resolvedWhite)
      : selectionItem('Resolved', sharedResolvedStartId(projection)),
    resolvedWhite !== undefined || resolvedBlack !== undefined
      ? selectionItem('Resolved Black', resolvedBlack)
      : document.createDocumentFragment(),
  );
}

// ── Action status / game info ─────────────────────────────────────────────────

function renderDraftPicker(): void {
  const view = currentView();
  const projection = currentProjection();
  if (liveState.solo || !isColor(liveState.seat) || view?.status.type !== 'pregame') {
    refs.draftPicker.hidden = true;
    return;
  }
  const color = liveState.seat;
  const offers = draftOfferForColor(color, projection);
  if (offers.length === 0) {
    refs.draftPicker.hidden = true;
    return;
  }
  refs.draftPicker.hidden = false;

  const mySelection = selectedStartId(color, projection);
  const fogSquares = color === 'white' ? PICKER_FOG_WHITE : PICKER_FOG_BLACK;

  if (mySelection !== undefined) {
    const selected = offers.find((o) => o.id === mySelection);
    if (!selected) {
      refs.draftPicker.hidden = true;
      return;
    }
    const pieces = fenToPickerPieces(selected.fenPlacement, color);
    const size = 200;
    const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${fogPatternDefs(size)}${renderBoardSvg(pieces, fogSquares, 0, 0, size, color)}</svg>`;
    refs.draftPicker.replaceChildren();
    const waiting = document.createElement('div');
    waiting.className = 'draft-picker-waiting';
    waiting.innerHTML = `<div class="draft-picker-waiting-board">${svgHtml}</div>`;
    const label = document.createElement('p');
    label.className = 'draft-picker-waiting-label';
    label.textContent = 'Waiting for opponent…';
    waiting.append(label);
    refs.draftPicker.append(waiting);
    return;
  }

  refs.draftPicker.replaceChildren();
  const inner = document.createElement('div');
  inner.className = 'draft-picker-inner';
  const heading = document.createElement('p');
  heading.className = 'draft-picker-heading';
  heading.textContent = 'Choose your starting position';
  const boardsEl = document.createElement('div');
  boardsEl.className = 'draft-picker-boards';
  const size = 160;

  ['A', 'B', 'C'].slice(0, offers.length).forEach((letter, i) => {
    const offer = offers[i]!;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'draft-pick-board';
    const pieces = fenToPickerPieces(offer.fenPlacement, color);
    const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${fogPatternDefs(size)}${renderBoardSvg(pieces, fogSquares, 0, 0, size, color)}</svg>`;
    btn.innerHTML = svgHtml;
    const lbl = document.createElement('span');
    lbl.className = 'draft-pick-label';
    lbl.textContent = letter;
    btn.append(lbl);
    btn.addEventListener('click', () => {
      sendSocket({ type: 'select-start', color, startId: offer.id });
    });
    boardsEl.append(btn);
  });

  inner.append(heading, boardsEl);
  refs.draftPicker.append(inner);
}

function renderActionStatus(view: PlayerView | null): void {
  refs.actionStatus.replaceChildren();
  refs.actionSection.hidden = false;
  // While the player is mid-game we keep this panel hidden and let the board +
  // clocks carry the state. A reconnect only un-hides it once it has escalated
  // to the 'banner' tier; below that the own-seat presence dot is the signal, so
  // a sub-second blip never pops (and re-collapses) the panel. See
  // connectionNoticeMode().
  const showBanner = connectionNoticeMode() === 'banner';
  if (view?.status.type === 'playing' && isLive() && isColor(liveState.seat) && !showBanner) {
    refs.actionSection.hidden = true;
    return;
  }
  const notice = document.createElement('div');
  const tone = actionTone(view);
  notice.className = `action-notice ${tone}`;

  const title = document.createElement('strong');
  title.textContent = actionTitle(view);
  const body = document.createElement('span');
  body.textContent = actionBody(view, {
    hasVisibleDraftData: hasVisibleDraftData(currentProjection()),
  });
  notice.append(title, body);

  if (
    showBanner &&
    (liveState.connectionState === 'disconnected' || liveState.connectionState === 'reconnecting')
  ) {
    const reconnect = document.createElement('button');
    reconnect.type = 'button';
    reconnect.textContent = 'Reconnect now';
    reconnect.addEventListener('click', reconnectNow);
    notice.append(reconnect);
  }

  refs.actionStatus.append(notice);
}

// Lichess-style meta card (mirrors the tenant room-chrome renderMeta): time
// control + mode headline, variant name, seats as player rows, stateful
// bottom line. Degraded-connection detail moves to a small trailing row.
function renderGameInfo(view: PlayerView | null): void {
  const fmt = formatLabel(view);
  const timeLabel = timeControlLabel(view);
  const modeEntry = modeDetailEntry();
  const status = view?.status ?? null;

  let subline: string | null = null;
  let statusLine: string | null = null;
  if (status?.type === 'finished') {
    const reason = status.reason.replace(/-/g, ' ');
    statusLine = status.winner
      ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)} • ${status.winner === 'white' ? 'White' : 'Black'} is victorious`
      : `Draw • ${reason}`;
  } else if (status?.type === 'aborted') {
    statusLine = 'Game aborted';
  } else if (status?.type === 'playing') {
    subline = 'Playing right now';
  }

  const card = createGameMetaCard({
    glyph: '♔',
    headline: [timeLabel, modeEntry ? modeEntry[1] : 'Casual'],
    variantName: fmt,
    subline,
    players: (['white', 'black'] as const).map((color) => ({
      color,
      name:
        liveState.seat === color
          ? `You (${color === 'white' ? 'White' : 'Black'})`
          : color === 'white'
            ? 'White'
            : 'Black',
    })),
    status: statusLine,
  });
  refs.gameInfo.replaceChildren(card.el);
  // Connection only surfaces when degraded — green-path "Connected · 1ms" is noise.
  // The wrapper carries the .game-info styling the row expects (the region
  // itself no longer has it, so it can't mangle the meta card).
  if (liveState.connectionState !== 'connected') {
    const connLabel = connectionDetailLabel();
    if (connLabel) {
      const wrap = document.createElement('div');
      wrap.className = 'game-info';
      wrap.append(infoItem('Connection', connLabel));
      refs.gameInfo.append(wrap);
    }
  }
}

function formatLabel(view: PlayerView | null): string {
  const variant = view?.variant ?? liveState.state?.variant ?? liveState.variantRequested;
  if (variant === 'draft960' || variant === 'fog-draft960' || variant === 'dark-draft960') {
    return 'Dark Draft960';
  }
  const base = variant === 'dark-chess' ? 'Fog Chess' : capitalize(variant ?? 'dark chess');
  const isDraft960 =
    liveState.variantRequested === 'fog-draft960' ||
    liveState.variantRequested === 'dark-draft960' ||
    Object.values(liveState.offers).some((arr) => arr && arr.length > 0) ||
    Object.keys(liveState.resolvedStartIds).length > 0;
  return isDraft960 ? `${base} · Dark Draft960` : base;
}

function timeControlLabel(view: PlayerView | null): string | null {
  // Day-scale rooms label by their per-move allowance; minutes+increment and
  // the live time classes are meaningless at days cadence.
  const daysPerMove = liveState.timeControl?.daysPerMove;
  if (typeof daysPerMove === 'number' && daysPerMove > 0) {
    const days = daysPerMove === 1 ? '1 day' : `${daysPerMove} days`;
    return `${days} per move · Correspondence`;
  }
  let initialMs: number | null = null;
  let incrementMs: number | null = null;
  if (view?.clock) {
    initialMs = view.clock.initialMs;
    incrementMs = view.clock.incrementMs;
  } else {
    const roomCreated = liveState.events.find(
      (e): e is Extract<GameEvent, { type: 'room-created' }> => e.type === 'room-created',
    );
    if (roomCreated?.timeControl) {
      initialMs = roomCreated.timeControl.initialMs;
      incrementMs = roomCreated.timeControl.incrementMs;
    }
  }
  if (initialMs === null || incrementMs === null) return null;
  const minutes = Math.round(initialMs / 60_000);
  const incSec = Math.round(incrementMs / 1000);
  const compact = incSec > 0 ? `${minutes}+${incSec}` : `${minutes}+0`;
  const klass = classifyTimeControl(initialMs, incrementMs);
  return klass ? `${compact} · ${capitalize(klass)}` : compact;
}

function modeDetailLabel(): string {
  if (liveState.solo) return 'Solo dev';
  if (liveState.roomMode === 'pve') {
    const engine = liveState.pveEngineName ?? 'Engine';
    return `vs ${engine}`;
  }
  if (liveState.roomMode === 'eve') return 'Engine vs engine';
  if (liveState.roomMode === 'imported') return 'Imported game';
  if (liveState.roomMode === 'manual') return 'Manual setup';
  return liveState.rated ? 'Rated' : 'Casual';
}

function modeDetailEntry(): [string, string] | null {
  if (liveState.roomMode === 'pve') return null;
  return ['Mode', modeDetailLabel()];
}

function connectionDetailLabel(): string | null {
  switch (liveState.connectionState) {
    case 'connected':
      return liveState.latencyMs !== null ? `Connected · ${liveState.latencyMs}ms` : 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return `Reconnecting · attempt ${liveState.reconnectAttempt}`;
    case 'disconnected':
      return 'Disconnected';
    case 'displaced':
      return 'Session moved';
    case 'rejected':
      return 'Rejected';
    default:
      return null;
  }
}

export function updateAbortCountdown(): void {
  updateGameControlCountdown(refs);
}

// ── Room actions ──────────────────────────────────────────────────────────────

export function shouldShowPostGameRoomActions(view: PlayerView | null): boolean {
  return shouldShowPostGameRoomActionRows(view);
}

export function tickClockTimers(view: PlayerView | null): void {
  tickClockRows(refs, view);
}

// ── Board ─────────────────────────────────────────────────────────────────────

function renderBoard(view: PlayerView | null): void {
  const moveColor = activeMoveColor();
  const ownSeat = isColor(liveState.seat) ? liveState.seat : null;
  const paused = liveState.paused === true && view?.status.type === 'playing';
  // Displaced/rejected are terminal: the socket is closed and will not
  // reconnect, so any move the board accepts can never be sent or reconciled
  // against the true game. Lock the board to view-only in these states.
  const connectionLost =
    liveState.connectionState === 'displaced' || liveState.connectionState === 'rejected';
  const canInteractWithOwnPieces =
    !connectionLost &&
    isLive() &&
    view?.status.type === 'playing' &&
    !paused &&
    (liveState.solo || ownSeat !== null) &&
    pendingPromotion === null;
  const boardIsLive = canInteractWithOwnPieces && moveColor !== null;
  const movableColor = boardIsLive ? moveColor : ownSeat;
  const premovesEnabled = readAccountPreferences().premoves;
  if (!premovesEnabled) ground?.cancelPremove();
  const dests = view ? legalDests(view) : new Map<cg.Key, cg.Key[]>();
  refs.board.classList.toggle('finished-board', view?.status.type === 'finished');
  refs.board.classList.toggle('paused-board', paused);
  renderPausedOverlay(paused);
  const config = {
    // Rebuilt on every render, so a pieceAnimation pref change applies live.
    // Fog chess (dark-chess) forces animation off: a glide would imply a
    // hidden origin/destination the server redacted.
    animation: chessgroundAnimation({ fog: view?.variant === 'dark-chess' }),
    autoCastle: true,
    coordinates: false,
    coordinatesOnSquares: false,
    fen: view ? boardFen(view.board) : '8/8/8/8/8/8/8/8',
    highlight: {
      custom: view ? boardHighlightClasses(view, orientation) : new Map(),
      lastMove: true,
    },
    lastMove: view?.lastMove ? ([view.lastMove.from, view.lastMove.to] as cg.Key[]) : undefined,
    movable: {
      color: movableColor ?? undefined,
      dests,
      free: false,
      rookCastle: true,
      showDests: true,
      events: {
        after: (from: cg.Key, to: cg.Key) => sendBoardMove(from, to),
      },
    },
    orientation,
    premovable: {
      castle: true,
      customDests: dests,
      enabled: shouldEnablePremoves({
        preferenceEnabled: premovesEnabled,
        canInteractWithOwnPieces,
        boardIsLive,
        hasSeat: ownSeat !== null,
      }),
      showDests: true,
    },
    selectable: { enabled: canInteractWithOwnPieces },
    draggable: { enabled: true, showGhost: true },
    turnColor: view?.status.type === 'playing' ? view.status.turn : undefined,
    viewOnly: false,
  } satisfies Config;

  if (ground) {
    ground.set(config);
    ensureDragGhostElement();
    maybePlayPremove();
    return;
  }

  ground = mountBoard(refs.board, config);
  liveState.ground = ground;
  ensureDragGhostElement();
  maybePlayPremove();
}

export function shouldEnablePremoves(input: {
  preferenceEnabled: boolean;
  canInteractWithOwnPieces: boolean;
  boardIsLive: boolean;
  hasSeat: boolean;
}): boolean {
  return (
    input.preferenceEnabled && input.canInteractWithOwnPieces && !input.boardIsLive && input.hasSeat
  );
}

function ensureDragGhostElement(): void {
  if (!ground || refs.board.querySelector('piece.ghost')) return;
  ground.redrawAll();
}

function maybePlayPremove(): void {
  if (
    !ground ||
    !readAccountPreferences().premoves ||
    activeMoveColor() === null ||
    pendingPromotion !== null
  ) {
    return;
  }
  ground.playPremove();
}

function renderPausedOverlay(paused: boolean): void {
  refs.boardPaused.hidden = !paused;
  if (!paused) return;
  const title = refs.boardPaused.querySelector<HTMLElement>('[data-board-paused-title]');
  const body = refs.boardPaused.querySelector<HTMLElement>('[data-board-paused-body]');
  if (liveState.pauseReason === 'engine-error') {
    if (title) title.textContent = 'Engine stopped';
    if (body) body.textContent = 'The engine failed before this room could be completed.';
    return;
  }
  if (title) title.textContent = 'Game paused';
  if (body) body.textContent = 'Server is restarting - your game will resume shortly';
}

function renderBoardResult(view: PlayerView | null): void {
  const nextClass = boardResultClass(view);
  for (const className of ['king-celebrating-white', 'king-celebrating-black']) {
    refs.board.classList.toggle(className, className === nextClass);
  }
}

// ── Interaction state ─────────────────────────────────────────────────────────

export function reconcileInteractionState(): void {
  const shellTenant = activeLiveShellTenant();
  if (shellTenant) {
    shellTenant.reconcileInteractionState();
    return;
  }
  const view = currentView();
  if (!isLive() || !view || view.status.type !== 'playing') {
    pendingPromotion = null;
    ground?.cancelMove();
    ground?.cancelPremove();
    return;
  }

  if (pendingPromotion && !promotionMovesFor(pendingPromotion.from, pendingPromotion.to).length) {
    pendingPromotion = null;
    ground?.cancelMove();
    ground?.cancelPremove();
  }
}

function sendBoardMove(from: cg.Key, to: cg.Key): void {
  const view = currentView();
  const fromSquare = from as Square;
  const toSquare = to as Square;
  const promotions = promotionMovesFor(fromSquare, toSquare);
  if (promotions.length > 1) {
    pendingPromotion = {
      color: view?.board[fromSquare]?.color ?? activeMoveColor() ?? 'white',
      from: fromSquare,
      moves: promotions,
      to: toSquare,
    };
    renderBoard(view);
    renderPromotion();
    return;
  }

  const move = promotions[0] ?? bestMove(fromSquare, toSquare);
  if (!move) {
    renderBoard(view);
    return;
  }
  submitBoardMove(move, view);
}

function submitBoardMove(move: Move, view: PlayerView | null): void {
  if (!sendSocket({ type: 'move', ...move })) return;
  playSound(soundForOwnMove(view, move));
}

// Dev-only hook for browser-driven verification (synthetic chessground events
// are rejected because trustAllEvents is off). Remove or wall behind a stricter
// guard before flipping production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __mbDev?: object }).__mbDev = {
    move: (from: Square, to: Square, promotion?: PromotionRole) =>
      submitBoardMove({ from, to, ...(promotion ? { promotion } : {}) }, currentView()),
    view: () => currentView(),
    captures: () => currentCaptures(),
    events: () => liveState.events,
    render: () => render(),
  };
}

function bestMove(from: Square, to: Square) {
  return movesFor(from, to)[0];
}

function promotionMovesFor(from: Square, to: Square): Move[] {
  return movesFor(from, to).filter((move) => move.promotion);
}

function movesFor(from: Square, to: Square): Move[] {
  const view = currentView();
  if (!view) return [];
  const castlingAlias = view.legalMoves.filter(
    (move) => move.from === from && castlingKingDestinationFromView(view, move) === to,
  );
  if (castlingAlias.length > 0) return castlingAlias;
  return view.legalMoves.filter((move) => move.from === from && move.to === to);
}

// ── Promotion picker ──────────────────────────────────────────────────────────

function renderPromotion(): void {
  refs.promotion.replaceChildren();
  refs.promotion.hidden = pendingPromotion === null;
  refs.promotion.onclick = null;
  if (!pendingPromotion) return;

  refs.promotion.className = `promotion-picker cg-wrap ${pendingPromotion.color}`;
  refs.promotion.setAttribute('aria-label', 'Choose promotion piece');
  refs.promotion.onclick = (event) => {
    if (event.target !== refs.promotion) return;
    pendingPromotion = null;
    refs.promotion.hidden = true;
    renderBoard(currentView());
  };

  const fileIndex = squareFileIndex(pendingPromotion.to);
  const visualFile = orientation === 'white' ? fileIndex : 7 - fileIndex;
  const startsAtTop = pendingPromotion.color === orientation;

  for (const [index, role] of promotionRoles.entries()) {
    const move = pendingPromotion.moves.find((candidate) => candidate.promotion === role);
    if (!move) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'promotion-choice';
    button.title = role;
    button.setAttribute('aria-label', `Promote to ${role}`);
    button.style.left = `${visualFile * 12.5}%`;
    button.style.top = `${(startsAtTop ? index : 7 - index) * 12.5}%`;
    button.append(promotionLabel(role, pendingPromotion.color));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      pendingPromotion = null;
      refs.promotion.hidden = true;
      submitBoardMove(move, currentView());
    });
    refs.promotion.append(button);
  }
}

function promotionLabel(role: PromotionRole, color: Color): HTMLElement {
  const label = document.createElement('piece');
  label.className = `promotion-piece ${role} ${color}`;
  label.setAttribute('aria-hidden', 'true');
  return label;
}

// ── View helpers ──────────────────────────────────────────────────────────────

function activeMoveColor(): Color | null {
  const status = currentView()?.status;
  if (status?.type !== 'playing') return null;
  if (liveState.solo) return status.turn;
  return liveState.seat === status.turn ? liveState.seat : null;
}

// ── Draft data helpers ────────────────────────────────────────────────────────

function draftOfferForColor(
  color: Color,
  projection: GameProjection | null,
): { id: number; fenPlacement: string }[] {
  return (
    projection?.offers[color] ??
    liveState.offers[color] ??
    (projection?.offer.length ? projection.offer : liveState.offer)
  );
}

function selectedStartId(color: Color, projection: GameProjection | null): number | undefined {
  return projection?.selections[color] ?? liveState.selections[color];
}

function sharedResolvedStartId(projection: GameProjection | null): number | null {
  return projection?.resolvedStartId ?? liveState.resolvedStartId;
}

function resolvedStartIdForColor(
  color: Color,
  projection: GameProjection | null,
): number | undefined {
  return projection?.resolvedStartIds[color] ?? liveState.resolvedStartIds[color];
}

function shouldShowDraftControls(
  view: PlayerView | null,
  projection: GameProjection | null,
): boolean {
  // Only show Draft960 UI for actual draft960 games — never for fog-of-war,
  // regardless of what hasVisibleDraftData returns (avoids spurious "Draft960
  // Offer" section on fog-of-war spectator views).
  const variant = view?.variant ?? liveState.state?.variant;
  if (variant && variant !== 'draft960') return false;
  if (view?.variant === 'draft960') return true;
  return hasVisibleDraftData(projection);
}

function hasVisibleDraftData(projection: GameProjection | null): boolean {
  if (liveState.solo) {
    return (
      draftOfferForColor('white', projection).length > 0 ||
      draftOfferForColor('black', projection).length > 0 ||
      selectedStartId('white', projection) !== undefined ||
      selectedStartId('black', projection) !== undefined ||
      resolvedStartIdForColor('white', projection) !== undefined ||
      resolvedStartIdForColor('black', projection) !== undefined ||
      sharedResolvedStartId(projection) !== null
    );
  }
  if (liveState.seat === 'spectator')
    return liveState.offer.length > 0 || Object.keys(liveState.offers).length > 0;
  return (
    draftOfferForColor(pickColorForSeat(), projection).length > 0 ||
    selectedStartId(pickColorForSeat(), projection) !== undefined ||
    resolvedStartIdForColor(pickColorForSeat(), projection) !== undefined
  );
}

function shouldRequestHiddenDraft960ForPlayAgain(): boolean {
  const variant = currentView()?.variant ?? liveState.state?.variant ?? liveState.variantRequested;
  return variant === 'dark-chess' && hasVisibleDraftData(currentProjection());
}

// ── Labels ────────────────────────────────────────────────────────────────────

function roomMetaHtml(): string {
  const mode = escapeHtml(modeLabel());
  const seat = isColor(liveState.seat)
    ? ` · Playing as ${escapeHtml(seatLabel(liveState.seat))}`
    : liveState.seat === 'spectator'
      ? ' · Spectating'
      : '';
  const replayLabel = isLive() ? '' : ' · replay';
  return `${mode}${seat}${replayLabel}`;
}

function renderBoardStatus(view: PlayerView | null): void {
  refs.boardStatus.hidden = view !== null;
  refs.boardStatus.dataset.tone = boardStatusTone();
  const label = refs.boardStatus.querySelector<HTMLParagraphElement>('[data-board-status-label]');
  if (label) label.textContent = boardStatusLabel();
  const spinner = refs.boardStatus.querySelector<HTMLSpanElement>('[data-board-status-spinner]');
  if (spinner) {
    const showSpinner =
      liveState.connectionState === 'connecting' ||
      liveState.connectionState === 'reconnecting' ||
      liveState.connectionState === 'disconnected';
    spinner.hidden = !showSpinner;
  }
}

function selectionLabel(startId: number | null | undefined): string {
  return startId === null || startId === undefined ? 'none' : `#${startId}`;
}

// ── Small utilities ───────────────────────────────────────────────────────────

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function infoNotice(tone: InfoTone, text: string): HTMLDivElement {
  const notice = document.createElement('div');
  notice.className = `info-notice ${tone}`;
  notice.textContent = text;
  return notice;
}

function infoItem(label: string, value: string): HTMLDivElement {
  const item = document.createElement('div');
  const key = document.createElement('span');
  const val = document.createElement('strong');
  key.textContent = label;
  val.textContent = value;
  item.append(key, val);
  return item;
}

function selectionItem(label: string, value: number | string | null | undefined): HTMLDivElement {
  const item = document.createElement('div');
  const key = document.createElement('span');
  const val = document.createElement('strong');
  key.textContent = label;
  val.textContent = typeof value === 'number' ? selectionLabel(value) : (value ?? 'none');
  item.append(key, val);
  return item;
}

function pickColorForSeat(): Color {
  return liveState.seat === 'black' ? 'black' : 'white';
}

function destroyChessBoardForAlternateRenderer(): void {
  if (!ground) return;
  ground.destroy();
  ground = null;
  liveState.ground = null;
}
