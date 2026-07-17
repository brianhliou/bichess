import type {
  LuzhanqiColor,
  LuzhanqiFormation,
  LuzhanqiLastMove,
  LuzhanqiMove,
  LuzhanqiPieceRole,
  LuzhanqiPlayerView,
  LuzhanqiSquare,
  LuzhanqiVisiblePiece,
} from '@mistboard/game';
import {
  ALL_LUZHANQI_SQUARES,
  isLuzhanqiCamp,
  isLuzhanqiHeadquarters,
  LUZHANQI_FRONTLINE_POINTS,
  LUZHANQI_MOUNTAINS,
  LUZHANQI_SETUP_SQUARES,
  LUZHANQI_SPEC_ID,
  luzhanqiFormationForColor,
} from '@mistboard/game';
import './luzhanqi-preview.css';
import { luzhanqiEnabled } from './feature-flags.js';
import type { LiveRefs } from './live-state.js';
import { ROLE_SKIN, renderLuzhanqiSkinMark } from './luzhanqi-skin.js';
import {
  createTenantLiveClient,
  type TenantLiveClientContext,
  type TenantLiveEvent,
  type TenantMovePlayed,
} from './variant-tenant/live-client.js';
import type { WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';

type LuzhanqiWireView = LuzhanqiPlayerView;
type LuzhanqiMoveEvent = TenantMovePlayed<LuzhanqiColor, LuzhanqiMove>;
type LuzhanqiTargetKind = 'capture' | 'move' | 'rail' | 'rail-capture' | 'swap';
type LuzhanqiBoardRenderOptions = {
  lastMove?: LuzhanqiLastMove;
  movableSquares: ReadonlySet<LuzhanqiSquare>;
  orientation: LuzhanqiColor;
  selected: LuzhanqiSquare | null;
  setupSquares: ReadonlySet<LuzhanqiSquare>;
  targetKinds: ReadonlyMap<LuzhanqiSquare, LuzhanqiTargetKind>;
};

const FILES = ['a', 'b', 'c', 'd', 'e'] as const;
const RANKS_TOP_DOWN = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
const RED_RANKS = [1, 2, 3, 4, 5, 6] as const;
const BLACK_RANKS = [13, 12, 11, 10, 9, 8] as const;
const CELL = 62;
const PAD = 36;
const WIDTH = PAD * 2 + CELL * (FILES.length - 1);
const HEIGHT = PAD * 2 + CELL * (RANKS_TOP_DOWN.length - 1);

const ROAD_EDGES = new Set<string>();
const RAIL_EDGES = new Set<string>();

let core: TenantLiveClientContext<LuzhanqiColor, LuzhanqiWireView> | null = null;
let selectedSquare: LuzhanqiSquare | null = null;
let setupFormation: LuzhanqiFormation | null = null;
let setupFormationSeat: LuzhanqiColor | null = null;
let setupSelectedSquare: LuzhanqiSquare | null = null;
let setupDragStart: LuzhanqiSquare | null = null;
let setupDragPointer: { id: number; x: number; y: number } | null = null;
let suppressNextClick = false;

function isLuzhanqiColor(value: unknown): value is LuzhanqiColor {
  return value === 'red' || value === 'black';
}

function oppositeColor(color: LuzhanqiColor): LuzhanqiColor {
  return color === 'red' ? 'black' : 'red';
}

const luzhanqiWebTenant: WebVariantTenant<LuzhanqiColor> = {
  displayName: 'Luzhanqi',
  metaGlyph: '军',
  colors: ['red', 'black'],
  isColor: isLuzhanqiColor,
  oppositeColor,
  enabled: luzhanqiEnabled,
  reviewUrl: (roomId) => `/luzhanqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: luzhanqiReasonPhrase,
  disabledTitle: 'Luzhanqi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Luzhanqi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching the game.',
  selectInstruction: 'Select one of your pieces, then choose a legal target.',
  seatLabel: (seat) => (seat === 'red' ? 'Red' : 'Black'),
  showPregameTurn: true,
};

const client = createTenantLiveClient<LuzhanqiColor, LuzhanqiWireView, LuzhanqiMove>({
  tenant: luzhanqiWebTenant,
  gameSpecId: LUZHANQI_SPEC_ID,
  defaultRoomId: 'lzq_dev',
  boardClass: 'luzhanqi-live-board',
  playAgainRequestBody: (state) => ({
    mode: 'pvp',
    gameSpecId: LUZHANQI_SPEC_ID,
    preferredColor: isLuzhanqiColor(state.seat) ? oppositeColor(state.seat) : 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  resetState: () => {
    selectedSquare = null;
    setupFormation = null;
    setupFormationSeat = null;
    setupSelectedSquare = null;
    setupDragStart = null;
    setupDragPointer = null;
    suppressNextClick = false;
  },
  renderBoard,
  renderExtras,
  onDisabled: () => {
    selectedSquare = null;
    setupFormation = null;
    setupFormationSeat = null;
    setupSelectedSquare = null;
    setupDragStart = null;
    setupDragPointer = null;
    suppressNextClick = false;
  },
  setup: (ctx) => {
    core = ctx;
    installLuzhanqiBoardInteraction(ctx.refs);
    installSelectionClickAway({
      roots: () => [core?.refs.board],
      hasSelection: () => selectedSquare !== null || setupSelectedSquare !== null,
      clearSelection: () => {
        selectedSquare = null;
        setupSelectedSquare = null;
        if (core) renderBoard(core.refs, core.displayedView());
      },
    });
  },
  moveList: {
    rowClass: 'move-row xiangqi-move-row',
    cellPrefix: 'xiangqi-move-row',
    listClass: 'xiangqi-move-list',
    masked: true,
    notate: (move) => `${move.from}-${move.to}`,
    isMoveEvent: isLuzhanqiMoveEvent,
  },
  replayCapture: {
    positionKey: (view) =>
      JSON.stringify({
        board: view.board,
        lastMove: view.lastMove ?? null,
        status: view.status,
      }),
    plyForView: (view, ctx) =>
      view.status.type === 'setup'
        ? 0
        : Math.max(view.ply, ctx.events.filter(isLuzhanqiMoveEvent).length),
  },
});

export function bootstrapLuzhanqiLiveRoom(): void {
  client.bootstrap();
}

function luzhanqiReasonPhrase(reason: string): string {
  switch (reason) {
    case 'flag-captured':
      return 'finding the Den';
    case 'mobile-force-eliminated':
      return 'eliminating every mobile piece';
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

function renderBoard(liveRefs: LiveRefs, view: LuzhanqiWireView | null): void {
  liveRefs.board.className = 'board luzhanqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Luzhanqi board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  clearSetupStateIfPlaying(view);
  const seat = localSeat(view);
  const setupEditable =
    view.status.type === 'setup' && isLuzhanqiColor(seat) && !hasOwnSetup(view, seat);
  const displayView = setupEditable ? stagedSetupView(view, seat) : view;
  const targetKinds = new Map<LuzhanqiSquare, LuzhanqiTargetKind>();
  const setupSquares = new Set<LuzhanqiSquare>();
  const movableSquares = new Set<LuzhanqiSquare>();
  if (setupEditable) {
    for (const square of LUZHANQI_SETUP_SQUARES[seat]) setupSquares.add(square);
    if (setupSelectedSquare) {
      for (const square of LUZHANQI_SETUP_SQUARES[seat]) {
        if (square !== setupSelectedSquare && setupPieceAt(seat, square))
          targetKinds.set(square, 'swap');
      }
    }
  } else if (
    isLuzhanqiColor(seat) &&
    displayView.status.type === 'playing' &&
    displayView.status.turn === seat
  ) {
    for (const move of displayView.legalMoves) movableSquares.add(move.from);
    if (selectedSquare) {
      for (const move of displayView.legalMoves.filter(
        (candidate) => candidate.from === selectedSquare,
      )) {
        targetKinds.set(move.to, targetKindForMove(displayView, move, seat));
      }
    }
  }
  const selected = setupEditable ? setupSelectedSquare : selectedSquare;
  liveRefs.board.replaceChildren(
    renderLuzhanqiBoard(displayView, {
      lastMove: displayView.lastMove,
      movableSquares,
      orientation: core?.orientation() ?? displayView.perspective,
      selected,
      setupSquares,
      targetKinds,
    }),
  );
}

function stagedSetupView(view: LuzhanqiWireView, seat: LuzhanqiColor): LuzhanqiWireView {
  const formation = editableSetupFormation(seat);
  const board: LuzhanqiWireView['board'] = { ...view.board };
  for (const square of LUZHANQI_SETUP_SQUARES[seat]) delete board[square];
  for (const [square, role] of Object.entries(formation) as Array<
    [LuzhanqiSquare, LuzhanqiPieceRole]
  >) {
    board[square] = { color: seat, role, known: true };
  }
  return { ...view, board };
}

function editableSetupFormation(seat: LuzhanqiColor): LuzhanqiFormation {
  if (!setupFormation || setupFormationSeat !== seat) {
    setupFormation = { ...luzhanqiFormationForColor(seat) };
    setupFormationSeat = seat;
    setupSelectedSquare = null;
  }
  return setupFormation;
}

function resetSetupFormation(seat: LuzhanqiColor): void {
  setupFormation = { ...luzhanqiFormationForColor(seat) };
  setupFormationSeat = seat;
  setupSelectedSquare = null;
  setupDragStart = null;
  setupDragPointer = null;
}

function isSetupSquareForSeat(seat: LuzhanqiColor, square: LuzhanqiSquare): boolean {
  return LUZHANQI_SETUP_SQUARES[seat].includes(square);
}

function setupPieceAt(seat: LuzhanqiColor, square: LuzhanqiSquare): LuzhanqiPieceRole | undefined {
  return editableSetupFormation(seat)[square];
}

function canEditSetup(view: LuzhanqiWireView, seat: LuzhanqiColor): boolean {
  return view.status.type === 'setup' && !hasOwnSetup(view, seat);
}

function handleSetupSquareClick(
  view: LuzhanqiWireView,
  square: LuzhanqiSquare,
  seat: LuzhanqiColor,
): void {
  selectedSquare = null;
  if (!canEditSetup(view, seat) || !isSetupSquareForSeat(seat, square)) {
    setupSelectedSquare = null;
    return;
  }
  if (!setupSelectedSquare) {
    setupSelectedSquare = setupPieceAt(seat, square) ? square : null;
    return;
  }
  if (setupSelectedSquare === square) {
    setupSelectedSquare = null;
    return;
  }
  if (!isSetupSquareForSeat(seat, setupSelectedSquare)) {
    setupSelectedSquare = null;
    return;
  }
  if (!swapSetupSquares(view, setupSelectedSquare, square, seat)) {
    setupSelectedSquare = setupPieceAt(seat, square) ? square : null;
  }
}

function swapSetupSquares(
  view: LuzhanqiWireView,
  from: LuzhanqiSquare,
  to: LuzhanqiSquare,
  seat: LuzhanqiColor,
): boolean {
  if (!canEditSetup(view, seat)) return false;
  if (from === to || !isSetupSquareForSeat(seat, from) || !isSetupSquareForSeat(seat, to))
    return false;
  const formation = editableSetupFormation(seat);
  const first = formation[from];
  const second = formation[to];
  if (!first || !second) return false;
  formation[from] = second;
  formation[to] = first;
  setupSelectedSquare = null;
  return true;
}

function submitCurrentFormation(seat: LuzhanqiColor): void {
  const formation: LuzhanqiFormation = { ...editableSetupFormation(seat) };
  setupSelectedSquare = null;
  core?.send({ type: 'setup:submit', setup: formation });
}

function clearSetupStateIfPlaying(view: LuzhanqiWireView): void {
  if (view.status.type === 'setup') return;
  setupFormation = null;
  setupFormationSeat = null;
  setupSelectedSquare = null;
  setupDragStart = null;
  setupDragPointer = null;
}

function renderExtras(liveRefs: LiveRefs, view: LuzhanqiWireView | null): void {
  liveRefs.starts.replaceChildren();
  liveRefs.starts.hidden = true;
  liveRefs.offerSection.hidden = true;
  if (!view) return;
  const seat = localSeat(view);
  if (!isLuzhanqiColor(seat)) {
    if (
      view.status.type === 'playing' ||
      view.status.type === 'finished' ||
      view.status.type === 'aborted'
    ) {
      showLuzhanqiExtrasSection(liveRefs, 'Status');
      liveRefs.starts.hidden = false;
      renderStatePanel(liveRefs, view, null);
    }
    return;
  }

  showLuzhanqiExtrasSection(liveRefs, view.status.type === 'setup' ? 'Formation' : 'Status');
  liveRefs.starts.hidden = false;
  if (view.status.type !== 'setup') {
    renderStatePanel(liveRefs, view, seat);
    return;
  }
  const panel = document.createElement('div');
  panel.className = 'luzhanqi-setup-panel';
  const submitted = hasOwnSetup(view, seat);

  const title = document.createElement('strong');
  title.textContent = submitted ? 'Formation locked' : 'Formation ready';
  const body = document.createElement('span');
  body.textContent = submitted ? 'Waiting for opponent setup.' : setupSelectionText(seat);
  const actions = document.createElement('div');
  actions.className = 'luzhanqi-setup-actions';

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'primary';
  submitButton.disabled = submitted || core?.connection() !== 'connected';
  submitButton.textContent = submitted ? 'Locked' : 'Lock formation';
  submitButton.addEventListener('click', () => submitCurrentFormation(seat));
  actions.append(submitButton);

  if (!submitted) {
    editableSetupFormation(seat);
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset';
    resetButton.addEventListener('click', () => {
      resetSetupFormation(seat);
      if (core) renderBoard(core.refs, core.displayedView());
    });
    actions.append(resetButton);
  }

  panel.append(title, body, actions);
  liveRefs.starts.append(panel);
}

function localSeat(view: LuzhanqiWireView): LuzhanqiColor | null {
  const seat = core?.state.seat;
  if (isLuzhanqiColor(seat)) return seat;
  return seat === null && isLuzhanqiColor(view.perspective) ? view.perspective : null;
}

function showLuzhanqiExtrasSection(liveRefs: LiveRefs, title: string): void {
  liveRefs.offerSection.hidden = false;
  const heading = liveRefs.offerSection.querySelector('h2');
  if (heading) heading.textContent = title;
}

function setupSelectionText(seat: LuzhanqiColor): string {
  if (!setupSelectedSquare) return 'Drag pieces to swap, or click two pieces.';
  const role = setupPieceAt(seat, setupSelectedSquare);
  return role
    ? `${setupSelectedSquare}: ${ROLE_SKIN[role].displayName}. Choose another piece to swap.`
    : 'Choose a piece to move in the formation.';
}

function renderStatePanel(
  liveRefs: LiveRefs,
  view: LuzhanqiWireView,
  seat: LuzhanqiColor | null,
): void {
  const panel = document.createElement('div');
  panel.className = 'luzhanqi-state-panel';
  const title = document.createElement('strong');
  const body = document.createElement('span');

  if (view.status.type === 'playing') {
    const ownTurn = seat !== null && view.status.turn === seat;
    title.textContent = `${seatLabel(view.status.turn)} to move${ownTurn ? ' (you)' : ''}`;
    body.textContent = selectedSquare
      ? selectedMoveText(view, selectedSquare)
      : ownTurn
        ? 'Movable pieces are marked on the board.'
        : (lastMoveText(view) ?? 'Waiting for opponent.');
  } else if (view.status.type === 'finished') {
    title.textContent = view.status.winner ? `${seatLabel(view.status.winner)} wins` : 'Game drawn';
    body.textContent = luzhanqiReasonPhrase(view.status.reason);
  } else if (view.status.type === 'aborted') {
    title.textContent = 'Game aborted';
    body.textContent = view.status.reason;
  } else {
    title.textContent = 'Formation setup';
    body.textContent = 'Waiting for setup.';
  }

  panel.append(title, body);
  if (view.status.type !== 'setup' && view.lastMove) {
    panel.append(renderLastMoveDetails(view.lastMove));
  }
  liveRefs.starts.append(panel);
}

function selectedMoveText(view: LuzhanqiWireView, square: LuzhanqiSquare): string {
  const piece = view.board[square];
  const moves = view.legalMoves.filter((move) => move.from === square);
  if (!piece?.known)
    return `${square}: ${moves.length} legal move${moves.length === 1 ? '' : 's'}.`;
  const railMoves = moves.filter((move) => isRailMove(move)).length;
  const captures = moves.filter((move) => {
    const target = view.board[move.to];
    return target !== undefined && target.color !== piece.color;
  }).length;
  const details = [
    `${moves.length} legal move${moves.length === 1 ? '' : 's'}`,
    railMoves > 0 ? `${railMoves} rail` : '',
    captures > 0 ? `${captures} attack${captures === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return `${square}: ${ROLE_SKIN[piece.role].displayName}, ${details.join(', ')}.`;
}

function lastMoveText(view: LuzhanqiWireView): string | null {
  if (!view.lastMove) return null;
  return `Last move: ${view.lastMove.from}-${view.lastMove.to}. ${lastMoveOutcomeText(view.lastMove)}`;
}

function renderLastMoveDetails(move: LuzhanqiLastMove): HTMLElement {
  const list = document.createElement('div');
  list.className = 'luzhanqi-result-list';
  for (const item of lastMoveResultItems(move)) {
    const pill = document.createElement('span');
    pill.className = `luzhanqi-result luzhanqi-result--${item.tone}`;
    pill.textContent = item.text;
    list.append(pill);
  }
  return list;
}

function lastMoveOutcomeText(move: LuzhanqiLastMove): string {
  if (move.outcome.type === 'move') return 'Moved without combat.';
  if (move.outcome.flagCaptured) return `${seatLabel(move.outcome.flagCaptured)} Den found.`;
  if (move.outcome.attackerRemoved && move.outcome.defenderRemoved) return 'Both pieces removed.';
  if (move.outcome.attackerRemoved) return 'Attacker removed.';
  if (move.outcome.defenderRemoved) return 'Defender removed.';
  return 'Defender held.';
}

function lastMoveResultItems(
  move: LuzhanqiLastMove,
): Array<{ text: string; tone: 'capture' | 'move' | 'reveal' }> {
  if (move.outcome.type === 'move') {
    return [{ text: `${move.from}-${move.to}`, tone: 'move' }];
  }
  const items: Array<{ text: string; tone: 'capture' | 'move' | 'reveal' }> = [];
  if (move.outcome.attackerRemoved && move.outcome.defenderRemoved) {
    items.push({ text: 'Both removed', tone: 'capture' });
  } else if (move.outcome.attackerRemoved) {
    items.push({ text: 'Attacker removed', tone: 'capture' });
  } else if (move.outcome.defenderRemoved) {
    items.push({ text: 'Defender removed', tone: 'capture' });
  } else {
    items.push({ text: 'Defender held', tone: 'move' });
  }
  if (move.outcome.flagCaptured) {
    items.push({ text: `${seatLabel(move.outcome.flagCaptured)} Den found`, tone: 'capture' });
  }
  if (move.outcome.revealedFlag) {
    items.push({
      text: `${seatLabel(move.outcome.revealedFlag.color)} Den revealed at ${move.outcome.revealedFlag.square}`,
      tone: 'reveal',
    });
  }
  return items;
}

function seatLabel(color: LuzhanqiColor): string {
  return color === 'red' ? 'Red' : 'Black';
}

function targetKindForMove(
  view: LuzhanqiWireView,
  move: LuzhanqiMove,
  seat: LuzhanqiColor,
): LuzhanqiTargetKind {
  const targetPiece = view.board[move.to];
  const capture = targetPiece !== undefined && targetPiece.color !== seat;
  const rail = isRailMove(move);
  if (rail && capture) return 'rail-capture';
  if (rail) return 'rail';
  return capture ? 'capture' : 'move';
}

function isRailMove(move: LuzhanqiMove): boolean {
  const edge = edgeKey(move.from, move.to);
  return RAIL_EDGES.has(edge) || !ROAD_EDGES.has(edge);
}

function hasOwnSetup(view: LuzhanqiWireView, seat: LuzhanqiColor): boolean {
  return Object.values(view.board).some((piece) => piece?.color === seat && piece.known);
}

function installLuzhanqiBoardInteraction(liveRefs: LiveRefs): void {
  liveRefs.board.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-square]') : null;
    const square = target?.getAttribute('data-square');
    const view = core?.state.view;
    const seat = core?.state.seat;
    if (!view || !isLuzhanqiColor(seat) || !isLuzhanqiSquareString(square)) return;
    if (!canEditSetup(view, seat) || !setupPieceAt(seat, square)) return;
    setupDragStart = square;
    setupDragPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  liveRefs.board.addEventListener('pointerup', (event) => {
    const start = setupDragStart;
    const pointer = setupDragPointer;
    setupDragStart = null;
    setupDragPointer = null;
    if (!start || !pointer || pointer.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 6;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-square]');
    const square = target?.getAttribute('data-square');
    const view = core?.state.view;
    const seat = core?.state.seat;
    if (!moved || !view || !isLuzhanqiColor(seat) || !isLuzhanqiSquareString(square)) return;
    if (swapSetupSquares(view, start, square, seat)) {
      suppressNextClick = true;
      renderBoard(liveRefs, view);
      renderExtras(liveRefs, view);
    }
  });
  liveRefs.board.addEventListener('pointercancel', () => {
    setupDragStart = null;
    setupDragPointer = null;
  });
  liveRefs.board.addEventListener('click', (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const target = event.target instanceof Element ? event.target.closest('[data-square]') : null;
    const square = target?.getAttribute('data-square');
    if (!isLuzhanqiSquareString(square)) return;
    const view = core?.state.view;
    if (!view) return;
    handleSquareClick(view, square);
    renderBoard(liveRefs, view);
    renderExtras(liveRefs, view);
  });
}

function handleSquareClick(view: LuzhanqiWireView, square: LuzhanqiSquare): void {
  if (!core?.replay.isLive() || core.connection() !== 'connected') return;
  const seat = core.state.seat;
  if (!isLuzhanqiColor(seat)) {
    selectedSquare = null;
    setupSelectedSquare = null;
    return;
  }
  if (view.status.type === 'setup') {
    handleSetupSquareClick(view, square, seat);
    return;
  }
  setupSelectedSquare = null;
  if (view.status.type !== 'playing' || view.status.turn !== seat) {
    selectedSquare = null;
    return;
  }
  const piece = view.board[square];
  if (piece?.color === seat) {
    selectedSquare = square;
    return;
  }
  if (selectedSquare) {
    const move = view.legalMoves.find(
      (candidate) => candidate.from === selectedSquare && candidate.to === square,
    );
    if (move) {
      selectedSquare = null;
      core.send({ type: 'move', from: move.from, to: move.to });
      return;
    }
  }
  selectedSquare = null;
}

function renderLuzhanqiBoard(
  view: LuzhanqiWireView,
  options: LuzhanqiBoardRenderOptions,
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'luzhanqi-board');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Luzhanqi ${view.perspective} board`);

  const network = svgGroup('luzhanqi-board__network');
  for (const edge of ROAD_EDGES) {
    const [from, to] = edge.split(':') as [LuzhanqiPoint, LuzhanqiPoint];
    network.append(lineBetween(from, to, RAIL_EDGES.has(edge), options.orientation));
  }
  svg.append(network);
  svg.append(renderTargetLines(options));

  for (const point of [...LUZHANQI_FRONTLINE_POINTS, ...LUZHANQI_MOUNTAINS]) {
    svg.append(renderFrontierPoint(point, options.orientation));
  }
  for (const square of ALL_LUZHANQI_SQUARES) {
    svg.append(renderSquareMarker(square, options));
  }
  if (options.lastMove) svg.append(renderLastMoveBadge(options.lastMove, options.orientation));
  for (const square of ALL_LUZHANQI_SQUARES) {
    const piece = view.board[square];
    if (piece) svg.append(renderPiece(square, piece, options));
  }
  return svg;
}

function renderTargetLines(options: LuzhanqiBoardRenderOptions): SVGElement {
  const group = svgGroup('luzhanqi-board__target-lines');
  if (!options.selected) return group;
  for (const [target, kind] of options.targetKinds) {
    if (kind === 'swap') continue;
    const [x1, y1] = pointPosition(options.selected, options.orientation);
    const [x2, y2] = pointPosition(target, options.orientation);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', `luzhanqi-board__target-line luzhanqi-board__target-line--${kind}`);
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    group.append(line);
  }
  return group;
}

function renderLastMoveBadge(move: LuzhanqiLastMove, orientation: LuzhanqiColor): SVGElement {
  const [x, y] = pointPosition(move.to, orientation);
  const label = lastMoveBadgeLabel(move);
  const width = Math.max(44, label.length * 5.8 + 18);
  const above = y > 58;
  const group = svgGroup(`luzhanqi-last-badge luzhanqi-last-badge--${lastMoveBadgeTone(move)}`);
  group.setAttribute('transform', `translate(${x} ${above ? y - 34 : y + 34})`);

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(-width / 2));
  rect.setAttribute('y', '-10');
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', '20');
  rect.setAttribute('rx', '8');
  group.append(rect);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.textContent = label;
  group.append(text);
  return group;
}

function lastMoveBadgeLabel(move: LuzhanqiLastMove): string {
  if (move.outcome.type === 'move') return isRailMove(move) ? 'rail' : 'move';
  if (move.outcome.flagCaptured) return 'Den';
  if (move.outcome.revealedFlag) return 'reveal';
  if (move.outcome.attackerRemoved && move.outcome.defenderRemoved) return 'both out';
  if (move.outcome.attackerRemoved) return 'held';
  if (move.outcome.defenderRemoved) return 'hit';
  return 'bounce';
}

function lastMoveBadgeTone(move: LuzhanqiLastMove): 'capture' | 'move' | 'reveal' {
  if (move.outcome.type === 'move') return 'move';
  if (move.outcome.revealedFlag && !move.outcome.flagCaptured) return 'reveal';
  return 'capture';
}

type LuzhanqiPoint = LuzhanqiSquare | 'a7' | 'b7' | 'c7' | 'd7' | 'e7';

function edgeKey(a: LuzhanqiPoint, b: LuzhanqiPoint): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addRoad(a: LuzhanqiPoint, b: LuzhanqiPoint): void {
  ROAD_EDGES.add(edgeKey(a, b));
}

function addRail(a: LuzhanqiPoint, b: LuzhanqiPoint): void {
  RAIL_EDGES.add(edgeKey(a, b));
  addRoad(a, b);
}

function pointOf(file: number, rank: number): LuzhanqiPoint {
  return `${FILES[file]}${rank}` as LuzhanqiPoint;
}

function addTerritoryRoads(ranks: readonly number[]): void {
  for (const rank of ranks) {
    for (let file = 0; file < FILES.length - 1; file += 1) {
      addRoad(pointOf(file, rank), pointOf(file + 1, rank));
    }
  }
  for (let rankIndex = 0; rankIndex < ranks.length - 1; rankIndex += 1) {
    for (let file = 0; file < FILES.length; file += 1) {
      addRoad(pointOf(file, ranks[rankIndex]), pointOf(file, ranks[rankIndex + 1]));
    }
  }
  const midRanks = ranks.slice(1);
  const diagPairs: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0, 1, 1],
    [2, 0, 1, 1],
    [2, 0, 3, 1],
    [4, 0, 3, 1],
    [1, 1, 2, 2],
    [3, 1, 2, 2],
    [1, 3, 2, 2],
    [3, 3, 2, 2],
    [0, 4, 1, 3],
    [2, 4, 1, 3],
    [2, 4, 3, 3],
    [4, 4, 3, 3],
  ];
  for (const [fileA, rankA, fileB, rankB] of diagPairs) {
    addRoad(pointOf(fileA, midRanks[rankA]), pointOf(fileB, midRanks[rankB]));
  }
}

function addTerritoryRails(ranks: readonly number[]): void {
  const backRail = ranks[1];
  const frontRail = ranks[5];
  for (let file = 0; file < FILES.length - 1; file += 1) {
    addRail(pointOf(file, backRail), pointOf(file + 1, backRail));
    addRail(pointOf(file, frontRail), pointOf(file + 1, frontRail));
  }
  for (const file of [0, 2, 4]) {
    for (let rankIndex = 1; rankIndex < ranks.length - 1; rankIndex += 1) {
      addRail(pointOf(file, ranks[rankIndex]), pointOf(file, ranks[rankIndex + 1]));
    }
  }
}

addTerritoryRoads(RED_RANKS);
addTerritoryRoads(BLACK_RANKS);
addTerritoryRails(RED_RANKS);
addTerritoryRails(BLACK_RANKS);
for (const file of [0, 2, 4]) addRail(pointOf(file, 6), pointOf(file, 8));

function renderPiece(
  square: LuzhanqiSquare,
  piece: LuzhanqiVisiblePiece,
  options: LuzhanqiBoardRenderOptions,
): SVGElement {
  const [x, y] = pointPosition(square, options.orientation);
  const skin = piece.known ? ROLE_SKIN[piece.role] : null;
  const group = svgGroup(`luzhanqi-piece luzhanqi-piece--${piece.color}`);
  group.dataset.square = square;
  if (skin) {
    group.classList.add(`luzhanqi-piece--skin-${skin.kind}`);
    group.classList.add(`luzhanqi-piece--token-${skin.className}`);
  }
  if (!piece.known) group.classList.add('luzhanqi-piece--hidden');
  if (piece.immobile) group.classList.add('luzhanqi-piece--locked');
  if (options.setupSquares.has(square)) group.classList.add('luzhanqi-piece--setup');
  if (options.movableSquares.has(square)) group.classList.add('luzhanqi-piece--movable');
  if (options.selected === square) group.classList.add('luzhanqi-piece--selected');
  group.setAttribute('transform', `translate(${x} ${y})`);

  const disc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  disc.setAttribute('class', 'luzhanqi-piece__disc');
  disc.setAttribute('r', '22');
  group.append(disc);
  group.append(renderLuzhanqiSkinMark(skin));

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('class', 'luzhanqi-piece__label');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dominant-baseline', 'central');
  label.textContent = skin ? skin.shortLabel : '?';
  group.append(label);

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = piece.known
    ? `${square}: ${piece.color} ${skin?.displayName ?? 'piece'}`
    : `${square}: hidden ${piece.color} token`;
  group.append(title);
  return group;
}

function renderSquareMarker(
  square: LuzhanqiSquare,
  options: LuzhanqiBoardRenderOptions,
): SVGElement {
  const [x, y] = pointPosition(square, options.orientation);
  const group = svgGroup('luzhanqi-square');
  group.dataset.square = square;
  group.setAttribute('transform', `translate(${x} ${y})`);
  const targetKind = options.targetKinds.get(square);
  if (isLuzhanqiCamp(square)) group.classList.add('luzhanqi-square--camp');
  if (isLuzhanqiHeadquarters(square)) group.classList.add('luzhanqi-square--hq');
  if (options.setupSquares.has(square)) group.classList.add('luzhanqi-square--setup');
  if (options.lastMove?.from === square) group.classList.add('luzhanqi-square--last-from');
  if (options.lastMove?.to === square) group.classList.add('luzhanqi-square--last-to');
  if (targetKind) {
    group.classList.add('luzhanqi-square--target');
    group.classList.add(`luzhanqi-square--target-${targetKind}`);
  }

  if (isLuzhanqiCamp(square)) {
    const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    diamond.setAttribute('points', '0,-17 17,0 0,17 -17,0');
    group.append(diamond);
  } else if (isLuzhanqiHeadquarters(square)) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '-17');
    rect.setAttribute('y', '-17');
    rect.setAttribute('width', '34');
    rect.setAttribute('height', '34');
    rect.setAttribute('rx', '5');
    group.append(rect);
  } else {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '6');
    group.append(dot);
  }
  if (targetKind) {
    const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    halo.setAttribute('class', 'luzhanqi-square__target-halo');
    halo.setAttribute('r', '25');
    group.append(halo);
  }
  return group;
}

function renderFrontierPoint(point: LuzhanqiPoint, orientation: LuzhanqiColor): SVGElement {
  const [x, y] = pointPosition(point, orientation);
  const group = svgGroup('luzhanqi-frontier');
  group.setAttribute('transform', `translate(${x} ${y})`);
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  marker.setAttribute('r', LUZHANQI_MOUNTAINS.includes(point as never) ? '10' : '7');
  group.classList.toggle(
    'luzhanqi-frontier--mountain',
    LUZHANQI_MOUNTAINS.includes(point as never),
  );
  group.append(marker);
  return group;
}

function lineBetween(
  from: LuzhanqiPoint,
  to: LuzhanqiPoint,
  rail: boolean,
  orientation: LuzhanqiColor,
): SVGElement {
  const [x1, y1] = pointPosition(from, orientation);
  const [x2, y2] = pointPosition(to, orientation);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', rail ? 'luzhanqi-board__rail' : 'luzhanqi-board__road');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  return line;
}

function pointPosition(point: LuzhanqiPoint, orientation: LuzhanqiColor): [number, number] {
  const file = point[0] as (typeof FILES)[number];
  const rank = Number(point.slice(1));
  const displayFile = orientation === 'red' ? file : FILES[FILES.length - 1 - FILES.indexOf(file)];
  const displayRank = orientation === 'red' ? rank : 14 - rank;
  const fileIndex = FILES.indexOf(displayFile);
  const rankIndex = RANKS_TOP_DOWN.indexOf(displayRank as (typeof RANKS_TOP_DOWN)[number]);
  if (fileIndex < 0 || rankIndex < 0) throw new Error(`invalid Luzhanqi point: ${point}`);
  return [PAD + fileIndex * CELL, PAD + rankIndex * CELL];
}

function svgGroup(className: string): SVGGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', className);
  return group;
}

function isLuzhanqiSquareString(value: unknown): value is LuzhanqiSquare {
  return typeof value === 'string' && ALL_LUZHANQI_SQUARES.includes(value as LuzhanqiSquare);
}

function isLuzhanqiMoveEvent(event: TenantLiveEvent): event is LuzhanqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isLuzhanqiColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    isLuzhanqiSquareString((move as { from?: unknown }).from) &&
    isLuzhanqiSquareString((move as { to?: unknown }).to)
  );
}
