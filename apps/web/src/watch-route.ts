import { type GameEvent, maybeGameSpecForId } from '@mistboard/game';
import { banqiResultLabel } from './banqi-result-label.js';
import { createGameTable } from './game-table.js';
import { renderVariantMarker } from './variant-markers.js';
import type { VariantMiniId } from './variant-mini-boards.js';
import { webVariantTenantForSpecId } from './variant-tenant/registry.js';
import { variantMiniIdForRawVariant } from './variants.js';
import './watch-route.css';
import {
  displayParticipantName,
  type FeaturedGame,
  type GameParticipant,
  matchupLabel,
  matchupSeats,
  participantForColor,
  sourceLabel,
  variantDisplayLabel,
} from './game-display.js';
import { gameMetaForGame, timeControlLabelForGame } from './game-meta.js';
import { initLiveSound, playSound } from './live-sound.js';
import type { GameMeta, ReplayHandle } from './replay.js';
import { renderWatchReplaySkeleton } from './replay-skeleton.js';
import { createGameMetaCard, type GameMetaPlayer } from './review/game-meta-card.js';
import { createMoveList, type MoveList } from './review/move-list.js';
import { createReviewShell } from './review/review-shell.js';
import { showcaseRendererKindForSpec, specIdForShowcaseVariant } from './showcase-dispatch.js';
import { buildLoadingState, buildNav } from './site-shell.js';

// replay.js statically pulls in chessground (~64KB). Importing it dynamically
// keeps it out of watch-route's module-init path, so mountWatch can fire
// /api/watch before that bundle parses. loadReplayModule() is kicked off at the
// top of mountWatch to prefetch the chunk in parallel with the feed fetch, so
// the dynamic import costs no extra round trip by the time the board mounts.
let replayModulePromise: Promise<typeof import('./replay.js')> | null = null;
function loadReplayModule(): Promise<typeof import('./replay.js')> {
  replayModulePromise ??= import('./replay.js');
  return replayModulePromise;
}

type WatchChannelSummary = {
  family: string;
  gameSpecIds: string[];
  id: string;
  label: string;
  sealedCount: number;
  unlockedCount: number;
  // The headline seat for the rail row (name + rating), shown under the channel
  // name lichess-style. null/absent for an empty channel (name-only row).
  topPlayer?: { name: string; rating: number | null } | null;
};
type WatchInitialReplay = {
  events: GameEvent[];
  roomId: string;
};
type WatchFeed = {
  activeChannel: string;
  channels: WatchChannelSummary[];
  now: string;
  sealedActivityWindowMs?: number;
  unlockLimit: number;
  sealedCount: number;
  unlocked: FeaturedGame[];
  initialReplay?: WatchInitialReplay;
};

// Which replay renderer a game needs: a game spec id (the registry's unambiguous
// tenant key) or 'chess' (the chessground fallback for the unregistered dark-chess
// stack). It must NOT key on the coarse watch.family: jieqi and Dark Mini Xiangqi
// both render in the 'xiangqi' family, so a family key would resolve both to the
// same tenant. A switch across renderers must re-mount, not loadGame.
type WatchRendererKind = string;

// Resolve the renderer for the SELECTED GAME by its own variant, not the
// channel's — the Engines channel (and, later, a "Top" auto-channel) is
// cross-variant, so one channel can hold an xiangqi game and a chess game that
// need different renderers. Each game carries its variant; map it to a spec id
// the same way the homepage showcase cycler does, so the two dispatchers can't
// drift. A renderer switch across games re-mounts (chessground vs tenant SVG
// can't loadGame across). Falls back to the channel's primary spec only when the
// roomId is absent from the unlocked list (shouldn't happen post-hydrate).
export function watchRendererKindForGame(feed: WatchFeed, roomId: string): WatchRendererKind {
  const game = feed.unlocked.find((entry) => entry.roomId === roomId);
  if (game) return showcaseRendererKindForSpec(specIdForShowcaseVariant(game.variant));
  const channel = feed.channels.find((entry) => entry.id === feed.activeChannel);
  return showcaseRendererKindForSpec(channel?.gameSpecIds[0] ?? null);
}

const WATCH_ACTIVE_POLL_MS = 15_000;
const WATCH_IDLE_POLL_MS = 60_000;

export function shouldPlayWatchMoveSound(previousPly: number | null, nextPly: number): boolean {
  return previousPly !== null && nextPly === previousPly + 1;
}

