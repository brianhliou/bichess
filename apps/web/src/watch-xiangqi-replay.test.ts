import { createInitialXiangqiState, getStandardXiangqiPlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { xiangqiAppearanceChangedEvent } from './theme.js';
import { mountXiangqiWatchReplay } from './watch-xiangqi-replay.js';
import type { XiangqiPostgameResponse } from './xiangqi-postgame.js';

describe('Xiangqi watch replay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('repaints the current position when the board layout changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(postgameFixture())),
    );
    const root = document.createElement('div');
    window.history.replaceState(null, '', '/watch/xq_watch');

    const handle = await mountXiangqiWatchReplay(root, 'xq_watch', { autoplay: false });
    expect(root.querySelector('.xq-live-svg--intersection')).not.toBeNull();

    window.history.replaceState(null, '', '/watch/xq_watch?xqLayout=cell');
    window.dispatchEvent(new Event(xiangqiAppearanceChangedEvent));

    expect(root.querySelector('.xq-live-svg--cell')).not.toBeNull();
    expect(root.querySelector('.xq-live-cell-river')).not.toBeNull();
    handle.destroy();
  });
});

function postgameFixture(): XiangqiPostgameResponse {
  const state = createInitialXiangqiState('xq_watch');
  const view = getStandardXiangqiPlayerView(state, 'red');
  return {
    game: {
      roomId: 'xq_watch',
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
