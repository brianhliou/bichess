import { XIANGQI_BROADCAST_SCHEMA, type XiangqiColor, type XiangqiMove } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importXiangqiGame } from './review/xiangqi-import.js';
import { buildXiangqiReplayFromMoves } from './review/xiangqi-review-model.js';
import { xiangqiAppearanceChangedEvent } from './theme.js';
import {
  formatBroadcastFreshness,
  mountXiangqiBroadcastBoard,
  mountXiangqiBroadcastIndex,
  mountXiangqiBroadcastRound,
  serializeBroadcastMovesForAnalysis,
} from './xiangqi-broadcast.js';

type TimelineEntry = {
  type: 'move-played';
  color: XiangqiColor;
  move: XiangqiMove;
  ply: number;
};

// Red moves on odd plies, black on even — the same alternation the server emits.
function timelineFrom(moves: XiangqiMove[]): TimelineEntry[] {
  return moves.map((move, index) => ({
    type: 'move-played',
    color: index % 2 === 0 ? 'red' : 'black',
    move,
    ply: index + 1,
  }));
}

function stubEventSource(): void {
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener(): void {}
      close(): void {}
    },
  );
}

function stubFetchJson(payloadForUrl: (url: string) => unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => ({
      ok: true,
      status: 200,
      json: async () => payloadForUrl(String(input)),
    })),
  );
}

describe('serializeBroadcastMovesForAnalysis', () => {
  // A legal, color-alternating opening (red on odd plies) that also exercises
  // rank-10 tokens (b10, a10) — every move is legal, so the analysis importer
  // keeps the whole line instead of truncating at an illegal ply.
  const GAME: XiangqiMove[] = [
    { from: 'b3', to: 'e3' }, // red cannon to center
    { from: 'h8', to: 'e8' }, // black cannon to center
    { from: 'b1', to: 'c3' }, // red horse
    { from: 'b10', to: 'c8' }, // black horse
    { from: 'a1', to: 'a2' }, // red rook up one
    { from: 'a10', to: 'a9' }, // black rook up one
  ];
  const QUERY = 'b3e3,h8e8,b1c3,b10c8,a1a2,a10a9';

  it('round-trips a broadcast timeline through the /analysis/xiangqi importer', () => {
    const query = serializeBroadcastMovesForAnalysis(timelineFrom(GAME));
    expect(query).toBe(QUERY);

    const imported = importXiangqiGame(query);
    expect(imported.error).toBeUndefined();
    expect(imported.moves).toEqual(GAME);
  });

  it('orders by ply regardless of timeline entry order', () => {
    const shuffled = [...timelineFrom(GAME)].reverse();
    expect(serializeBroadcastMovesForAnalysis(shuffled)).toBe(QUERY);
  });

  it('yields an empty query for a board with no moves', () => {
    expect(serializeBroadcastMovesForAnalysis([])).toBe('');
  });
});

describe('formatBroadcastFreshness', () => {
  // Local-time (no Z) timestamps keep the expected labels timezone-independent.
  const NOW = new Date('2026-07-10T12:00:00');

  it('labels sub-day updates relative to now', () => {
    expect(formatBroadcastFreshness('2026-07-10T11:59:40', NOW)).toBe('just now');
    expect(formatBroadcastFreshness('2026-07-10T11:57:00', NOW)).toBe('3m ago');
    expect(formatBroadcastFreshness('2026-07-10T10:00:00', NOW)).toBe('2h ago');
  });

  it('falls back to a short date after a day, adding the year when it differs', () => {
    expect(formatBroadcastFreshness('2026-07-08T18:00:00', NOW)).toBe('Jul 8');
    expect(formatBroadcastFreshness('2025-12-31T18:00:00', NOW)).toBe('Dec 31, 2025');
  });

  it('returns null for missing or invalid timestamps', () => {
    expect(formatBroadcastFreshness(null, NOW)).toBeNull();
    expect(formatBroadcastFreshness(undefined, NOW)).toBeNull();
    expect(formatBroadcastFreshness('not-a-date', NOW)).toBeNull();
  });
});

