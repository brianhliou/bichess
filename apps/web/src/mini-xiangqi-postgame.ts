import {
  createInitialMiniXiangqiBoard,
  type MiniXiangqiColor,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
} from '@mistboard/game';
import './landing.css';
import './game-route.css';
import {
  installMiniXiangqiBoardStyles,
  miniXiangqiPieceGhostSvg,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { type MiniXiangqiViewKey, miniXiangqiMoveLabel } from './mini-xiangqi-view.js';
import { createPane } from './replay-board.js';
import { capturedByDiff } from './review/captured-diff.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { createFlankCaptures } from './review/flank-captures.js';
import { buildReviewMeta } from './review/game-review-meta.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

// Mini Xiangqi's open view carries no captured list, so derive it by diffing the
// standard opening against the current board (grouping handled by fillCapturedPool).
const MINI_XIANGQI_INITIAL_PIECES = Object.values(createInitialMiniXiangqiBoard()).filter(
  (piece): piece is NonNullable<typeof piece> => Boolean(piece),
);

function miniXiangqiCaptured(view: MiniXiangqiPlayerView): Array<{
  owner: MiniXiangqiColor;
  role: (typeof MINI_XIANGQI_INITIAL_PIECES)[number]['role'];
}> {
  const current = Object.values(view.board)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => !entry.shrouded)
    .map((entry) => entry.piece);
  return capturedByDiff(MINI_XIANGQI_INITIAL_PIECES, current);
}

// Postgame review for Mini Xiangqi. Perfect-information 7x7 board: one review
// surface, one per-ply history. The shared review layout owns the shell,
// scrubber, keyboard, flip, and viewport-fill sizing; this module supplies the
// board host + move list.

export type MiniXiangqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'mini-xiangqi';
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
    move?: MiniXiangqiMove;
    ply?: number;
    winner?: MiniXiangqiColor;
    reason?: string;
  }>;
  view: MiniXiangqiPlayerView;
  views?: Partial<Record<MiniXiangqiViewKey, MiniXiangqiPlayerView>>;
  history?: Partial<
    Record<MiniXiangqiViewKey, Array<{ ply: number; view: MiniXiangqiPlayerView }>>
  >;
};

type MiniMoveEntry = { move: MiniXiangqiMove; ply: number; color: MiniXiangqiColor };

type LoadResult =
  | { ok: true; postgame: MiniXiangqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountMiniXiangqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  setBoardFamily('xiangqi');
  installMiniXiangqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  void loadMiniXiangqiPostgame(roomId)
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

export async function loadMiniXiangqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(miniXiangqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as MiniXiangqiPostgameResponse,
  };
}

export function miniXiangqiPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/mini-xiangqi/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: MiniXiangqiPostgameResponse): void {
  const pane = createPane('', 'truth', false, 'single');
  pane.boardEl.classList.add('mini-xiangqi-live-board');
  // Flank layout: capture columns beside the board (opponent top-left, near side
  // bottom-right) so the board keeps its full height and grows to fill it.
  const flankAnchor = pane.boardEl.nextSibling;
  const flankParent = pane.boardEl.parentElement;
  const flank = createFlankCaptures(pane.boardEl);
  flankParent?.insertBefore(flank.host, flankAnchor);

  const moves: MiniMoveEntry[] = postgame.timeline
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        move: MiniXiangqiMove;
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
    markerId: 'mini-xiangqi',
    variantName: 'Mini Xiangqi',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'mini-xiangqi-review',
    ariaLabel: 'Mini Xiangqi postgame',
    title: 'Mini Xiangqi',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    moves: movesCard,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: 516 / 516,
    boardCols: 7,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: MiniXiangqiColor = flipped ? 'black' : 'red';
      const view =
        postgameViewAtPly(postgame, 'truth', ply) ?? postgame.views?.truth ?? postgame.view;
      pane.boardEl.innerHTML = renderMiniXiangqiBoardSvg(view, orientation, { showFog: false });
      const captured = miniXiangqiCaptured(view);
      const opponent: MiniXiangqiColor = orientation === 'red' ? 'black' : 'red';
      flank.leftColumn.replaceChildren();
      flank.rightColumn.replaceChildren();
      fillCapturedPoolWith(flank.leftColumn, captured, orientation, miniXiangqiPieceGhostSvg);
      fillCapturedPoolWith(flank.rightColumn, captured, opponent, miniXiangqiPieceGhostSvg);
    },
    renderMoves({ ply }, jump) {
      renderMoveRows(moveList, moves, ply, jump);
    },
  });
}

export function postgameViewEntries(
  postgame: MiniXiangqiPostgameResponse,
): Array<{ key: MiniXiangqiViewKey; label: string; view: MiniXiangqiPlayerView }> {
  return [{ key: 'truth', label: 'Server truth', view: postgame.views?.truth ?? postgame.view }];
}

export function postgameReplayMaxPly(postgame: MiniXiangqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: MiniXiangqiPostgameResponse,
  key: MiniXiangqiViewKey,
  ply: number,
): MiniXiangqiPlayerView | null {
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
  moves: MiniMoveEntry[],
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
  const byPly = new Map<number, MiniMoveEntry>();
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
  entry: MiniMoveEntry | undefined,
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
  const label = miniXiangqiMoveLabel(entry.move);
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
  if (result.status === 404) return 'This Mini Xiangqi game is not available.';
  if (result.status === 503) return 'The postgame service is not available.';
  return result.error === 'request_failed' ? 'The request failed.' : `Error: ${result.error}`;
}

async function safeJson(response: Response): Promise<{ error?: unknown } | null> {
  try {
    return (await response.json()) as { error?: unknown };
  } catch {
    return null;
  }
}

function labelize(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
