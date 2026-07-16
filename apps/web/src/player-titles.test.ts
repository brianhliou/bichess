import { describe, expect, it } from 'vitest';
import { buildTitleBadge, PLAYER_TITLES, titleAbbr, titleFullName } from './player-titles.js';
import { buildProfileIdentity } from './profile.js';
import { buildUserCard, type UserCardProfile } from './user-card.js';

describe('player titles', () => {
  it('builds a badge with the abbreviation and the localized full name tooltip', () => {
    const badge = buildTitleBadge('xgm');
    expect(badge?.textContent).toBe('XGM');
    expect(badge?.title).toBe('Xiangqi Grandmaster');
    expect(badge?.className).toBe('title-badge');

    const zh = buildTitleBadge('xgm', 'zh-Hans');
    expect(zh?.title).toBe('象棋特级大师');
  });

  it('renders no badge for unknown or missing titles (fail-closed)', () => {
    expect(buildTitleBadge(null)).toBeNull();
    expect(buildTitleBadge(undefined)).toBeNull();
    expect(buildTitleBadge('nm')).toBeNull();
    expect(buildTitleBadge('XGM')).toBeNull();
  });

  it('has a localized full name for every title in the vocabulary', () => {
    for (const title of PLAYER_TITLES) {
      expect(titleAbbr(title)).toBe(title.toUpperCase());
      for (const locale of ['en', 'zh-Hans', 'zh-Hant'] as const) {
        expect(titleFullName(title, locale).trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('title badge on the user card', () => {
  it('shows the gold abbreviation before a titled player name and skips untitled ones', () => {
    const titled = buildUserCard(cardProfile({ title: 'xgm' }));
    expect(titled.querySelector('.user-card-header .title-badge')?.textContent).toBe('XGM');

    const untitled = buildUserCard(cardProfile({ title: null }));
    expect(untitled.querySelector('.title-badge')).toBeNull();

    const absent = buildUserCard(cardProfile({}));
    expect(absent.querySelector('.title-badge')).toBeNull();
  });
});

describe('title badge on the profile header', () => {
  it('renders the h1 abbreviation and the meta full name for titled profiles only', () => {
    const titled = buildProfileIdentity(headerProfile({ title: 'xim' }), 'en');
    expect(titled.querySelector('h1 .title-badge')?.textContent).toBe('XIM');
    expect(titled.querySelector('.profile-title-full')?.textContent).toBe(
      'Xiangqi International Master',
    );
    // The presence dot still lives where hydrateProfilePresence looks for it.
    expect(titled.querySelector('h1 .profile-presence')).not.toBeNull();

    const untitled = buildProfileIdentity(headerProfile({ title: null }), 'en');
    expect(untitled.querySelector('.title-badge')).toBeNull();
    expect(untitled.querySelector('.profile-title-full')).toBeNull();
  });
});

function cardProfile(user: { title?: string | null }): UserCardProfile {
  return {
    user: {
      handle: 'weichen',
      displayName: 'Wei Chen',
      accountRole: 'player',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...user,
    },
    ratings: [],
    gamesTotal: 0,
  };
}

function headerProfile(user: {
  title?: string | null;
}): Parameters<typeof buildProfileIdentity>[0] {
  return {
    user: {
      handle: 'weichen',
      displayName: 'Wei Chen',
      profileVisibility: 'public',
      accountRole: 'player',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...user,
    },
    ratings: [],
    games: [],
    gamesTotal: 0,
  };
}