export async function mountWatch(root: HTMLElement): Promise<void> {
  initLiveSound();
  root.replaceChildren();
  root.classList.add('landing-page', 'watch-route');
  root.append(buildNav(), buildLoadingState('Loading replays'));

  // Start downloading the replay/chessground chunk now, in parallel with the
  // feed fetch below, rather than serializing it behind /api/watch.
  void loadReplayModule();

  let currentFeed = await fetchWatchFeed().catch((err) => {
    console.warn(err);
    return null;
  });
  const watch = buildWatchSection(currentFeed);
  root.replaceChildren(buildNav(), watch.el);
  document.title = 'Mistboard TV · Mistboard';

  let activeRoomId: string | null = null;
  let replayHandle: ReplayHandle | null = null;
  // Which renderer the live handle is: chess (chessground) vs xiangqi (native
  // SVG). A channel switch across families must re-mount, not loadGame.
  let replayHandleKind: WatchRendererKind | null = null;
  let pollTimer: number | null = null;
  let refreshInFlight = false;
  // Right-rail interactive move list + shared game-table controls. The move list
  // is rebuilt whenever the active game changes. `watchPly` / `watchMaxPly` track
  // the board's ply so the controls'
  // relative steps (prev/next) resolve without a live getter on the handle.
  let moveList: MoveList | null = null;
  let watchPly = 0;
  let watchMaxPly = 0;
  let lastSoundPly: number | null = null;
  let queuePreviewHandles: ReplayHandle[] = [];
  let queuePreviewKey = '';
  let queueRenderVersion = 0;
  const selectedRoomByChannel = new Map<string, string>();
  const metadataByRoomId: Record<string, GameMeta> = {};
  // First/second-mover names for the tenant compact seats (the tenant postgames
  // carry no player names), keyed by room id — same shape the homepage showcase
  // feeds its compact boards.
  const namesByRoomId: Record<string, { first: string; second: string }> = {};
  const abortController = new AbortController();

  const renderQueue = (
    feed: WatchFeed | null,
    roomId: string | null,
    previousRoomIds: ReadonlySet<string> | null,
  ): void => {
    const previewKey = feed
      ? `${feed.activeChannel}:${feed.unlocked
          .slice(0, 2)
          .map((game) => game.roomId)
          .join('|')}`
      : 'unavailable';
    if (previewKey === queuePreviewKey && watch.queueRoot.childElementCount > 0) {
      updateWatchQueueActive(watch.queueRoot, roomId);
      return;
    }
    queuePreviewKey = previewKey;
    const version = ++queueRenderVersion;
    for (const handle of queuePreviewHandles) handle.destroy();
    queuePreviewHandles = [];
    const previews = renderWatchQueue(watch.queueRoot, feed, roomId, { previousRoomIds });
    if (!feed || previews.length === 0) return;

    void Promise.all(
      previews.map(async ({ game, root: previewRoot }) => {
        try {
          return await mountWatchQueuePreview(previewRoot, game, metadataByRoomId, namesByRoomId);
        } catch (err) {
          console.warn(err);
          renderWatchQueuePreviewError(previewRoot);
          return null;
        }
      }),
    ).then((handles) => {
      const mounted = handles.filter((handle): handle is ReplayHandle => handle !== null);
      if (version !== queueRenderVersion) {
        for (const handle of mounted) handle.destroy();
        return;
      }
      queuePreviewHandles = mounted;
    });
  };

  // Preserve tenant SVG proportions as their width-fixed boards re-render. This
  // lets xiangqi, banqi, jungle, and other rectangular variants determine their
  // own height instead of being letterboxed inside a common square.
  if (typeof MutationObserver !== 'undefined') {
    const centerTenantBoards = (): void => {
      for (const svg of watch.replayRoot.querySelectorAll<SVGElement>(
        '.replay-layout-solo .replay-board svg',
      )) {
        if (svg.getAttribute('preserveAspectRatio') !== 'xMidYMid meet') {
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }
      }
    };
    new MutationObserver(centerTenantBoards).observe(watch.replayRoot, {
      childList: true,
      subtree: true,
    });
    centerTenantBoards();
  }

  // Jump the board through the active handle (pauses autoplay). The handle's
  // onPlyChange then fires syncMoveList, re-highlighting + re-bounding.
  const jumpBoardToPly = (ply: number): void => {
    replayHandle?.jumpToPly?.(clampPly(ply, watchMaxPly));
  };

  const moveScrubber = buildWatchScrubber(
    jumpBoardToPly,
    () => watchPly,
    () => watchMaxPly,
    watch.replayControlsRoot,
  );

  // Re-highlight the current move + refresh the scrubber bounds/status. Driven by
  // the handle's onPlyChange on every autoplay tick or manual jump.
  const syncMoveList = (ply: number, maxPly: number): void => {
    if (shouldPlayWatchMoveSound(lastSoundPly, ply)) playSound('move');
    lastSoundPly = ply;
    watchPly = ply;
    watchMaxPly = maxPly;
    moveList?.update(ply, jumpBoardToPly);
    moveScrubber.setBounds(ply, maxPly);
    if (moveScrubber.status)
      moveScrubber.status.textContent = maxPly > 0 ? `${ply} / ${maxPly}` : '';
  };

  const clearMoveList = (): void => {
    watch.movesRoot.replaceChildren();
    moveList = null;
    watchPly = 0;
    watchMaxPly = 0;
    moveScrubber.setBounds(0, 0);
  };

  const clearPovToggle = (): void => {
    watch.povRoot.replaceChildren();
  };

  // (Re)build the fog-perspective toggle under the board for the freshly loaded
  // game. Shown only for asymmetric fog (dark) variants whose handle offers more
  // than one view; defaults to Truth (which it also pushes to the board), so a
  // channel/game switch always lands on Truth.
  const rebuildPovToggle = (feed: WatchFeed, roomId: string): void => {
    const game = feed.unlocked.find((entry) => entry.roomId === roomId) ?? null;
    renderWatchPovToggle(watch.povRoot, game, replayHandle);
  };

  // Rebuild the move list inside the shared room table from the freshly loaded
  // game's handle. A
  // handle that exposes neither jumpToPly nor plyCount (should not happen for the
  // watch renderers, but the methods are optional) hides the whole panel; a handle
  // with plyCount but no derivable move labels keeps the scrubber and drops the
  // list (empty move labels for that path).
  const rebuildMoveList = (handle: ReplayHandle): void => {
    clearMoveList();
    if (!handle.jumpToPly || !handle.plyCount) return;
    watchMaxPly = handle.plyCount();
    watchPly = 0;
    const entries = handle.moveEntries?.() ?? [];

    if (entries.length > 0) {
      moveList = createMoveList(entries);
      watch.movesRoot.append(moveList.el);
    }
    syncMoveList(watchPly, watchMaxPly);
  };

  // Mount the right-kind replay handle, re-mounting when the family changes
  // (chess chessground vs xiangqi SVG can't loadGame across each other); else
  // reuse the handle and just load the next game.
  const ensureReplay = async (
    feed: WatchFeed,
    roomId: string,
    seed?: WatchInitialReplay,
  ): Promise<void> => {
    const kind = watchRendererKindForGame(feed, roomId);
    if (!replayHandle || replayHandleKind !== kind) {
      // Family change (e.g. switching the channel to Crossroads): the live
      // renderer can't load the new game, so it's torn down and a different
      // chunk + postgame are fetched — two round trips. Paint a skeleton in the
      // board slot up front so the area gives feedback instead of going blank
      // while the swap lands. Null the handle before the await so a failed
      // mount surfaces the empty state rather than a stale, destroyed handle.
      replayHandle?.destroy();
      replayHandle = null;
      replayHandleKind = null;
      renderWatchReplaySkeleton(watch.replayRoot);
      replayHandle = await mountWatchReplay(
        watch.replayRoot,
        roomId,
        metadataByRoomId,
        namesByRoomId,
        seed,
        kind,
        syncMoveList,
      );
      replayHandleKind = kind;
      rebuildMoveList(replayHandle);
      rebuildPovToggle(feed, roomId);
      return;
    }
    if (replayHandle.activeSampleId() !== roomId) {
      await replayHandle.loadGame(roomId);
      rebuildMoveList(replayHandle);
      rebuildPovToggle(feed, roomId);
    }
  };

  const renderFeed = async (
    nextFeed: WatchFeed | null,
    previousFeed: WatchFeed | null,
    animateNewRows: boolean,
    options: { urlMode?: 'push' | 'replace' | false } = {},
  ): Promise<void> => {
    const previousRoomIds =
      animateNewRows && previousFeed
        ? new Set(previousFeed.unlocked.map((game) => game.roomId))
        : null;
    mergeWatchMetadata(metadataByRoomId, namesByRoomId, nextFeed);
    renderWatchChannelList(watch.channelRoot, nextFeed);

    if (!nextFeed || nextFeed.unlocked.length === 0) {
      replayHandle?.destroy();
      replayHandle = null;
      replayHandleKind = null;
      activeRoomId = null;
      clearMoveList();
      clearPovToggle();
      renderWatchEmptyState(watch.replayRoot, nextFeed);
      renderWatchActiveGame(watch, nextFeed, activeRoomId);
      renderQueue(nextFeed, activeRoomId, previousRoomIds);
      currentFeed = nextFeed;
      if (options.urlMode && nextFeed) {
        syncWatchUrl(options.urlMode, nextFeed.activeChannel, activeRoomId);
      }
      return;
    }

    const nextRoomId = resolveWatchRoomId(nextFeed, activeRoomId, selectedRoomByChannel);
    const priorRoomId = activeRoomId;
    activeRoomId = nextRoomId;
    selectedRoomByChannel.set(nextFeed.activeChannel, nextRoomId);
    renderWatchActiveGame(watch, nextFeed, activeRoomId);
    renderQueue(nextFeed, activeRoomId, previousRoomIds);

    try {
      await ensureReplay(nextFeed, nextRoomId, nextFeed.initialReplay);
    } catch (err) {
      console.warn(err);
      activeRoomId = priorRoomId;
      if (!replayHandle) renderWatchEmptyState(watch.replayRoot, null);
      renderWatchActiveGame(watch, nextFeed, activeRoomId);
      renderQueue(nextFeed, activeRoomId, null);
      return;
    }

    currentFeed = nextFeed;
    if (options.urlMode) {
      syncWatchUrl(options.urlMode, nextFeed.activeChannel, activeRoomId);
    }
  };

  const clearPollTimer = (): void => {
    if (pollTimer === null) return;
    window.clearTimeout(pollTimer);
    pollTimer = null;
  };

  const pollDelay = (feed: WatchFeed | null): number =>
    feed && feed.sealedCount > 0 ? WATCH_ACTIVE_POLL_MS : WATCH_IDLE_POLL_MS;

  const refreshFeed = async (): Promise<void> => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      const nextFeed = await fetchWatchFeed();
      const previousFeed = currentFeed;
      await renderFeed(nextFeed, previousFeed, true);
    } catch (err) {
      console.warn(err);
      if (!currentFeed && !replayHandle) {
        await renderFeed(null, null, false);
      }
    } finally {
      refreshInFlight = false;
      clearPollTimer();
      if (!document.hidden) {
        pollTimer = window.setTimeout(() => void refreshFeed(), pollDelay(currentFeed));
      }
    }
  };

  const handleVisibilityChange = (): void => {
    clearPollTimer();
    if (!document.hidden) void refreshFeed();
  };

  const handleNavigationClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const link = target?.closest<HTMLAnchorElement>('a.watch-queue-row, a.watch-channel-link');
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== '/watch') return;

    event.preventDefault();
    const channel = url.searchParams.get('channel');
    const roomId = url.searchParams.get('game');
    if (link.classList.contains('watch-channel-link')) {
      void switchWatchChannel(channel, 'push');
      return;
    }
    if (roomId) void switchWatchGame(roomId, 'push');
  };

  const switchWatchChannel = async (
    channelId: string | null,
    urlMode: 'push' | 'replace',
  ): Promise<void> => {
    try {
      const nextFeed = await fetchWatchFeed(channelId);
      await renderFeed(nextFeed, currentFeed, true, { urlMode });
    } catch (err) {
      console.warn(err);
    }
  };

  const switchWatchGame = async (roomId: string, urlMode: 'push' | 'replace'): Promise<void> => {
    if (!currentFeed?.unlocked.some((game) => game.roomId === roomId)) return;
    if (roomId === activeRoomId) {
      syncWatchUrl(urlMode, currentFeed.activeChannel, activeRoomId);
      return;
    }
    const previousRoomId = activeRoomId;
    activeRoomId = roomId;
    selectedRoomByChannel.set(currentFeed.activeChannel, roomId);
    renderWatchActiveGame(watch, currentFeed, activeRoomId);
    updateWatchQueueActive(watch.queueRoot, activeRoomId);
    try {
      await ensureReplay(currentFeed, roomId, currentFeed.initialReplay);
      syncWatchUrl(urlMode, currentFeed.activeChannel, activeRoomId);
    } catch (err) {
      console.warn(err);
      activeRoomId = previousRoomId;
      renderWatchActiveGame(watch, currentFeed, activeRoomId);
      updateWatchQueueActive(watch.queueRoot, activeRoomId);
    }
  };

  const handlePopState = (): void => {
    const channel = watchChannelFromLocation();
    const currentChannel = currentFeed?.activeChannel ?? null;
    if (channel !== currentChannel) {
      void switchWatchChannel(channel, 'replace');
      return;
    }
    const roomId = watchRoomFromLocation();
    if (roomId) void switchWatchGame(roomId, 'replace');
  };

  document.addEventListener('visibilitychange', handleVisibilityChange, {
    signal: abortController.signal,
  });
  window.addEventListener('popstate', handlePopState, { signal: abortController.signal });
  watch.el.addEventListener('click', handleNavigationClick, { signal: abortController.signal });
  await renderFeed(currentFeed, null, false, { urlMode: 'replace' });
  if (!document.hidden) {
    pollTimer = window.setTimeout(() => void refreshFeed(), pollDelay(currentFeed));
  }
}

