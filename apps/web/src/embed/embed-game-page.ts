// /embed/game/:roomId — one finished game, rendered alone, meant to be framed by
// someone else's page.
//
// Board on the left, move list on the right, a row of step buttons under the
// list, and a credit line back to the review page. That is the whole surface:
// no nav, no engine, no sign-in state. The board is the same renderer /watch
// uses for the same game, resolved by the game's own variant, so every variant
// the site can replay is embeddable without a per-variant branch here.
//
// Only FINISHED games load. The summary endpoint answers 404 for anything still
// in progress and the per-variant postgame endpoints apply the post-terminal
// reveal gate, so a fog game is framed only once its hidden information is
// public everywhere else too.

import '../app-base.css';
import '../review/move-list.css';
import type { GameEvent } from '@mistboard/game';
import { displayParticipantName, type FeaturedGame, matchupSeats } from '../game-display.js';
import { gameMetaForGame, reviewUrlForGame } from '../game-meta.js';
import type { GameMeta, ReplayHandle } from '../replay.js';
import { createMoveList, type MoveList } from '../review/move-list.js';
import { showcaseRendererKindForSpec, specIdForShowcaseVariant } from '../showcase-dispatch.js';
import { webVariantTenantForSpecId } from '../variant-tenant/registry.js';
import { boardAspectForSpec } from '../watch-board-aspect.js';
import type { EmbedGameRoute } from './embed-route.js';
import './embed.css';

// Below this frame width the move list drops under the board (mirrors the
// @media rule in embed.css; the two must agree or the board is sized for the
// wrong layout).
const STACK_BELOW_PX = 480;
// Width the move column takes beside the board, and the gap between them.
const RAIL_WIDTH_PX = 168;
const RAIL_GAP_PX = 10;
// Two seat rows (name + clock) frame the tenant boards; the chess renderer's
// board-edge clock rows are the same height. Reserved out of the box height so
// the board never pushes them off the bottom.
const SEAT_ROWS_PX = 56;
// In the stacked layout the move list keeps at least this much height.
const STACKED_MOVES_MIN_PX = 72;

export type EmbedGameOptions = {
  /** `?ply=N`: open on this ply rather than the final position. */
  startPly?: number | null;
};

function note(root: HTMLElement, message: string): void {
  const box = document.createElement('div');
  box.className = 'embed-note';
  box.textContent = message;
  root.replaceChildren(box);
}

async function loadEvents(roomId: string): Promise<GameEvent[]> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/events`);
  if (!resp.ok) throw new Error(`failed to load events for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { events: GameEvent[] };
  return data.events;
}

type MountBoardOptions = {
  metadataByRoomId: Record<string, GameMeta>;
  namesByRoomId: Record<string, { first: string; second: string }>;
  onPlyChange: (ply: number, maxPly: number) => void;
};

// The same dispatch /watch uses: a tenant with a watch renderer draws its own
// board; everything else is the chessground fallback, rendered as the single
// truth pane (a finished game's truth board is public by definition).
async function mountBoard(
  root: HTMLElement,
  specId: string,
  roomId: string,
  options: MountBoardOptions,
): Promise<ReplayHandle> {
  const kind = showcaseRendererKindForSpec(specId);
  const tenant = kind === 'chess' ? null : webVariantTenantForSpecId(specId);
  if (tenant?.watch) {
    return tenant.watch.mountReplay(root, roomId, {
      autoplay: false,
      compact: true,
      metadataByRoomId: options.metadataByRoomId,
      namesByRoomId: options.namesByRoomId,
      onGameEnd: () => {},
      onPlyChange: options.onPlyChange,
    });
  }
  const { mountReplay } = await import('../replay.js');
  return mountReplay(root, roomId, {
    autoplay: false,
    showControls: false,
    keyboardNav: false,
    revealOnFinish: true,
    clampPace: true,
    metadataMode: 'compact',
    compactClockLayout: 'board-edges',
    endStatusMode: 'clock',
    showCaptures: false,
    hideGameIdPill: true,
    loaderForId: loadEvents,
    metadataByRoomId: options.metadataByRoomId,
    onGameEnd: () => {},
    onPlyChange: options.onPlyChange,
  });
}

