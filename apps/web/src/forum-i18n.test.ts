import { afterEach, describe, expect, it, vi } from 'vitest';

// The forum shipped 100% catalog coverage and an English page: the chrome came
// from 142 translated forum.* keys, and the four category names and descriptions
// came out of the database with no overlay at all. So what is asserted here is
// the two halves TOGETHER on a rendered page -- a catalog diff cannot see the
// half that never enters the catalog.

const categories = [
  {
    id: 'general-discussion',
    slug: 'general-discussion',
    name: 'General Games Discussion',
    description: 'The place to discuss general games topics.',
    i18n: {
      'zh-Hans': { name: '综合棋类讨论', description: '讨论各类棋牌话题的地方。' },
      'zh-Hant': { name: '綜合棋類討論', description: '討論各類棋牌話題的地方。' },
    },
    sortOrder: 10,
    topicWritePolicy: 'account' as const,
    topicCount: 1,
    postCount: 2,
    latestPost: null,
  },
  {
    // No overlay: the degrade has to be the English name, not a blank row.
    id: 'game-analysis',
    slug: 'game-analysis',
    name: 'Game analysis',
    description: 'Show your game and analyse it with the community.',
    sortOrder: 30,
    topicWritePolicy: 'account' as const,
    topicCount: 0,
    postCount: 0,
    latestPost: null,
  },
];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function stubForum(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/forum/categories')) return json({ categories });
    if (url.startsWith('/api/forum/topics')) return json({ topics: [] });
    if (url.startsWith('/api/auth/me')) return json({ user: null });
    throw new Error(`unexpected fetch ${url}`);
  });
}

// The locale is read from window.localStorage (see i18n/locale.ts resolveLocale).
// happy-dom does not provide one here, so the test supplies the smallest thing
// that behaves like it -- which is also the only way to exercise the stored
// preference, the sole route by which a zh reader reaches /forum.
const store = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
});

function setLocale(locale: string | null): void {
  if (locale) window.localStorage.setItem('mistboard.locale', locale);
  else window.localStorage.removeItem('mistboard.locale');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.history.pushState(null, '', '/');
  setLocale(null);
});

describe('forum category text', () => {
  it('renders the English name and description with no locale chosen', async () => {
    stubForum();
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    expect(root.textContent).toContain('General Games Discussion');
    expect(root.textContent).toContain('The place to discuss general games topics.');
  });

  it('renders the overlay when the reader has chosen Chinese', async () => {
    // /forum takes no /zh-hans path prefix, so the stored preference is the only
    // way a zh reader ever reaches this page. That is the case to cover.
    setLocale('zh-Hans');
    stubForum();
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    expect(root.textContent).toContain('综合棋类讨论');
    expect(root.textContent).toContain('讨论各类棋牌话题的地方。');
    expect(root.textContent).not.toContain('General Games Discussion');
  });

  it('falls back to English for a category with no overlay', async () => {
    setLocale('zh-Hans');
    stubForum();
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    // Degrades one string at a time: the translated category is Chinese and the
    // untranslated one is readable English, never blank.
    expect(root.textContent).toContain('综合棋类讨论');
    expect(root.textContent).toContain('Game analysis');
  });

  it('gives the page a title in the reader’s language', async () => {
    setLocale('zh-Hans');
    stubForum();
    const root = document.createElement('div');
    const { mountForum } = await import('./forum.js');

    await mountForum(root);

    // The server cannot set this: it does not know a preference stored in the
    // reader's browser. Three forum surfaces served an English tab title.
    expect(document.title).toContain('论坛');
    expect(document.title).not.toContain('Forum');
  });
});

describe('forum relative time', () => {
  it('pluralizes through Intl rather than by appending an s', async () => {
    const { timeAgo } = await import('./relative-time.js');
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

    setLocale(null);
    expect(timeAgo(days(3))).toBe('3 days ago');
    expect(timeAgo(days(1))).toBe('yesterday');

    setLocale('zh-Hans');
    // The assertion that matters is that it is not English; the exact wording is
    // Intl's to choose and differs by engine version.
    expect(timeAgo(days(3))).not.toMatch(/[A-Za-z]/);
  });

  it('formats dates in the site locale, not the browser one', async () => {
    const { formatDateTime } = await import('./relative-time.js');
    const iso = '2026-09-06T10:25:00.000Z';

    setLocale('zh-Hans');
    const chinese = formatDateTime(iso);
    setLocale(null);
    const english = formatDateTime(iso);

    expect(chinese).not.toBe(english);
    expect(chinese).toMatch(/[一-鿿]/);
  });
});
