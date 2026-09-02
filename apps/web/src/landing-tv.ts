// Homepage Mistboard TV controller: one board that honors TRUE LIVE.
//
// The TV model (decided 2026-07-20, tightened 2026-07-21): follow the
// top-rated live game when one exists (moves arrive via a short poll of
// /api/watch/live); otherwise FREEZE on the last game's final position.
// Auto-playback of already-finished games is never broadcast: everything that
// was finished before the visitor arrived is baseline history and only ever
// shows as a frozen final position. The single exception is a game that
// COMPLETES while the visitor is watching — it airs exactly once at recorded
// pace (the delayed-release broadcast; this is also how a fog game's
// post-completion reveal reaches the board) and then freezes. Fog games can
// never appear live — the server's visibility policy is fail-closed.

import type { GameEvent } from '@mistboard/game';
import { reloadForChunkLoadError } from './chunk-load-recovery.js';
import { displayLiveName } from './game-display.js';
import type { GameMeta, ReplayHandle } from './replay.js';
import { renderWatchReplayFailure } from './replay-skeleton.js';
import { mountShowcaseBoard } from './showcase-board.js';
import type { ShowcaseEntry } from './showcase-cycler.js';
import { showcaseRendererKindForSpec } from './showcase-dispatch.js';

const LIVE_POLL_MS = 4_000;

export type LandingTvMode = 'live' | 'replay' | 'frozen';

type LiveFeatured = {
  roomId: string;
  gameSpecId: string;
  ply: number;
  players?: Array<{ color: string; name: string | null; isEngine: boolean }>;
  payload?: Record<string, unknown>;
};

export type LandingTvOptions = {
  metadataByRoomId: Record<string, GameMeta>;
  namesByRoomId: Record<string, { first: string; second: string }>;
  loaderForId: (roomId: string) => Promise<GameEvent[]>;
  // Fired when the board commits to a game/mode, so the caller can update the
  // out-of-board caption ("Xiangqi · live" / "recent · 2h ago").
  onGameChange?: (info: { roomId: string; specId: string; mode: LandingTvMode }) => void;
  // Polling stops for good once this reports false (landing unmounted).
  isConnected: () => boolean;
  // Which /api/watch/live channel to follow. The homepage follows 'top' (the
  // cross-channel election); the TV embed can pin one variant's channel.
  channel?: string;
};

export type LandingTvController = {
  // The completed-games showcase pool. Its HEAD is the site's most recently
  // finished game ("the last game" the board freezes on), but the rest is a
  // breadth interleave across variants, NOT recency order — so anything that
  // needs "the newest" out of the tail compares endedAt, never pool position.
  // Entries never seen in any prior pool are treated as games that finished
  // DURING this session and air once; everything else is history and only ever
  // shows frozen. `jumpNow` marks a
  // BASELINE refresh (the first real pool replacing the static fallback):
  // nothing airs, the board re-freezes on the new head. A live game is never
  // cut by pool updates.
  updateCompletedPool(entries: ShowcaseEntry[], opts?: { jumpNow?: boolean }): void;
  destroy(): void;
};

