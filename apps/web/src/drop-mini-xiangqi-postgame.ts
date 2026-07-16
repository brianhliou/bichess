import type {
  DropMiniXiangqiMove,
  DropMiniXiangqiPlayerView,
  MiniXiangqiColor,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import './landing.css';
import './game-route.css';
import {
  type DropMiniXiangqiViewKey,
  dropMiniXiangqiBoardView,
  dropMiniXiangqiMoveLabel,
  fillDropMiniXiangqiReserve,
} from './drop-mini-xiangqi-view.js';
import { dropMiniXiangqiEnabled } from './feature-flags.js';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { createPane } from './replay-board.js';
import { buildReviewMeta } from './review/game-review-meta.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

// Postgame review for Drop Mini Xiangqi. Perfect-information 7x7 board plus per-
// seat drop RESERVES (rendered as top/bottom strips flanking the board). The
// shared review layout owns the shell, scrubber, keyboard, flip, and viewport-
// fill sizing; this module supplies the board host + reserves + move list.

export type DropMiniXiangqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'drop-mini-xiangqi';
    mode: string;
    redName?: string | null;
    blackName?: string | null;
    result: string;
    termination: string;
    plyCount: number;
    startedAt: string;
    endedAt: string;
    rated: boolean;
    visibility: string;
    initialMs: number | null;
    incrementMs: number | null;
    players?: Array<{
      color: string;
      name: string;
      rating: number | null;
      kind: 'account' | 'guest' | 'engine';
    }>;
    pveEngineId?: string | null;
  };
  state: {
    status: { type: string; winner?: MiniXiangqiColor | null; reason?: string };
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: MiniXiangqiColor;
    move?: DropMiniXiangqiMove;
    ply?: number;
    winner?: MiniXiangqiColor;
    reason?: string;
  }>;
  view: DropMiniXiangqiPlayerView;
  views?: Partial<Record<DropMiniXiangqiViewKey, DropMiniXiangqiPlayerView>>;
  history?: Partial<
    Record<DropMiniXiangqiViewKey, Array<{ ply: number; view: DropMiniXiangqiPlayerView }>>
  >;
};

type DropMiniMoveEntry = { move: DropMiniXiangqiMove; ply: number; color: MiniXiangqiColor };

type LoadResult =
  | { ok: true; postgame: DropMiniXiangqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountDropMiniXiangqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  setBoardFamily('xiangqi');
  installMiniXiangqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  if (!dropMiniXiangqiEnabled()) {
    renderError(root, 'Drop Mini Xiangqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadDropMiniXiangqiPostgame(roomId)
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

export async function loadDropMiniXiangqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(dropMiniXiangqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as DropMiniXiangqiPostgameResponse,
  };
}

export function dropMiniXiangqiPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/drop-mini-xiangqi/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: DropMiniXiangqiPostgameResponse): void {
  const pane = createPane('', 'truth', true, 'split');
  pane.boardEl.classList.add('mini-xiangqi-live-board');

  const moves: DropMiniMoveEntry[] = postgame.timeline
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        move: DropMiniXiangqiMove;
        ply: number;
        color: MiniXiangqiColor;
      } =>
        entry.type === 'move-played' &&
        !!entry.move &&
        typeof entry.ply === 'number' &&
        !!entry.color,
    )
    .map((entry) => ({ move: entry.move, ply: entry.ply, color: entry.color }));

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
    markerId: 'drop-mini-xiangqi',
    variantName: 'Drop Mini Xiangqi',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'drop-mini-xiangqi-review',
    ariaLabel: 'Drop Mini Xiangqi postgame',
    title: 'Drop Mini Xiangqi',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    moves: movesCard,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: 516 / 516,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: MiniXiangqiColor = flipped ? 'black' : 'red';
      const view =
        postgameViewAtPly(postgame, 'truth', ply) ?? postgame.views?.truth ?? postgame.view;
      pane.boardEl.innerHTML = renderMiniXiangqiBoardSvg(
        dropMiniXiangqiBoardView(view),
        orientation,
        { showFog: false },
      );
      const top = orientation === 'red' ? 'black' : 'red';
      fillDropMiniXiangqiReserve(pane.topCapturesEl, view, top);
      fillDropMiniXiangqiReserve(pane.capturesEl, view, orientation);
    },
    renderMoves({ ply }, jump) {
      renderMoveRows(moveList, moves, ply, jump);
    },
  });
}

export async function createDropMiniXiangqiPlayAgainRoom(
  postgame: DropMiniXiangqiPostgameResponse,
): Promise<string> {
  const mode =
    postgame.game.mode === 'pve' && typeof postgame.game.pveEngineId === 'string' ? 'pve' : 'pvp';
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode,
      gameSpecId: 'drop-mini-xiangqi',
      preferredColor: 'random',
      ...(mode === 'pve' ? { engineId: postgame.game.pveEngineId } : { rated: false }),
      ...(postgameTimeControl(postgame) ? { timeControl: postgameTimeControl(postgame) } : {}),
    }),
  });
  if (!response.ok) throw new Error('drop_mini_xiangqi_play_again_failed');
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('drop_mini_xiangqi_play_again_missing_url');
  return body.url;
}

export function postgameViewEntries(
  postgame: DropMiniXiangqiPostgameResponse,
): Array<{ key: DropMiniXiangqiViewKey; label: string; view: DropMiniXiangqiPlayerView }> {
  return [{ key: 'truth', label: 'Server truth', view: postgame.views?.truth ?? postgame.view }];
}

export function postgameReplayMaxPly(postgame: DropMiniXiangqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DropMiniXiangqiPostgameResponse,
  key: DropMiniXiangqiViewKey,
  ply: number,
): DropMiniXiangqiPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

function renderMoveRows(
  list: HTMLOListElement,
  moves: DropMiniMoveEntry[],
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
  const byPly = new Map<number, DropMiniMoveEntry>();
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
  entry: DropMiniMoveEntry | undefined,
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
  const label = dropMiniXiangqiMoveLabel(entry.move);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${cell}-ply${activePly === ply ? ' active' : ''}`;
  button.textContent = label;
  button.title = `${entry.color} ply ${ply}: ${label}`;
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

function resultLabel(result: string): string {
  if (result === 'red-wins') return 'Red wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
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
  if (status === 503) return 'Postgame unavailable';
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Drop Mini Xiangqi game is not available.';
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

function postgameTimeControl(
  postgame: DropMiniXiangqiPostgameResponse,
): { initialMs: number; incrementMs: number } | null {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null || incrementMs === null) return null;
  return { initialMs, incrementMs };
}

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
