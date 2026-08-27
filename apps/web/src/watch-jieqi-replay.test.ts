import type { JieqiColor, JieqiMove, JieqiPlayerBoard, JieqiPlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JieqiPostgameResponse } from './live-jieqi-postgame.js';
import { jieqiWatchPostgameApiUrl, mountJieqiWatchReplay } from './watch-jieqi-replay.js';

describe('Jieqi watch replay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts a compact as-played Jieqi TV replay with no captures or reveal controls', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const roomId = String(input).split('/').pop() ?? 'jq_watch';
      return jsonResponse(postgameFixture(roomId));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    const handle = await mountJieqiWatchReplay(root, 'jq_watch', {
      autoplay: false,
      compact: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/jieqi/games/jq_watch/watch');
    expect(handle.activeSampleId()).toBe('jq_watch');
    expect(root.textContent).toContain('Red');
    expect(root.textContent).toContain('Black');
    expect(root.querySelectorAll('.jieqi-board')).toHaveLength(1);

    // The homepage widget replays the finished game the way it was PLAYED: the
    // soldier that moved is face-up, and the chariot nobody ever moved is not.
    const board = root.querySelector('.jieqi-board')?.innerHTML ?? '';
    expect(board).toContain('red soldier');
    expect(board).toContain('hidden piece');
    expect(board).not.toContain('red chariot');
    // No control bar in compact mode, so no reveal affordance either.
    expect(root.querySelector('[aria-label="Reveal hidden identities"]')).toBeNull();
    for (const strip of root.querySelectorAll('.replay-captures')) {
      expect(strip.childElementCount).toBe(0);
    }

    await handle.loadGame('jq_next');
    expect(fetchSpy).toHaveBeenCalledWith('/api/jieqi/games/jq_next/watch');
    expect(handle.activeSampleId()).toBe('jq_next');

    handle.destroy();
    expect(root.childElementCount).toBe(0);
  });

  it('reveals the never-moved identities on /watch only when asked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(postgameFixture('jq_watch'))),
    );
    const root = document.createElement('div');

    const handle = await mountJieqiWatchReplay(root, 'jq_watch', { autoplay: false });
    const boardHtml = (): string => root.querySelector('.jieqi-board')?.innerHTML ?? '';

    expect(boardHtml()).toContain('hidden piece');
    expect(boardHtml()).not.toContain('red chariot');

    const revealBtn = root.querySelector<HTMLButtonElement>(
      '[aria-label="Reveal hidden identities"]',
    );
    expect(revealBtn?.textContent).toBe('Reveal');
    revealBtn?.click();

    expect(boardHtml()).toContain('red chariot');
    expect(boardHtml()).not.toContain('hidden piece');
    expect(revealBtn?.textContent).toBe('Hide');

    revealBtn?.click();
    expect(boardHtml()).toContain('hidden piece');

    handle.destroy();
  });

  it('still replays a payload built before the masked track existed', async () => {
    // An unrefreshed server cache (or a client ahead of the server) has truth only.
    // Falling back to it keeps the old revealed board, which beats a blank one.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const payload = postgameFixture('jq_watch');
        return jsonResponse({ ...payload, history: { truth: payload.history?.truth ?? [] } });
      }),
    );
    const root = document.createElement('div');

    const handle = await mountJieqiWatchReplay(root, 'jq_watch', {
      autoplay: false,
      compact: true,
    });

    const board = root.querySelector('.jieqi-board')?.innerHTML ?? '';
    expect(board).toContain('red soldier');
    expect(board).toContain('red chariot');

    handle.destroy();
  });

  it('encodes room ids in the dedicated finished-game watch endpoint', () => {
    expect(jieqiWatchPostgameApiUrl('jq room')).toBe('/api/jieqi/games/jq%20room/watch');
  });
});

// A minimal two-position finished-game fixture carrying BOTH watch tracks. a1 is
// the piece that never moves: revealed in truth, still face-down in masked.
function postgameFixture(roomId: string): JieqiPostgameResponse {
  const startBoard: JieqiPlayerBoard = {
    e1: { color: 'red', role: 'general', faceDown: false },
    a1: { color: 'red', role: 'chariot', faceDown: false },
    a4: { color: 'red', role: 'soldier', faceDown: false },
    e10: { color: 'black', role: 'general', faceDown: false },
  };
  const movedBoard: JieqiPlayerBoard = {
    e1: { color: 'red', role: 'general', faceDown: false },
    a1: { color: 'red', role: 'chariot', faceDown: false },
    a5: { color: 'red', role: 'soldier', faceDown: false },
    e10: { color: 'black', role: 'general', faceDown: false },
  };
  const mask = (board: JieqiPlayerBoard): JieqiPlayerBoard => ({
    ...board,
    a1: { color: 'red', faceDown: true },
  });
  const move: JieqiMove = { from: 'a4', to: 'a5' };
  const finished = {
    type: 'finished' as const,
    winner: 'red' as const,
    reason: 'resignation' as const,
  };
  const playingRed = { type: 'playing' as const, turn: 'red' as const };
  const playingBlack = { type: 'playing' as const, turn: 'black' as const };

  return {
    game: {
      roomId,
      variant: 'jieqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-13T12:00:00.000Z',
      endedAt: '2026-06-13T12:05:00.000Z',
      rated: false,
      visibility: 'public',
      initialMs: 180_000,
      incrementMs: 2_000,
    },
    state: {
      status: finished,
      moveNumber: 1,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [
      { type: 'move-played', at: 2, color: 'red', move, ply: 1 },
      { type: 'seat-resigned', at: 3, color: 'black', winner: 'red' },
    ],
    view: view('red', movedBoard, move, finished),
    history: {
      truth: [
        { ply: 0, view: view('red', startBoard, undefined, playingRed) },
        { ply: 1, view: view('red', movedBoard, move, playingBlack) },
      ],
      masked: [
        { ply: 0, view: view('red', mask(startBoard), undefined, playingRed) },
        { ply: 1, view: view('red', mask(movedBoard), move, playingBlack) },
      ],
    },
  };
}

function view(
  perspective: JieqiColor,
  board: JieqiPlayerBoard,
  lastMove: JieqiMove | undefined,
  status: JieqiPlayerView['status'],
): JieqiPlayerView {
  return {
    id: `${perspective}-${Object.keys(board).join('')}`,
    perspective,
    board,
    legalMoves: [],
    captured: [],
    inCheck: false,
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
