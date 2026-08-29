import { describe, expect, it, vi } from 'vitest';
import { buildArticlePage } from './articles.js';
import { articles } from './articles-data.js';

describe('internal article links', () => {
  it('never renders a button to an article the build hides', () => {
    // A draft's URL 404s in production, so a published page linking to one ships
    // a dead button. This is the whole failure mode: it depends on nobody
    // forgetting the publishing order.
    vi.stubEnv('DEV', false);
    try {
      const hidden = new Set(
        articles.filter((a) => a.status !== 'published').map((a) => `/blog/${a.slug}`),
      );
      for (const article of articles.filter((a) => a.status === 'published')) {
        const page = buildArticlePage(article.slug);
        for (const anchor of page.querySelectorAll<HTMLAnchorElement>('.article-cta')) {
          const href = anchor.getAttribute('href') ?? '';
          expect(hidden.has(href), `${article.slug} links to unpublished ${href}`).toBe(false);
        }
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('renders the same link once its target is published', () => {
    // Dev shows drafts, which is how the link gets reviewed before it ships.
    vi.stubEnv('DEV', true);
    try {
      const page = buildArticlePage('xiangqi-champions');
      const hrefs = [...page.querySelectorAll<HTMLAnchorElement>('.article-cta')].map((a) =>
        a.getAttribute('href'),
      );
      expect(hrefs).toContain('/blog/xiangqi-world-championship');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('drops only the link to the draft, keeping the rest of the page', () => {
    // Until this article was published on 2026-08-29 the guard could not be
    // observed from this page at all: the page was itself a draft, so its own
    // URL 404d and there was nothing to render. Now it is live while the world
    // title article it links to is still a draft, which is exactly the state
    // the guard exists for, and the assertion that matters is asymmetric --
    // the dead button goes, the two live ones stay.
    vi.stubEnv('DEV', false);
    try {
      const page = buildArticlePage('xiangqi-champions');
      const hrefs = [...page.querySelectorAll<HTMLAnchorElement>('.article-cta')].map((a) =>
        a.getAttribute('href'),
      );
      expect(page.textContent).toContain('Every Xiangqi Champion');
      expect(hrefs).not.toContain('/blog/xiangqi-world-championship');
      expect(hrefs.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
