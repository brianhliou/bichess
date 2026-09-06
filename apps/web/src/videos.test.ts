import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './i18n/locale.js';
import {
  buildHomeVideoCards,
  buildVideoCard,
  buildVideosPage,
  filterVideos,
  freshHomeVideos,
  mountVideos,
  orderHomeVideos,
  sortVideos,
  type VideoFilters,
  videoLanguageForLocale,
  videoThumbUrl,
  videoWatchUrl,
} from './videos.js';
import {
  FIRST_PARTY_VIDEOS,
  VIDEO_LANGUAGES,
  VIDEO_LEVELS,
  VIDEO_TAGS,
  VIDEOS,
  type VideoEntry,
  type VideoLanguage,
  type VideoLevel,
  type VideoTag,
  type VideoVariant,
  videoKey,
} from './videos-data.js';

// jsdom reports an English navigator locale, so a bare mount lands on the
// English-language default. Tests that assert against the whole catalog widen it
// back out through the facet's own All chip rather than reaching into state.
function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  mountVideos(root);
  return root;
}

function mountAllLanguages(): HTMLElement {
  const root = mount();
  chip(root, 'Language', 'all').click();
  return root;
}

function visibleTitles(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.videos-catalog-grid .videos-card-title')].map(
    (el) => el.textContent ?? '',
  );
}

function facetRow(root: HTMLElement, label: string): HTMLElement {
  const row = [...root.querySelectorAll<HTMLElement>('.videos-facet')].find(
    (el) => el.querySelector('.videos-facet-label')?.textContent === label,
  );
  if (!row) throw new Error(`missing facet row: ${label}`);
  return row;
}

function chip(root: HTMLElement, facetLabel: string, value: string): HTMLButtonElement {
  const el = facetRow(root, facetLabel).querySelector<HTMLButtonElement>(
    `.videos-tag-chip[data-value="${value}"]`,
  );
  if (!el) throw new Error(`missing chip ${facetLabel}/${value}`);
  return el;
}

function noFilter(query = ''): VideoFilters {
  return {
    tags: new Set(),
    levels: new Set(),
    variants: new Set(),
    sources: new Set(),
    languages: new Set(),
    query,
  };
}

const MISTBOARD_FIXTURE: VideoEntry = {
  source: 'mistboard',
  slug: 'first-fog-game',
  url: '/video/first-fog-game',
  thumbnailUrl: '/img/videos/first-fog-game.jpg',
  title: 'Your first Fog of War game',
  author: 'Mistboard',
  tags: ['basics'],
  level: 'intro',
  variant: 'fog',
  language: 'en',
  addedAt: '2026-07-21',
};