async function mountWatchQueuePreview(
  root: HTMLElement,
  game: FeaturedGame,
  metadataByRoomId: Record<string, GameMeta>,
  namesByRoomId: Record<string, { first: string; second: string }>,
): Promise<ReplayHandle> {
  const { mountShowcaseBoard } = await import('./showcase-board.js');
  const handle = await mountShowcaseBoard(
    root,
    specIdForShowcaseVariant(game.variant),
    game.roomId,
    {
      autoplay: false,
      loaderForId: apiEventLoader,
      metadataByRoomId,
      namesByRoomId,
      pov: 'white',
      revealOnFinish: true,
    },
  );
  handle.setPov?.('truth');
  handle.jumpToPly?.(handle.plyCount?.() ?? game.plyCount);
  return handle;
}

function renderWatchQueuePreviewError(root: HTMLElement): void {
  root.replaceChildren();
  const message = document.createElement('span');
  message.className = 'watch-queue-preview-error';
  message.textContent = 'Final position unavailable';
  root.append(message);
}

async function mountWatchReplay(
  root: HTMLElement,
  roomId: string,
  metadataByRoomId: Record<string, GameMeta>,
  namesByRoomId: Record<string, { first: string; second: string }>,
  seed?: WatchInitialReplay,
  kind: WatchRendererKind = 'chess',
  onPlyChange?: (ply: number, maxPly: number) => void,
): Promise<ReplayHandle> {
  // Tenant renderers load through the registry's dynamic-import closures, so
  // they stay out of the chess path's bundle. `kind` is the channel's spec id
  // (chess uses the chessground fallback below), so the tenant resolves
  // unambiguously even when two channels share a render family. Compact mode is
  // the homepage-showcase single-board layout (.replay-layout-solo); watch CSS
  // makes it width-driven so each variant keeps its natural height.
  const tenant = kind === 'chess' ? null : webVariantTenantForSpecId(kind);
  if (tenant?.watch) {
    return await tenant.watch.mountReplay(root, roomId, {
      autoplay: true,
      compact: true,
      metadataByRoomId,
      namesByRoomId,
      onPlyChange,
    });
  }
  // Chess (chessground): fog channels (dark-chess, reveal-chess, kriegspiel,
  // dark-crazyhouse). Watch only ever serves COMPLETED games, so the middle
  // "Truth" pane is the fully public final-and-throughout board — no hidden-info
  // leak. Render the triptych compact but let watch-route.css isolate the truth
  // pane into the board slot (the panes resolver can only pick a fogged white/
  // black POV, so truth-only is a CSS concern). No controls: the TV autoplays.
  const { mountReplay } = await loadReplayModule();
  return await mountReplay(root, roomId, {
    autoplay: true,
    showControls: false,
    keyboardNav: false,
    revealOnFinish: false,
    clampPace: true,
    metadataMode: 'compact',
    showCaptures: false,
    hideGameIdPill: true,
    loaderForId: makeWatchEventLoader(seed),
    metadataByRoomId,
    onPlyChange,
  });
}

