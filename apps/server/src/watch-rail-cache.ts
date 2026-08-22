/**
 * Short-lived process-local cache for the /watch channel RAIL — the per-channel
 * counts and headline player shown beside every channel name.
 *
 * Why it exists: /api/watch has to serve the active channel's game list, but the
 * rail it ships alongside is identical no matter which channel was requested.
 * Rebuilding it meant a count + list query for EVERY registered watch channel on
 * EVERY channel click: 20 queries on a 10-channel rail, 18 of them producing
 * bytes the client already had on screen. Clicking through the rail (the whole
 * point of the surface) re-ran all of them per click.
 *
 * What is NOT cached: the active channel's own `unlocked` list and sealed count.
 * Those are recomputed on every request and overwrite the cached rail row for
 * that channel, so the channel you are actually looking at is never stale, and a
 * game finishing shows up in its own channel's feed immediately.
 *
 * Staleness budget: the cached values are a count and a name per OTHER channel.
 * A few seconds behind is invisible; the client's own poll (15s active / 60s
 * idle) is a longer window than this cache's TTL, so nothing the rail shows can
 * lag more than the refresh cadence the page already runs on.
 *
 * Process-local and unsynchronized on purpose: it is a read cache over public
 * aggregates, so a second web instance holding a slightly different copy is
 * fine, and there is nothing to invalidate on write.
 */

export const WATCH_RAIL_CACHE_MS = 5_000;

export type WatchRailRow = {
  family: string;
  gameSpecIds: readonly string[];
  id: string;
  label: string;
  sealedCount: number;
  unlockedCount: number;
  topPlayer: { name: string; rating: number | null } | null;
};

type RailCacheEntry = { at: number; rows: readonly WatchRailRow[] };

let railCache: RailCacheEntry | null = null;

/** The cached rail, or null when absent/expired. `now` is injected so tests
 *  drive the clock rather than sleeping. */
export function cachedWatchRail(now: number = Date.now()): readonly WatchRailRow[] | null {
  if (!railCache) return null;
  if (now - railCache.at >= WATCH_RAIL_CACHE_MS) return null;
  return railCache.rows;
}

export function storeWatchRail(rows: readonly WatchRailRow[], now: number = Date.now()): void {
  railCache = { at: now, rows };
}

export function clearWatchRailCache(): void {
  railCache = null;
}

/** Replace one channel's row with the freshly-computed one, preserving rail
 *  order. The active channel is always computed live, so its cached row (which
 *  may be seconds old) must never be the one served. */
export function withFreshRow(
  rows: readonly WatchRailRow[],
  fresh: WatchRailRow,
): readonly WatchRailRow[] {
  return rows.map((row) => (row.id === fresh.id ? fresh : row));
}
