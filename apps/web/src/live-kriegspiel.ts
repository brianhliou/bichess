// Live multiplayer room client for Kriegspiel (standard chess played blind). A
// hidden-info tenant on the generic live-client core (variant-tenant/live-client.ts
// owns bootstrap, frame application, renderAll skeleton, the fog-safe replay
// CAPTURE controller, and the masked two-column move list — here the umpire log).
//
// Kriegspiel is stricter than fog, so the surface is different from the other
// tenants: the board shows ONLY the viewer's own pieces (everything else is
// shrouded), and the opponent's move never arrives — only the UMPIRE
// ANNOUNCEMENT does. This module keeps that umpire voice:
//   * the bottom status area (renderExtras): the latest umpire call, check
//     banner, turn state, PAWN-TRY count, and TRY-LOOP bounce ("illegal, try
//     again") when a pseudo-legal probe is refused by the umpire;
//   * the move-list notation — the viewer's own plies in full, the opponent's
//     plies as the announcement alone (the umpire call).
// The move event drives its own capture/quiet sound cue (a capture is heard, not
// seen), wired through onEventApplied.

import {
  type Color,
  type KriegspielCheckType,
  type KriegspielPlayerView,
  kriegspielCheckCandidateSquares,
  type Move,
  type PieceRole,
  type Square,
} from '@mistboard/game';
import './live-kriegspiel.css';
import { kriegspielEnabled } from './feature-flags.js';
import {
  KRIEGSPIEL_PIECE_PX,
  kriegspielPieceGhostSvg,
  kriegspielPromotionPieceSvg,
  renderKriegspielBoardSvg,
} from './kriegspiel-render.js';
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
  type TenantLiveClientContext,
  type TenantLiveEvent,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

type KriegspielPromotionRole = Exclude<PieceRole, 'king' | 'pawn'>;

// The umpire's announcement, as it rides a move-played event.
type KriegspielAnnouncement = {
  capture?: { square: Square; kind: 'pawn' | 'piece' };
  check?: KriegspielCheckType[];
};

// A wire move. The viewer's own move carries from/to; the opponent's is redacted
// down to the announcement alone (from/to stripped server-side).
type KriegspielWireMove = {
  from?: Square;
  to?: Square;
  promotion?: KriegspielPromotionRole;
  announcement?: KriegspielAnnouncement;
};

type KriegspielMovePlayed = TenantMovePlayed<Color, KriegspielWireMove>;

const CHECK_LABELS: Record<KriegspielCheckType, string> = {
  file: 'file',
  rank: 'rank',
  'long-diagonal': 'long diagonal',
  'short-diagonal': 'short diagonal',
  knight: 'knight',
};

// ── Kriegspiel-owned interaction/render state ────────────────────────────────

let core: TenantLiveClientContext<Color, KriegspielPlayerView> | null = null;
// Right-click arrows/circles the player drew on this board.
let annotations: BoardAnnotations | null = null;
let selected: Square | null = null;
let pendingPromotion: { from: Square; to: Square; roles: KriegspielPromotionRole[] } | null = null;
// The from/to of a try the umpire refused (illegal). Cleared on the next action.
// This is the only feedback a refused try yields — no "why".
let bounce: { from?: Square; to?: Square } | null = null;
// The square a piece is being dragged from (its piece is lifted off the board so
// only the floating ghost shows). Null when not dragging.
let draggingFrom: Square | null = null;
// How many move events we have already sounded — a move cue fires once per newly
// appended move event (see onEventApplied). The opponent's redacted move is still
// a move event, so a capture you cannot see still plays its "captured" cue.
let lastSoundedMoveCount = 0;

// ── Shared tenant room chrome config ─────────────────────────────────────────

