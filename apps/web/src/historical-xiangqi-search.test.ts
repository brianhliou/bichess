import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  historicalXiangqiOutcomeLabel,
  historicalXiangqiResultLabel,
  historicalXiangqiReviewUrl,
  historicalXiangqiSearchApiUrl,
  mountHistoricalXiangqiSearch,
} from './historical-xiangqi-search.js';

describe('historical xiangqi search page', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/games/search');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds archive URLs and result labels', () => {
    expect(historicalXiangqiReviewUrl('hxq game')).toBe('/historical-xiangqi/game/hxq%20game');
    expect(
      historicalXiangqiSearchApiUrl({
        sort: 'recent',
        player: 'Hu Ronghua',
        event: '',
        source: 'xqbase',
        result: '1-0',
        from: '1970-01-01',
        to: '',
        plyMin: '20',
        plyMax: '',
        offset: 50,
        limit: 100,
      }),
    ).toBe(
      '/api/historical-xiangqi/games?player=Hu+Ronghua&source=xqbase&result=1-0&from=1970-01-01&plyMin=20&offset=50&limit=100',
    );
    expect(historicalXiangqiResultLabel('1-0')).toBe('Red');
    expect(historicalXiangqiResultLabel('0-1')).toBe('Black');
    expect(historicalXiangqiResultLabel('1/2-1/2')).toBe('Draw');
    expect(historicalXiangqiOutcomeLabel('1-0')).toBe('Red wins');
    expect(historicalXiangqiOutcomeLabel('0-1')).toBe('Black wins');
    expect(historicalXiangqiOutcomeLabel('1/2-1/2')).toBe('Draw');
    expect(historicalXiangqiOutcomeLabel('*')).toBe('Unfinished');
  });

  it('renders filters and links result rows to the historical review route', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        total: 1,
        offset: 0,
        limit: 50,
        games: [
          {
            id: 'hxq_1',
            kind: 'historical',
            reviewUrl: '/historical-xiangqi/game/hxq_1',
            sourceSlug: 'xqbase',
            sourceName: 'XQBase',
            sourceGameId: '123',
            sourceUrl: null,
            eventName: 'Wuyang Cup',
            site: 'Guangzhou',
            round: '1',
            board: null,
            playedOn: '1982-01-04',
            redNameRaw: 'Hu Ronghua',
            blackNameRaw: 'Liu Dahua',
            result: '1-0',
            plyCount: 83,
            sortAt: '1982-01-04',
            moveFormat: 'wxf',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountHistoricalXiangqiSearch(root);

    expect(fetchSpy).toHaveBeenCalledWith('/api/historical-xiangqi/games?limit=50', {
      headers: { accept: 'application/json' },
    });
    expect(root.querySelector<HTMLInputElement>('input[type="search"]')).not.toBeNull();
    expect(root.textContent).toContain('1 game found');
    expect(root.textContent).toContain('Hu Ronghua vs Liu Dahua');
    expect(root.textContent).toContain('Wuyang Cup');
    expect(root.textContent).toContain('Archive');
    expect(root.querySelector<HTMLAnchorElement>('.historical-xiangqi-row')?.pathname).toBe(
      '/historical-xiangqi/game/hxq_1',
    );
  });

  it('renders broadcast rows English primary with the Chinese as a secondary span', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          total: 1,
          offset: 0,
          limit: 50,
          games: [
            {
              id: 'bcast_1',
              kind: 'broadcast',
              reviewUrl: '/broadcast/xiangqi/board/bcast_1',
              sourceSlug: 'broadcast',
              sourceName: 'Broadcast',
              sourceGameId: 'b1',
              sourceUrl: null,
              eventName: '2026全国象棋团体赛',
              eventNameEn: '2026 National Xiangqi Team Championship',
              site: null,
              round: '第3轮',
              roundNameEn: 'Round 3',
              board: '1',
              playedOn: '2026-07-01',
              redNameRaw: '徐腾飞',
              redNameEn: 'Xu Tengfei',
              blackNameRaw: '唐丹',
              blackNameEn: 'Tang Dan',
              result: '1-0',
              plyCount: 88,
              sortAt: '2026-07-01',
              moveFormat: 'broadcast',
            },
          ],
        }),
      ),
    );
    const root = document.createElement('div');

    await mountHistoricalXiangqiSearch(root);

    // English primary line, Chinese preserved in the secondary span.
    const matchup = root.querySelector('.historical-xiangqi-matchup');
    expect(matchup?.textContent).toContain('Xu Tengfei vs Tang Dan');
    expect(matchup?.querySelector('.historical-xiangqi-zh')?.textContent).toBe('徐腾飞 vs 唐丹');

    const event = root.querySelector('.historical-xiangqi-event');
    expect(event?.textContent).toContain('2026 National Xiangqi Team Championship');
    expect(event?.textContent).toContain('Round 3');
    expect(event?.querySelector('.historical-xiangqi-zh')?.textContent).toContain(
      '2026全国象棋团体赛',
    );
    expect(event?.querySelector('.historical-xiangqi-zh')?.textContent).toContain('第3轮');
  });

  // Applying a filter used to rewrite the bar to `/historical-xiangqi/games`,
  // a retired path that 301s back here, so a copied or reloaded filtered URL
  // took a redirect hop and lost its query.
  it('keeps the canonical /games/search path when filters are applied', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ total: 0, offset: 0, limit: 50, games: [] })),
    );
    const root = document.createElement('div');

    await mountHistoricalXiangqiSearch(root);
    const form = root.querySelector<HTMLFormElement>('form.historical-xiangqi-filters');
    const player = form?.querySelector<HTMLInputElement>('input[type="search"]');
    if (!form || !player) throw new Error('filter form did not render');
    player.value = 'Hu Ronghua';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(window.location.pathname).toBe('/games/search');
    expect(window.location.search).toBe('?player=Hu+Ronghua');
  });

  it('round-trips a non-default sort through the URL and the API call', async () => {
    window.history.replaceState(null, '', '/games/search?sort=longest');
    const requested: string[] = [];
    const fetchSpy = vi.fn(async (url: string) => {
      requested.push(url);
      return jsonResponse({ total: 0, offset: 0, limit: 50, games: [] });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountHistoricalXiangqiSearch(root);

    expect(requested[0]).toContain('sort=longest');
    expect(window.location.search).toContain('sort=longest');
    // The default stays out of the URL so a plain /games/search link is still canonical.
    const select = [...root.querySelectorAll<HTMLSelectElement>('select')].find((el) =>
      [...el.options].some((option) => option.value === 'shortest'),
    );
    expect(select?.value).toBe('longest');
  });

  // Regression: every select was built by setting `selected` on a detached
  // option before appending it, which the selectedness reset discards for
  // anything past the second position. Every result past "Red wins" rendered as
  // "Red wins" while the rows below were filtered correctly.
  it('renders the saved filter in every select, not just the first two options', async () => {
    window.history.replaceState(null, '', '/games/search?result=1%2F2-1%2F2&sort=shortest');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ total: 0, offset: 0, limit: 50, games: [] })),
    );
    const root = document.createElement('div');

    await mountHistoricalXiangqiSearch(root);

    const selects = [...root.querySelectorAll<HTMLSelectElement>('select')];
    const byOption = (value: string): HTMLSelectElement | undefined =>
      selects.find((el) => [...el.options].some((option) => option.value === value));
    expect(byOption('1/2-1/2')?.value).toBe('1/2-1/2');
    expect(byOption('shortest')?.value).toBe('shortest');
  });

  it('uses server-provided review URLs for non-archive rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          total: 1,
          offset: 0,
          limit: 50,
          games: [
            {
              id: 'mist_1',
              kind: 'mistboard',
              reviewUrl: '/xiangqi/game/mist_1',
              sourceSlug: 'mistboard',
              sourceName: 'Mistboard',
              sourceGameId: 'mist_1',
              sourceUrl: null,
              eventName: null,
              site: null,
              round: null,
              board: null,
              playedOn: '2026-07-09',
              redNameRaw: 'Red',
              blackNameRaw: 'Black',
              result: '1/2-1/2',
              plyCount: 42,
              sortAt: '2026-07-09T12:00:00.000Z',
              moveFormat: 'mistboard',
            },
          ],
        }),
      ),
    );
    const root = document.createElement('div');

    await mountHistoricalXiangqiSearch(root);

    expect(root.querySelector<HTMLAnchorElement>('.historical-xiangqi-row')?.pathname).toBe(
      '/xiangqi/game/mist_1',
    );
    expect(root.textContent).toContain('Mistboard');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}