// The initial replay's events ride along in the /api/watch response, so the
// first board paints pieces without a second round trip. The seed is consumed
// once: a later reload of the same game (after polling or queue navigation)
// refetches fresh events, and every other game uses the per-game loader.
function makeWatchEventLoader(seed?: WatchInitialReplay): (roomId: string) => Promise<GameEvent[]> {
  let pending = seed;
  return async (roomId: string) => {
    if (pending && pending.roomId === roomId) {
      const events = pending.events;
      pending = undefined;
      return events;
    }
    return apiEventLoader(roomId);
  };
}

async function fetchWatchFeed(channelOverride?: string | null): Promise<WatchFeed> {
  const channel = channelOverride ?? watchChannelFromLocation();
  const url = channel ? `/api/watch?channel=${encodeURIComponent(channel)}` : '/api/watch';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`failed to load watch feed: ${resp.status}`);
  return (await resp.json()) as WatchFeed;
}

async function apiEventLoader(roomId: string): Promise<GameEvent[]> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/events`);
  if (!resp.ok) throw new Error(`failed to load events for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { events: GameEvent[] };
  return data.events;
}

function mergeWatchMetadata(
  target: Record<string, GameMeta>,
  namesTarget: Record<string, { first: string; second: string }>,
  feed: WatchFeed | null | undefined,
): void {
  if (!feed) return;
  for (const game of feed.unlocked) {
    target[game.roomId] = gameMetaForGame(game);
    // First/second-mover names for the tenant compact seats, resolved through the
    // shared seat model (red/black for xiangqi + jungle, white/red for crossroads,
    // white/black otherwise). The chess path reads names from metadataByRoomId.
    const [firstSeat, secondSeat] = matchupSeats(game);
    namesTarget[game.roomId] = {
      first: displayParticipantName(game, firstSeat),
      second: displayParticipantName(game, secondSeat),
    };
  }
}

function resolveWatchRoomId(
  feed: WatchFeed,
  activeRoomId: string | null,
  selectedRoomByChannel: ReadonlyMap<string, string>,
): string {
  const roomIds = new Set(feed.unlocked.map((game) => game.roomId));
  const candidates = [
    selectedRoomByChannel.get(feed.activeChannel),
    activeRoomId,
    watchRoomFromLocation(),
    feed.unlocked[0]?.roomId,
  ];
  for (const candidate of candidates) {
    if (candidate && roomIds.has(candidate)) return candidate;
  }
  return feed.unlocked[0]!.roomId;
}

function watchChannelFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('channel');
}

function watchRoomFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('game');
}

