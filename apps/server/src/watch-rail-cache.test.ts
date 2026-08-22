import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  cachedWatchRail,
  clearWatchRailCache,
  storeWatchRail,
  WATCH_RAIL_CACHE_MS,
  type WatchRailRow,
  withFreshRow,
} from './watch-rail-cache.js';

const row = (id: string, unlockedCount: number): WatchRailRow => ({
  family: 'xiangqi',
  gameSpecIds: [id],
  id,
  label: id,
  sealedCount: 0,
  topPlayer: null,
  unlockedCount,
});

beforeEach(() => {
  clearWatchRailCache();
});

test('an empty cache reports a miss rather than an empty rail', () => {
  // A miss must be distinguishable from "the rail is legitimately empty", or the
  // route would serve a channel-less rail on the first request after boot.
  assert.equal(cachedWatchRail(1_000), null);
});

test('serves a stored rail inside the TTL and expires at the boundary', () => {
  const rows = [row('xiangqi', 3), row('banqi', 5)];
  storeWatchRail(rows, 1_000);

  assert.deepEqual(cachedWatchRail(1_000), rows);
  assert.deepEqual(cachedWatchRail(1_000 + WATCH_RAIL_CACHE_MS - 1), rows);
  // Exactly at the TTL is a miss, so a cached row can never be served older
  // than the window this module advertises.
  assert.equal(cachedWatchRail(1_000 + WATCH_RAIL_CACHE_MS), null);
});

test('the active channel row is replaced with the freshly-computed one', () => {
  // The whole safety property of the cache: the channel you are looking at is
  // always computed live, so a game finishing shows up in its own channel's
  // counts immediately even while the other nine rows are seconds stale.
  const cached = [row('xiangqi', 3), row('banqi', 5), row('jieqi', 7)];
  const fresh = row('banqi', 6);

  const merged = withFreshRow(cached, fresh);

  assert.deepEqual(
    merged.map((entry) => [entry.id, entry.unlockedCount]),
    [
      ['xiangqi', 3],
      ['banqi', 6],
      ['jieqi', 7],
    ],
  );
});

test('replacing a row preserves rail order and never adds or drops one', () => {
  // The rail is rendered in canonical order; a merge that reordered or appended
  // would visibly shuffle the channel list between clicks.
  const cached = [row('top', 1), row('xiangqi', 2), row('engines', 3)];

  const merged = withFreshRow(cached, row('xiangqi', 99));
  assert.deepEqual(
    merged.map((entry) => entry.id),
    ['top', 'xiangqi', 'engines'],
  );

  // A fresh row for a channel not in the cached rail is a no-op, not an append:
  // the rail's membership comes from listWatchChannels(), never from this merge.
  const unknown = withFreshRow(cached, row('not-a-channel', 1));
  assert.deepEqual(
    unknown.map((entry) => entry.id),
    ['top', 'xiangqi', 'engines'],
  );
});

test('a stored rail is not aliased to the caller-visible array on read', () => {
  // Guards the read path against a caller mutating the cached rows in place
  // (withFreshRow returns a new array, so the stored copy stays authoritative).
  const rows = [row('xiangqi', 3)];
  storeWatchRail(rows, 1_000);
  const merged = withFreshRow(cachedWatchRail(1_000)!, row('xiangqi', 42));
  assert.equal(merged[0]!.unlockedCount, 42);
  assert.equal(cachedWatchRail(1_000)![0]!.unlockedCount, 3);
});
