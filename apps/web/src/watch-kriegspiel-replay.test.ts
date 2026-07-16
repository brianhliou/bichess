import {
  applyKriegspielMove,
  createInitialKriegspielState,
  getKriegspielPlayerView,
  type KriegspielGameState,
  type KriegspielPlayerView,
  type Move,
  type Square,
} from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  KriegspielPostgameResponse,
  KriegspielPostgameViewKey,
} from './kriegspiel-postgame.js';
import { mountKriegspielWatchReplay } from './watch-kriegspiel-replay.js';

describe('Kriegspiel watch replay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts a Kriegspiel TV triptych with controls', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const roomId = String(input).split('/').pop() ?? 'kr_watch';
      return jsonResponse(postgameFixture(roomId));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');
    const onPlyChange = vi.fn();

    const handle = await mountKriegspielWatchReplay(root, 'kr_watch', {
      autoplay: false,
      onPlyChange,
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/kriegspiel/games/kr_watch');
    expect(handle.activeSampleId()).toBe('kr_watch');
    expect(root.textContent).toContain('Human vs human');
    expect(root.textContent).toContain('White wins');
    expect(root.textContent).toContain('by Resignation');
    expect(root.textContent).toContain('1 plies');
    expect(root.textContent).toContain('3+2');
    expect(root.textContent).toContain('Ply 0 / 1');
    expect(root.querySelectorAll('.kriegspiel-live-svg')).toHaveLength(3);
    expect(onPlyChange).toHaveBeenLastCalledWith(0, 1);

    root.querySelector<HTMLButtonElement>('[aria-label="Next move"]')?.click();
    expect(root.textContent).toContain('Ply 1 / 1 - White wins');
    expect(onPlyChange).toHaveBeenLastCalledWith(1, 1);

    await handle.loadGame('kr_next');
    expect(fetchSpy).toHaveBeenCalledWith('/api/kriegspiel/games/kr_next');
    expect(handle.activeSampleId()).toBe('kr_next');

    handle.destroy();
    expect(root.childElementCount).toBe(0);
  });
});

function viewFor(state: KriegspielGameState, key: KriegspielPostgameViewKey): KriegspielPlayerView {
  if (key === 'truth') return truthView(state);
  return getKriegspielPlayerView(state, key);
}

function truthView(state: KriegspielGameState): KriegspielPlayerView {
  return {
    id: state.id,
    perspective: 'white',
    board: { ...state.board },
    visibleSquares: allSquares(),
    legalMoves: [],
    pawnTries: 0,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function allSquares(): Square[] {
  const squares: Square[] = [];
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank += 1) {
      squares.push(`${file}${rank}` as Square);
    }
  }
  return squares;
}

function postgameFixture(roomId: string): KriegspielPostgameResponse {
  const initial = createInitialKriegspielState(roomId);
  const move: Move = { from: 'e2', to: 'e4' };
  const moved = applyKriegspielMove(initial, move);
  const finished: KriegspielGameState = {
    ...moved,
    status: { type: 'finished', winner: 'white', reason: 'resignation' },
  };
  const keys: KriegspielPostgameViewKey[] = ['white', 'truth', 'black'];
  const history = Object.fromEntries(
    keys.map((key) => [
      key,
      [
        { ply: 0, view: viewFor(initial, key) },
        { ply: 1, view: viewFor(finished, key) },
      ],
    ]),
  ) as KriegspielPostgameResponse['history'];
  return {
    game: {
      roomId,
      variant: 'kriegspiel',
      mode: 'pvp',
      result: 'white-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-20T00:00:00.000Z',
      endedAt: '2026-06-20T00:05:00.000Z',
      rated: false,
      visibility: 'public',
      initialMs: 180_000,
      incrementMs: 2_000,
    },
    state: {
      status: finished.status,
      moveNumber: finished.moveNumber,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [
      {
        type: 'move-played',
        at: 1,
        color: 'white',
        move,
        ply: 1,
      },
      {
        type: 'game-ended',
        at: 2,
        winner: 'white',
        reason: 'resignation',
      },
    ],
    view: truthView(finished),
    views: {
      black: viewFor(finished, 'black'),
      truth: truthView(finished),
      white: viewFor(finished, 'white'),
    },
    history,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}
