// Landing TV controller state machine: live-follow via /api/watch/live, air a
// completed game once, freeze thereafter, never replay. mountShowcaseBoard is
// mocked; the tests drive the poll with fake timers and a stubbed fetch.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type MountRecord = {
  specId: string;
  roomId: string;
  options: {
    autoplay?: boolean;
    live?: boolean;
    onGameEnd?: () => void;
    loadPostgameOverride?: (
      roomId: string,
    ) => Promise<{ ok: true; postgame: unknown } | { ok: false }>;
    onLoadError?: () => boolean;
  };
  handle: {
    destroy: ReturnType<typeof vi.fn>;
    loadGame: ReturnType<typeof vi.fn>;
    jumpToPly: ReturnType<typeof vi.fn>;
  };
};

const mounts: MountRecord[] = [];

vi.mock('./showcase-board.js', () => ({
  mountShowcaseBoard: vi.fn(
    async (_root: HTMLElement, specId: string, roomId: string, options: MountRecord['options']) => {
      const handle = {
        activeSampleId: () => roomId,
        destroy: vi.fn(),
        loadGame: vi.fn(async () => {}),
        jumpToPly: vi.fn(),
        plyCount: () => 6,
        updateLoopPool: () => {},
      };
      mounts.push({ handle, options, roomId, specId });
      return handle;
    },
  ),
}));

import { mountLandingTv } from './landing-tv.js';

const POLL_MS = 4_000;

let featuredResponse: { featured: unknown } = { featured: null };
let root: HTMLElement;

function liveFeatured(roomId: string, ply: number, withPayload = true): unknown {
  return {
    roomId,
    gameSpecId: 'xiangqi',
    ply,
    players: [
      { color: 'red', isEngine: false, name: 'Ada' },
      { color: 'black', isEngine: true, name: 'Pikafish' },
    ],
    ...(withPayload ? { payload: { marker: `${roomId}@${ply}` } } : {}),
  };
}

async function flush(): Promise<void> {
  // Let the poll fetch + the serialized mount chain settle.
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

async function tick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(POLL_MS);
  await flush();
}

function mountController(
  initialPool: Array<{ roomId: string; specId: string; pov: 'white'; endedAt?: string }>,
) {
  return mountLandingTv(root, initialPool, {
    isConnected: () => true,
    loaderForId: async () => [],
    metadataByRoomId: {},
    namesByRoomId: {},
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mounts.length = 0;
  featuredResponse = { featured: null };
  root = document.createElement('div');
  document.body.append(root);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => featuredResponse, ok: true })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  root.remove();
});

const entryA = { pov: 'white' as const, roomId: 'gameA', specId: 'xiangqi' };
const entryB = { pov: 'white' as const, roomId: 'gameB', specId: 'xiangqi' };

test('boot FREEZES on the pool head (paused, jumped to end) and never auto-plays history', async () => {
  const tv = await mountController([entryA]);
  await flush();
  expect(mounts).toHaveLength(1);
  expect(mounts[0]!.roomId).toBe('gameA');
  expect(mounts[0]!.options.autoplay).toBe(false);
  expect(mounts[0]!.options.live).toBeUndefined();
  expect(mounts[0]!.handle.jumpToPly).toHaveBeenCalled();

  // The same head on later pool refreshes changes nothing.
  tv.updateCompletedPool([entryA]);
  await flush();
  await tick();
  expect(mounts).toHaveLength(1);
  tv.destroy();
});

test('a game that finishes DURING the session airs once, then freezes; history never airs', async () => {
  const tv = await mountController([entryA]);
  await flush();
  expect(mounts).toHaveLength(1); // frozen on gameA

  // gameB completes mid-session (new entry in a later pool): it airs once.
  tv.updateCompletedPool([entryB, entryA]);
  await flush();
  expect(mounts).toHaveLength(2);
  expect(mounts[1]!.roomId).toBe('gameB');
  expect(mounts[1]!.options.autoplay).toBe(true);

  // Airing ends: frozen in place; the same pool again airs nothing.
  mounts[1]!.options.onGameEnd?.();
  await flush();
  tv.updateCompletedPool([entryB, entryA]);
  await flush();
  await tick();
  expect(mounts).toHaveLength(2);
  tv.destroy();
});

test('airs the NEWEST unseen game, not the first one in the breadth-interleaved pool', async () => {
  // The server pool round-robins variants, so a refresh can reveal several
  // never-seen rooms at once with a stale one sorting first. Only the game that
  // actually finished most recently may air; the rest is history.
  const staleJungle = {
    endedAt: '2026-07-28T19:48:00Z',
    pov: 'white' as const,
    roomId: 'gameStaleJungle',
    specId: 'jungle',
  };
  const freshXiangqi = {
    endedAt: '2026-07-30T01:00:00Z',
    pov: 'white' as const,
    roomId: 'gameFreshXiangqi',
    specId: 'xiangqi',
  };
  const tv = await mountController([{ ...entryA, endedAt: '2026-07-29T12:00:00Z' }]);
  await flush();
  expect(mounts).toHaveLength(1);

  tv.updateCompletedPool([
    { ...entryA, endedAt: '2026-07-29T12:00:00Z' },
    staleJungle,
    freshXiangqi,
  ]);
  await flush();
  expect(mounts).toHaveLength(2);
  expect(mounts[1]!.roomId).toBe('gameFreshXiangqi');
  expect(mounts[1]!.options.autoplay).toBe(true);
  tv.destroy();
});