function syncWatchUrl(mode: 'push' | 'replace', channelId: string, roomId: string | null): void {
  const params = new URLSearchParams();
  params.set('channel', channelId);
  if (roomId) params.set('game', roomId);
  const nextUrl = `/watch?${params.toString()}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) return;
  const method = mode === 'push' ? 'pushState' : 'replaceState';
  window.history[method](null, '', nextUrl);
}

function clampPly(ply: number, maxPly: number): number {
  return Math.max(0, Math.min(maxPly, ply));
}

type WatchScrubber = {
  el: HTMLElement;
  status: HTMLElement | null;
  setBounds(ply: number, maxPly: number): void;
};

// First / prev / next / last playback behavior. Production binds this to the
// shared room table's replay controls; the standalone fallback keeps the helper
// directly testable. No play/pause: the TV autoplays and a manual jump pauses it.
// `getPly` / `getMaxPly` read the live board ply at click time (the handle has
// no ply getter), so relative steps resolve correctly after any jump.
export function buildWatchScrubber(
  jump: (ply: number) => void,
  getPly: () => number,
  getMaxPly: () => number,
  sharedControls?: HTMLElement,
): WatchScrubber {
  const el = sharedControls ?? document.createElement('div');
  let status: HTMLElement | null = null;
  let first: HTMLButtonElement;
  let prev: HTMLButtonElement;
  let next: HTMLButtonElement;
  let last: HTMLButtonElement;
  if (sharedControls) {
    first = requiredWatchControl(sharedControls, 'first');
    prev = requiredWatchControl(sharedControls, 'prev');
    next = requiredWatchControl(sharedControls, 'next');
    last = requiredWatchControl(sharedControls, 'latest');
  } else {
    el.className = 'review-scrubber';
    status = document.createElement('span');
    status.className = 'review-scrubber__status';
    status.setAttribute('aria-live', 'polite');
    first = watchScrubButton('|<', 'First move');
    prev = watchScrubButton('<', 'Previous move');
    next = watchScrubButton('>', 'Next move');
    last = watchScrubButton('>|', 'Last move');
    el.append(status, first, prev, next, last);
  }
  first.addEventListener('click', () => jump(0));
  prev.addEventListener('click', () => jump(getPly() - 1));
  next.addEventListener('click', () => jump(getPly() + 1));
  last.addEventListener('click', () => jump(getMaxPly()));
  return {
    el,
    status,
    setBounds(ply, maxPly) {
      first.disabled = ply <= 0;
      prev.disabled = ply <= 0;
      next.disabled = ply >= maxPly;
      last.disabled = ply >= maxPly;
    },
  };
}

function requiredWatchControl(root: HTMLElement, action: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(`[data-replay="${action}"]`);
  if (!button) throw new Error(`missing shared watch control: ${action}`);
  return button;
}

function watchScrubButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'review-scrubber__button';
  button.setAttribute('aria-label', label);
  button.textContent = text;
  return button;
}

// Whether the fog-perspective toggle applies to a variant: only asymmetric fog
// (`visibility: 'dark'`) games have distinct per-side views worth switching
// between. Symmetric-mask hidden-identity (jieqi/banqi/jungle-flip/reveal-chess)
// and open variants render a single board and get no toggle.
export function watchPovToggleApplies(variant: string): boolean {
  return maybeGameSpecForId(variant)?.visibility === 'dark';
}

// The color words for the two side-perspective buttons, from the variant's
// family: the chess family reads White/Black; every other family (xiangqi,
// jungle, shogi, crossroads, …) reads Red/Black. paneKind 'white' is the
// first/red/white seat, 'black' the second.
function watchPovSideLabels(variant: string): { first: string; second: string } {
  const family = maybeGameSpecForId(variant)?.family;
  return family === 'chess'
    ? { first: 'White', second: 'Black' }
    : { first: 'Red', second: 'Black' };
}

// Render the fog-perspective segmented control under the board for a dark game,
// or clear the slot. Buttons: [<first>'s view] [Truth] [<second>'s view], mapped
// to handle.setPov('white'|'truth'|'black'). Defaults to Truth and pushes that
// perspective to the board, so every (re)build lands on Truth. Non-dark games,
// a handle without setPov/availablePovs, or a single-view game render nothing.
function renderWatchPovToggle(
  root: HTMLElement,
  game: FeaturedGame | null,
  handle: ReplayHandle | null,
): void {
  root.replaceChildren();
  if (!game || !handle?.setPov) return;
  if (!watchPovToggleApplies(game.variant)) return;
  const povs = handle.availablePovs?.() ?? [];
  if (povs.length <= 1) return;

  const labels = watchPovSideLabels(game.variant);
  // Compact single-word perspective labels (the side's color); "Truth" in the
  // middle frames all three as perspectives. Full "X's view" phrasing overflowed
  // the height-capped board width into an ellipsis.
  const options: Array<{ kind: 'white' | 'truth' | 'black'; label: string }> = [
    { kind: 'white', label: labels.first },
    { kind: 'truth', label: 'Truth' },
    { kind: 'black', label: labels.second },
  ];

  const group = document.createElement('div');
  group.className = 'watch-pov';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Board perspective');

  const buttons: HTMLButtonElement[] = [];
  const select = (kind: 'white' | 'truth' | 'black'): void => {
    handle.setPov?.(kind);
    for (const button of buttons) {
      const active = button.dataset.pov === kind;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  };

  for (const option of options) {
    if (!povs.includes(option.kind)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'watch-pov__button';
    button.dataset.pov = option.kind;
    button.textContent = option.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => select(option.kind));
    buttons.push(button);
    group.append(button);
  }

  root.append(group);
  // Default the board (and the control) to Truth on every (re)build.
  select('truth');
}

type WatchSection = {
  el: HTMLElement;
  metaRoot: HTMLElement;
  channelRoot: HTMLElement;
  replayRoot: HTMLElement;
  povRoot: HTMLElement;
  queueRoot: HTMLElement;
  gameTableRoot: HTMLElement;
  playerBottom: HTMLElement;
  playerTop: HTMLElement;
  movesRoot: HTMLElement;
  replayControlsRoot: HTMLElement;
};

// The /watch page rides the SHARED review-shell (left info rail | center board |
// right rail), the same layout the room + review pages use, so Mistboard TV reads
// like the rest of the site. LEFT: game meta card + channel list. CENTER: a
// fixed-width, naturally proportioned board with two completed mini-boards. RIGHT:
// the same shared game table the corresponding room uses.
function buildWatchSection(feed: WatchFeed | null): WatchSection {
  // ── Left rail: meta card (top) + channel list (below) + sealed-status badge ──
  const left = document.createElement('div');
  left.className = 'watch-left';

  const metaRoot = document.createElement('div');
  metaRoot.className = 'watch-meta';

  const channelRail = document.createElement('aside');
  channelRail.className = 'watch-channel-rail';
  const channelRoot = document.createElement('nav');
  channelRoot.className = 'watch-channel-list';
  channelRoot.setAttribute('aria-label', 'Watch channels');
  channelRail.append(channelRoot);

  left.append(metaRoot, channelRail);

  // ── Center: width-fixed, naturally proportioned board + final boards ──
  const center = document.createElement('div');
  center.className = 'watch-center';

  const boardBox = document.createElement('div');
  boardBox.className = 'watch-board-box';
  const replayRoot = document.createElement('div');
  replayRoot.className = 'watch-tv-board';
  boardBox.append(replayRoot);

  // Fog-perspective toggle slot, directly under the board-box. Populated only for
  // asymmetric fog (dark) games with more than one available view; empty and
  // display:none-collapsed otherwise (see renderWatchPovToggle).
  const povRoot = document.createElement('div');
  povRoot.className = 'watch-pov-slot';

  const queueRoot = document.createElement('section');
  queueRoot.className = 'watch-previously';
  queueRoot.setAttribute('aria-label', 'Previously on Mistboard TV');

  center.append(boardBox, povRoot, queueRoot);

  // ── Right rail: the shared room game table, with watch-owned behavior ──
  const right = document.createElement('div');
  right.className = 'watch-right';
  const gameTable = createGameTable();
  gameTable.el.classList.add('watch-game-table');
  right.append(gameTable.el);

  const el = createReviewShell({
    left,
    center,
    right,
    pageClassName: 'watch-review-shell',
    ariaLabel: 'Mistboard TV',
  });

  renderWatchChannelList(channelRoot, feed);
  return {
    el,
    metaRoot,
    channelRoot,
    replayRoot,
    povRoot,
    queueRoot,
    gameTableRoot: gameTable.el,
    playerBottom: gameTable.refs.playerBottom,
    playerTop: gameTable.refs.playerTop,
    movesRoot: gameTable.refs.movesRoot,
    replayControlsRoot: gameTable.refs.replayControlsRoot,
  };
}

// Human label for a kebab-cased termination code ("king-captured" -> "King
// captured"), for the meta-card result line.
function watchTerminationLabel(termination: string): string {
  if (!termination) return '';
  const spaced = termination.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// The FeaturedGame currently showing on the board (the active room), or null.
function activeWatchGame(feed: WatchFeed | null, activeRoomId: string | null): FeaturedGame | null {
  if (!feed || !activeRoomId) return null;
  return feed.unlocked.find((game) => game.roomId === activeRoomId) ?? null;
}

// The seat rows for a game, in first-mover/second-mover order, resolved through
// the shared seat model. Shared by the left meta card and the right-rail rows.
function watchGamePlayers(game: FeaturedGame): GameMetaPlayer[] {
  const seats = matchupSeats(game);
  return seats.map((color) => {
    const participant = participantForColor(game, color);
    return {
      color,
      name: displayParticipantName(game, color),
      rating: watchParticipantRating(participant),
      isEngine: participant?.subjectType === 'engine-version' || participant?.subjectType === 'bot',
    };
  });
}

function watchParticipantRating(participant: GameParticipant | null): number | null {
  if (!participant) return null;
  return participant.ratingAfter ?? participant.ratingBefore ?? null;
}

// Re-render the left meta card + right-rail player rows from the active game.
// Called on every feed refresh and channel/game switch (the active game changes).
function renderWatchActiveGame(
  watch: WatchSection,
  feed: WatchFeed | null,
  activeRoomId: string | null,
): void {
  const game = activeWatchGame(feed, activeRoomId);
  renderWatchMetaCard(watch.metaRoot, game);
  watch.gameTableRoot.hidden = !game;
  renderWatchPlayers(watch.playerTop, watch.playerBottom, game);
}

function renderWatchMetaCard(root: HTMLElement, game: FeaturedGame | null): void {
  root.replaceChildren();
  if (!game) return;
  const players = watchGamePlayers(game);
  const ratedSegment = game.rated === true ? 'Rated' : game.rated === false ? 'Casual' : null;
  const card = createGameMetaCard({
    markerId: variantMiniIdForRawVariant(game.variant) ?? undefined,
    headline: [timeControlLabelForGame(game), ratedSegment, sourceLabel(game.mode)],
    variantName: variantDisplayLabel(game.variant),
    players,
    status: watchGameStatusLine(game),
  });
  root.append(card.el);
}

function watchGameStatusLine(game: FeaturedGame): string {
  const result = watchQueueResultLabel(game);
  const termination = watchTerminationLabel(game.termination);
  return termination ? `${result} by ${termination}` : result;
}

// Populate the shared room table's board-relative player rows. The second mover
// sits above the board and the first mover below it, matching every room's
// default orientation.
function renderWatchPlayers(
  top: HTMLElement,
  bottom: HTMLElement,
  game: FeaturedGame | null,
): void {
  top.replaceChildren();
  bottom.replaceChildren();
  if (!game) return;
  const [firstMover, secondMover] = watchGamePlayers(game);
  if (secondMover) top.append(watchGameTablePlayer(secondMover));
  if (firstMover) bottom.append(watchGameTablePlayer(firstMover));
}

function watchGameTablePlayer(player: GameMetaPlayer): HTMLElement {
  const row = document.createElement('span');
  row.className = 'clock-player-line watch-game-table__player';
  const disc = document.createElement('span');
  disc.className = `watch-player-disc watch-player-disc--${player.color}`;
  disc.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'clock-name';
  name.textContent = player.name;
  name.title = player.name;
  row.append(disc, name);
  if (player.isEngine) {
    const bot = document.createElement('span');
    bot.className = 'watch-player-bot';
    bot.textContent = 'BOT';
    row.append(bot);
  }
  if (player.rating != null) {
    const rating = document.createElement('span');
    rating.className = 'watch-player-rating';
    rating.textContent = String(player.rating);
    row.append(rating);
  }
  return row;
}

// The shared variant marker for each watch channel, so the TV rail reads in
// the same icon language as the picker, rules rail, leaderboard, and profile.
// Channel ids match VariantMiniId ids except crossroads-chess -> crossroads;
// the dark-chess channel (which also carries dark-draft960 games) shows the
// dark-chess marker. An unmapped channel keeps its (empty) marker slot so the
// rows stay grid-aligned.
const CHANNEL_MINI_BY_ID: Record<string, VariantMiniId> = {
  'dark-chess': 'dark-chess',
  xiangqi: 'xiangqi',
  'dark-xiangqi': 'dark-xiangqi',
  'mini-xiangqi': 'mini-xiangqi',
  'dark-mini-xiangqi': 'dark-mini-xiangqi',
  'drop-mini-xiangqi': 'drop-mini-xiangqi',
  'fortress-xiangqi': 'fortress-xiangqi',
  jieqi: 'jieqi',
  banqi: 'banqi',
  'crossroads-chess': 'crossroads',
  'dark-crossroads-chess': 'dark-crossroads',
  'dark-shogi': 'dark-shogi',
  'dark-crazyhouse': 'dark-crazyhouse',
  kriegspiel: 'kriegspiel',
  'reveal-chess': 'reveal-chess',
  jungle: 'jungle',
  'jungle-flip': 'jungle-flip',
};

// Lichess's `cogs` icon, used for its Bot and computer TV channels. Mistboard
// and Lichess are both AGPL-3.0-or-later, so keep the source link beside this
// extracted outline: https://github.com/lichess-org/lila/blob/master/public/font/lichess.sfd
const ENGINES_CHANNEL_MARKER = `<svg class="watch-channel-gears" viewBox="-18 4 548 504" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M216 204Q195 183 165 183Q134 183 113 204Q91 228 91 256Q91 284 113 308Q134 329 165 329Q195 329 216 308Q238 286 238 256Q238 226 216 204ZM457 402Q457 387 446 377Q436 366 421 366Q405 366 395 377Q384 388 384 402Q384 417 395 428Q406 439 421 439Q435 439 446 428Q457 418 457 402ZM457 110Q457 94 446 84Q435 73 421 73Q406 73 395 84Q384 95 384 110Q384 123 395 136Q405 146 421 146Q436 146 446 136Q457 125 457 110ZM347 230V283Q347 287 345 288Q344 291 341 291L297 298Q291 312 287 320Q309 348 313 353Q315 357 315 359Q315 362 313 364Q311 367 290 390Q271 407 267 407Q265 407 261 405L228 379Q214 385 206 388Q203 419 200 432Q197 439 191 439H138Q136 439 132 437Q132 436 131 435Q130 433 129 432L123 388Q114 385 101 379L68 405Q64 407 62 407Q59 407 56 404Q15 366 15 359Q15 357 17 353Q20 348 29 338Q32 334 37 328Q42 322 42 321Q33 301 32 297L-11 290Q-14 290-16 288Q-18 286-18 282V229Q-18 225-16 224Q-14 221-12 221L33 214Q36 205 42 192Q20 164 16 159Q14 155 14 153Q14 150 16 148Q18 145 39 122Q58 105 62 105Q64 105 68 107L101 133Q107 130 123 124Q126 94 129 80Q132 73 138 73H191Q193 73 197 75Q200 78 200 80L206 124Q215 127 228 133L261 107Q265 105 267 105Q270 105 273 108Q314 145 314 153Q314 157 312 159Q309 164 300 174Q298 178 296 181Q293 184 291 187Q288 190 287 191Q294 206 297 215L341 221Q342 222 343 223Q344 224 345 224Q347 226 347 230ZM530 382V422Q530 426 488 431Q487 433 486 436Q484 439 483 442Q481 444 479 446Q494 479 494 485L493 487L457 508Q455 508 444 494Q440 490 436 484Q431 477 429 475H412Q410 477 405 484Q400 490 397 494Q386 508 384 508Q372 501 349 487Q347 487 347 485Q347 479 362 446L353 431Q311 426 311 422V382Q311 378 353 373Q359 363 362 359Q347 326 347 319L349 317Q353 315 359 311Q362 309 368 306Q373 303 375 302L384 297Q386 297 397 310Q400 314 403 318Q406 322 409 326Q411 329 412 330Q416 329 421 329Q425 329 429 330Q438 318 455 298L457 297Q458 297 493 317Q493 318 494 318Q494 318 494 319Q494 326 479 359Q482 363 488 373Q530 378 530 382ZM530 90V130Q530 134 488 139Q480 151 479 153Q494 186 494 193Q494 194 494 194Q493 194 493 195Q488 198 484 201Q479 203 476 205Q472 207 469 209Q466 210 464 211Q462 212 461 213Q459 214 458 214L457 215Q454 215 444 202Q441 198 438 194Q435 190 433 187Q430 183 429 182Q425 183 421 183Q416 183 412 182Q411 183 409 187Q406 190 403 194Q400 198 397 202Q387 215 384 215Q372 208 349 195L347 193Q347 186 362 153Q359 149 353 139Q311 134 311 130V90Q311 86 353 81Q358 72 362 66Q347 33 347 27Q347 25 349 25Q349 24 359 19Q361 17 375 9L384 5Q387 5 397 18Q400 22 405 29Q410 35 412 37H429Q444 18 455 5H457Q460 5 493 25Q494 26 494 27Q494 33 479 66Q484 72 488 81Q530 86 530 90Z"/></svg>`;

export function renderWatchChannelList(root: HTMLElement, feed: WatchFeed | null): void {
  root.replaceChildren();
  root.hidden = !feed || feed.channels.length <= 1;
  const rail = root.closest<HTMLElement>('.watch-channel-rail');
  if (rail) rail.hidden = root.hidden;
  if (!feed || feed.channels.length <= 1) return;

  for (const channel of feed.channels) {
    const link = document.createElement('a');
    link.className = 'watch-channel-link';
    link.href = `/watch?channel=${encodeURIComponent(channel.id)}`;
    const player = channel.topPlayer ?? null;
    const playerLine = player
      ? player.rating != null
        ? `${player.name} ${player.rating}`
        : player.name
      : '';
    link.setAttribute('aria-label', playerLine ? `${channel.label}, ${playerLine}` : channel.label);
    // Lichess-style row: text block (channel name over the top-rated player)
    // right-aligned, with the variant marker on the RIGHT edge. Decorative
    // marker; aria-hidden because the link's aria-label already names the
    // channel. notranslate keeps Google Translate off the SVG's aria text.
    const thumb = document.createElement('span');
    thumb.className = 'watch-channel-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const miniId = CHANNEL_MINI_BY_ID[channel.id];
    if (channel.id === 'engines') {
      thumb.innerHTML = ENGINES_CHANNEL_MARKER;
    } else if (miniId) {
      thumb.classList.add('notranslate');
      thumb.setAttribute('translate', 'no');
      thumb.innerHTML = renderVariantMarker(miniId, {
        size: 112,
        label: `${channel.label} marker`,
      });
    }
    const label = document.createElement('span');
    label.className = 'watch-channel-name';
    label.textContent = channel.label;
    const text = document.createElement('span');
    text.className = 'watch-channel-text';
    text.append(label);
    if (playerLine) {
      const player_ = document.createElement('span');
      player_.className = 'watch-channel-player';
      player_.textContent = playerLine;
      player_.title = playerLine;
      text.append(player_);
    }
    link.append(text, thumb);
    if (channel.id === feed.activeChannel) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    root.append(link);
  }
}

// A sized placeholder for the board slot while a renderer swap is in flight
// (channel switch across families, or the first mount). It reserves the board's
// footprint so the swap doesn't shift layout, and every renderer's mount path
// calls root.replaceChildren(), so the skeleton is wiped the moment real
// content is ready. aria-hidden: it's a transient loading affordance, not state.
// Re-exported from the leaf so the existing watch-route test keeps importing it
// from here; the homepage showcase cycler imports it from './replay-skeleton.js'.
export { renderWatchReplaySkeleton };

function renderWatchEmptyState(root: HTMLElement, feed: WatchFeed | null): void {
  root.replaceChildren();

  const empty = document.createElement('section');
  empty.className = 'watch-empty';
  const title = document.createElement('h2');
  title.textContent = feed
    ? watchFeedIsDark(feed)
      ? 'No unlocked dark replays yet'
      : 'No replays yet'
    : 'Replay feed unavailable';
  const body = document.createElement('p');
  body.textContent = feed
    ? feed.sealedCount > 0
      ? watchFeedIsDark(feed)
        ? 'Dark games are being played, but they stay hidden until completion.'
        : 'Games are being played now, but they stay hidden until completion.'
      : watchFeedIsDark(feed)
        ? 'Start a dark game and it can become the next replay after it finishes.'
        : 'Start a game and it can become the next replay after it finishes.'
    : 'The watch feed needs persistence, so it is not available in this runtime.';

  const actions = document.createElement('div');
  actions.className = 'watch-empty-actions';
  const engine = document.createElement('a');
  engine.href = '/?play=computer';
  engine.textContent = 'Play engine';
  const friend = document.createElement('a');
  friend.href = '/?play=friend';
  friend.textContent = 'Start friend game';
  actions.append(engine, friend);

  empty.append(title, body, actions);
  root.append(empty);
}

export type WatchQueuePreview = { game: FeaturedGame; root: HTMLElement };

// The two newest completed games for the active channel, rendered as real final
// boards. Each preview remains an `a.watch-queue-row`, so selecting one still
// promotes it into the main replay without a full navigation.
export function renderWatchQueue(
  root: HTMLElement,
  feed: WatchFeed | null,
  activeRoomId: string | null,
  options: { previousRoomIds?: ReadonlySet<string> | null } = {},
): WatchQueuePreview[] {
  root.replaceChildren();
  const previousRoomIds = options.previousRoomIds ?? null;
  const previews: WatchQueuePreview[] = [];

  const heading = document.createElement('div');
  heading.className = 'watch-previously-heading';
  const title = document.createElement('h2');
  title.textContent = 'Previously on Mistboard TV';
  heading.append(title);
  root.append(heading);

  if (!feed) {
    const empty = document.createElement('p');
    empty.className = 'watch-previously-empty';
    empty.textContent = 'Feed unavailable.';
    root.append(empty);
    return previews;
  }

  if (feed.unlocked.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'watch-previously-empty';
    empty.textContent = 'No completed games in the current replay window.';
    root.append(empty);
    return previews;
  }

  const list = document.createElement('ol');
  list.className = 'watch-queue-list';

  for (const game of feed.unlocked.slice(0, 2)) {
    const item = document.createElement('li');
    item.className = 'watch-queue-item';
    item.dataset.roomId = game.roomId;
    if (previousRoomIds && !previousRoomIds.has(game.roomId)) item.classList.add('is-new');

    const row = document.createElement('a');
    row.className = 'watch-queue-row';
    row.href = watchQueueGameHref(feed, game.roomId);
    if (game.roomId === activeRoomId) {
      item.classList.add('active');
      row.classList.add('active');
    }

    row.setAttribute('aria-label', `Watch ${watchQueueMatchupLabel(game)}`);
    const previewRoot = document.createElement('div');
    previewRoot.className = 'watch-queue-preview';
    row.append(previewRoot);
    item.append(row);
    list.append(item);
    previews.push({ game, root: previewRoot });
  }

  root.append(list);
  return previews;
}

function updateWatchQueueActive(root: HTMLElement, activeRoomId: string | null): void {
  for (const item of root.querySelectorAll<HTMLElement>('.watch-queue-item')) {
    const active = activeRoomId !== null && item.dataset.roomId === activeRoomId;
    item.classList.toggle('active', active);
    const row = item.querySelector<HTMLAnchorElement>('.watch-queue-row');
    row?.classList.toggle('active', active);
  }
}

function watchQueueGameHref(feed: WatchFeed, roomId: string): string {
  const params = new URLSearchParams();
  params.set('game', roomId);
  params.set('channel', feed.activeChannel);
  return `/watch?${params.toString()}`;
}

export function watchFeedIsDark(feed: Pick<WatchFeed, 'activeChannel' | 'channels'>): boolean {
  const channel = feed.channels.find((candidate) => candidate.id === feed.activeChannel);
  if (!channel) return false;
  return channel.id.includes('dark') || channel.gameSpecIds.some((id) => id.includes('dark'));
}

export function watchQueueMatchupLabel(game: FeaturedGame): string {
  return matchupLabel(game);
}

export function formatWatchScope(
  feed: Pick<WatchFeed, 'activeChannel' | 'channels' | 'unlockLimit'>,
): string {
  return watchFeedIsDark(feed)
    ? `dark variants · latest ${feed.unlockLimit}`
    : `latest ${feed.unlockLimit}`;
}

export function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  if (result === 'red-wins') return 'Red wins';
  return 'Draw';
}

// Banqi seats are decoupled from ink, so its seat-keyed result needs the game's
// firstColor to read by ink ("Black wins"). Every other variant has seat == ink
// and uses the plain label.
export function watchQueueResultLabel(game: FeaturedGame): string {
  if (game.variant === 'banqi') return banqiResultLabel(game.result, game.firstColor ?? null);
  return resultLabel(game.result);
}
