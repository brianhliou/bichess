import type {
  ShogiColor,
  ShogiGameStatus,
  ShogiHand,
  ShogiHandRole,
  ShogiMove,
  ShogiPlayerView,
} from '@mistboard/game';
import { isShogiDrop } from '@mistboard/game';
import './game-shell.css';
import './live-dark-shogi.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*); the route-scoped
// theme + board/reserve overrides live in our own file.
import './dark-xiangqi-postgame.css';
import './dark-shogi-postgame.css';
import { darkShogiEnabled } from './feature-flags.js';
import { buildReviewMeta } from './review/game-review-meta.js';
import { createMoveList, type MoveListEntry } from './review/move-list.js';
import { mountReviewLayout } from './review/review-layout.js';
import { renderShogiBoardSvg, SHOGI_HAND_ORDER, shogiHandKomaSvg } from './shogi-render.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

export type DarkShogiPostgameViewKey = ShogiColor | 'truth';

export type DarkShogiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'dark-shogi';
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
    status: ShogiGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: ShogiColor;
    move?: ShogiMove;
    ply?: number;
    winner?: ShogiColor;
    reason?: string;
  }>;
  view: ShogiPlayerView;
  views?: Partial<Record<DarkShogiPostgameViewKey, ShogiPlayerView>>;
  history?: Partial<
    Record<DarkShogiPostgameViewKey, Array<{ ply: number; view: ShogiPlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: DarkShogiPostgameResponse }
  | { ok: false; status: number; error: string };

type PostgameEntry = { key: DarkShogiPostgameViewKey; label: string; view: ShogiPlayerView };