test('a jumpNow baseline refresh freezes on the new head instead of airing it', async () => {
  const tv = await mountController([entryA]);
  await flush();
  expect(mounts).toHaveLength(1);

  // First REAL pool replacing the static fallback: pre-session history, so it
  // re-freezes (paused) rather than airing, even though gameB is unseen. The
  // frozen handle is reused (same renderer kind + flags), so gameB loads into
  // the existing mount and re-jumps to its end.
  tv.updateCompletedPool([entryB], { jumpNow: true });
  await flush();
  expect(mounts).toHaveLength(1);
  expect(mounts[0]!.handle.loadGame).toHaveBeenCalledWith('gameB');
  expect(mounts[0]!.handle.jumpToPly).toHaveBeenCalled();
  tv.destroy();
});

// A followed game can leave the feed without ever becoming a retrievable
// finished game: abandoned by both players and reaped, or lost to a restart.
// Its last live frame is a dead position, so the hero goes back to the pool head
// rather than parking the homepage on a game that went nowhere.
test('a handoff whose finished-game load fails falls back to the pool head', async () => {
  featuredResponse = { featured: liveFeatured('deadGame', 2) };
  const tv = await mountController([entryA]);
  await flush();

  // Boot froze on gameA, then the live game took the board.
  expect(mounts).toHaveLength(2);
  const live = mounts[1]!;
  expect(live.roomId).toBe('deadGame');
  expect(live.options.live).toBe(true);

  // The room vanishes and its finished-game load 404s.
  live.handle.loadGame.mockImplementation(async () => {
    live.options.onLoadError?.();
  });
  featuredResponse = { featured: null };
  await tick();

  expect(mounts).toHaveLength(3);
  expect(mounts[2]!.roomId).toBe('gameA');
  expect(mounts[2]!.options.live).toBeUndefined();
  expect(mounts[2]!.options.autoplay).toBe(false);
  tv.destroy();
});

test('a live featured game mounts paused+live, follows new plies, and hands off on finish', async () => {
  featuredResponse = { featured: liveFeatured('liveGame', 3) };
  const tv = await mountController([]);
  await flush();

  // Live mount: paused board in live mode, jumped to the latest ply.
  expect(mounts).toHaveLength(1);
  const live = mounts[0]!;
  expect(live.roomId).toBe('liveGame');
  expect(live.options.live).toBe(true);
  expect(live.options.autoplay).toBe(false);
  expect(live.handle.jumpToPly).toHaveBeenCalled();
  // The live handle keeps its last frame on a failed load rather than wiping to
  // the error notice (the live→frozen handoff relies on this).
  expect(live.options.onLoadError?.()).toBe(true);

  // The override serves the poll payload for the live room.
  const served = await live.options.loadPostgameOverride?.('liveGame');
  expect(served).toEqual({ ok: true, postgame: { marker: 'liveGame@3' } });

  // A new ply arrives: same handle reloads and re-jumps (no re-mount).
  featuredResponse = { featured: liveFeatured('liveGame', 4) };
  await tick();
  expect(mounts).toHaveLength(1);
  expect(live.handle.loadGame).toHaveBeenCalledWith('liveGame');

  // The game leaves the feed: the handoff reuses the SAME live handle to load
  // the finished replay (no fresh mount), so a failed finished-game load can
  // keep the last frame instead of leaving an empty error box.
  live.handle.loadGame.mockClear();
  featuredResponse = { featured: null };
  await tick();
  expect(mounts).toHaveLength(1);
  expect(live.handle.loadGame).toHaveBeenCalledWith('liveGame');
  expect(live.handle.jumpToPly).toHaveBeenCalled();
  tv.destroy();
});

test('stale history never clobbers the board after a live handoff; a mid-session finish airs', async () => {
  // Freeze on gameA at boot, then go live, then finish.
  const tv = await mountController([entryA]);
  await flush();
  featuredResponse = { featured: liveFeatured('liveGame', 2) };
  await tick();
  featuredResponse = { featured: null };
  await tick();
  const beforeCount = mounts.length;
  expect(mounts[beforeCount - 1]!.roomId).toBe('liveGame');

  // Stale pool still headed by pre-session gameA: board stays put.
  tv.updateCompletedPool([entryA]);
  await tick();
  expect(mounts).toHaveLength(beforeCount);

  // A game that finished during the session arrives: it airs once.
  tv.updateCompletedPool([entryB, entryA]);
  await flush();
  expect(mounts).toHaveLength(beforeCount + 1);
  expect(mounts[beforeCount]!.roomId).toBe('gameB');
  expect(mounts[beforeCount]!.options.autoplay).toBe(true);
  tv.destroy();
});

test('the live game is never cut by pool updates', async () => {
  featuredResponse = { featured: liveFeatured('liveGame', 2) };
  const tv = await mountController([]);
  await flush();
  expect(mounts).toHaveLength(1);

  // Pool refresh while live: no board change, even with jumpNow.
  tv.updateCompletedPool([entryB], { jumpNow: true });
  await flush();
  expect(mounts).toHaveLength(1);
  tv.destroy();
});

test('a guest seat (null name on the live frame) is labelled Guest, matching the finished record', async () => {
  const namesByRoomId: Record<string, { first: string; second: string }> = {};
  const tv = await mountLandingTv(root, [entryA], {
    isConnected: () => true,
    loaderForId: async () => [],
    metadataByRoomId: {},
    namesByRoomId,
  });
  await flush();
  featuredResponse = {
    featured: {
      roomId: 'liveG',
      gameSpecId: 'jungle',
      ply: 3,
      players: [
        { color: 'red', isEngine: true, name: 'Misty' },
        { color: 'black', isEngine: false, name: null },
      ],
      payload: { marker: 'liveG@3' },
    },
  };
  await tick();
  expect(namesByRoomId.liveG).toEqual({ first: 'Misty', second: 'Guest' });
  tv.destroy();
});