describe('videos data', () => {
  it('holds verified, well-formed entries', () => {
    expect(VIDEOS.length).toBeGreaterThanOrEqual(12);
    for (const video of VIDEOS) {
      expect(video.title.trim()).not.toBe('');
      expect(video.author.trim()).not.toBe('');
      expect(VIDEO_LANGUAGES).toContain(video.language);
      expect(video.tags.length).toBeGreaterThan(0);
      for (const tag of video.tags) expect(VIDEO_TAGS).toContain(tag);
      expect(VIDEO_LEVELS).toContain(video.level);
      expect(['xiangqi', 'fog']).toContain(video.variant);
      if (video.source === 'youtube') expect(video.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
      else {
        expect(video.slug.trim()).not.toBe('');
        expect(video.url.trim()).not.toBe('');
        expect(video.thumbnailUrl.trim()).not.toBe('');
      }
    }
    // Keys are unique across sources.
    expect(new Set(VIDEOS.map(videoKey)).size).toBe(VIDEOS.length);
  });

  // The length sorts push an unknown duration to the end of the list, so a
  // catalogue that is mostly unknown does not sort badly, it does not sort at
  // all: two of the three sort modes degrade to one bucket. That is what this
  // was before `scripts/videos-audit.mjs` backfilled 36 of the entries from
  // YouTube. Run `npm run videos:audit -- --missing --write` when this fails.
  it("knows every entry's runtime, so the length sorts mean something", () => {
    for (const video of VIDEOS) {
      expect(video.durationMinutes, `${video.title} has no durationMinutes`).toBeGreaterThan(0);
    }
  });

  it('covers every topic tag and difficulty level with at least one entry', () => {
    for (const tag of VIDEO_TAGS) {
      expect(VIDEOS.some((video) => video.tags.includes(tag))).toBe(true);
    }
    for (const level of VIDEO_LEVELS) {
      expect(VIDEOS.some((video) => video.level === level)).toBe(true);
    }
  });

  // Replaces the old blanket `language === 'en'` assertion. That check was the
  // editorial English-first guarantee wearing a schema check's clothes; widening
  // the type would have dropped the guarantee silently, so it is restated here as
  // what it always meant: English is the largest shelf, not merely a present one.
  it('keeps English the deepest shelf and ships no token language', () => {
    const counts = new Map<VideoLanguage, number>();
    for (const video of VIDEOS) counts.set(video.language, (counts.get(video.language) ?? 0) + 1);

    const english = counts.get('en') ?? 0;
    for (const [language, count] of counts) {
      if (language !== 'en') expect(english).toBeGreaterThan(count);
      // A language thin enough to look accidental should not get a facet chip.
      expect(count).toBeGreaterThanOrEqual(4);
      // The locale default lands a beginner somewhere useful in every language.
      expect(
        VIDEOS.some((video) => video.language === language && video.tags.includes('basics')),
      ).toBe(true);
    }
  });

  // A cut has to stay cut. The declined ledger already stopped `videos:mine`
  // re-PROPOSING what was judged, but nothing stopped a session ACCEPTING it
  // back, and nothing put the July banned-player removals in the ledger at all
  // — so 386e9256 removed `aUPyuAv-Hhs` and 73cc8104, the commit that built the
  // miner, restored it. This closes that loop from the other side: the ledger is
  // the list of ids this catalogue may not contain, whatever the reason for the
  // cut, and it fails here rather than shipping.
  it('contains nothing the declined ledger has ruled out', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const ledger = JSON.parse(
      readFileSync(resolve(here, '../../../scripts/data/videos-declined.json'), 'utf8'),
    ) as { declined: Record<string, string> };

    const declined = Object.keys(ledger.declined);
    expect(declined.length).toBeGreaterThan(0);
    for (const id of declined) expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);

    for (const video of VIDEOS) {
      if (video.source !== 'youtube') continue;
      expect(
        declined,
        `${video.id} (${video.title}) is in the declined ledger: ${ledger.declined[video.id]}`,
      ).not.toContain(video.id);
    }
  });
});

describe('videoLanguageForLocale', () => {
  it('maps every supported locale, folding both Chinese scripts onto one spoken language', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(VIDEO_LANGUAGES).toContain(videoLanguageForLocale(locale));
    }
    expect(videoLanguageForLocale('en')).toBe('en');
    expect(videoLanguageForLocale('zh-Hans')).toBe('zh');
    expect(videoLanguageForLocale('zh-Hant')).toBe('zh');
    // Every site locale has a catalog behind it: no locale maps to a language
    // the library does not stock, which is what keeps the default non-empty.
    for (const locale of SUPPORTED_LOCALES) {
      expect(VIDEOS.some((video) => video.language === videoLanguageForLocale(locale))).toBe(true);
    }
  });
});

describe('source-dispatched watch + thumbnail', () => {
  it('derives YouTube URLs from the id', () => {
    const yt = VIDEOS.find((v) => v.source === 'youtube' && v.firstParty !== true);
    if (!yt || yt.source !== 'youtube') throw new Error('expected a youtube video');
    expect(videoWatchUrl(yt)).toBe(`https://www.youtube.com/watch?v=${yt.id}`);
    expect(videoThumbUrl(yt)).toBe(`https://img.youtube.com/vi/${yt.id}/hqdefault.jpg`);
  });

  it('uses the explicit URL + thumbnail for first-party videos', () => {
    expect(videoWatchUrl(MISTBOARD_FIXTURE)).toBe('/video/first-fog-game');
    expect(videoThumbUrl(MISTBOARD_FIXTURE)).toBe('/img/videos/first-fog-game.jpg');
  });
});