export async function mountLandingTv(
  root: HTMLElement,
  initialPool: ShowcaseEntry[],
  options: LandingTvOptions,
): Promise<LandingTvController> {
  let destroyed = false;
  let handle: ReplayHandle | null = null;
  let handleKind: string | null = null;
  // Whether the mounted handle was created live / autoplaying — a handle is
  // only reused across games when both match (the flags are baked at mount).
  let handleLive = false;
  let handleAutoplay = false;
  let mode: LandingTvMode | null = null;
  let currentRoomId: string | null = null;
  let currentSpecId: string | null = null;
  let completedPool = initialPool.slice();
  // Rooms fully shown this session (live-followed, aired, or frozen-displayed):
  // never re-aired. Failed rooms land here too so a broken payload can't loop.
  const airedRoomIds = new Set<string>();
  // Every room id that has EVER appeared in a pool this session. The boot pool
  // is pre-session history by definition, so it seeds the set; a later entry
  // outside it is a game that finished while the visitor was here — the only
  // kind that earns a one-time airing.
  const seenRoomIds = new Set<string>(initialPool.map((entry) => entry.roomId));
  // The one game queued to air (a mid-session completion), or null.
  let pendingAir: ShowcaseEntry | null = null;
  // Latest live payload per featured room; the loadPostgameOverride below reads
  // it, and clearing it makes the override fall back to the real finished-game
  // endpoint (the live→finished handoff).
  let livePayload: { roomId: string; payload: Record<string, unknown> } | null = null;
  let shownLivePly = -1;
  // Set by the live handle's onLoadError. Only the live->frozen handoff can
  // trip it: while following, loadPostgameOverride always answers.
  let liveLoadFailed = false;
  let pollTimer: number | null = null;

  // Serializes every mount/load: poll ticks, pool swaps, and onGameEnd all
  // funnel through here so re-mounts can't interleave.
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): void => {
    chain = chain
      .then(() => (destroyed ? undefined : task()))
      .catch((err) => {
        console.warn('[landing-tv] step failed', err);
        reloadForChunkLoadError(err);
      });
  };

  const notify = (roomId: string, specId: string, nextMode: LandingTvMode): void => {
    mode = nextMode;
    currentRoomId = roomId;
    currentSpecId = specId;
    options.onGameChange?.({ mode: nextMode, roomId, specId });
  };

  const loadPostgameOverride = async (
    roomId: string,
  ): Promise<{ ok: true; postgame: unknown } | { ok: false }> => {
    if (livePayload && livePayload.roomId === roomId) {
      return { ok: true, postgame: livePayload.payload };
    }
    return { ok: false };
  };

  const destroyHandle = (): void => {
    handle?.destroy();
    handle = null;
    handleKind = null;
  };

  // Mount (or re-mount) the board for a game. Same renderer kind reloads in
  // place; a different kind tears down and re-mounts, pinning the panel height
  // so the page doesn't jump across the swap (cycler behavior, kept).
  const mountGame = async (
    entry: { roomId: string; specId: string; pov: 'white' | 'black' },
    mountOptions: { autoplay: boolean; live: boolean; onGameEnd?: () => void },
  ): Promise<void> => {
    const kind = showcaseRendererKindForSpec(entry.specId);
    // Reuse the mounted handle only when its baked flags match; live and
    // autoplay are mount-time options, so a mismatch needs a fresh mount.
    if (
      handle &&
      handleKind === kind &&
      handleLive === mountOptions.live &&
      handleAutoplay === mountOptions.autoplay &&
      !mountOptions.live &&
      !mountOptions.onGameEnd
    ) {
      await handle.loadGame(entry.roomId);
      return;
    }
    const priorHeight = handle ? root.offsetHeight : 0;
    destroyHandle();
    if (priorHeight > 0) root.style.minHeight = `${priorHeight}px`;
    try {
      const next = await mountShowcaseBoard(root, entry.specId, entry.roomId, {
        metadataByRoomId: options.metadataByRoomId,
        namesByRoomId: options.namesByRoomId,
        loaderForId: options.loaderForId,
        pov: entry.pov,
        autoplay: mountOptions.autoplay,
        ...(mountOptions.onGameEnd ? { onGameEnd: mountOptions.onGameEnd } : {}),
        // The live handle keeps its last frame on any load failure rather than
        // wiping to an error: normal following never sees one (the override
        // always answers), and the live→frozen handoff drives its finished-game
        // load through THIS handle, so an idle/unpersisted game freezes in place.
        ...(mountOptions.live
          ? {
              live: true,
              loadPostgameOverride,
              onLoadError: () => {
                liveLoadFailed = true;
                return true;
              },
            }
          : {}),
      });
      if (destroyed) {
        next.destroy();
        return;
      }
      handle = next;
      handleKind = kind;
      handleLive = mountOptions.live;
      handleAutoplay = mountOptions.autoplay;
    } finally {
      root.style.minHeight = '';
    }
  };

  const jumpToEnd = (glideFrom?: number): void => {
    if (!handle?.jumpToPly || !handle.plyCount) return;
    const end = handle.plyCount();
    if (glideFrom !== undefined && end - glideFrom === 1 && end > 0) {
      // One new move: paint the previous position, then step so the piece glides.
      handle.jumpToPly(end - 1);
    }
    handle.jumpToPly(end);
  };

  // First/second seat names from the featured players (red is the first mover
  // for every live-capable tenant today; fall back to seat order).
  const registerLiveNames = (featured: LiveFeatured): void => {
    const players = featured.players ?? [];
    if (players.length < 2 || options.namesByRoomId[featured.roomId]) return;
    const first = players.find((player) => player.color === 'red') ?? players[0]!;
    const second = players.find((player) => player !== first)!;
    options.namesByRoomId[featured.roomId] = {
      first: displayLiveName(first.name, 'Anonymous'),
      second: displayLiveName(second.name, 'Anonymous'),
    };
  };

  const showLive = async (featured: LiveFeatured): Promise<void> => {
    if (featured.payload) {
      livePayload = { payload: featured.payload, roomId: featured.roomId };
    }
    registerLiveNames(featured);
    airedRoomIds.add(featured.roomId);
    const following = mode === 'live' && currentRoomId === featured.roomId;
    if (!following) {
      if (!featured.payload) return; // need a payload to mount; next poll carries one
      await mountGame(
        { pov: 'white', roomId: featured.roomId, specId: featured.gameSpecId },
        { autoplay: false, live: true },
      );
      jumpToEnd();
      shownLivePly = featured.ply;
      notify(featured.roomId, featured.gameSpecId, 'live');
      return;
    }
    if (featured.ply > shownLivePly && featured.payload && handle) {
      const from = shownLivePly === featured.ply - 1 ? (handle.plyCount?.() ?? 0) : undefined;
      await handle.loadGame(featured.roomId);
      jumpToEnd(from);
      shownLivePly = featured.ply;
    }
  };

  // The live game left the feed (finished, went idle past the fresh window, or
  // the server restarted). Try to upgrade the live board to the real finished
  // replay by reloading through the SAME live handle: clearing livePayload makes
  // its override answer {ok:false}, so the load falls through to the finished-game
  // endpoint. That endpoint 404s whenever the game isn't retrievable as finished
  // yet (idle-but-still-playing, unpersisted, or gone after a restart); the live
  // handle's onLoadError then keeps the last frame instead of wiping the board to
  // "This game could not be loaded." Re-mounting a fresh finished handle (the old
  // approach) could not do this: destroy() clears root before the failing load
  // runs, so a 404 left an empty error box.
  //
  // A failed load means the game never became a retrievable finished game, so
  // its last live frame is a dead position and the hero hands back to the pool
  // head. Keeping that frame is only right when there is no completed game to
  // fall back to.
  const finishLiveHandoff = async (): Promise<void> => {
    const roomId = currentRoomId;
    const specId = currentSpecId;
    if (!roomId || !specId) return;
    livePayload = null;
    if (!handle) {
      // No live handle to reuse (shouldn't happen while mode === 'live'): fall
      // back to freezing on the pool head rather than leaving a blank board.
      // freezeOnHead notifies for the game it actually mounts.
      await freezeOnHead();
      return;
    }
    liveLoadFailed = false;
    await handle.loadGame(roomId);
    if (liveLoadFailed && completedPool[0]) {
      await freezeOnHead();
      return;
    }
    jumpToEnd();
    notify(roomId, specId, 'frozen');
  };

  // Freeze the board on the pool head's final position (the "last game").
  const freezeOnHead = async (): Promise<void> => {
    const target = completedPool[0];
    if (!target) return;
    if (currentRoomId === target.roomId && mode !== 'live') return;
    airedRoomIds.add(target.roomId);
    await mountGame(target, { autoplay: false, live: false });
    jumpToEnd();
    notify(target.roomId, target.specId, 'frozen');
  };

  const syncCompleted = async (): Promise<void> => {
    // A game that finished during this session airs exactly once, then the
    // end-of-game hold freezes it in place.
    if (pendingAir && !airedRoomIds.has(pendingAir.roomId)) {
      const target = pendingAir;
      pendingAir = null;
      airedRoomIds.add(target.roomId);
      await mountGame(target, {
        autoplay: true,
        live: false,
        onGameEnd: () => {
          if (destroyed) return;
          notify(target.roomId, target.specId, 'frozen');
          // Another game may have finished while this one aired.
          enqueue(syncCompleted);
        },
      });
      notify(target.roomId, target.specId, 'replay');
      return;
    }
    pendingAir = null;
    // A board already showing something keeps it: pre-session history never
    // replaces fresher state (e.g. the live game that just ended). Only an
    // empty board (first paint) freezes onto the head.
    if (currentRoomId !== null && mode !== 'live') return;
    await freezeOnHead();
  };

  // The one entry allowed to air: the most recently FINISHED game among those the
  // client has not shown yet. Pool position is the wrong signal — the server pool
  // interleaves variants for breadth, so the first not-yet-aired entry is
  // whichever variant sorts earliest in the round-robin and can easily be days
  // old. Airing that one broadcasts stale history as if it had just finished.
  // Entries with no endedAt (bundled demos) sort last and never win.
  const finishedAtMs = (entry: ShowcaseEntry): number => {
    const parsed = entry.endedAt ? Date.parse(entry.endedAt) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };
  const newestUnaired = (entries: ShowcaseEntry[]): ShowcaseEntry | null => {
    let best: ShowcaseEntry | null = null;
    for (const entry of entries) {
      if (airedRoomIds.has(entry.roomId)) continue;
      if (!best || finishedAtMs(entry) > finishedAtMs(best)) best = entry;
    }
    return best;
  };

  const stopPolling = (): void => {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const schedulePoll = (): void => {
    if (destroyed) return;
    pollTimer = window.setTimeout(() => void pollLive(), LIVE_POLL_MS);
  };

  const pollLive = async (): Promise<void> => {
    if (destroyed) return;
    if (!options.isConnected()) {
      stopPolling();
      return;
    }
    if (document.visibilityState === 'hidden') {
      schedulePoll();
      return;
    }
    try {
      const following = mode === 'live' && currentRoomId !== null;
      const channel = encodeURIComponent(options.channel ?? 'top');
      const query = following
        ? `?channel=${channel}&room=${encodeURIComponent(currentRoomId!)}&ply=${shownLivePly}`
        : `?channel=${channel}`;
      const resp = await fetch(`/api/watch/live${query}`);
      if (resp.ok) {
        const data = (await resp.json()) as { featured: LiveFeatured | null };
        if (data.featured) {
          const featured = data.featured;
          enqueue(() => showLive(featured));
        } else if (mode === 'live') {
          enqueue(finishLiveHandoff);
        } else {
          enqueue(syncCompleted);
        }
      }
    } catch {
      // Transient network failure: keep whatever is on the board.
    }
    schedulePoll();
  };

  // Hidden tabs skip the fetch (see pollLive), so poll immediately when the
  // tab comes back instead of waiting out the current interval.
  const onVisibilityChange = (): void => {
    if (destroyed || document.visibilityState !== 'visible') return;
    stopPolling();
    void pollLive();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Boot: freeze on the last game's final position (nothing pre-session ever
  // auto-plays), then start watching for live games.
  enqueue(async () => {
    try {
      await freezeOnHead();
    } catch (err) {
      renderWatchReplayFailure(root);
      throw err;
    }
  });
  void pollLive();

  return {
    updateCompletedPool: (entries, opts) => {
      if (destroyed) return;
      completedPool = entries.slice();
      const fresh = entries.filter((entry) => !seenRoomIds.has(entry.roomId));
      for (const entry of entries) seenRoomIds.add(entry.roomId);
      if (opts?.jumpNow) {
        // Baseline refresh: the first real pool replacing the static fallback
        // is pre-session history — never air it, re-freeze on its head.
        pendingAir = null;
        if (mode !== 'live') enqueue(freezeOnHead);
        return;
      }
      const candidate = newestUnaired(fresh);
      if (candidate) pendingAir = candidate;
      if (mode === 'live') return; // the airing waits out the live broadcast
      if (mode !== 'replay') enqueue(syncCompleted);
    },
    destroy: () => {
      destroyed = true;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      destroyHandle();
    },
  };
}
