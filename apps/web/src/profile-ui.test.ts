import { describe, expect, it } from 'vitest';
import type { FeaturedGame } from './game-display.js';
import { buildProfileGameRow } from './profile-ui.js';
import { webVariantTenants } from './variant-tenant/registry.js';

function game(overrides: Partial<FeaturedGame> = {}): FeaturedGame {
  return {
    roomId: 'room_1',
    variant: 'dark-chess',
    mode: 'pvp',
    rated: false,
    result: 'white-wins',
    termination: 'resignation',
    plyCount: 12,
    whiteName: null,
    blackName: null,
    corpusId: null,
    endedAt: '2026-06-07T12:00:00.000Z',
    participants: [
      {
        color: 'white',
        displayName: 'Alice',
        subjectType: 'user',
        subjectId: 'u_alice',
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: 'Bob',
        subjectType: 'user',
        subjectId: 'u_bob',
        visibility: 'public',
      },
    ],
    playerColor: 'white',
    ...overrides,
  };
}

describe('profile game rows', () => {
  it('renders Dark Mini Xiangqi rows with red/black outcome and review route', () => {
    const row = buildProfileGameRow(
      game({
        roomId: 'dmxq_profile',
        variant: 'dark-mini-xiangqi',
        result: 'red-wins',
        participants: [
          {
            color: 'red',
            displayName: 'Red Player',
            subjectType: 'user',
            subjectId: 'red-user',
            visibility: 'private',
          },
          {
            color: 'black',
            displayName: 'Misty DMX 1.0',
            subjectType: 'engine-version',
            subjectId: 'python-dmx-v1.0',
            visibility: 'private',
          },
        ],
        playerColor: 'red',
      }),
    );

    const link = row.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/dark-mini-xiangqi/game/dmxq_profile');
    expect(row.textContent).toContain('Win');
    expect(row.textContent).toContain('vs Misty DMX 1.0');
    expect(row.textContent).toContain('Dark Mini Xiangqi');
    expect(row.textContent).toContain('Red');
  });

  it('renders Crossroads Chess rows with white/red outcome and review route', () => {
    const row = buildProfileGameRow(
      game({
        roomId: 'dchess_profile',
        variant: 'crossroads-chess',
        result: 'red-wins',
        participants: [
          {
            color: 'white',
            displayName: 'White Player',
            subjectType: 'user',
            subjectId: 'white-user',
            visibility: 'private',
          },
          {
            color: 'red',
            displayName: 'Red Player',
            subjectType: 'user',
            subjectId: 'red-user',
            visibility: 'private',
          },
        ],
        playerColor: 'red',
      }),
    );

    const link = row.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/crossroads-chess/game/dchess_profile');
    expect(row.textContent).toContain('Win');
    expect(row.textContent).toContain('vs White Player');
    expect(row.textContent).toContain('Crossroads Chess');
    expect(row.textContent).toContain('Red');
  });

  it('renders a banqi row vs the engine (not "vs White") and routes to the banqi surface', () => {
    // Regression: banqi names sides red/black, and a black player's opponent is
    // red. The opponent-colour resolver used to fall through to 'white', which
    // has no participant, so the row showed the literal seat "vs White" instead
    // of the engine. The href also fell through to /game/:id, whose chess-family
    // replay reducer 403s on banqi events.
    const row = buildProfileGameRow(
      game({
        roomId: 'bq_profile',
        variant: 'banqi',
        result: 'black-wins',
        participants: [
          {
            color: 'red',
            displayName: 'MistyBanqi - Strongest',
            subjectType: 'engine-version',
            subjectId: 'python-banqi-v1.0',
            visibility: 'private',
          },
          {
            color: 'black',
            displayName: 'dev-testing',
            subjectType: 'user',
            subjectId: 'u_dev',
            visibility: 'private',
          },
        ],
        playerColor: 'black',
      }),
    );

    const link = row.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/banqi/game/bq_profile');
    expect(row.textContent).toContain('Win');
    expect(row.textContent).toContain('vs MistyBanqi - Strongest');
    expect(row.textContent).not.toContain('vs White');
    expect(row.textContent).toContain('Flip Xiangqi');
    expect(row.textContent).toContain('Black');
  });

  it('renders a Flip Jungle row vs the engine (not "vs White") and routes to the flip-jungle surface', () => {
    // Regression (prod, 2026-07-03): Flip Jungle names sides red/black, so a
    // black player's opponent is red. profileGameHref/opponentColor were
    // hand-maintained switches that never listed jungle-flip, so the row showed
    // the literal seat "vs White" and the href fell through to /game/:id, whose
    // chess-family replay reducer 403s on jungle-flip events. Both now resolve
    // through the variant registry + spec family.
    const row = buildProfileGameRow(
      game({
        roomId: 'jgf_profile',
        variant: 'jungle-flip',
        result: 'red-wins',
        participants: [
          {
            color: 'red',
            displayName: 'MistyJungleFlip',
            subjectType: 'engine-version',
            subjectId: 'container-jungle-flip-v1',
            visibility: 'private',
          },
          {
            color: 'black',
            displayName: 'dev-testing',
            subjectType: 'user',
            subjectId: 'u_dev',
            visibility: 'private',
          },
        ],
        playerColor: 'black',
      }),
    );

    const link = row.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/jungle-flip/game/jgf_profile');
    expect(row.textContent).toContain('vs MistyJungleFlip');
    expect(row.textContent).not.toContain('vs White');
    expect(row.textContent).toContain('Flip Jungle');
    expect(row.textContent).toContain('Black');
  });

  it('routes jieqi profile rows to the jieqi surface', () => {
    const row = buildProfileGameRow(
      game({
        roomId: 'jq_profile',
        variant: 'jieqi',
        result: 'red-wins',
        participants: [
          {
            color: 'red',
            displayName: 'Red Player',
            subjectType: 'user',
            subjectId: 'red-user',
            visibility: 'private',
          },
          {
            color: 'black',
            displayName: 'PikaJieQi',
            subjectType: 'engine-version',
            subjectId: 'python-jieqi-v1.0',
            visibility: 'private',
          },
        ],
        playerColor: 'red',
      }),
    );

    expect(row.querySelector('a')?.getAttribute('href')).toBe('/jieqi/game/jq_profile');
    expect(row.textContent).toContain('vs PikaJieQi');
  });

  it('keeps chess profile rows on the chess game route', () => {
    const row = buildProfileGameRow(game());
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/game/room_1');
    expect(row.textContent).toContain('Fog Chess');
    expect(row.textContent).toContain('White');
  });

  // Registry-driven conformance: every variant tenant that owns a postgame
  // surface must route its profile rows there, never to the dark-chess
  // /game/:id (whose chess-family replay reducer 403s on a non-chess event
  // log). This is the lock that a hand-maintained switch lacked, so a newly
  // launched variant can't silently regress to "vs White" / a 403 postgame.
  const tenantsWithPostgame = webVariantTenants().filter((tenant) => tenant.gameRouteBase);
  it.each(
    tenantsWithPostgame.map((tenant) => [tenant.gameSpecId, tenant] as const),
  )('routes %s profile rows to its own postgame surface', (_specId, tenant) => {
    const roomId = `${tenant.roomIdPrefix}conformance`;
    const row = buildProfileGameRow(game({ roomId, variant: tenant.gameSpecId }));
    expect(row.querySelector('a')?.getAttribute('href')).toBe(`${tenant.gameRouteBase}/${roomId}`);
  });
});