describe('video card', () => {
  it('shelves our own episodes above the catalogue, never inside it', () => {
    // The library's job is to turn a visitor into a subscriber, so ours lead and
    // the curated list stays external. A first-party entry appearing in the
    // catalogue would double-render it and shift every count and facet the page
    // derives from that list.
    const root = mountAllLanguages();
    const ours = root.querySelectorAll('.videos-ours-grid .videos-card');
    expect(ours.length).toBe(FIRST_PARTY_VIDEOS.length);
    expect(ours.length).toBeGreaterThan(0);
    expect(root.querySelector('.videos-ours-grid .videos-source-badge')).not.toBeNull();
    for (const video of VIDEOS) expect(video.firstParty).not.toBe(true);
    const subscribe = root.querySelector<HTMLAnchorElement>('.videos-subscribe');
    expect(subscribe?.href).toContain('youtube.com/@Mistboard');
  });

  it('renders a YouTube card as an outbound new-tab link', () => {
    const yt = VIDEOS.find((v) => v.source === 'youtube' && v.firstParty !== true);
    if (!yt || yt.source !== 'youtube') throw new Error('expected a youtube video');
    const card = buildVideoCard(yt, 'en');
    const link = card.querySelector<HTMLAnchorElement>('.videos-card-link');
    expect(link?.getAttribute('href')).toBe(`https://www.youtube.com/watch?v=${yt.id}`);
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(card.querySelector('.videos-source-badge')).toBeNull();
  });

  it('renders a first-party card as an internal link with a Mistboard badge', () => {
    const card = buildVideoCard(MISTBOARD_FIXTURE, 'en');
    const link = card.querySelector<HTMLAnchorElement>('.videos-card-link');
    expect(link?.getAttribute('href')).toBe('/video/first-fog-game');
    expect(link?.target).toBe('');
    expect(link?.getAttribute('rel')).toBeNull();
    expect(card.querySelector('.videos-source-badge')?.textContent).toBe('Mistboard');
    expect(card.querySelector('img')?.getAttribute('src')).toBe('/img/videos/first-fog-game.jpg');
  });

  it('leads the badge row with the difficulty level', () => {
    const yt = VIDEOS.find((v) => v.source === 'youtube' && v.firstParty !== true);
    if (!yt) throw new Error('expected a video');
    const card = buildVideoCard(yt, 'en');
    expect(card.querySelector('.videos-card-tags .videos-card-tag')?.classList).toContain(
      'videos-card-level',
    );
  });
});