function fixtureBoard(input: {
  n: number;
  red: string;
  redEn?: string;
  black: string;
  blackEn?: string;
  moves: XiangqiMove[];
  status: 'scheduled' | 'live' | 'complete';
  result: '*' | '1-0' | '0-1' | '1/2-1/2';
  updatedAt?: string;
}) {
  return {
    id: `t-r-b${input.n}`,
    tourSlug: 't',
    roundId: 'r',
    sourceBoardId: `b${input.n}`,
    boardNumber: input.n,
    red: { name: input.red, ...(input.redEn ? { nameEn: input.redEn } : {}) },
    black: { name: input.black, ...(input.blackEn ? { nameEn: input.blackEn } : {}) },
    status: input.status,
    result: input.result,
    plyCount: input.moves.length,
    moves: input.moves,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

// The ingested shape: Chinese originals with cached English translations on
// the rounds and player tags (tour name here is already English). `rounds`
// carries the sibling-round stats the round switcher renders markers from.
const ROUND = {
  tour: { schema: XIANGQI_BROADCAST_SCHEMA, slug: 't', name: 'Test Cup' },
  round: {
    schema: XIANGQI_BROADCAST_SCHEMA,
    id: 'r',
    tourSlug: 't',
    name: '第1轮',
    nameEn: 'Round 1',
  },
  rounds: [
    {
      schema: XIANGQI_BROADCAST_SCHEMA,
      id: 'r',
      tourSlug: 't',
      name: '第1轮',
      nameEn: 'Round 1',
      boardCount: 2,
      liveBoardCount: 1,
      completeBoardCount: 0,
      scheduledBoardCount: 1,
    },
    {
      schema: XIANGQI_BROADCAST_SCHEMA,
      id: 'r2',
      tourSlug: 't',
      name: '第2轮',
      nameEn: 'Round 2',
      boardCount: 2,
      liveBoardCount: 0,
      completeBoardCount: 2,
      scheduledBoardCount: 0,
    },
  ],
  boards: [
    fixtureBoard({
      n: 1,
      red: '王天一',
      redEn: 'Wang Tianyi',
      black: '郑惟桐',
      blackEn: 'Zheng Weitong',
      moves: [{ from: 'b3', to: 'e3' }],
      status: 'live',
      result: '*',
    }),
    fixtureBoard({
      n: 2,
      red: 'A Player',
      black: 'B Player',
      moves: [],
      status: 'scheduled',
      result: '*',
    }),
  ],
};

describe('mountXiangqiBroadcastRound (mini-board grid)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders one mini-board card per board with a board, names, and live marker', async () => {
    // Stub the round fetch; EventSource is stubbed to a no-op so the live-stream
    // wiring does not reach for a real connection under happy-dom.
    stubFetchJson(() => ROUND);
    stubEventSource();

    const root = document.createElement('div');
    await mountXiangqiBroadcastRound(root, 't', 'r');

    const cards = root.querySelectorAll('.xqb-board-card');
    expect(cards.length).toBe(2);
    // Each card rebuilds a position and renders the shared board SVG (the board
    // root carries .xq-live-svg; pieces are nested svgs, so match the root only).
    expect(root.querySelectorAll('.xqb-card-board > svg.xq-live-svg').length).toBe(2);
    // Pairing names are present.
    expect(root.textContent).toContain('王天一');
    expect(root.textContent).toContain('郑惟桐');
    // The live board carries the live status class; both players are shown.
    expect(root.querySelector('.xqb-board-card-live .xqb-status-live')).not.toBeNull();
    expect(root.querySelectorAll('.xqb-board-card-live .xqb-card-player').length).toBe(2);
    // The live status renders as the accent badge.
    expect(root.querySelector('.xqb-board-card-live .xqb-badge-live')).not.toBeNull();
  });

  it('repaints mini-board cards when the board layout changes', async () => {
    stubFetchJson(() => ROUND);
    stubEventSource();
    window.history.replaceState(null, '', '/broadcast/xiangqi/t/round/r');

    const root = document.createElement('div');
    await mountXiangqiBroadcastRound(root, 't', 'r');
    expect(root.querySelectorAll('.xq-live-svg--intersection')).toHaveLength(2);

    window.history.replaceState(null, '', '/broadcast/xiangqi/t/round/r?xqLayout=cell');
    window.dispatchEvent(new Event(xiangqiAppearanceChangedEvent));

    expect(root.querySelectorAll('.xq-live-svg--cell')).toHaveLength(2);
    window.history.replaceState(null, '', '/');
  });

  it('renders English primary with the Chinese preserved as a secondary line', async () => {
    stubFetchJson(() => ROUND);
    stubEventSource();

    const root = document.createElement('div');
    await mountXiangqiBroadcastRound(root, 't', 'r');

    // Round hero: English title primary, Chinese as the subtitle line.
    expect(root.querySelector('.xqb-hero h1')?.textContent).toBe('Round 1');
    expect(root.querySelector('.xqb-hero-zh')?.textContent).toBe('第1轮');

    // Player names: English primary, Chinese secondary span alongside.
    const names = [...root.querySelectorAll('.xqb-card-player-name')].map(
      (node) => node.textContent,
    );
    expect(names).toContain('Wang Tianyi');
    expect(names).toContain('Zheng Weitong');
    const zh = [...root.querySelectorAll('.xqb-name-zh')].map((node) => node.textContent);
    expect(zh).toContain('王天一');
    expect(zh).toContain('郑惟桐');

    // Already-English names get no duplicate secondary line.
    expect(zh).not.toContain('A Player');
    expect(root.querySelectorAll('.xqb-board-card')[1]?.querySelector('.xqb-name-zh')).toBeNull();
  });

  it('renders a round switcher listing sibling rounds with the current round selected', async () => {
    stubFetchJson(() => ROUND);
    stubEventSource();

    const root = document.createElement('div');
    await mountXiangqiBroadcastRound(root, 't', 'r');

    const select = root.querySelector<HTMLSelectElement>('.xqb-hero .xqb-round-select');
    expect(select).not.toBeNull();
    const options = [...(select?.querySelectorAll('option') ?? [])];
    expect(options.map((option) => option.value)).toEqual(['r', 'r2']);
    expect(select?.value).toBe('r');
    // Status markers: live disc for round 1, finished check for round 2.
    expect(options[0]?.textContent).toBe('● Round 1');
    expect(options[1]?.textContent).toBe('✓ Round 2');
  });

  it('sorts live boards ahead of finished and scheduled boards with result badges', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    stubFetchJson(() => ({
      ...ROUND,
      boards: [
        fixtureBoard({
          n: 1,
          red: 'R1',
          black: 'B1',
          moves: [],
          status: 'complete',
          result: '1-0',
          updatedAt: twoHoursAgo,
        }),
        fixtureBoard({ n: 2, red: 'R2', black: 'B2', moves: [], status: 'scheduled', result: '*' }),
        fixtureBoard({ n: 3, red: 'R3', black: 'B3', moves: [], status: 'live', result: '*' }),
      ],
    }));
    stubEventSource();

    const root = document.createElement('div');
    await mountXiangqiBroadcastRound(root, 't', 'r');

    const numbers = [...root.querySelectorAll('.xqb-card-number')].map((node) => node.textContent);
    expect(numbers).toEqual(['Board 3', 'Board 1', 'Board 2']);
    // Finished boards carry a neutral result pill; card feet carry freshness.
    expect(root.querySelector('.xqb-board-card-complete .xqb-badge-result')?.textContent).toBe(
      'Red wins',
    );
    expect(root.querySelector('.xqb-board-card-complete .xqb-card-foot')?.textContent).toContain(
      '2h ago',
    );
    expect(root.querySelector('.xqb-board-card-live .xqb-card-foot')?.textContent).toContain(
      'live',
    );
  });
});

