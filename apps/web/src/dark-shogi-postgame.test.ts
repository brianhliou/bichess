import {
  createInitialShogiState,
  getShogiPlayerView,
  type ShogiGameState,
  type ShogiPlayerView,
  type ShogiSquare,
  shogiSquareOf,
} from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DarkShogiPostgameResponse,
  darkShogiPostgameApiUrl,
  mountDarkShogiPostgame,
} from './dark-shogi-postgame.js';

describe('Dark Shogi postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_SHOGI_ENABLED', 'true');
    window.history.replaceState(null, '', '/dark-shogi/game/dsg_postgame');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('builds the public postgame API URL', () => {
    expect(darkShogiPostgameApiUrl('dsg room')).toBe('/api/dark-shogi/games/dsg%20room');
  });

  it('mounts the review with site nav, no play-again action, and keyboard replay', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountDarkShogiPostgame(root, 'dsg_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/dark-shogi/games/dsg_postgame');
    expect(root.querySelector('.site-nav')).not.toBeNull();
    expect(root.querySelector('.review-shell')).not.toBeNull();
    expect(root.textContent).toContain('Fog Shogi');
    expect(root.textContent).toContain('Black wins');
    expect(root.textContent).toContain('Black view');
    expect(root.textContent).toContain('Server truth');
    expect(root.textContent).toContain('White view');
    expect(root.textContent).not.toContain('Play again');
    expect(root.textContent).not.toContain('Opponent reserve: hidden');
    expect(root.querySelectorAll('.dxq-postgame__board-wrap')).toHaveLength(3);
    expect(root.querySelector('.review-stage')?.classList).toContain('review-stage--board-only');
    expect(root.querySelector('.review-stage .dsg-postgame__reserve')).not.toBeNull();
    // Current ply is read off the highlighted move (data-ply); ply 0 = the start
    // position, which has no move to highlight. (The scrubber's "Ply X of Y" status
    // was removed with the lichess control bar.)
    const currentPly = () =>
      root.querySelector('.review-move-list__move--current')?.getAttribute('data-ply') ?? '0';
    expect(currentPly()).toBe('2');

    // Moves render in the shared clickable list with the shogi notation, each a
    // jump-to-ply button that drives the same ply state the scrubber uses.
    const moveButtons = root.querySelectorAll<HTMLButtonElement>('.review-move-list__move');
    expect(moveButtons).toHaveLength(2);
    expect(moveButtons[0]?.textContent).toContain('7g7f');
    expect(moveButtons[1]?.textContent).toContain('3c3d');
    moveButtons[0]?.click();
    expect(currentPly()).toBe('1');
    moveButtons[1]?.click();
    expect(currentPly()).toBe('2');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(currentPly()).toBe('1');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(currentPly()).toBe('0');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(currentPly()).toBe('2');
  });
});

function postgameFixture(): DarkShogiPostgameResponse {
  const initial = createInitialShogiState('dsg_postgame');
  const finalStatus = { type: 'finished', winner: 'black', reason: 'resignation' } as const;
  const black = reviewView(getShogiPlayerView(initial, 'black'), 'black', finalStatus);
  const white = reviewView(getShogiPlayerView(initial, 'white'), 'white', finalStatus);
  const truth = truthView(initial, finalStatus);
  const snapshots = [0, 1, 2];
  return {
    game: {
      roomId: 'dsg_postgame',
      variant: 'dark-shogi',
      mode: 'pvp',
      result: 'black-wins',
      termination: 'resignation',
      plyCount: 2,
      startedAt: '2026-06-20T08:00:00.000Z',
      endedAt: '2026-06-20T08:05:00.000Z',
      rated: false,
      visibility: 'private',
      initialMs: 180000,
      incrementMs: 2000,
    },
    state: {
      status: finalStatus,
      moveNumber: 2,
      timeControl: { initialMs: 180000, incrementMs: 2000 },
    },
    timeline: [
      { type: 'move-played', at: 2, color: 'black', move: { from: '7g', to: '7f' }, ply: 1 },
      { type: 'move-played', at: 3, color: 'white', move: { from: '3c', to: '3d' }, ply: 2 },
    ],
    view: truth,
    views: { black, truth, white },
    history: {
      black: snapshots.map((ply) => ({ ply, view: black })),
      truth: snapshots.map((ply) => ({ ply, view: truth })),
      white: snapshots.map((ply) => ({ ply, view: white })),
    },
  };
}

function reviewView(
  view: ShogiPlayerView,
  idSuffix: string,
  status: ShogiPlayerView['status'],
): ShogiPlayerView {
  return {
    ...view,
    id: `${view.id}_${idSuffix}`,
    hand: { P: 1 },
    legalMoves: [],
    moveNumber: 2,
    status,
  };
}

function truthView(state: ShogiGameState, status: ShogiPlayerView['status']): ShogiPlayerView {
  return {
    id: `${state.id}_truth`,
    perspective: 'black',
    board: state.board,
    hand: {},
    visibleSquares: allShogiSquares(),
    legalMoves: [],
    status,
    moveNumber: 2,
  };
}

function allShogiSquares(): ShogiSquare[] {
  const squares: ShogiSquare[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
      squares.push(shogiSquareOf(file, rankIndex));
    }
  }
  return squares;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}