describe('videos page', () => {
  it('renders every curated entry in editorial order once language is widened', () => {
    const root = mountAllLanguages();
    const cards = root.querySelectorAll<HTMLAnchorElement>(
      '.videos-catalog-grid .videos-card-link',
    );
    expect(cards.length).toBe(VIDEOS.length);
    expect(root.querySelector('.videos-count')?.textContent).toBe(`${VIDEOS.length} videos`);
    // The page opens on the curated ranking, which is the array as written.
    expect(visibleTitles(root)).toEqual(VIDEOS.map((v) => v.title));
    expect(root.querySelector('.videos-empty')?.hasAttribute('hidden')).toBe(true);
  });

  it('renders a level facet but no dead variant/source facets for homogeneous data', () => {
    const root = mount();
    // All current videos are xiangqi YouTube videos, so those facets stay hidden.
    expect(() => facetRow(root, 'Level')).not.toThrow();
    const labels = [...root.querySelectorAll('.videos-facet-label')].map((el) => el.textContent);
    expect(labels).toContain('Topic');
    expect(labels).toContain('Level');
    // Language discriminates now that the catalog is mixed, and leads the stack
    // because it is the one facet that starts with a selection.
    expect(labels[0]).toBe('Language');
    expect(labels).not.toContain('Game');
    expect(labels).not.toContain('Source');
    // Level facet exposes All + the three ordered levels.
    const levelChips = facetRow(root, 'Level').querySelectorAll('.videos-tag-chip');
    expect(levelChips.length).toBe(VIDEO_LEVELS.length + 1);
  });

  it('narrows by a toggled topic tag and restores on untoggle', () => {
    const root = mountAllLanguages();
    const openings = chip(root, 'Topic', 'openings');
    openings.click();
    const expected = VIDEOS.filter((v) => v.tags.includes('openings'));
    expect(root.querySelectorAll('.videos-catalog-grid .videos-card-link').length).toBe(
      expected.length,
    );
    expect(openings.getAttribute('aria-pressed')).toBe('true');
    openings.click();
    expect(root.querySelectorAll('.videos-catalog-grid .videos-card-link').length).toBe(
      VIDEOS.length,
    );
    expect(openings.getAttribute('aria-pressed')).toBe('false');
  });

  it('intersects across axes (topic AND level)', () => {
    const root = mountAllLanguages();
    chip(root, 'Topic', 'games').click();
    chip(root, 'Level', 'advanced').click();
    const expected = VIDEOS.filter((v) => v.tags.includes('games') && v.level === 'advanced');
    expect(expected.length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.videos-catalog-grid .videos-card-link').length).toBe(
      expected.length,
    );
  });

  it('resets a facet via its All chip', () => {
    const root = mountAllLanguages();
    chip(root, 'Level', 'intro').click();
    expect(root.querySelectorAll('.videos-catalog-grid .videos-card-link').length).toBeLessThan(
      VIDEOS.length,
    );
    chip(root, 'Level', 'all').click();
    expect(root.querySelectorAll('.videos-catalog-grid .videos-card-link').length).toBe(
      VIDEOS.length,
    );
  });

  it('narrows by text across title and author, case-insensitively', () => {
    const root = mountAllLanguages();
    const search = root.querySelector<HTMLInputElement>('.videos-search');
    if (!search) throw new Error('missing search input');
    search.value = 'CHECKMATE';
    search.dispatchEvent(new Event('input'));
    // Author too, which is what this test is named for and did not check: the
    // expectation filtered titles only, and passed until a channel called
    // `iwantcheckmate` joined the catalogue and the page correctly returned one
    // more card than the test predicted.
    const expected = VIDEOS.filter((v) =>
      `${v.title} ${v.author}`.toLowerCase().includes('checkmate'),
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.some((v) => !v.title.toLowerCase().includes('checkmate'))).toBe(true);
    expect(new Set(visibleTitles(root))).toEqual(new Set(expected.map((v) => v.title)));
  });

  it('reorders by the sort control', () => {
    const root = mountAllLanguages();
    const select = root.querySelector<HTMLSelectElement>('.videos-sort-select');
    if (!select) throw new Error('missing sort select');
    select.value = 'shortest';
    select.dispatchEvent(new Event('change'));
    expect(visibleTitles(root)).toEqual(sortVideos(VIDEOS, 'shortest').map((v) => v.title));
  });

  it('shows the empty state when no entry matches', () => {
    const root = mount();
    const search = root.querySelector<HTMLInputElement>('.videos-search');
    if (!search) throw new Error('missing search input');
    search.value = 'zzzz-no-match';
    search.dispatchEvent(new Event('input'));
    expect(root.querySelectorAll('.videos-catalog-grid .videos-card-link').length).toBe(0);
    expect(root.querySelector('.videos-count')?.textContent).toBe('0 videos');
    expect(root.querySelector('.videos-empty')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.videos-empty')?.textContent).toBe('No videos match your filters.');
  });

  it('localizes page chrome for zh-Hant', () => {
    const page = buildVideosPage('zh-Hant');
    expect(page.querySelector('.site-section-heading')?.textContent).toBe('影片庫');
    expect(page.querySelector('.videos-empty')?.textContent).toBe('沒有符合篩選條件的影片。');
    const levelRow = [...page.querySelectorAll<HTMLElement>('.videos-facet')].find(
      (el) => el.querySelector('.videos-facet-label')?.textContent === '難度',
    );
    expect(levelRow).toBeDefined();
    // First option is the default sort, which is the editorial ranking.
    expect(page.querySelector('.videos-sort-select option')?.textContent).toBe('推薦');
  });
});

describe('language facet', () => {
  // Language leads the facet stack, so the first row is it. The ordering itself
  // is asserted in the facet-presence test above.
  function languageRow(root: HTMLElement): HTMLElement {
    const row = root.querySelector<HTMLElement>('.videos-facet');
    if (!row) throw new Error('missing language facet');
    return row;
  }

  function pressedChips(root: HTMLElement): (string | undefined)[] {
    return [...languageRow(root).querySelectorAll<HTMLButtonElement>('.videos-tag-chip')]
      .filter((el) => el.getAttribute('aria-pressed') === 'true')
      .map((el) => el.dataset.value);
  }

  function cardCount(root: HTMLElement): number {
    return root.querySelectorAll('.videos-catalog-grid .videos-card-link').length;
  }

  it("opens on the visitor's language instead of a mixed list", () => {
    const root = mount();
    expect(pressedChips(root)).toEqual(['en']);
    expect(cardCount(root)).toBe(VIDEOS.filter((v) => v.language === 'en').length);
    expect(cardCount(root)).toBeLessThan(VIDEOS.length);
  });

  it('is one click from the whole catalog', () => {
    const root = mount();
    chip(root, 'Language', 'all').click();
    expect(pressedChips(root)).toEqual(['all']);
    expect(cardCount(root)).toBe(VIDEOS.length);
  });

  it('opens a Chinese-locale visitor on Chinese-language video', () => {
    const page = buildVideosPage('zh-Hant');
    expect(pressedChips(page)).toEqual(['zh']);
    const chinese = VIDEOS.filter((v) => v.language === 'zh');
    expect(chinese.length).toBeGreaterThan(0);
    expect(cardCount(page)).toBe(chinese.length);
  });

  // The guard that makes a default-on filter safe: no locale may land on the
  // empty state, which would read as a broken library rather than as a filter.
  it('never opens on an empty grid for any supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const page = buildVideosPage(locale);
      expect(cardCount(page)).toBeGreaterThan(0);
      expect(page.querySelector('.videos-empty')?.hasAttribute('hidden')).toBe(true);
    }
  });

  it('badges each card with its spoken language now that the catalog is mixed', () => {
    const chinese = VIDEOS.find((v) => v.language === 'zh');
    if (!chinese) throw new Error('expected a Chinese entry');
    const card = buildVideoCard(chinese, 'en');
    expect(card.querySelector('.videos-card-language')?.textContent).toBe('Chinese');
  });
});

