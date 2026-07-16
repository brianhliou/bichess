import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayHandle } from './replay';

// Mock the board mount + skeleton so the cycler logic can be driven without a
// real renderer, and force a deterministic "kind = spec id" so same-spec games
// share a renderer and different-spec games force a re-mount.
vi.mock('./showcase-board.js', () => ({ mountShowcaseBoard: vi.fn() }));
vi.mock('./chunk-load-recovery.js', () => ({ reloadForChunkLoadError: vi.fn() }));
vi.mock('./replay-skeleton.js', () => ({
  renderWatchReplayFailure: vi.fn(),
  renderWatchReplaySkeleton: vi.fn(),
}));
vi.mock('./showcase-dispatch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./showcase-dispatch')>();
  return { ...actual, showcaseRendererKindForSpec: (specId: string | null) => specId ?? 'chess' };
});

import { reloadForChunkLoadError } from './chunk-load-recovery.js';
import { renderWatchReplayFailure, renderWatchReplaySkeleton } from './replay-skeleton.js';
import { mountShowcaseBoard } from './showcase-board.js';
import { mountShowcaseCycler, type ShowcaseEntry } from './showcase-cycler.js';

const mountMock = vi.mocked(mountShowcaseBoard);
const reloadForChunkMock = vi.mocked(reloadForChunkLoadError);
const failureMock = vi.mocked(renderWatchReplayFailure);
const skeletonMock = vi.mocked(renderWatchReplaySkeleton);

type FakeHandle = ReplayHandle & {
  loadGame: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};
const mounted: Array<{ roomId: string; specId: string; handle: FakeHandle }> = [];
let capturedOnGameEnd: (() => void) | null | undefined = null;