export function mountDarkShogiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'dark-shogi-postgame-route');
  setBoardFamily('shogi');
  root.replaceChildren(buildNav(), loadingView());
  if (!darkShogiEnabled()) {
    renderError(root, 'Fog Shogi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadDarkShogiPostgame(roomId)
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

export async function loadDarkShogiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(darkShogiPostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return { ok: true, postgame: (await response.json()) as DarkShogiPostgameResponse };
}

export function darkShogiPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/dark-shogi/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: DarkShogiPostgameResponse): void {
  const views = postgameViewEntries(postgame);
  // Each board host carries its own label + hand (reserve) strips; the review
  // layout arranges them (truth dominant, per-seat views as click-to-promote
  // secondaries) and owns the scrubber, keyboard, flip, and viewport-fill sizing.
  const targets = views.map((entry) => {
    const el = document.createElement('section');
    el.className = 'dxq-postgame__board-wrap';
    const heading = document.createElement('h2');
    heading.className = 'dxq-postgame__board-title';
    heading.textContent = entry.label;
    const topReserve = document.createElement('div');
    topReserve.className = 'dsg-postgame__reserve dsg-postgame__reserve--top';
    const board = document.createElement('div');
    board.className = 'dxq-postgame__board shogi-live-board';
    board.setAttribute('aria-label', `${entry.label} final Fog Shogi board`);
    const bottomReserve = document.createElement('div');
    bottomReserve.className = 'dsg-postgame__reserve dsg-postgame__reserve--bottom';
    el.append(heading, topReserve, board, bottomReserve);
    return { entry, el, board, topReserve, bottomReserve };
  });

  // Clickable move list (jump-to-ply + current-ply highlight), matching the
  // other postgame pages. Black (sente) moves first, so the default 'a' pairing
  // lands the first ply in the left column. Full truth moves are correct here —
  // /game postgame pages reveal by design.
  const moveList = createMoveList(moveEntries(postgame), { title: 'Moves' });

  const status = `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'dark-shogi',
    variantName: 'Fog Shogi',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'dark-shogi-review',
    ariaLabel: 'Fog Shogi postgame',
    title: 'Fog Shogi',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    moves: moveList.el,
    boards: targets.map((target) => ({
      key: target.entry.key,
      el: target.el,
      tier: target.entry.key === 'truth' ? 'primary' : 'secondary',
    })),
    boardAspect: 1,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: ShogiColor = flipped ? 'white' : 'black';
      const topColor: ShogiColor = orientation === 'black' ? 'white' : 'black';
      for (const { entry, board, topReserve, bottomReserve } of targets) {
        const view = postgameViewAtPly(postgame, entry.key, ply) ?? entry.view;
        board.innerHTML = renderShogiBoardSvg(view, {
          perspective: orientation,
          showFog: entry.key !== 'truth',
          showCoords: false,
        });
        const revealed: readonly ShogiColor[] =
          entry.key === 'truth' ? ['black', 'white'] : [entry.key];
        renderReserve(topReserve, topColor, ply, postgame, revealed, false);
        renderReserve(bottomReserve, orientation, ply, postgame, revealed, true);
      }
    },
    // Jump-to-ply routes through the layout's own `go`, the same path the
    // scrubber and keyboard use, so every triptych board stays consistent.
    renderMoves({ ply }, jump) {
      moveList.update(ply, jump);
    },
  });
}

function renderReserve(
  host: HTMLElement,
  color: ShogiColor,
  ply: number,
  postgame: DarkShogiPostgameResponse,
  revealed: readonly ShogiColor[],
  pointsUp: boolean,
): void {
  host.replaceChildren();
  if (!revealed.includes(color)) {
    return;
  }
  const hand = handForColorAtPly(postgame, color, ply);
  const entries = SHOGI_HAND_ORDER.filter((role) => (hand[role] ?? 0) > 0);
  if (entries.length === 0) return; // empty hand: leave the strip collapsed, no note
  for (const role of entries) {
    host.append(reserveKoma(role, color, hand[role] ?? 0, pointsUp));
  }
}

function reserveKoma(
  role: ShogiHandRole,
  color: ShogiColor,
  count: number,
  pointsUp: boolean,
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'dsg-postgame__reserve-koma';
  wrap.innerHTML = shogiHandKomaSvg(role, color, pointsUp);
  const badge = document.createElement('span');
  badge.className = 'dsg-postgame__reserve-count';
  badge.textContent = String(count);
  wrap.append(badge);
  return wrap;
}

// The reserve carried by a side at a given ply. The per-color fog views carry
// that side's own hand; the truth view carries no hand, so hands come from the
// color histories / final color views.
function handForColorAtPly(
  postgame: DarkShogiPostgameResponse,
  color: ShogiColor,
  ply: number,
): ShogiHand {
  const history = postgame.history?.[color];
  if (history && history.length > 0) {
    let selected = history[0] ?? null;
    for (const snapshot of history) {
      if (snapshot.ply > ply) break;
      selected = snapshot;
    }
    if (selected) return selected.view.hand;
  }
  return postgame.views?.[color]?.hand ?? {};
}

export function postgameViewEntries(postgame: DarkShogiPostgameResponse): PostgameEntry[] {
  const views = postgame.views;
  if (views?.black && views.truth && views.white) {
    return [
      { key: 'black', label: 'Black view', view: views.black },
      { key: 'truth', label: 'Server truth', view: views.truth },
      { key: 'white', label: 'White view', view: views.white },
    ];
  }
  return [{ key: 'truth', label: 'Server truth', view: postgame.view }];
}

export function postgameReplayMaxPly(postgame: DarkShogiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DarkShogiPostgameResponse,
  key: DarkShogiPostgameViewKey,
  ply: number,
): ShogiPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

// Flat move entries for the shared clickable list: one per played ply, keeping
// the shogi `notateShogiMove` notation (P*5e drops, `+` promotion suffix) the
// static timeline showed. `ply` is the cursor a click lands on (the scrubber's
// 1..maxPly). Fall back to array index when the wire entry omits ply.
function moveEntries(postgame: DarkShogiPostgameResponse): MoveListEntry[] {
  const moves = postgame.timeline.filter((entry) => entry.type === 'move-played' && entry.move);
  return moves.map((entry, index) => ({
    ply: entry.ply ?? index + 1,
    label: notateShogiMove(entry.move!),
  }));
}

function notateShogiMove(move: ShogiMove): string {
  if (isShogiDrop(move)) return `${move.drop}*${move.to}`;
  return `${move.from}${move.to}${move.promote ? '+' : ''}`;
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
  if (result.status === 404) return 'This Fog Shogi game is not available.';
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
  if (result === 'black-wins') return 'Black wins';
  if (result === 'white-wins') return 'White wins';
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