describe('buildHomeVideoCards', () => {
  it('builds a curated carousel of external video cards that open on YouTube', () => {
    const row = buildHomeVideoCards(8, 'en');
    expect(row).not.toBeNull();
    const cards = [...row!.querySelectorAll<HTMLAnchorElement>('.landing-video-card')];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(8);
    // Reuses the blog carousel scaffold so initLandingCarousel drives it.
    expect(row!.querySelector('.landing-carousel-track')).not.toBeNull();
    expect(row!.querySelector('.landing-carousel-nav-prev')).not.toBeNull();
    for (const card of cards) {
      expect(card.dataset.cardKind).toBe('video');
      expect(card.href).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
      expect(card.target).toBe('_blank');
      expect(card.rel).toBe('noopener noreferrer');
      // Every card carries a play affordance + a title.
      expect(card.querySelector('.landing-video-card-play')).not.toBeNull();
      expect(card.querySelector('.landing-video-card-title')?.textContent).toBeTruthy();
    }
  });

  it('honors the limit', () => {
    const row = buildHomeVideoCards(3, 'en');
    expect(row!.querySelectorAll('.landing-video-card').length).toBe(3);
  });

  it('follows the locale into a language-matched arc', () => {
    const row = buildHomeVideoCards(8, 'zh-Hans');
    const byId = new Map(
      VIDEOS.flatMap((video) => (video.source === 'youtube' ? [[video.id, video] as const] : [])),
    );
    const languages = [...row!.querySelectorAll<HTMLAnchorElement>('.landing-video-card')].map(
      (card) => byId.get(new URL(card.href).searchParams.get('v') ?? '')?.language,
    );
    expect(languages.length).toBeGreaterThanOrEqual(4);
    expect(new Set(languages)).toEqual(new Set<VideoLanguage>(['zh']));
  });

  // The strip drops an unresolved key rather than breaking, which is right at
  // runtime and invisible in a test: every assertion below this one passes just
  // as well with a half-empty row. So assert the arcs are whole. A cut entry, a
  // typo, or a renamed id fails here instead of quietly shortening the homepage.
  it('fills every arc, with no curated key silently dropped', () => {
    const known = new Set([...FIRST_PARTY_VIDEOS, ...VIDEOS].map((video) => videoKey(video)));
    for (const locale of ['en', 'zh-Hans', 'zh-Hant'] as const) {
      const row = buildHomeVideoCards(8, locale);
      expect(row, `no strip for ${locale}`).not.toBeNull();
      const cards = row!.querySelectorAll('.landing-video-card');
      expect(cards.length, `${locale} arc is short`).toBe(8);
    }
    // And the arcs draw only on entries that exist, in either list.
    const row = buildHomeVideoCards(8, 'en');
    for (const card of [...row!.querySelectorAll<HTMLAnchorElement>('.landing-video-card')]) {
      expect(known.has(`yt:${new URL(card.href).searchParams.get('v')}`)).toBe(true);
    }
  });

  // Directly, so the invariant still holds the day there is more than one of
  // ours: every first-party entry moves to the front, in curated order, no
  // matter where it sat in the arc.
  it('pins every promoted video ahead of the rest, in curated order', () => {
    const ours = [...FIRST_PARTY_VIDEOS];
    const arc = [VIDEOS[0], ...ours, VIDEOS[1], VIDEOS[2]];
    const ordered = orderHomeVideos(arc);
    expect(ordered.slice(0, ours.length)).toEqual(ours);
    expect(new Set(ordered)).toEqual(new Set(arc));
    expect(ordered.length).toBe(arc.length);
  });

  // The row shuffles everything that is not ours on every render, so these two
  // assertions carry the whole contract: ours never loses the front slot, and
  // the rest actually move. Run over many renders because a single render of a
  // shuffled list can legally come out in curated order.
  it('keeps ours pinned first across renders while the rest rotate', () => {
    const tails = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const hrefs = [
        ...buildHomeVideoCards(8, 'en')!.querySelectorAll<HTMLAnchorElement>('.landing-video-card'),
      ].map((card) => new URL(card.href).searchParams.get('v') ?? '');
      expect(hrefs[0]).toBe('aWxafeWsncQ');
      tails.add(hrefs.slice(1).join(','));
    }
    expect(tails.size).toBeGreaterThan(1);
  });

  // Shuffling must not drop, duplicate, or reorder-away an entry: the row is
  // still exactly the curated arc, just in a different order.
  it('renders the whole arc under any shuffle', () => {
    const ids = (row: HTMLElement) =>
      [...row.querySelectorAll<HTMLAnchorElement>('.landing-video-card')].map(
        (card) => new URL(card.href).searchParams.get('v') ?? '',
      );
    const first = new Set(ids(buildHomeVideoCards(8, 'en')!));
    for (let i = 0; i < 20; i += 1) {
      const next = ids(buildHomeVideoCards(8, 'en')!);
      expect(next.length).toBe(8);
      expect(new Set(next)).toEqual(first);
    }
  });

  it('only surfaces curated keys that resolve against the catalog', () => {
    const row = buildHomeVideoCards(8, 'en');
    // Ours are curated into the strip too, and they live outside VIDEOS.
    const known = new Set([...FIRST_PARTY_VIDEOS, ...VIDEOS].map((video) => videoKey(video)));
    const hrefs = [...row!.querySelectorAll<HTMLAnchorElement>('.landing-video-card')].map(
      (card) => card.href,
    );
    // Each rendered card's watch URL corresponds to a real entry, and ours
    // leads the English arc.
    expect(hrefs[0]).toContain('aWxafeWsncQ');
    for (const href of hrefs) {
      const id = new URL(href).searchParams.get('v');
      expect(known.has(`yt:${id}`)).toBe(true);
    }
  });

  // Mainland China: YouTube AND img.youtube.com are blocked, so the row does not
  // degrade to dead links, it renders as ten failed images. #378.
  describe('where YouTube is blocked', () => {
    const setCountry = (code: string | null) => {
      document.cookie = 'mb_cc=; Max-Age=0; Path=/';
      if (code) document.cookie = `mb_cc=${code}; Path=/`;
    };

    afterEach(() => setCountry(null));

    it('omits the row entirely for a CN viewer', () => {
      setCountry('CN');
      expect(buildHomeVideoCards(undefined, 'zh-Hans')).toBeNull();
      expect(buildHomeVideoCards(undefined, 'en')).toBeNull();
    });

    // The load-bearing half. Gating on the zh locale instead of on the country
    // would hide the Chinese shelf from Taiwan, Hong Kong, Singapore and
    // Malaysia, who reach YouTube fine and were ~59 visitors in the month this
    // shipped -- the exact readers the Chinese block was added for.
    it('keeps the row for every other Chinese-reading region', () => {
      for (const country of ['TW', 'HK', 'MO', 'SG', 'MY']) {
        setCountry(country);
        const row = buildHomeVideoCards(undefined, 'zh-Hans');
        expect(row, `${country} lost the video row`).not.toBeNull();
        expect(row?.querySelectorAll('.landing-video-card').length).toBeGreaterThan(8);
      }
    });

    it('shows the row when the country is unknown', () => {
      // No cookie is local dev, a direct hit that skipped Cloudflare, or an
      // unrecognised country. Hiding is only ever a known-blocked case.
      setCountry(null);
      expect(buildHomeVideoCards(undefined, 'en')).not.toBeNull();
    });
  });

  // The whole point of the fresh slots: the homepage used to be decoupled from
  // the catalogue, so `videos:mine` could add twenty entries and this row stayed
  // byte-identical. These assertions are what make that wire load-bearing --
  // delete the top-up and they go red, which is the only way a later session
  // learns the row is supposed to move.
  describe('fresh slots', () => {
    const idsOf = (row: HTMLElement) =>
      [...row.querySelectorAll<HTMLAnchorElement>('.landing-video-card')].map(
        (card) => new URL(card.href).searchParams.get('v') ?? '',
      );

    it('tops the arc up with catalogue entries at the default limit', () => {
      for (const locale of ['en', 'zh-Hans'] as const) {
        const ids = idsOf(buildHomeVideoCards(undefined, locale)!);
        // Arc is 8; the row is longer, so the extra slots came from elsewhere.
        expect(ids.length, `${locale} row did not grow past the arc`).toBeGreaterThan(8);
        expect(new Set(ids).size, `${locale} row repeats a video`).toBe(ids.length);
      }
    });

    it('never displaces a curated arc entry to make room', () => {
      const curated = new Set(idsOf(buildHomeVideoCards(8, 'en')!));
      const full = new Set(idsOf(buildHomeVideoCards(undefined, 'en')!));
      for (const id of curated) expect(full.has(id), `arc entry ${id} was dropped`).toBe(true);
    });

    it('trims freshness before the arc when the limit is tight', () => {
      // Eight is exactly the arc, so there is no room left to top up.
      expect(idsOf(buildHomeVideoCards(8, 'en')!).length).toBe(8);
      expect(idsOf(buildHomeVideoCards(3, 'en')!).length).toBe(3);
    });

    it('draws fresh entries in the language the row actually rendered', () => {
      const byId = new Map(
        VIDEOS.flatMap((video) => (video.source === 'youtube' ? [[video.id, video] as const] : [])),
      );
      for (const [locale, language] of [
        ['en', 'en'],
        ['zh-Hans', 'zh'],
        ['zh-Hant', 'zh'],
      ] as const) {
        for (const id of idsOf(buildHomeVideoCards(undefined, locale)!)) {
          const entry = byId.get(id);
          // Ours are pinned by orderHomeVideos and live outside VIDEOS.
          if (entry) expect(entry.language, `${locale} row shows ${id}`).toBe(language);
        }
      }
    });

    it('draws only from the newest end of the catalogue, never the whole shelf', () => {
      // The pool cap is the quality floor. Without it the rotation eventually
      // seats a 94-view clip or a 90-minute lecture beside the rules primer,
      // which is the thing the curated arc exists to prevent. So: whatever the
      // week, every rotated pick is one of the ten most recent entries.
      const eligible = [...VIDEOS]
        .filter((video) => video.language === 'en')
        .sort((a, b) =>
          a.addedAt === b.addedAt
            ? VIDEOS.indexOf(a) - VIDEOS.indexOf(b)
            : a.addedAt < b.addedAt
              ? 1
              : -1,
        )
        .slice(0, 10)
        .map(videoKey);

      for (let week = 0; week < 30; week += 1) {
        const at = new Date(Date.UTC(2026, 8, 6) + week * 7 * 24 * 60 * 60 * 1000);
        for (const pick of freshHomeVideos('en', new Set(), 2, at)) {
          expect(eligible, `week ${week} reached outside the pool`).toContain(videoKey(pick));
        }
      }
    });

    // The whole point of the rotation: the row has to change without anyone
    // editing a file, and it has to change to something *else* rather than
    // reshuffling the same pair.
    it('advances every week and covers the pool over a cycle', () => {
      const weekOf = (week: number) =>
        freshHomeVideos(
          'en',
          new Set(),
          2,
          new Date(Date.UTC(2026, 8, 6) + week * 7 * 24 * 60 * 60 * 1000),
        ).map(videoKey);

      // Consecutive weeks share nothing.
      for (let week = 0; week < 10; week += 1) {
        const now = weekOf(week);
        const next = weekOf(week + 1);
        expect(now.length).toBe(2);
        expect(new Set(now).size, `week ${week} repeats a video within one row`).toBe(2);
        for (const key of next)
          expect(now, `week ${week + 1} reuses week ${week}`).not.toContain(key);
      }

      // And a full cycle reaches every entry in the pool, so nothing sits in the
      // catalogue's top ten and never gets a slot.
      const seen = new Set<string>();
      for (let week = 0; week < 5; week += 1) for (const key of weekOf(week)) seen.add(key);
      expect(seen.size).toBe(10);
    });

    // Anchoring the cycle to the newest entry is what preserves the property the
    // rotating slots were built for: ingest, and the front door moves. Without
    // it the phase is epoch-derived and a batch added today can wait most of a
    // cycle for a slot, which is the manual-edit problem wearing a timer.
    it('seats the best of a new batch in its first week', () => {
      for (const language of ['en', 'zh'] as const) {
        const newest = [...VIDEOS]
          .filter((video) => video.language === language)
          .map((video) => video.addedAt)
          .sort()
          .at(-1);
        expect(newest).toBeDefined();

        const dayOfBatch = new Date(`${newest}T12:00:00Z`);
        const picks = freshHomeVideos(language, new Set(), 2, dayOfBatch);
        for (const pick of picks) {
          expect(pick.addedAt, `${language} did not lead with the new batch`).toBe(newest);
        }
      }
    });

    it('is stable within a week, so every visitor sees the same row', () => {
      const monday = new Date(Date.UTC(2026, 8, 7, 0, 30));
      const friday = new Date(Date.UTC(2026, 8, 10, 23, 45));
      const a = freshHomeVideos('zh', new Set(), 2, monday).map(videoKey);
      const b = freshHomeVideos('zh', new Set(), 2, monday).map(videoKey);
      expect(a).toEqual(b);
      // Same rotation period, different moment inside it.
      const sameWeek =
        Math.floor(monday.getTime() / 6.048e8) === Math.floor(friday.getTime() / 6.048e8);
      if (sameWeek) expect(freshHomeVideos('zh', new Set(), 2, friday).map(videoKey)).toEqual(a);
    });

    it('honours the exclusion set so the arc is never shown twice', () => {
      const at = new Date(Date.UTC(2026, 8, 6));
      const first = freshHomeVideos('en', new Set(), 1, at)[0];
      expect(first).toBeDefined();
      const next = freshHomeVideos('en', new Set([videoKey(first!)]), 1, at)[0];
      expect(next).toBeDefined();
      expect(videoKey(next!)).not.toBe(videoKey(first!));
    });
  });
});