describe('mountXiangqiBroadcastIndex (live and past zones)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const startView = buildXiangqiReplayFromMoves([]).views[0]!;

  function indexEntry(input: {
    slug: string;
    name: string;
    nameEn?: string;
    live: boolean;
    updatedAt: string;
    featured?: boolean;
  }) {
    return {
      tour: {
        schema: XIANGQI_BROADCAST_SCHEMA,
        slug: input.slug,
        name: input.name,
        ...(input.nameEn ? { nameEn: input.nameEn } : {}),
        location: 'Chengdu',
        startsAt: '2026-07-01',
        endsAt: '2026-07-08',
      },
      roundCount: 3,
      boardCount: 14,
      liveBoardCount: input.live ? 2 : 0,
      completeBoardCount: input.live ? 0 : 14,
      scheduledBoardCount: 0,
      totalPlies: 480,
      updatedAt: input.updatedAt,
      lastSyncLog: null,
      featuredBoard:
        input.featured === false
          ? null
          : {
              id: `${input.slug}-b1`,
              roundId: 'r1',
              boardNumber: 1,
              red: { name: 'Red Player' },
              black: { name: 'Black Player' },
              status: input.live ? ('live' as const) : ('complete' as const),
              result: input.live ? ('*' as const) : ('1-0' as const),
              plyCount: 40,
              updatedAt: input.updatedAt,
              view: startView,
            },
    };
  }

  it('zones live tours above past tours as cards with thumbnails and freshness', async () => {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60_000).toISOString();
    // Past tour listed first in the payload to prove zoning is status-driven,
    // not order-driven. It also has no featured board, covering the
    // initial-position thumbnail fallback.
    stubFetchJson(() => ({
      tours: [
        indexEntry({
          slug: 'past-open',
          name: 'Past Open',
          live: false,
          updatedAt: threeMinutesAgo,
          featured: false,
        }),
        indexEntry({
          slug: 'live-cup',
          name: '直播杯',
          nameEn: 'Live Cup',
          live: true,
          updatedAt: threeMinutesAgo,
        }),
      ],
    }));

    const root = document.createElement('div');
    await mountXiangqiBroadcastIndex(root);

    const headings = [...root.querySelectorAll('.xqb-section h2')].map((node) => node.textContent);
    expect(headings).toEqual(['Live now', 'Past']);

    const zones = root.querySelectorAll('.xqb-section');
    const liveCard = zones[0]?.querySelector('.xqb-tour-card');
    expect(liveCard?.className).toContain('xqb-tour-card-live');
    expect(liveCard?.querySelector('.xqb-badge-live')).not.toBeNull();
    // English primary, Chinese secondary, location and counts on the card.
    expect(liveCard?.querySelector('strong')?.textContent).toBe('Live Cup');
    expect(liveCard?.querySelector('.xqb-name-zh')?.textContent).toBe('直播杯');
    expect(liveCard?.textContent).toContain('Chengdu');
    expect(liveCard?.textContent).toContain('3 rounds / 14 boards / 2 live');

    const pastCard = zones[1]?.querySelector('.xqb-tour-card');
    expect(pastCard?.querySelector('.xqb-badge-live')).toBeNull();
    expect(pastCard?.textContent).toContain('Updated 3m ago');

    // Both cards render a mini-board thumbnail, including the featured-board
    // fallback for the past tour.
    expect(root.querySelectorAll('.xqb-tour-card .xqb-card-board > svg.xq-live-svg').length).toBe(
      2,
    );
  });

  it('renders a single zone when nothing is live', async () => {
    stubFetchJson(() => ({
      tours: [
        indexEntry({
          slug: 'past-open',
          name: 'Past Open',
          live: false,
          updatedAt: new Date().toISOString(),
        }),
      ],
    }));

    const root = document.createElement('div');
    await mountXiangqiBroadcastIndex(root);

    const headings = [...root.querySelectorAll('.xqb-section h2')].map((node) => node.textContent);
    expect(headings).toEqual(['Broadcasts']);
    expect(root.querySelectorAll('.xqb-tour-card').length).toBe(1);
  });
});