const kriegspielWebTenant: WebVariantTenant<Color> = {
  displayName: 'Kriegspiel',
  metaMarkerId: 'kriegspiel',
  metaGlyph: '♔',
  colors: ['white', 'black'],
  isColor,
  oppositeColor: (color) => (color === 'white' ? 'black' : 'white'),
  enabled: kriegspielEnabled,
  reviewUrl: (roomId) => `/kriegspiel/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: kriegspielEndReasonLabel,
  disabledTitle: 'Kriegspiel disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Kriegspiel room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction:
    'Select one of your pieces, then a destination. You see only your own army; the umpire calls captures and checks.',
};

function kriegspielEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'checkmate':
      return 'checkmate';
    case 'draw':
      return 'a draw';
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

const client = createTenantLiveClient<Color, KriegspielPlayerView, KriegspielWireMove>({
  tenant: kriegspielWebTenant,
  gameSpecId: 'kriegspiel',
  defaultRoomId: 'kr_dev',
  boardClass: 'kriegspiel-live-board',
  playAgainRequestBody: (state) => ({
    mode: 'pvp',
    gameSpecId: 'kriegspiel',
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  // The move cue is EVENT-based (a capture is heard, not seen), so it rides
  // onEventApplied, not a snapshot sound. Fires once per newly appended move
  // event; snapshots and hello frames stay silent.
  onEventApplied: () => {
    if (!core) return;
    const moves = core.state.events.filter(isMoveEvent);
    if (moves.length > lastSoundedMoveCount) {
      lastSoundedMoveCount = moves.length;
      const last = moves[moves.length - 1];
      if (last) playMoveSound(last);
    }
  },
  onServerMessage,
  resetState: () => {
    selected = null;
    pendingPromotion = null;
    bounce = null;
    draggingFrom = null;
    lastSoundedMoveCount = 0;
  },
  renderBoard,
  renderExtras: (liveRefs, view) => {
    renderUmpireZones(liveRefs, view);
    renderPromotion(liveRefs, view);
  },
  onDisabled: (liveRefs) => {
    liveRefs.capturesTop.hidden = true;
    liveRefs.capturesTop.replaceChildren();
    liveRefs.capturesBottom.hidden = false;
    liveRefs.capturesBottom.replaceChildren();
    clearSelection();
  },
  setup: (ctx) => {
    core = ctx;
    setBoardFamily('chess');
    installBoardInteraction(ctx.refs);
    ctx.refs.promotion.addEventListener('click', onPromotionClick);
    installSelectionClickAway({
      roots: () => [core?.refs.board],
      hasSelection: () => pendingPromotion === null && selected !== null,
      clearSelection: () => {
        clearSelection();
        core?.renderAll();
      },
    });
    window.addEventListener(boardAppearanceChangedEvent, ctx.renderAll);
  },
  moveList: {
    rowClass: 'ksg-move-row',
    cellPrefix: 'ksg-move-row',
    masked: true,
    notate: notateUmpireMove,
    isMoveEvent,
  },
  replayCapture: {
    positionKey: replayPositionKey,
    plyForView: (view, ctx) => {
      if (view.status.type === 'playing') {
        const completedFullMoves = Math.max(0, view.moveNumber - 1);
        return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
      }
      if (ctx.positionChanged && view.lastMove) return ctx.latestPly + 1;
      return ctx.latestPly;
    },
  },
});

export function bootstrapKriegspielLiveRoom(): void {
  client.bootstrap();
}

// ── Server messages ──────────────────────────────────────────────────────────

function onServerMessage(message: { type: string; [key: string]: unknown }): void {
  // The try-loop bounce: the umpire refused an illegal try. Record the attempt
  // so the player can pick another; this is the only feedback they get.
  if (message.type === 'kriegspiel-illegal') {
    bounce = {
      from: typeof message.from === 'string' ? (message.from as Square) : undefined,
      to: typeof message.to === 'string' ? (message.to as Square) : undefined,
    };
    selected = null;
    pendingPromotion = null;
    core?.renderAll();
  }
}

// The drama beat for a single move. In Kriegspiel a capture is heard, not seen —
// the opponent's move that takes one of your pieces plays a distinct "captured"
// cue, the closest thing to feeling the blow land in the dark. Check has no
// dedicated cue; its red banner + threat squares carry that moment visually.
function playMoveSound(event: KriegspielMovePlayed): void {
  const captured = Boolean(event.move.announcement?.capture);
  if (isColor(core?.state.seat) && event.color !== core?.state.seat) {
    playSound(captured ? 'captured' : 'move');
  } else {
    playSound(captured ? 'capture' : 'move');
  }
}

// ── Interaction ──────────────────────────────────────────────────────────────

// Click + drag, delegated to the persistent board container once at mount so they
// survive every innerHTML re-render. Click is the existing select-then-move; drag
// lifts a piece and drops it on a target (routing promotions through the same
// picker). A tap that never crosses the movement threshold falls through to the
// click handler.
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
    ghostSizePx: KRIEGSPIEL_PIECE_PX,
    onSquareClick: (square) => handleSquareClick(square as Square),
    canDragFrom: (square) => canDragPiece(square as Square),
    ghostHtml: (square) => {
      const piece = core?.state.view?.board[square as Square];
      if (!piece) return null;
      return kriegspielPieceGhostSvg(piece.role, piece.color);
    },
    onDragStart: (from) => {
      selected = from as Square;
      draggingFrom = from as Square;
      bounce = null;
      core?.renderAll();
    },
    onDrop: (from, to) => dropPiece(from as Square, to as Square | null),
  });
}

function handleSquareClick(square: Square): void {
  const view = core?.state.view;
  if (!view) return;
  if (!canActNow(view)) return;
  if (pendingPromotion) return;
  bounce = null;

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
  const matches = movesFromTo(view, selected, square);
  if (matches.length > 0) {
    submitMove(selected, square, matches);
    return;
  }
  selected = moveTargets(view, square).length > 0 ? square : null;
  core?.renderAll();
}

// Every piece on the viewer's board is the viewer's own (the opponent's army is
// never sent under Kriegspiel fog), so any of them can be lifted on your turn —
// it snaps back if dropped somewhere it cannot move. Verify the seat colour
// defensively regardless.
function canDragPiece(square: Square): boolean {
  const view = core?.state.view;
  if (!view || !canActNow(view) || pendingPromotion) return false;
  const piece = view.board[square];
  return !!piece && piece.color === core?.state.seat;
}

// A drag ended over `to` (null if dropped off-board or back on `from`). Run the
// exact click-to-move path for from→to, including the promotion picker — a drag
// that lands a promotion routes through the SAME picker (it never auto-sends a
// promotion). A failed drop clears the selection and target dots.
function dropPiece(from: Square, to: Square | null): void {
  draggingFrom = null;
  const view = core?.state.view;
  if (!view || !canActNow(view)) {
    selected = null;
    core?.renderAll();
    return;
  }
  const matches = to ? movesFromTo(view, from, to) : [];
  if (to && matches.length > 0) {
    // submitMove handles promotion: it opens the picker instead of sending when
    // the move set carries promotions, so a dragged promotion lands in the picker.
    submitMove(from, to, matches);
    return;
  }
  selected = null;
  core?.renderAll();
}

function submitMove(from: Square, to: Square, matches: Move[]): void {
  const promotions = matches
    .map((move) => move.promotion)
    .filter((role): role is KriegspielPromotionRole => Boolean(role));
  if (promotions.length > 0) {
    pendingPromotion = { from, to, roles: promotions };
    core?.renderAll();
    return;
  }
  core?.send({ type: 'move', from, to });
  clearSelection();
  core?.renderAll();
}

function onPromotionClick(event: MouseEvent): void {
  const pending = pendingPromotion;
  if (!pending) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-promote]');
  if (!target) return;
  const role = target.getAttribute('data-promote') as KriegspielPromotionRole | null;
  if (!role || !pending.roles.includes(role)) return;
  core?.send({ type: 'move', from: pending.from, to: pending.to, promotion: role });
  clearSelection();
  core?.renderAll();
}

function clearSelection(): void {
  selected = null;
  pendingPromotion = null;
  draggingFrom = null;
}

function movesFromTo(view: KriegspielPlayerView, from: Square, to: Square): Move[] {
  return view.legalMoves.filter((move) => move.from === from && move.to === to);
}

function moveTargets(view: KriegspielPlayerView, from: Square): Square[] {
  const seen = new Set<Square>();
  for (const move of view.legalMoves) if (move.from === from) seen.add(move.to);
  return [...seen];
}

function canActNow(view: KriegspielPlayerView): boolean {
  return !!core && core.replay.isLive() && iAmPlayer() && isMyTurn(view);
}

function iAmPlayer(): boolean {
  return isColor(core?.state.seat);
}

function isMyTurn(view: KriegspielPlayerView): boolean {
  return view.status.type === 'playing' && view.status.turn === core?.state.seat;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderBoard(liveRefs: LiveRefs, view: KriegspielPlayerView | null): void {
  liveRefs.board.className = 'board kriegspiel-live-board';
  liveRefs.board.setAttribute('aria-label', 'Kriegspiel board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  const perspective = core?.orientation() ?? view.perspective;
  const interactive =
    !!core && core.replay.isLive() && iAmPlayer() && isMyTurn(view) && !pendingPromotion;
  const activeSelected = interactive ? selected : null;
  const targets = interactive && selected ? moveTargets(view, selected) : [];
  // When the opponent's move checked us, draw the squares the checker could be
  // on (the umpire's call, in board-space). Live position only.
  const threats = core?.replay.isLive() ? checkThreats(view) : [];
  const drawn = drawnBoardOverlays<Square>(annotations?.shapes() ?? []);
  liveRefs.board.innerHTML = renderKriegspielBoardSvg(view, {
    arrows: drawn.arrows,
    markers: drawn.markers,
    perspective,
    showFog: true,
    selected: activeSelected,
    targets,
    threats,
    interactive,
    draggingFrom,
  });
}

// The squares a checking piece could occupy, derived purely from the umpire's
// latest call against us + our own (visible) pieces. Empty unless the opponent's
// most recent move announced a check.
function checkThreats(view: KriegspielPlayerView): Square[] {
  const seat = core?.state.seat;
  if (!isColor(seat)) return [];
  const latest = latestMoveEvent();
  if (!latest || latest.color === seat) return [];
  const categories = latest.move.announcement?.check;
  if (!categories || categories.length === 0) return [];
  const king = kingSquareFor(view, seat);
  if (!king) return [];
  return kriegspielCheckCandidateSquares(king, categories, Object.keys(view.board) as Square[]);
}

function kingSquareFor(view: KriegspielPlayerView, color: Color): Square | null {
  for (const [square, piece] of Object.entries(view.board)) {
    if (piece && piece.color === color && piece.role === 'king') return square as Square;
  }
  return null;
}

// Keep every Kriegspiel status line below the board: the umpire's latest call,
// check banner, turn state, pawn-try count, and try-loop bounce.
function renderUmpireZones(liveRefs: LiveRefs, view: KriegspielPlayerView | null): void {
  liveRefs.capturesTop.hidden = true;
  liveRefs.capturesTop.replaceChildren();
  liveRefs.capturesBottom.hidden = false;
  const zone = document.createElement('div');
  zone.className = 'kriegspiel-bottom-status';
  zone.append(umpireCallZone(view), turnStateZone(view));
  liveRefs.capturesBottom.replaceChildren(zone);
}

function umpireCallZone(view: KriegspielPlayerView | null): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'kriegspiel-umpire';
  const latest = latestMoveEvent();
  if (!view || !latest) {
    zone.append(umpireLine('The umpire calls captures and checks aloud.', 'muted'));
    return zone;
  }
  const announcement = latest.move.announcement;
  const fromOpponent = latest.color !== core?.state.seat;
  const cats = announcement?.check?.length
    ? announcement.check.map((c) => CHECK_LABELS[c]).join(' and ')
    : '';
  const mated = view.status.type === 'finished' && view.status.reason === 'checkmate';

  // Checkmate ends the game — announce the mate, not a bare check.
  if (mated) {
    const banner = document.createElement('div');
    banner.className = 'kriegspiel-umpire__check kriegspiel-umpire__check--mate';
    banner.textContent = fromOpponent
      ? `Checkmate${cats ? ` by ${cats}` : ''}.`
      : 'Checkmate. You win.';
    zone.append(banner);
    if (announcement?.capture)
      zone.append(umpireLine(captureLine(announcement.capture, fromOpponent)));
    return zone;
  }

  // A check against the viewer (the opponent's move checked me) is the loudest
  // signal — surface it as a banner.
  if (fromOpponent && cats) {
    const banner = document.createElement('div');
    banner.className = 'kriegspiel-umpire__check';
    banner.textContent = `Check by ${cats}.`;
    zone.append(banner);
    if (announcement?.capture)
      zone.append(umpireLine(captureLine(announcement.capture, fromOpponent)));
    return zone;
  }
  zone.append(umpireLine(umpireCallText(latest, fromOpponent), 'call'));
  return zone;
}

function umpireCallText(event: KriegspielMovePlayed, fromOpponent: boolean): string {
  const announcement = event.move.announcement;
  const subject = fromOpponent ? 'Opponent' : 'You';
  const captured = announcement?.capture;
  const check = announcement?.check?.length
    ? ` ${fromOpponent ? '' : 'and gave '}check (${announcement.check.map((c) => CHECK_LABELS[c]).join(', ')})`
    : '';
  if (captured) {
    return `${subject} captured a ${captured.kind} on ${captured.square}${check}.`;
  }
  if (announcement?.check?.length) {
    return fromOpponent
      ? `Check (${announcement.check.map((c) => CHECK_LABELS[c]).join(', ')}).`
      : `You gave check (${announcement.check.map((c) => CHECK_LABELS[c]).join(', ')}).`;
  }
  return fromOpponent ? 'Opponent moved.' : 'You moved.';
}

function captureLine(
  capture: { square: Square; kind: 'pawn' | 'piece' },
  fromOpponent: boolean,
): string {
  return `${fromOpponent ? 'Opponent' : 'You'} captured a ${capture.kind} on ${capture.square}.`;
}

function umpireLine(text: string, variant: 'muted' | 'call' = 'call'): HTMLElement {
  const line = document.createElement('div');
  line.className = `kriegspiel-umpire__line kriegspiel-umpire__line--${variant}`;
  line.textContent = text;
  return line;
}

function turnStateZone(view: KriegspielPlayerView | null): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'kriegspiel-turn';
  if (!view) return zone;
  if (bounce) {
    const bounceLine = document.createElement('div');
    bounceLine.className = 'kriegspiel-turn__bounce';
    const attempt = bounce.from && bounce.to ? ` (${bounce.from}-${bounce.to})` : '';
    bounceLine.textContent = `Illegal${attempt}: the umpire says no. Try another move.`;
    zone.append(bounceLine);
  }
  if (!iAmPlayer()) {
    zone.append(turnLine('Watching without private information.', 'muted'));
    return zone;
  }
  if (view.status.type !== 'playing') return zone;
  if (isMyTurn(view)) {
    zone.append(turnLine('Your move.', 'active'));
    const tries = view.pawnTries ?? 0;
    const pawn = document.createElement('div');
    pawn.className = `kriegspiel-turn__tries${tries > 0 ? ' kriegspiel-turn__tries--has' : ''}`;
    pawn.textContent =
      tries === 0 ? 'No pawn tries.' : `${tries} pawn ${tries === 1 ? 'try' : 'tries'}.`;
    zone.append(pawn);
  } else {
    zone.append(turnLine('Waiting for opponent…', 'muted'));
  }
  return zone;
}

function turnLine(text: string, variant: 'active' | 'muted'): HTMLElement {
  const line = document.createElement('div');
  line.className = `kriegspiel-turn__line kriegspiel-turn__line--${variant}`;
  line.textContent = text;
  return line;
}

function renderPromotion(liveRefs: LiveRefs, view: KriegspielPlayerView | null): void {
  const pending = pendingPromotion;
  const seat = core?.state.seat;
  if (!pending || !view || !isColor(seat)) {
    liveRefs.promotion.hidden = true;
    liveRefs.promotion.replaceChildren();
    return;
  }
  const color = seat;
  liveRefs.promotion.hidden = false;
  liveRefs.promotion.className = 'promotion-picker kriegspiel-promotion';
  const choices = pending.roles
    .map(
      (role) =>
        `<button type="button" class="kriegspiel-promotion__choice" data-promote="${role}">${kriegspielPromotionPieceSvg(role, color)}</button>`,
    )
    .join('');
  liveRefs.promotion.innerHTML = `<div class="kriegspiel-promotion__panel"><div class="kriegspiel-promotion__title">Promote to</div><div class="kriegspiel-promotion__choices">${choices}</div></div>`;
}

// ── Umpire log notation (the move list) ───────────────────────────────────────

// The viewer's own ply is shown in full (they know their move); the opponent's
// is the umpire call alone — a capture mark, a check mark, or a quiet dot. Under
// Kriegspiel redaction a client only ever receives from/to for its OWN moves, so
// "has from/to" is exactly "own move".
function notateUmpireMove(move: KriegspielWireMove): string {
  const announcement = move.announcement;
  const marks = `${announcement?.capture ? '×' : ''}${announcement?.check?.length ? '+' : ''}`;
  if (move.from && move.to) {
    const promo = move.promotion ? `=${move.promotion[0]?.toUpperCase()}` : '';
    return `${move.from}${move.to}${promo}${marks}`;
  }
  if (announcement?.capture)
    return `× ${announcement.capture.square}${announcement.check?.length ? ' +' : ''}`;
  if (announcement?.check?.length) return '+ check';
  return '·';
}

function latestMoveEvent(): KriegspielMovePlayed | null {
  const events = core?.state.events ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && isMoveEvent(event)) return event;
  }
  return null;
}

// ── Fog-safe replay capture key ──────────────────────────────────────────────

function replayPositionKey(view: KriegspielPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece?.color, piece?.role]);
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    visibleSquares: [...view.visibleSquares].sort(),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isMoveEvent(event: TenantLiveEvent): event is KriegspielMovePlayed {
  if (event.type !== 'move-played') return false;
  if (!isColor((event as { color?: unknown }).color)) return false;
  const move = (event as { move?: unknown }).move;
  return typeof move === 'object' && move !== null;
}

function isColor(value: unknown): value is Color {
  return value === 'white' || value === 'black';
}
