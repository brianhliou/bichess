import { describe, expect, it, vi } from 'vitest';
import type { Article } from './articles-data.js';

// A guest article does not exist in the shipped catalog yet, so the byline path
// is driven through a synthetic one resolved by the real render code.
const GUEST: Article = {
  slug: 'guest-piece',
  kind: 'article',
  publisher: 'community',
  title: 'A guest annotates the Riverbank Cannon',
  summary: 'One master on one opening.',
  status: 'published',
  audience: 'Club players',
  publishedAt: '2026-08-27',
  author: { displayName: 'Wei Chen', handle: 'weichen', title: 'xgm' },
  sections: [{ heading: 'Opening', blocks: [{ kind: 'paragraph', text: 'A move.' }] }],
};

const ANONYMOUS: Article = { ...GUEST, slug: 'house-piece', author: undefined };

// Table cells rendered through textContent until 2026-08-27, so inline markdown
// in a cell printed its own brackets.
const TABLED: Article = {
  ...GUEST,
  slug: 'tabled-piece',
  sections: [
    {
      heading: 'Numbers',
      blocks: [
        {
          kind: 'table',
          headers: ['Surface', 'What you get'],
          rows: [['Coaching', 'Publish at [/coach](/coach), **no commission**.']],
        },
      ],
    },
  ],
};

vi.mock('./articles-data.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./articles-data.js')>();
  return {
    ...actual,
    findArticle: (slug: string) => {
      if (slug === 'guest-piece') return GUEST;
      if (slug === 'house-piece') return ANONYMOUS;
      if (slug === 'tabled-piece') return TABLED;
      return actual.findArticle(slug);
    },
  };
});

describe('guest article byline', () => {
  it('renders the author with their verified title, linked to their profile', async () => {
    const { buildArticlePage } = await import('./articles.js');
    const page = buildArticlePage('guest-piece');

    const byline = page.querySelector('.article-meta-byline');
    expect(byline?.textContent).toContain('By');
    expect(byline?.querySelector('.article-meta-author-name')?.textContent).toBe('Wei Chen');

    const badge = byline?.querySelector('.title-badge');
    expect(badge?.textContent).toBe('XGM');
    expect(badge?.getAttribute('title')).toBe('Xiangqi Grandmaster');

    const link = byline?.querySelector<HTMLAnchorElement>('a.article-meta-author');
    expect(link?.getAttribute('href')).toBe('/@/weichen');
    // The byline leads the meta row, ahead of the dates.
    expect(page.querySelector('.article-meta-row')?.firstElementChild).toBe(byline);
  });

  it('renders no byline for an article Mistboard wrote itself', async () => {
    const { buildArticlePage } = await import('./articles.js');
    const page = buildArticlePage('house-piece');

    expect(page.querySelector('.article-meta-byline')).toBeNull();
    // The dates still render, so the meta row is not simply empty.
    expect(page.querySelector('.article-meta-dates')?.textContent).toContain('Published');
  });
});

describe('article table cells', () => {
  it('renders inline markdown rather than printing its brackets', async () => {
    const { buildArticlePage } = await import('./articles.js');
    const page = buildArticlePage('tabled-piece');

    const cell = page.querySelector('.article-table tbody td:last-child');
    expect(cell?.textContent).not.toContain('[/coach]');
    expect(cell?.querySelector<HTMLAnchorElement>('a')?.getAttribute('href')).toBe('/coach');
    expect(cell?.querySelector('strong')?.textContent).toBe('no commission');
  });
});
