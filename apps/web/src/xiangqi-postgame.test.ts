import {
  applyMove,
  createInitialXiangqiState,
  getStandardXiangqiPlayerView,
} from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameChatApiUrl } from './review/spectator-chat.js';
import { mountXiangqiPostgame, xiangqiPostgameApiUrl } from './xiangqi-postgame.js';

describe('Xiangqi postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_XIANGQI_ENABLED', 'true');
    window.history.replaceState(null, '', '/');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('builds the family-native public postgame API URL', () => {
    expect(xiangqiPostgameApiUrl('xq room')).toBe('/api/xiangqi/games/xq%20room');
  });

  it('renders the review without play-again, home, or room action links', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/xiangqi/games/xq_postgame') return jsonResponse(postgameFixture());
      if (url === '/api/xiangqi/games/xq_postgame/analysis')
        return new Response(null, { status: 204 });
      if (url === '/api/chat/game/xq_postgame') return jsonResponse(chatFixture());
      if (url === '/api/games/xq_postgame/favorite')
        return jsonResponse({ authenticated: true, favorited: false });
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');
    root.dataset.favoriteGameId = 'xq_postgame';

    mountXiangqiPostgame(root, 'xq_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/xiangqi/games/xq_postgame');
    expect(fetchSpy).toHaveBeenCalledWith('/api/chat/game/xq_postgame');
    expect(root.querySelector('.site-nav')).not.toBeNull();
    expect(root.textContent).toContain('Xiangqi');
    expect(root.textContent).toContain('Spectator room');
    expect(root.textContent).toContain('hello from review');
    expect(root.querySelector<HTMLInputElement>('.review-spectator-chat__input')?.placeholder).toBe(
      'Please be nice in the chat!',
    );
    expect(root.querySelector('.review-actions--rail')).toBeNull();
    expect(root.querySelector('.dxq-postgame__actions')).toBeNull();
    const favorite = root.querySelector<HTMLButtonElement>(
      '.game-meta-card > .game-favorite-action--compact',
    );
    expect(favorite).not.toBeNull();
    expect(favorite?.textContent).toBe('☆');
    expect(favorite?.getAttribute('aria-label')).toBe('Save game');
    expect(root.textContent).not.toContain('Play again');
    expect(root.textContent).not.toContain('Back home');
    expect(root.querySelector<HTMLAnchorElement>('a[href="/room/xq_postgame"]')).toBeNull();
  });

  it('builds the game-scoped spectator chat API URL', () => {
    expect(gameChatApiUrl('xq room')).toBe('/api/chat/game/xq%20room');
  });

  it('shows the last-move marker at a nonzero ply and none at the start', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/xiangqi/games/xq_lastmove')
        return jsonResponse(postgameFixtureWithMove('xq_lastmove'));
      if (url === '/api/xiangqi/games/xq_lastmove/analysis')
        return new Response(null, { status: 204 });
      if (url === '/api/chat/game/xq_lastmove') return jsonResponse(chatFixture());
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountXiangqiPostgame(root, 'xq_lastmove');
    await flushPromises();

    // The review opens at the last mainline node (ply 1 here), so the b3-e3
    // markers render at the red-perspective intersections: the darker -from
    // shadow disc on b3, the gold destination ring on e3.
    const board = root.querySelector('.dxq-postgame__board');
    expect(board).not.toBeNull();
    expect(board!.innerHTML).toContain(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="96" cy="456" r="27"',
    );
    expect(board!.innerHTML).toContain(
      '<circle class="xq-live-lastmove-ring" cx="276" cy="456" r="26"',
    );

    // Jump back to the start: no move has been played, so no marker.
    root.querySelector<HTMLButtonElement>('[aria-label="First move"]')?.click();
    expect(board!.innerHTML).not.toContain('xq-live-lastmove-cell');
    expect(board!.innerHTML).not.toContain('xq-live-lastmove-ring');
  });
});

function postgameFixtureWithMove(roomId: string) {
  const move = { from: 'b3', to: 'e3' } as const;
  const state = applyMove(createInitialXiangqiState(roomId), move);
  const view = getStandardXiangqiPlayerView(state, 'red');
  return {
    game: {
      roomId,
      variant: 'xiangqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-07-01T12:00:00.000Z',
      endedAt: '2026-07-01T12:05:00.000Z',
      rated: false,
      visibility: 'public',
      initialMs: 180_000,
      incrementMs: 2_000,
      players: [
        { color: 'red', name: 'Red', rating: null, kind: 'guest' },
        { color: 'black', name: 'Black', rating: null, kind: 'guest' },
      ],
    },
    state: {
      status: view.status,
      moveNumber: view.moveNumber,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [{ type: 'move-played', at: 1, color: 'red', move: { ...move }, ply: 1 }],
    view,
    views: { truth: view },
    history: { truth: [{ ply: 1, view }] },
  };
}

function postgameFixture() {
  const state = createInitialXiangqiState('xq_postgame');
  const view = getStandardXiangqiPlayerView(state, 'red');
  return {
    game: {
      roomId: 'xq_postgame',
      variant: 'xiangqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 0,
      startedAt: '2026-07-01T12:00:00.000Z',
      endedAt: '2026-07-01T12:05:00.000Z',
      rated: false,
      visibility: 'public',
      initialMs: 180_000,
      incrementMs: 2_000,
      players: [
        { color: 'red', name: 'Red', rating: null, kind: 'guest' },
        { color: 'black', name: 'Black', rating: null, kind: 'guest' },
      ],
    },
    state: {
      status: view.status,
      moveNumber: view.moveNumber,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [],
    view,
    views: { truth: view },
    history: { truth: [{ ply: 0, view }] },
  };
}

function chatFixture() {
  return {
    lines: [
      {
        id: 'chln_review_1',
        handle: 'viewer',
        text: 'hello from review',
        createdAt: '2026-07-01T12:06:00.000Z',
      },
    ],
    canPost: true,
    canReport: false,
    viewerHandle: 'viewer',
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