describe('sortVideos', () => {
  it('leaves the editorial order alone under `featured`', () => {
    expect(sortVideos(VIDEOS, 'featured')).toEqual([...VIDEOS]);
    // A copy, not the array itself: callers sort and slice the result freely.
    expect(sortVideos(VIDEOS, 'featured')).not.toBe(VIDEOS);
  });

  // The point of ranking by array order rather than by a score is that a
  // filtered view stays ranked. Sorting a subset must not reshuffle it into
  // whatever order the filter happened to produce.
  it('keeps a filtered subset in catalogue order', () => {
    const english = VIDEOS.filter((video) => video.language === 'en');
    expect(sortVideos(english, 'featured')).toEqual(english);
    expect(english.length).toBeGreaterThan(1);
  });

  // Guards a specific regression: if someone re-sorts videos-data.ts by
  // addedAt, or reverts the default sort, `featured` silently becomes `newest`
  // and the curation is gone with no test failing. These differ today, and the
  // catalogue is ranked, so they should keep differing.
  it('is a real ranking, not the curation date in disguise', () => {
    expect(sortVideos(VIDEOS, 'featured')).not.toEqual(sortVideos(VIDEOS, 'newest'));
  });

  it('orders by length in both directions', () => {
    const longest = sortVideos(VIDEOS, 'longest').map((v) => v.durationMinutes ?? 0);
    const shortest = sortVideos(VIDEOS, 'shortest').map((v) => v.durationMinutes ?? 0);
    expect(longest).toEqual([...longest].sort((a, b) => b - a));
    expect(shortest).toEqual([...shortest].sort((a, b) => a - b));
  });
});

