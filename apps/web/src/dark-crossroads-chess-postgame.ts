import type {
  CrossroadsChessColor,
  CrossroadsChessGameStatus,
  CrossroadsChessMove,
  CrossroadsChessPlayerView,
} from '@mistboard/game';
import './game-shell.css';
import './live-crossroads-chess.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*); jieqi/banqi reuse it
// the same way. The route-scoped theme + board overrides live in our own file.
import './dark-xiangqi-postgame.css';
import './dark-crossroads-chess-postgame.css';
import {
  readCrossroadsChessAppearance,
  renderCrossroadsChessBoardSvg,
} from './crossroads-chess-render.js';
import { darkCrossroadsChessEnabled } from './feature-flags.js';
import { buildReviewMeta } from './review/game-review-meta.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

export type DarkCrossroadsChessPostgameViewKey = CrossroadsChessColor | 'truth';

export type DarkCrossroadsChessPostgameResponse = {
  game: {
    roomId: string;
    variant: 'dark-crossroads-chess';
    mode: string;
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
    status: CrossroadsChessGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
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
  view: CrossroadsChessPlayerView;
  views?: Partial<Record<DarkCrossroadsChessPostgameViewKey, CrossroadsChessPlayerView>>;
  history?: Partial<
    Record<
      DarkCrossroadsChessPostgameViewKey,
      Array<{ ply: number; view: CrossroadsChessPlayerView }>
    >
  >;
};

type LoadResult =
  | { ok: true; postgame: DarkCrossroadsChessPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountDarkCrossroadsChessPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'dark-crossroads-chess-postgame-route');
  setBoardFamily('chess');
  root.replaceChildren(buildNav(), loadingView());
  if (!darkCrossroadsChessEnabled()) {
    renderError(
      root,
      'Dark Crossroads Chess unavailable',
      'This route is not enabled in this build.',
    );
    return;
  }
  void loadDarkCrossroadsChessPostgame(roomId)
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

export async function loadDarkCrossroadsChessPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(darkCrossroadsChessPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as DarkCrossroadsChessPostgameResponse,
  };
}

export function darkCrossroadsChessPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/dark-crossroads-chess/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: DarkCrossroadsChessPostgameResponse): void {
  const views = postgameViewEntries(postgame);
  const appearance = readCrossroadsChessAppearance();
  // Each board host carries its own label; the review layout arranges them
  // (truth dominant, per-seat views as click-to-promote secondaries) and owns
  // the scrubber, keyboard, flip, and viewport-fill sizing.
  const targets = views.map((entry) => {
    const el = document.createElement('section');
    el.className = 'dxq-postgame__board-wrap';
    const heading = document.createElement('h2');
    heading.className = 'dxq-postgame__board-title';
    heading.textContent = entry.label;
    const board = document.createElement('div');
    board.className = 'dxq-postgame__board crossroads-live-board';
    board.setAttribute('aria-label', `${entry.label} final Dark Crossroads Chess board`);
    el.append(heading, board);
    return { entry, el, board };
  });

  const status = `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'dark-crossroads',
    variantName: 'Dark Crossroads Chess',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'dark-crossroads-chess-review',
    ariaLabel: 'Dark Crossroads Chess postgame',
    title: 'Dark Crossroads Chess',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    moves: timelinePanel(postgame),
    boards: targets.map((target) => ({
      key: target.entry.key,
      el: target.el,
      tier: target.entry.key === 'truth' ? 'primary' : 'secondary',
    })),
    boardAspect: 6 / 8,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: CrossroadsChessColor = flipped ? 'red' : 'white';
      for (const { entry, board } of targets) {
        const view = postgameViewAtPly(postgame, entry.key, ply) ?? entry.view;
        board.innerHTML = renderCrossroadsChessBoardSvg(view, {
          perspective: orientation,
          showFog: entry.key !== 'truth',
          coords: false,
          ...appearance,
        });
      }
    },
  });
}

export function postgameViewEntries(postgame: DarkCrossroadsChessPostgameResponse): Array<{
  key: DarkCrossroadsChessPostgameViewKey;
  label: string;
  view: CrossroadsChessPlayerView;
}> {
  const views = postgame.views;
  if (views?.white && views.truth && views.red) {
    return [
      { key: 'white', label: 'White view', view: views.white },
      { key: 'truth', label: 'Server truth', view: views.truth },
      { key: 'red', label: 'Red view', view: views.red },
    ];
  }
  return [{ key: 'truth', label: 'Server truth', view: postgame.view }];
}

export function postgameReplayMaxPly(postgame: DarkCrossroadsChessPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DarkCrossroadsChessPostgameResponse,
  key: DarkCrossroadsChessPostgameViewKey,
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

function timelinePanel(postgame: DarkCrossroadsChessPostgameResponse): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Moves';
  const list = document.createElement('ol');
  list.className = 'dxq-postgame__moves';
  const moves = postgame.timeline.filter((entry) => entry.type === 'move-played' && entry.move);
  if (moves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'dxq-postgame__move';
    empty.textContent = 'No moves';
    list.append(empty);
  } else {
    // One numbered row per White+Red pair (White moves first). Fall back to array
    // index / ply parity when the wire entry omits ply or color.
    const rows = new Map<number, { white?: string; red?: string }>();
    moves.forEach((entry, index) => {
      const ply = entry.ply ?? index + 1;
      const color = entry.color ?? (ply % 2 === 1 ? 'white' : 'red');
      const moveNumber = Math.max(1, Math.ceil(ply / 2));
      const row = rows.get(moveNumber) ?? {};
      const text = `${entry.move!.from}-${entry.move!.to}`;
      if (color === 'red') row.red = text;
      else row.white = text;
      rows.set(moveNumber, row);
    });
    for (const [moveNumber, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const item = document.createElement('li');
      item.className = 'dxq-postgame__move';
      const number = document.createElement('span');
      number.className = 'dxq-postgame__move-number';
      number.textContent = String(moveNumber);
      const white = document.createElement('span');
      white.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--white';
      white.textContent = row.white ?? '';
      const red = document.createElement('span');
      red.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--red';
      red.textContent = row.red ?? '';
      item.append(number, white, red);
      list.append(item);
    }
  }
  panel.append(heading, list);
  return panel;
}

function loadingView(): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = 'Loading game';
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
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
  if (result.status === 404) return 'This Dark Crossroads Chess game is not available.';
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

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
