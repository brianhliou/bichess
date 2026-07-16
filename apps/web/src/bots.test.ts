import { afterEach, describe, expect, it, vi } from 'vitest';

function bot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const primaryRating = {
    gameSpecId: 'dark-chess',
    timeClass: 'blitz',
    rating: 1812,
    ratingDeviation: 92,
    games: 48,
    source: 'eve-anchor',
    sourceRef: 'report-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    provisional: false,
  };
  return {
    id: 'misty-dark-chess',
    displayName: 'Misty',
    bio: 'Searches hidden positions with the Mistboard engine.',
    ownerType: 'system',
    ownerUserId: null,
    activeEngineId: 'python-v2-v1.5',
    defaultGameSpecId: 'dark-chess',
    supportedGameSpecIds: ['dark-chess', 'banqi'],
    play: {
      mode: 'pve',
      gameSpecId: 'dark-chess',
      engineId: 'python-v2-v1.5',
      timeControl: {
        initialMs: 180_000,
        incrementMs: 2_000,
      },
      preferredColor: 'random',
    },
    gamesTotal: 12,
    record: {
      games: 12,
      wins: 8,
      losses: 3,
      draws: 1,
    },
    rating: primaryRating,
    ratings: [
      primaryRating,
      {
        gameSpecId: 'banqi',
        timeClass: 'rapid',
        rating: 1620,
        ratingDeviation: 110,
        games: 12,
        source: 'eve-anchor',
        sourceRef: 'report-2',
        createdAt: '2026-06-01T00:00:00.000Z',
        provisional: false,
      },
    ],
    games: [],
    ...overrides,
  };
}

describe('bot pages', () => {
  afterEach(() => {
    document.querySelector('[data-bot-play-dialog]')?.remove();
    vi.restoreAllMocks();
  });

  it('groups the bot directory by featured and community bots', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          bots: [
            bot({ supportedGameSpecIds: ['dark-chess', 'dark-draft960', 'banqi'] }),
            bot({
              id: 'community-bot',
              displayName: 'Community Bot',
              ownerType: 'user',
              bio: 'A public community engine profile.',
            }),
          ],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);

    expect(
      [...root.querySelectorAll('.bot-directory-section h2')].map((el) => el.textContent),
    ).toEqual(['Featured bots', 'Community bots']);
    // Community rail is shared with /player; Online bots is the active entry.
    expect(root.querySelector('.community-rail a[aria-current="page"]')?.textContent).toBe(
      'Online bots',
    );
    expect(root.textContent).toContain('Searches hidden positions');
    expect(root.querySelector('.bot-card-rating-value')?.textContent).toBe('1,812');
    expect(root.querySelector('.bot-rating-strip')?.textContent).toContain('Flip Xiangqi Rapid');
    expect(root.textContent).not.toContain('Draft960');
    expect(root.querySelector<HTMLAnchorElement>('.bot-card-title')?.href).toContain(
      '/bot/misty-dark-chess',
    );
  });

  it('renders the bot profile rating and supported variants', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ bot: bot() }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const root = document.createElement('div');
    const { mountBotProfile } = await import('./bots.js');

    await mountBotProfile(root, 'misty-dark-chess');

    expect(root.querySelector('.profile-role-owner')?.textContent).toBe('First-party');
    expect(root.querySelector('.bot-profile-rating')?.textContent).toContain('1,812');
    expect(root.querySelector('.bot-profile-rating')?.textContent).toContain('48 rated games');
    expect(root.querySelector('.bot-profile-rating')?.textContent).toContain(
      'Flip Xiangqi · Rapid',
    );
    expect(root.querySelector('.bot-profile-variants')?.textContent).toContain('Flip Xiangqi');
  });

  it('opens a setup dialog before creating a bot game', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ bots: [bot()] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);
    root.querySelector<HTMLButtonElement>('.bot-play-button')?.click();

    expect(document.querySelector('[data-bot-play-dialog]')?.textContent).toContain('Start game');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('posts the confirmed bot side choice', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/bots') {
        return new Response(JSON.stringify({ bots: [bot()] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }
      if (String(input) === '/api/rooms') {
        return new Response(JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
          status: 201,
        });
      }
      return new Response(null, { status: 404 });
    });
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);
    root.querySelector<HTMLButtonElement>('.bot-play-button')?.click();
    [...document.querySelectorAll<HTMLButtonElement>('.bot-play-choice')]
      .find((button) => button.textContent === 'Black')
      ?.click();
    document.querySelector<HTMLButtonElement>('.bot-play-dialog-start')?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const postInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(postInit.body))).toMatchObject({
      mode: 'pve',
      botId: 'misty-dark-chess',
      preferredColor: 'black',
      rated: false,
    });
  });

  it('labels Banqi choices as move order instead of fixed colors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          bots: [
            bot({
              defaultGameSpecId: 'banqi',
              supportedGameSpecIds: ['banqi'],
              play: {
                mode: 'pve',
                gameSpecId: 'banqi',
                engineId: 'misty-banqi',
                timeControl: {
                  initialMs: 180_000,
                  incrementMs: 2_000,
                },
                preferredColor: 'random',
              },
            }),
          ],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    const root = document.createElement('div');
    const { mountBots } = await import('./bots.js');

    await mountBots(root);
    root.querySelector<HTMLButtonElement>('.bot-play-button')?.click();

    const dialogText = document.querySelector('[data-bot-play-dialog]')?.textContent ?? '';
    expect(dialogText).toContain('Move order');
    expect(dialogText).toContain('First');
    expect(dialogText).toContain('Second');
    expect(dialogText).not.toContain('Red');
  });
});