function makeHandle(roomId: string): FakeHandle {
  return {
    activeSampleId: () => roomId,
    destroy: vi.fn(),
    loadGame: vi.fn().mockResolvedValue(undefined),
    updateLoopPool: vi.fn(),
  } as FakeHandle;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const POOL: ShowcaseEntry[] = [
  { roomId: 'g1', specId: 'dark-chess', pov: 'white' },
  { roomId: 'g2', specId: 'dark-chess', pov: 'white' },
  { roomId: 'j1', specId: 'jieqi', pov: 'white' },
];

beforeEach(() => {
  mounted.length = 0;
  capturedOnGameEnd = null;
  reloadForChunkMock.mockReset().mockReturnValue(false);
  failureMock.mockClear();
  skeletonMock.mockClear();
  mountMock.mockReset();
  mountMock.mockImplementation(async (_root, specId, roomId, opts) => {
    capturedOnGameEnd = opts.onGameEnd;
    const handle = makeHandle(roomId);
    mounted.push({ roomId, specId, handle });
    return handle;
  });
});

const opts = { metadataByRoomId: {}, namesByRoomId: {}, loaderForId: async () => [] };

describe('mountShowcaseCycler', () => {
  it('mounts the first pooled game on start', async () => {
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(mounted[0]!.roomId).toBe('g1');
  });

  it('advances same-kind games via loadGame (no re-mount)', async () => {
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    capturedOnGameEnd!(); // g1 finished
    await flush();
    // Still one mount; g1's handle loaded g2 in place.
    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(mounted[0]!.handle.loadGame).toHaveBeenCalledWith('g2');
  });

  it('re-mounts (destroy + skeleton) when the next game is a different kind', async () => {
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    capturedOnGameEnd!(); // g1 -> g2 (loadGame)
    await flush();
    capturedOnGameEnd!(); // g2 -> j1 (different kind)
    await flush();
    expect(mountMock).toHaveBeenCalledTimes(2);
    expect(mounted[1]!.roomId).toBe('j1');
    expect(mounted[0]!.handle.destroy).toHaveBeenCalledTimes(1);
    expect(skeletonMock).toHaveBeenCalledTimes(1);
  });

  it('pins the slot min-height across a cross-kind swap, releasing it after mount', async () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'offsetHeight', { value: 700, configurable: true });
    const pinnedAtMount: string[] = [];
    mountMock.mockImplementation(async (mountRoot, specId, roomId, o) => {
      pinnedAtMount.push((mountRoot as HTMLElement).style.minHeight);
      capturedOnGameEnd = o.onGameEnd;
      const handle = makeHandle(roomId);
      mounted.push({ roomId, specId, handle });
      return handle;
    });
    await mountShowcaseCycler(root, POOL, opts);
    expect(pinnedAtMount[0]).toBe(''); // initial mount: nothing to pin
    capturedOnGameEnd!(); // g1 -> g2 (loadGame, same kind: no pin)
    await flush();
    capturedOnGameEnd!(); // g2 -> j1 (cross-kind: pinned during the swap)
    await flush();
    expect(pinnedAtMount[1]).toBe('700px');
    expect(root.style.minHeight).toBe(''); // released once the new board is up
  });

  it('wraps to the front of the pool after the last game', async () => {
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    capturedOnGameEnd!(); // -> g2
    await flush();
    capturedOnGameEnd!(); // -> j1 (re-mount)
    await flush();
    capturedOnGameEnd!(); // j1 is last -> wraps to g1 (re-mount)
    await flush();
    expect(mounted[mounted.length - 1]!.roomId).toBe('g1');
  });

  it('jumpNow cuts to the new pool immediately', async () => {
    const handle = await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    handle.updatePool([{ roomId: 'x1', specId: 'banqi', pov: 'white' }], { jumpNow: true });
    await flush();
    expect(mounted[mounted.length - 1]!.roomId).toBe('x1');
  });

  it('reloads once when a cross-kind renderer hits a stale chunk', async () => {
    const chunkError = new TypeError(
      'Failed to fetch dynamically imported module: /assets/watch-jieqi-old.js',
    );
    reloadForChunkMock.mockReturnValue(true);
    mountMock.mockImplementation(async (_root, specId, roomId, options) => {
      if (roomId === 'j1') throw chunkError;
      capturedOnGameEnd = options.onGameEnd;
      const handle = makeHandle(roomId);
      mounted.push({ roomId, specId, handle });
      return handle;
    });
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    capturedOnGameEnd!(); // g1 -> g2
    await flush();
    capturedOnGameEnd!(); // g2 -> j1, whose old chunk is gone
    await flush();
    await flush();
    expect(reloadForChunkMock).toHaveBeenCalledWith(chunkError);
    expect(mountMock.mock.calls.map((call) => call[2])).toEqual(['g1', 'j1']);
    expect(failureMock).not.toHaveBeenCalled();
  });

  it('skips an ordinary failed renderer and mounts the next game', async () => {
    const pool = [POOL[0]!, POOL[2]!, { roomId: 'b1', specId: 'banqi', pov: 'white' as const }];
    mountMock.mockImplementation(async (_root, specId, roomId, options) => {
      if (roomId === 'j1') throw new Error('malformed replay');
      capturedOnGameEnd = options.onGameEnd;
      const handle = makeHandle(roomId);
      mounted.push({ roomId, specId, handle });
      return handle;
    });
    await mountShowcaseCycler(document.createElement('div'), pool, opts);
    capturedOnGameEnd!();
    await flush();
    await flush();
    expect(mountMock.mock.calls.map((call) => call[2])).toEqual(['g1', 'j1', 'b1']);
    expect(mounted[mounted.length - 1]!.roomId).toBe('b1');
    expect(failureMock).not.toHaveBeenCalled();
  });

  it('shows a terminal failure after every pooled renderer fails once', async () => {
    mountMock.mockRejectedValue(new Error('renderer unavailable'));
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    await flush();
    await flush();
    await flush();
    expect(mountMock.mock.calls.map((call) => call[2])).toEqual(['g1', 'g2', 'j1']);
    expect(failureMock).toHaveBeenCalledTimes(1);
    await flush();
    expect(mountMock).toHaveBeenCalledTimes(3);
  });

  it('destroy tears down the active handle', async () => {
    const handle = await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    handle.destroy();
    expect(mounted[0]!.handle.destroy).toHaveBeenCalled();
  });
});
