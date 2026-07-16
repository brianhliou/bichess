import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
  MINI_XIANGQI_SPEC_ID,
} from '@mistboard/game';
// Watch channels (other than the hardcoded dark-chess default) derive from the
// variant-tenant registry, so the registrations must be populated for the
// derived channels to appear. This side-effect import registers every tenant.
import './variant-tenant/register-tenants.js';
import { defaultWatchChannel, listWatchChannels, watchChannelForId } from './watch-channels.js';

// The Mini Xiangqi sub-family (open, dark, drop) was retired from Mistboard TV
// on 2026-07-05 (xiangqi pivot): their registrations carry `watch: null`, so no
// channel derives for them and their `?channel=` ids resolve to null. Fog Chess
// is the only baseline VARIANT channel in a launched-flags-off environment; the
// composition-keyed Engines channel is always on and sorts to the end of the rail.
const BASELINE_WATCH_CHANNELS = ['dark-chess', 'engines'] as const;

// Retired sub-family ids that must NOT resolve to a watch channel.
const RETIRED_WATCH_CHANNEL_IDS = [
  MINI_XIANGQI_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
  'dark-mini-xiangqi',
] as const;

test('watch channels expose Fog Chess as the default channel', () => {
  const channel = defaultWatchChannel();
  assert.equal(channel.id, 'dark-chess');
  assert.equal(channel.label, 'Fog Chess');
  assert.deepEqual(channel.gameSpecIds, [DARK_CHESS_SPEC_ID, DARK_DRAFT960_SPEC_ID]);
  assert.deepEqual(channel.legacyVariants, ['dark-chess', 'draft960']);
});

test('watch channel lookup defaults empty input and rejects unknown channels', () => {
  assert.equal(watchChannelForId(null)?.id, 'dark-chess');
  assert.equal(watchChannelForId(undefined)?.id, 'dark-chess');
  assert.equal(watchChannelForId('dark-chess')?.id, 'dark-chess');
  assert.equal(watchChannelForId('unknown'), null);
});

test('watch channel list is immutable by convention', () => {
  assert.deepEqual(
    listWatchChannels().map((channel) => channel.id),
    BASELINE_WATCH_CHANNELS,
  );
});

test('watch channels expose every launched baseline variant in canonical order', () => {
  const channels = listWatchChannels();
  assert.deepEqual(
    channels.map((entry) => entry.id),
    BASELINE_WATCH_CHANNELS,
  );
  assert.equal(channels[0]?.id, 'dark-chess');
  assert.equal(defaultWatchChannel().id, 'dark-chess');
});

test('variant/family channels surface human play only (pvp + pve, never eve)', () => {
  // Decision #6: engine-vs-engine games are segregated to the Engines channel so
  // they never pollute a variant channel; PvE folds in because it is the
  // liquidity floor. Every derived channel + Fog Chess must be human-only.
  for (const channel of listWatchChannels()) {
    if (channel.id === 'engines') continue;
    assert.deepEqual(
      [...channel.modes].sort(),
      ['pve', 'pvp'],
      `${channel.id} must surface pvp+pve and exclude eve`,
    );
  }
});

test('the Engines channel is EvE-only, bounded to watchable variants, deep-linkable', () => {
  const engines = watchChannelForId('engines');
  assert.ok(engines, 'engines channel must be enabled + reachable by deep link');
  assert.deepEqual([...engines.modes], ['eve']);
  assert.equal(engines.default, false);
  // No per-channel renderer spec — the client dispatches a renderer per game.
  assert.deepEqual([...engines.gameSpecIds], []);
  // Bounded to the union of the enabled variant channels' variants so it never
  // surfaces an EvE game the client can't render. In a flags-off env only Fog
  // Chess is enabled, so Engines spans exactly its variants.
  const watchableVariants = new Set(
    listWatchChannels()
      .filter((channel) => channel.id !== 'engines')
      .flatMap((channel) => [...channel.legacyVariants]),
  );
  assert.deepEqual(new Set(engines.legacyVariants), watchableVariants);
  assert.ok(engines.legacyVariants.includes('dark-chess'));
});

test('retired Mini Xiangqi sub-family has no watch channel', () => {
  const ids = listWatchChannels().map((channel) => channel.id);
  for (const id of RETIRED_WATCH_CHANNEL_IDS) {
    assert.equal(ids.includes(id), false, `${id} must not appear in the watch rail`);
    assert.equal(watchChannelForId(id), null, `${id} must not resolve by deep link`);
  }
});
