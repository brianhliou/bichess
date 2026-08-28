import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dhtmlxqTag,
  dpxqLiveDiscoveryProvider,
  dpxqPlyCount,
  rankDpxqOnlineBoards,
} from './xiangqi-broadcast-discovery-dpxq.js';

test('online board ids rank by viewer count', () => {
  const html = [
    'view.asp?owner=u&id=100',
    'view.asp?owner=u&id=200',
    'view.asp?owner=u&id=100',
    'view.asp?owner=u&id=100&f=',
    'view.asp?owner=u&id=300',
    'view.asp?owner=u&id=200',
  ].join(' ');
  assert.deepEqual(rankDpxqOnlineBoards(html), [
    { id: '100', viewers: 3 },
    { id: '200', viewers: 2 },
    { id: '300', viewers: 1 },
  ]);
});

// Must agree with the adapter, which also takes the first non-empty movelist.
// A board counted as started here but read as empty there imports as a phantom.
test('the ply count skips dpxq empty movelist placeholders', () => {
  const page = '[DhtmlXQ_movelist][/DhtmlXQ_movelist][DhtmlXQ_movelist]77477062[/DhtmlXQ_movelist]';
  assert.equal(dpxqPlyCount(page), 2);
  assert.equal(dpxqPlyCount('[DhtmlXQ_movelist][/DhtmlXQ_movelist]'), 0);
});

test('tags read out of a board page', () => {
  const page = '[DhtmlXQ_event]2026年甲级联赛[/DhtmlXQ_event][DhtmlXQ_red]王天一[/DhtmlXQ_red]';
  assert.equal(dhtmlxqTag(page, 'event'), '2026年甲级联赛');
  assert.equal(dhtmlxqTag(page, 'red'), '王天一');
  assert.equal(dhtmlxqTag(page, 'black'), '');
});

function fakeFetch(pages: Record<string, string>) {
  return async (url: string) => {
    const body = pages[url];
    if (body === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
}

test('discovery reads the online list then each board', async () => {
  const origin = 'http://dpxq.test';
  const board = (id: string, event: string) =>
    `[DhtmlXQ_event]${event}[/DhtmlXQ_event][DhtmlXQ_red]R${id}[/DhtmlXQ_red][DhtmlXQ_black]B${id}[/DhtmlXQ_black][DhtmlXQ_movelist]77477062[/DhtmlXQ_movelist]`;
  const result = await dpxqLiveDiscoveryProvider.discover({
    config: new URLSearchParams({ origin }),
    timeoutMs: 1000,
    fetchImpl: fakeFetch({
      [`${origin}/hldcg/search/s_online.asp`]: 'view.asp?id=1 view.asp?id=1 view.asp?id=2',
      [`${origin}/hldcg/search/view.asp?owner=u&id=1`]: board('1', '甲级联赛'),
      [`${origin}/hldcg/search/view.asp?owner=u&id=2`]: board('2', '适情雅趣'),
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.boards.map((b) => [b.event, b.red, b.plies]),
    [
      ['甲级联赛', 'R1', 2],
      ['适情雅趣', 'R2', 2],
    ],
  );
});

// A board can close between the listing and the read; that is normal churn and
// must not fail the whole pass.
test('an unreachable candidate is skipped, not fatal', async () => {
  const origin = 'http://dpxq.test';
  const result = await dpxqLiveDiscoveryProvider.discover({
    config: new URLSearchParams({ origin }),
    timeoutMs: 1000,
    fetchImpl: fakeFetch({
      [`${origin}/hldcg/search/s_online.asp`]: 'view.asp?id=1 view.asp?id=9',
      [`${origin}/hldcg/search/view.asp?owner=u&id=1`]:
        '[DhtmlXQ_event]e[/DhtmlXQ_event][DhtmlXQ_movelist]7747[/DhtmlXQ_movelist]',
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.boards.length, 1);
});

test('an unreachable online list fails the pass', async () => {
  const result = await dpxqLiveDiscoveryProvider.discover({
    config: new URLSearchParams({ origin: 'http://dpxq.test' }),
    timeoutMs: 1000,
    fetchImpl: fakeFetch({}),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /online list unreachable/);
});
