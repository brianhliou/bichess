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

  it('a draft page renders nothing at all in a production build', () => {
    // The guard cannot be observed from this page in a production build,
    // because the page itself is a draft and its own URL 404s. That is the
    // behaviour worth pinning here; the guard is covered by the sweep above.
    vi.stubEnv('DEV', false);
    try {
      const page = buildArticlePage('xiangqi-champions');
      expect(page.querySelectorAll('.article-cta')).toHaveLength(0);
      expect(page.textContent).not.toContain('Every Xiangqi Champion');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
