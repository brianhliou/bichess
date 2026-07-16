import type {
  CROSSROADS_CHESS_SPEC_ID,
  CrossroadsChessColor,
  CrossroadsChessGameStatus,
  CrossroadsChessMove,
  CrossroadsChessPlayerView,
  DUAL_CHESS_SPEC_ID,
} from '@mistboard/game';
import './landing.css';
import './game-route.css';
import {
  readCrossroadsChessAppearance,
  renderCrossroadsChessBoardSvg,
} from './crossroads-chess-render.js';
import { crossroadsChessEnabled } from './feature-flags.js';
import { createPane } from './replay-board.js';
import { buildReviewMeta } from './review/game-review-meta.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

// Postgame review for Crossroads Chess. Perfect-information 6x8 fusion board: one
// review surface with per-orientation view projection. The shared review layout
// owns the shell, scrubber, keyboard, flip, and viewport-fill sizing; this module
// supplies the board host + move list.

type CrossroadsChessTimeControl = { initialMs: number; incrementMs: number };
export type CrossroadsChessPostgameViewKey = CrossroadsChessColor | 'truth';

export type CrossroadsChessPostgameResponse = {
  game: {
    roomId: string;
    variant: typeof CROSSROADS_CHESS_SPEC_ID | typeof DUAL_CHESS_SPEC_ID;
    mode: string;
    whiteName?: string | null;
    redName?: string | null;
    result: string;
    termination: string;
    plyCount: number;
    startedAt: string;
    endedAt: string;
    rated: boolean;
    visibility: string;
    players?: Array<{
      color: string;
      name: string;
      rating: number | null;
      kind: 'account' | 'guest' | 'engine';
    }>;
    timeControl?: CrossroadsChessTimeControl;
  };
  state: {
    status: CrossroadsChessGameStatus;
    moveNumber: number;
    progressClock: number;
    timeControl?: CrossroadsChessTimeControl;
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: CrossroadsChessColor;
    move?: CrossroadsChessMove;
    ply?: number;
    winner?: CrossroadsChessColor;
    reason?: string;
  }>;
  clocks?: Array<Record<CrossroadsChessColor, number>>;
  view: CrossroadsChessPlayerView;
  views?: Partial<Record<CrossroadsChessPostgameViewKey, CrossroadsChessPlayerView>>;
  history?: Partial<
    Record<CrossroadsChessPostgameViewKey, Array<{ ply: number; view: CrossroadsChessPlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: CrossroadsChessPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountCrossroadsChessPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  setBoardFamily('chess');
  root.replaceChildren(buildNav(), loadingView());
  if (!crossroadsChessEnabled()) {
    renderError(root, 'Crossroads Chess unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadCrossroadsChessPostgame(roomId)
    .then((result) => {
      if (result.ok) {
        renderPostgame(root, result.postgame);
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => {
      renderError(root, 'Postgame unavailable', 'The game could not be loaded.');
    });
}

export async function loadCrossroadsChessPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(crossroadsChessPostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return {
    ok: true,
    postgame: (await response.json()) as CrossroadsChessPostgameResponse,
  };
}

export function crossroadsChessPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/crossroads-chess/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: CrossroadsChessPostgameResponse): void {
  const pane = createPane('', 'truth', false, 'single');
  pane.boardEl.classList.add('crossroads-postgame-board');

  const moves = postgame.timeline.filter(
    (
      entry,
    ): entry is typeof entry & {
      move: CrossroadsChessMove;
      ply: number;
      color: CrossroadsChessColor;
    } =>
      entry.type === 'move-played' &&
      !!entry.move &&
      typeof entry.ply === 'number' &&
      !!entry.color,
  );

  const movesCard = document.createElement('section');
  movesCard.className = 'review-moves-card';
  const movesHeading = document.createElement('h2');
  movesHeading.className = 'review-moves-card__title';
  movesHeading.textContent = 'Moves';
  const moveList = document.createElement('ol');
  moveList.className = 'move-list';
  movesCard.append(movesHeading, moveList);

  const status = `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'crossroads',
    variantName: 'Crossroads Chess',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'crossroads-chess-review',
    ariaLabel: 'Crossroads Chess postgame',
    title: 'Crossroads Chess',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    moves: movesCard,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: 300 / 411,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: CrossroadsChessColor = flipped ? 'red' : 'white';
      const view = postgameViewAtPly(postgame, orientation, ply) ?? postgame.view;
      pane.boardEl.innerHTML = sizedCrossroadsBoardSvg(
        renderCrossroadsChessBoardSvg(view, {
          perspective: orientation,
          showFog: false,
          ...readCrossroadsChessAppearance(),
        }),
      );
    },
    renderMoves({ ply }, jump) {
      renderMoveRows(moveList, moves, ply, jump);
    },
  });
}

function sizedCrossroadsBoardSvg(svg: string): string {
  return svg.replace(/^<svg\b/, '<svg style="display:block;width:100%;height:auto"');
}

export async function createCrossroadsPlayAgainRoom(
  postgame: Pick<CrossroadsChessPostgameResponse, 'game' | 'state'>,
): Promise<string> {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pvp',
      gameSpecId: 'crossroads-chess',
      timeControl: postgame.game.timeControl ?? postgame.state.timeControl ?? defaultTimeControl(),
      rated: false,
      preferredColor: 'random',
    }),
  });
  if (!response.ok) throw new Error('crossroads_play_again_failed');
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('crossroads_play_again_missing_url');
  return body.url;
}

function defaultTimeControl(): CrossroadsChessTimeControl {
  return { initialMs: 300_000, incrementMs: 5_000 };
}

export function crossroadsChessInitialPlyFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get('ply');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

export function renderMoveRows(
  list: HTMLOListElement,
  moves: Array<{ move: CrossroadsChessMove; ply: number; color: CrossroadsChessColor }>,
  activePly: number,
  onJump: (ply: number) => void,
): void {
  list.replaceChildren();
  if (moves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'move-row move-empty';
    empty.textContent = 'No moves';
    list.append(empty);
    return;
  }
  const byPly = new Map<number, { move: CrossroadsChessMove; color: CrossroadsChessColor }>();
  for (const move of moves) byPly.set(move.ply, move);
  const maxPly = Math.max(...moves.map((move) => move.ply));
  const fullMoves = Math.ceil(maxPly / 2);
  for (let moveNumber = 1; moveNumber <= fullMoves; moveNumber += 1) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = String(moveNumber);
    row.append(
      number,
      moveCell(byPly.get(moveNumber * 2 - 1), 'white', moveNumber * 2 - 1, activePly, onJump),
      moveCell(byPly.get(moveNumber * 2), 'black', moveNumber * 2, activePly, onJump),
    );
    list.append(row);
  }
  scrollActiveMoveIntoView(list);
}

function moveCell(
  entry: { move: CrossroadsChessMove } | undefined,
  cell: 'white' | 'black',
  ply: number,
  activePly: number,
  onJump: (ply: number) => void,
): HTMLElement {
  if (!entry) {
    const empty = document.createElement('span');
    empty.className = `${cell}-ply move-empty`;
    return empty;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${cell}-ply${activePly === ply ? ' active' : ''}`;
  button.textContent = moveLabel(entry.move);
  button.title = `${capitalize(cell === 'white' ? 'white' : 'red')} ply ${ply}: ${moveLabel(
    entry.move,
  )}`;
  button.onclick = () => onJump(ply);
  return button;
}

function scrollActiveMoveIntoView(list: HTMLOListElement): void {
  window.requestAnimationFrame(() => {
    const active = list.querySelector<HTMLButtonElement>('button.active');
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const centeredDelta =
      activeRect.top - listRect.top - (list.clientHeight - activeRect.height) / 2;
    list.scrollTo({ top: Math.max(0, list.scrollTop + centeredDelta), behavior: 'auto' });
  });
}

export function postgameReplayMaxPly(postgame: CrossroadsChessPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: CrossroadsChessPostgameResponse,
  key: CrossroadsChessPostgameViewKey,
  ply: number,
): CrossroadsChessPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

function loadingView(): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const heading = document.createElement('h1');
  heading.textContent = 'Loading game';
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}

function errorTitle(status: number): string {
  if (status === 404) return 'Game not found';
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Crossroads Chess game is not available.';
  if (result.status === 503) return 'The postgame service is not available.';
  return result.error;
}

async function safeJson(response: Response): Promise<{ error?: unknown } | null> {
  try {
    return (await response.json()) as { error?: unknown };
  } catch {
    return null;
  }
}

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'red-wins') return 'Red wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

function moveLabel(move: CrossroadsChessMove): string {
  return `${move.from}-${move.to}${move.promotion ? `=${move.promotion[0].toUpperCase()}` : ''}`;
}

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