function control(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'embed-game-control';
  button.setAttribute('aria-label', label);
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

/** Board width that fits the box: the narrower of the room beside the rail and
 *  the room under the seat rows, at the variant's aspect ratio. Exported so the
 *  arithmetic is testable without a layout engine. */
export function fitBoardWidth(
  frame: { width: number; height: number },
  aspect: number,
  stacked: boolean,
): number {
  const availableWidth = stacked ? frame.width : frame.width - RAIL_WIDTH_PX - RAIL_GAP_PX;
  const reservedHeight = stacked ? SEAT_ROWS_PX + STACKED_MOVES_MIN_PX : SEAT_ROWS_PX;
  const availableHeight = frame.height - reservedHeight;
  return Math.max(120, Math.floor(Math.min(availableWidth, availableHeight * aspect)));
}

/** Board width for a board that stands alone in the box (the TV embed): the
 *  full width, or the height under the seat rows at the aspect ratio. */
export function fitSoloBoardWidth(
  frame: { width: number; height: number },
  aspect: number,
): number {
  return Math.max(120, Math.floor(Math.min(frame.width, (frame.height - SEAT_ROWS_PX) * aspect)));
}

export async function mountEmbedGame(
  root: HTMLElement,
  route: EmbedGameRoute,
  options: EmbedGameOptions = {},
): Promise<void> {
  document.body.classList.add('embed-body');
  document.documentElement.dataset.embed = 'game';
  root.className = 'embed-root';
  note(root, 'Loading…');

  let game: FeaturedGame | undefined;
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(route.roomId)}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      // In progress, private, or gone: all read as unavailable, never as broken.
      note(root, 'This game is not available.');
      return;
    }
    game = ((await response.json()) as { game?: FeaturedGame }).game;
  } catch {
    note(root, 'This game could not be loaded.');
    return;
  }
  if (!game || (game as { visibility?: string }).visibility === 'private') {
    note(root, 'This game is not available.');
    return;
  }

  const roomId = game.roomId ?? route.roomId;
  const specId = specIdForShowcaseVariant(game.variant);
  const aspect = boardAspectForSpec(specId);
  const metadataByRoomId: Record<string, GameMeta> = { [roomId]: gameMetaForGame(game) };
  const [firstSeat, secondSeat] = matchupSeats(game);
  const namesByRoomId = {
    [roomId]: {
      first: displayParticipantName(game, firstSeat),
      second: displayParticipantName(game, secondSeat),
    },
  };

  const frame = document.createElement('div');
  frame.className = 'embed-frame';
  const stage = document.createElement('div');
  stage.className = 'embed-game';
  const boardCol = document.createElement('div');
  boardCol.className = 'embed-board embed-game-board';
  const rail = document.createElement('div');
  rail.className = 'embed-game-rail';
  const movesRoot = document.createElement('div');
  movesRoot.className = 'embed-game-moves';
  const controls = document.createElement('div');
  controls.className = 'embed-game-controls';
  const status = document.createElement('span');
  status.className = 'embed-game-status';
  rail.append(movesRoot, controls);
  stage.append(boardCol, rail);
  frame.append(stage);

  const credit = document.createElement('a');
  credit.className = 'embed-credit';
  credit.href = reviewUrlForGame(game) ?? `/game/${encodeURIComponent(roomId)}`;
  credit.target = '_blank';
  credit.rel = 'noopener';
  const first = namesByRoomId[roomId]?.first ?? '';
  const second = namesByRoomId[roomId]?.second ?? '';
  credit.textContent = `${first} vs ${second} · ${game.result} · mistboard.com`;
  frame.append(credit);
  root.replaceChildren(frame);

  let handle: ReplayHandle | null = null;
  let moveList: MoveList | null = null;
  let currentPly = 0;
  let maxPly = 0;
  const clampPly = (ply: number): number => Math.max(0, Math.min(maxPly, ply));
  const jump = (ply: number): void => {
    handle?.jumpToPly?.(clampPly(ply));
  };
  const onPlyChange = (ply: number, max: number): void => {
    currentPly = ply;
    maxPly = max;
    moveList?.update(ply, jump);
    status.textContent = max > 0 ? `${ply} / ${max}` : '';
  };

  // Size the board to the box before the renderer paints, so the first frame
  // is already the right size, and again whenever the host resizes the frame.
  const fitBoard = (): void => {
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const stacked = rect.width < STACK_BELOW_PX;
    boardCol.style.width = `${fitBoardWidth(rect, aspect, stacked)}px`;
  };
  fitBoard();
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(fitBoard).observe(stage);
  }

  try {
    handle = await mountBoard(boardCol, specId, roomId, {
      metadataByRoomId,
      namesByRoomId,
      onPlyChange,
    });
  } catch {
    note(root, 'This game could not be loaded.');
    return;
  }

  const entries = handle.moveEntries?.() ?? [];
  maxPly = handle.plyCount?.() ?? entries.length;
  moveList = createMoveList(entries);
  movesRoot.append(moveList.el);

  controls.append(
    control('⏮', 'First move', () => jump(0)),
    control('◀', 'Previous move', () => jump(currentPly - 1)),
    control('▶', 'Next move', () => jump(currentPly + 1)),
    control('⏭', 'Last move', () => jump(maxPly)),
    status,
  );
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') jump(currentPly - 1);
    else if (event.key === 'ArrowRight') jump(currentPly + 1);
    else if (event.key === 'Home') jump(0);
    else if (event.key === 'End') jump(maxPly);
    else return;
    event.preventDefault();
  });

  // Land on the requested ply, or the final position: a finished game's embed
  // opens on its result, and the reader steps back from there.
  const start =
    options.startPly === null || options.startPly === undefined ? maxPly : options.startPly;
  if (handle.jumpToPly) jump(start);
  else onPlyChange(clampPly(start), maxPly);

  document.title = `${first} vs ${second} · Mistboard`;
}
