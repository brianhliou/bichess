import {
  type CrossroadsChessBoard,
  type CrossroadsChessColor,
  type CrossroadsChessMove,
  type CrossroadsChessPlayerBoard,
  type CrossroadsChessPlayerView,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessBoard,
} from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CrossroadsChessPostgameResponse } from './crossroads-chess-postgame.js';
import { mountCrossroadsChessWatchReplay } from './watch-crossroads-chess-replay.js';

describe('Crossroads Chess watch replay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts a Crossroads TV replay with board, clocks, and controls', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const roomId = String(input).split('/').pop() ?? 'dchess_watch';
      return jsonResponse(postgameFixture(roomId));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');
    const onPlyChange = vi.fn();

    const handle = await mountCrossroadsChessWatchReplay(root, 'dchess_watch', {
      autoplay: false,
      onPlyChange,
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/crossroads-chess/games/dchess_watch');
    expect(handle.activeSampleId()).toBe('dchess_watch');
    expect(root.textContent).toContain('Human vs human');
    expect(root.textContent).toContain('White wins');
    expect(root.textContent).toContain('by Resignation');
    expect(root.textContent).toContain('1 plies');
    expect(root.textContent).toContain('3+2');
    expect(root.textContent).toContain('Casual');
    expect(root.textContent).toContain('White Player');
    expect(root.textContent).toContain('Red Player');
    expect(root.textContent).toContain('Ply 0 / 1');
    expect(root.querySelectorAll('.crossroads-live-svg')).toHaveLength(1);
    expect(root.querySelector('.watch-crossroads-layout .crossroads-watch-board')).not.toBeNull();
    expect(onPlyChange).toHaveBeenLastCalledWith(0, 1);

    root.querySelector<HTMLButtonElement>('[aria-label="Next move"]')?.click();
    expect(root.textContent).toContain('Ply 1 / 1 - White wins');
    expect(onPlyChange).toHaveBeenLastCalledWith(1, 1);
    root.querySelector<HTMLButtonElement>('[aria-label="Flip board"]')?.click();
    expect(root.querySelectorAll('.crossroads-live-svg')).toHaveLength(1);

    await handle.loadGame('dchess_next');
    expect(fetchSpy).toHaveBeenCalledWith('/api/crossroads-chess/games/dchess_next');
    expect(handle.activeSampleId()).toBe('dchess_next');

    handle.destroy();
    expect(root.childElementCount).toBe(0);
  });
});

function postgameFixture(roomId: string): CrossroadsChessPostgameResponse {
  const initial = createInitialCrossroadsChessBoard();
  const moved = movePiece(initial, 'a2', 'a3');
  const move: CrossroadsChessMove = { from: 'a2', to: 'a3' };
  const status = {
    type: 'finished' as const,
    winner: 'white' as const,
    reason: 'resignation' as const,
  };
  const startStatus = { type: 'playing' as const, turn: 'white' as const };
  const afterMoveStatus = { type: 'playing' as const, turn: 'red' as const };
  return {
    game: {
      roomId,
      variant: 'crossroads-chess',
      mode: 'pvp',
      whiteName: 'White Player',
      redName: 'Red Player',
      result: 'white-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-09T12:00:00.000Z',
      endedAt: '2026-06-09T12:05:00.000Z',
      rated: false,
      visibility: 'public',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    state: {
      status,
      moveNumber: 1,
      progressClock: 0,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [
      { type: 'move-played', at: 2, color: 'white', move, ply: 1 },
      { type: 'seat-resigned', at: 3, color: 'red', winner: 'white' },
    ],
    clocks: [
      { white: 180_000, red: 180_000 },
      { white: 178_000, red: 180_000 },
    ],
    view: openView(`${roomId}_truth`, 'white', moved, move, status),
    views: {
      white: openView(`${roomId}_white`, 'white', moved, move, status),
      truth: openView(`${roomId}_truth_v`, 'white', moved, move, status),
      red: openView(`${roomId}_red`, 'red', moved, move, status),
    },
    history: {
      white: [
        { ply: 0, view: openView(`${roomId}_white_0`, 'white', initial, undefined, startStatus) },
        { ply: 1, view: openView(`${roomId}_white_1`, 'white', moved, move, afterMoveStatus) },
      ],
      red: [
        { ply: 0, view: openView(`${roomId}_red_0`, 'red', initial, undefined, startStatus) },
        { ply: 1, view: openView(`${roomId}_red_1`, 'red', moved, move, afterMoveStatus) },
      ],
    },
  };
}

function movePiece(
  board: CrossroadsChessBoard,
  from: CrossroadsChessSquare,
  to: CrossroadsChessSquare,
): CrossroadsChessBoard {
  const next = { ...board };
  next[to] = next[from];
  delete next[from];
  return next;
}

function openView(
  id: string,
  perspective: CrossroadsChessColor,
  board: CrossroadsChessBoard,
  lastMove: CrossroadsChessMove | undefined,
  status: CrossroadsChessPlayerView['status'],
): CrossroadsChessPlayerView {
  return {
    id,
    perspective,
    board: Object.fromEntries(
      Object.entries(board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as CrossroadsChessPlayerBoard,
    visibleSquares: Object.keys(board) as CrossroadsChessSquare[],
    legalMoves: [],
    status,
    moveNumber: 1,
    ...(lastMove ? { lastMove } : {}),
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}
