import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDiscoveryManifestSources,
  type DiscoveredBoard,
  type DiscoverySource,
  roundNumberFromRoundId,
} from './xiangqi-broadcast-discovery.js';
import {
  archiveBoardUrl,
  dpxqTourDiscoveryProvider,
  parseDpxqTourGameList,
  tourGameListUrl,
} from './xiangqi-broadcast-discovery-dpxq-tour.js';

// Shaped after the real /hldcg/movelist_12656.html (the 2026 甲级联赛 qualifier):
// one row per game, round label first, then the 台 number, then the two sides
// written in mirrored order, then the record link.
const GAME_LIST = `
<table>
<tr><td>第01轮</td><td>1</td><td>浙江民泰银行象棋队 王家瑞</td><td>2 + 0</td><td>朱鑫垚 天津市滨海新区象棋协会</td><td><a href="/hldcg/search/view_m_142519.html">谱</a></td></tr>
<tr><td>第01轮</td><td>2</td><td>天津市滨海新区象棋协会 焦伟宸</td><td>1 = 1</td><td>徐崇峰 浙江民泰银行象棋队</td><td><a href="/hldcg/search/view_m_142518.html">谱</a></td></tr>
<tr><td>第02轮</td><td>1</td><td>杭州市棋类协会 戴晨</td><td>2 + 0</td><td>张嘉禾 聚顺磨料象棋队</td><td><a href="/hldcg/search/view_m_142499.html">谱</a></td></tr>
<tr><td>合计</td><td colspan="5">61 局</td></tr>
</table>`;

function providerInput(pages: Record<string, string>) {
  return {
    config: new URLSearchParams({ tour: '12656' }),
    timeoutMs: 1000,
    fetchImpl: async (url: string) => {
      const body = pages[url];
      if (body === undefined) return new Response('missing', { status: 404 });
      return new Response(body, { status: 200 });
    },
  };
}

function discoverySource(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    provider: dpxqTourDiscoveryProvider,
    config: new URLSearchParams(),
    tourSlug: '2026-league',
    minViewers: 1,
    maxBoards: 32,
    ...overrides,
  };
}

test('a tour game list yields one board per game, with its stated round', () => {
  const games = parseDpxqTourGameList(GAME_LIST);
  assert.deepEqual(games, [
    { id: '142519', roundNumber: 1 },
    { id: '142518', roundNumber: 1 },
    { id: '142499', roundNumber: 2 },
  ]);
});

test('a row without a game link is not a game', () => {
  // The totals row at the foot of the real page has no record link.
  assert.equal(parseDpxqTourGameList('<tr><td>合计</td><td>61 局</td></tr>').length, 0);
});

test('the provider reads the tour list and points at archive pages', async () => {
  const result = await dpxqTourDiscoveryProvider.discover(
    providerInput({ [tourGameListUrl('12656')]: GAME_LIST }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.boards.length, 3);
  assert.equal(result.boards[0]!.url, archiveBoardUrl('142519'));
  assert.equal(result.boards[0]!.roundNumber, 1);
});

test('a tour with no uploaded records fails rather than importing nothing silently', async () => {
  const result = await dpxqTourDiscoveryProvider.discover(
    providerInput({ [tourGameListUrl('12656')]: '<table></table>' }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /lists no game records/);
});

test('discovery rejects a non-numeric tour id instead of fetching it', async () => {
  const input = providerInput({});
  input.config = new URLSearchParams({ tour: '../evil' });
  const result = await dpxqTourDiscoveryProvider.discover(input);
  assert.equal(result.ok, false);
});

test('roundNumberFromRoundId reads the seeded round id shape', () => {
  assert.equal(roundNumberFromRoundId('2026-league-r07'), 7);
  assert.equal(roundNumberFromRoundId('2026-league-r18'), 18);
  assert.equal(roundNumberFromRoundId('2026-league-final'), undefined);
});

test('a whole tour game list is filtered down to the scheduled round', () => {
  const boards: DiscoveredBoard[] = [
    { url: archiveBoardUrl('1'), roundNumber: 1 },
    { url: archiveBoardUrl('2'), roundNumber: 1 },
    { url: archiveBoardUrl('3'), roundNumber: 2 },
  ];
  const built = buildDiscoveryManifestSources({
    source: discoverySource(),
    boards,
    round: { roundId: '2026-league-r01', roundName: 'Round 1' },
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.sources.length, 2);
  // Board numbers run 1..N within the round, in game-list order, so a team
  // match's boards stay adjacent.
  assert.deepEqual(
    built.sources.map((source) => source.boardNumber),
    [1, 2],
  );
  assert.ok(built.sources.every((source) => source.roundId === '2026-league-r01'));
});

test('a round with no games in the list fails closed', () => {
  const built = buildDiscoveryManifestSources({
    source: discoverySource(),
    boards: [{ url: archiveBoardUrl('1'), roundNumber: 1 }],
    round: { roundId: '2026-league-r09' },
  });
  assert.equal(built.ok, false);
  if (built.ok) return;
  assert.match(built.message, /round 9/);
});

test('stated rounds against an unnumbered scheduled round fail rather than guessing', () => {
  // Importing a whole tournament's game list into whichever round happens to be
  // open is the failure this guards.
  const built = buildDiscoveryManifestSources({
    source: discoverySource(),
    boards: [{ url: archiveBoardUrl('1'), roundNumber: 1 }],
    round: { roundId: '2026-league-opening' },
  });
  assert.equal(built.ok, false);
});

test('boards without a stated round keep the existing behaviour', () => {
  const built = buildDiscoveryManifestSources({
    source: discoverySource(),
    boards: [{ url: archiveBoardUrl('1') }, { url: archiveBoardUrl('2') }],
    round: { roundId: '2026-league-r01' },
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.sources.length, 2);
});