describe('filterVideos', () => {
  it('treats selected topics as OR and trims the query', () => {
    const filters: VideoFilters = {
      ...noFilter('  '),
      tags: new Set<VideoTag>(['openings', 'endgames']),
    };
    const matches = filterVideos(VIDEOS, filters);
    const expected = VIDEOS.filter((v) =>
      v.tags.some((tag) => tag === 'openings' || tag === 'endgames'),
    );
    expect(matches).toEqual(expected);
  });

  it('intersects tag, level, variant, source, and language selections', () => {
    const pool: readonly VideoEntry[] = [...VIDEOS, MISTBOARD_FIXTURE];
    const filters: VideoFilters = {
      tags: new Set<VideoTag>(['basics']),
      levels: new Set<VideoLevel>(['intro']),
      variants: new Set<VideoVariant>(['fog']),
      sources: new Set(['mistboard']),
      languages: new Set<VideoLanguage>(['en']),
      query: '',
    };
    expect(filterVideos(pool, filters)).toEqual([MISTBOARD_FIXTURE]);
  });

  it('treats selected languages as OR', () => {
    // Selecting every language is the same list as selecting none.
    const all = filterVideos(VIDEOS, {
      ...noFilter(),
      languages: new Set<VideoLanguage>(VIDEO_LANGUAGES),
    });
    expect(all).toEqual(VIDEOS);

    const chinese = filterVideos(VIDEOS, {
      ...noFilter(),
      languages: new Set<VideoLanguage>(['zh']),
    });
    expect(chinese.length).toBeGreaterThan(0);
    expect(chinese).toEqual(VIDEOS.filter((v) => v.language === 'zh'));
  });
});