describe('mountXiangqiBroadcastBoard (side rail + round switcher)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const MOVES: XiangqiMove[] = [{ from: 'b3', to: 'e3' }];
  const replay = buildXiangqiReplayFromMoves(MOVES);
  const BOARD_RESPONSE = {
    board: {
      id: 't-r-b1',
      tourSlug: 't',
      roundId: 'r',
      sourceBoardId: 'b1',
      boardNumber: 1,
      red: { name: '王天一', nameEn: 'Wang Tianyi' },
      black: { name: '郑惟桐', nameEn: 'Zheng Weitong' },
      status: 'live',
      result: '*',
      plyCount: MOVES.length,
      moves: MOVES,
    },
    state: { status: { type: 'playing', turn: 'black' }, moveNumber: 1 },
    timeline: timelineFrom(MOVES),
    view: replay.views[replay.maxPly]!,
    views: { truth: replay.views[replay.maxPly]! },
    history: { truth: replay.views.map((view, ply) => ({ ply, view })) },
  };

  it('lists sibling boards in a rail with the current board highlighted', async () => {
    stubFetchJson((url) =>
      url.includes('/api/xiangqi/broadcasts/boards/') ? BOARD_RESPONSE : ROUND,
    );
    stubEventSource();

    const root = document.createElement('div');
    await mountXiangqiBroadcastBoard(root, 't-r-b1');

    expect(root.querySelector('.xqb-side-rail')).not.toBeNull();
    const rows = [...root.querySelectorAll('.xqb-rail-row')];
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/broadcast/xiangqi/board/t-r-b1',
      '/broadcast/xiangqi/board/t-r-b2',
    ]);

    const current = root.querySelector('.xqb-rail-row-current');
    expect(current?.getAttribute('href')).toBe('/broadcast/xiangqi/board/t-r-b1');
    expect(current?.getAttribute('aria-current')).toBe('page');
    // Players render English-primary; the live board carries a live marker.
    expect(current?.querySelector('.xqb-rail-players')?.textContent).toBe(
      'Wang Tianyi vs Zheng Weitong',
    );
    expect(current?.querySelector('.xqb-rail-marker')?.textContent).toBe('Live');

    // The hero carries the same round switcher as the round page.
    const select = root.querySelector<HTMLSelectElement>('.xqb-hero .xqb-round-select');
    expect(select).not.toBeNull();
    expect(select?.value).toBe('r');
  });

  it('renders the board without a rail when the round context fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/api/xiangqi/broadcasts/boards/')) {
          return { ok: true, status: 200, json: async () => BOARD_RESPONSE };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    );
    stubEventSource();

    const root = document.createElement('div');
    await mountXiangqiBroadcastBoard(root, 't-r-b1');

    expect(root.querySelector('.xqb-side-rail')).toBeNull();
    expect(root.querySelector('.xqb-round-select')).toBeNull();
    // The board page itself still renders.
    expect(root.querySelector('.xqb-board-frame')).not.toBeNull();
    expect(root.querySelector('.xqb-hero h1')?.textContent).toContain('Wang Tianyi');
  });
});
