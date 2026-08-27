import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CoachDetail, type CoachListing, mountCoach } from './coach.js';

const listedCoach: CoachListing = {
  handle: 'xim-coach',
  displayName: 'XIM Coach',
  title: 'xim',
  headline: 'XIM teaching English-language xiangqi',
  languages: 'English, Mandarin',
  rate: '$25 / hour',
  acceptingStudents: true,
};

const pausedCoach: CoachListing = {
  handle: 'gm-paused',
  displayName: 'GM Paused',
  title: 'gm',
  headline: 'Chess endgames, deep dives',
  languages: '',
  rate: '',
  acceptingStudents: false,
};

const detailCoach: CoachDetail = {
  ...listedCoach,
  about: 'Ten years of coaching.\n\nClub players welcome.',
  contact: 'coach@example.com',
};

describe('coach directory page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('renders one card per coach with the title badge and card fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/coaches') return jsonResponse({ coaches: [listedCoach, pausedCoach] });
        if (url === '/api/coaches/me') return jsonResponse({ error: 'not_signed_in' }, 401);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const root = mountRoot();
    await mountCoach(root, null);
    await flushDom();

    const cards = root.querySelectorAll<HTMLAnchorElement>('a.coach-card');
    expect(cards.length).toBe(2);
    expect(cards[0]?.getAttribute('href')).toBe('/coach/xim-coach');
    expect(cards[0]?.querySelector('.title-badge')?.textContent).toBe('XIM');
    expect(cards[0]?.textContent).toContain('XIM Coach');
    expect(cards[0]?.textContent).toContain('XIM teaching English-language xiangqi');
    expect(cards[0]?.textContent).toContain('Languages: English, Mandarin');
    expect(cards[0]?.textContent).toContain('Rate: $25 / hour');
    expect(cards[0]?.textContent).toContain('Accepting students');
    expect(cards[1]?.querySelector('.title-badge')?.textContent).toBe('GM');
    expect(cards[1]?.textContent).toContain('Not accepting students');
    // Anonymous visitor: funneled to title verification.
    const cta = root.querySelector<HTMLAnchorElement>('.coach-become a');
    expect(cta?.getAttribute('href')).toBe('/verify-title');
    expect(cta?.textContent).toBe('Are you a titled player? Verify your title to coach');
  });

  it('shows the empty state and no cards when nobody is listed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/coaches') return jsonResponse({ coaches: [] });
        if (url === '/api/coaches/me') return jsonResponse({ error: 'not_signed_in' }, 401);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const root = mountRoot();
    await mountCoach(root, null);
    await flushDom();

    expect(root.textContent).toContain('No coaches are listed yet.');
    expect(root.querySelector('a.coach-card')).toBeNull();
  });

  it('offers Become a coach to a signed-in titled user without a profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/coaches') return jsonResponse({ coaches: [] });
        if (url === '/api/coaches/me') {
          return jsonResponse({ titled: true, handle: 'me', profile: null });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const root = mountRoot();
    await mountCoach(root, null);
    await flushDom();

    const link = root.querySelector<HTMLAnchorElement>('.coach-become a');
    expect(link?.getAttribute('href')).toBe('/coach/edit');
    expect(link?.textContent).toBe('Become a coach');
  });

  it('offers Edit your coach profile when the titled user already has one, and the verify-title funnel to untitled users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/coaches') return jsonResponse({ coaches: [] });
        if (url === '/api/coaches/me') {
          return jsonResponse({ titled: true, handle: 'me', profile: { published: false } });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const withProfile = mountRoot();
    await mountCoach(withProfile, null);
    await flushDom();
    expect(withProfile.querySelector('.coach-become a')?.textContent).toBe(
      'Edit your coach profile',
    );

    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/coaches') return jsonResponse({ coaches: [] });
        if (url === '/api/coaches/me') {
          return jsonResponse({ titled: false, handle: 'student', profile: null });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const untitled = mountRoot();
    await mountCoach(untitled, null);
    await flushDom();
    const untitledCta = untitled.querySelector<HTMLAnchorElement>('.coach-become a');
    expect(untitledCta?.getAttribute('href')).toBe('/verify-title');
    expect(untitledCta?.textContent).toBe('Are you a titled player? Verify your title to coach');
    // An unconvinced visitor also gets the case for verifying, beside the CTA.
    const pitch = untitled.querySelector<HTMLAnchorElement>('.coach-cta-pitch');
    expect(pitch?.getAttribute('href')).toBe('/blog/titled-players');
    expect(pitch?.textContent).toBe('What titled players get on Mistboard');
    // A titled player is already sold; the pitch would be noise.
    expect(withProfile.querySelector('.coach-cta-pitch')).toBeNull();
  });
});

describe('coach detail page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('renders the full detail view with about, facts, and the profile link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/coaches/xim-coach') return jsonResponse({ coach: detailCoach });
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const root = mountRoot();
    await mountCoach(root, 'xim-coach');

    expect(root.querySelector('.title-badge')?.textContent).toBe('XIM');
    expect(root.textContent).toContain('XIM Coach');
    expect(root.textContent).toContain('XIM teaching English-language xiangqi');
    expect(root.textContent).toContain('Ten years of coaching.');
    expect(root.textContent).toContain('Club players welcome.');
    expect(root.textContent).toContain('coach@example.com');
    expect(root.textContent).toContain('Accepting students');

    const profileLink = [...root.querySelectorAll<HTMLAnchorElement>('a')].find(
      (a) => a.getAttribute('href') === '/@/xim-coach',
    );
    expect(profileLink?.textContent).toBe('View player profile');
    const backLink = [...root.querySelectorAll<HTMLAnchorElement>('a')].find(
      (a) => a.getAttribute('href') === '/coach',
    );
    expect(backLink).toBeDefined();
  });

  it('autolinks a booking URL in contact and leaves the rest as text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/coaches/xim-coach')
          return jsonResponse({
            coach: {
              ...detailCoach,
              contact: 'Email coach@example.com or book at https://cal.com/xim-coach.',
            },
          });
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const root = mountRoot();
    await mountCoach(root, 'xim-coach');

    const link = root.querySelector<HTMLAnchorElement>('.coach-detail-contact-link');
    expect(link?.getAttribute('href')).toBe('https://cal.com/xim-coach');
    // The trailing period is prose, not part of the URL.
    expect(link?.textContent).toBe('https://cal.com/xim-coach');
    expect(link?.rel).toBe('nofollow noopener noreferrer');
    expect(root.textContent).toContain('Email coach@example.com or book at');
    expect(root.textContent).toContain('https://cal.com/xim-coach.');
  });

  it('never builds an href from a non-http scheme', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/coaches/xim-coach')
          return jsonResponse({
            coach: { ...detailCoach, contact: 'javascript:alert(1) data:text/html,x' },
          });
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const root = mountRoot();
    await mountCoach(root, 'xim-coach');

    expect(root.querySelector('.coach-detail-contact-link')).toBeNull();
    expect(root.textContent).toContain('javascript:alert(1) data:text/html,x');
  });

  it('renders the not-found notice for a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'coach_not_found' }, 404)),
    );
    const root = mountRoot();
    await mountCoach(root, 'nobody');

    expect(root.textContent).toContain('Coach not found');
    expect(root.textContent).toContain('This coach page is not available.');
    expect(root.querySelector('.coach-detail-facts')).toBeNull();
  });
});

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

async function flushDom(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
