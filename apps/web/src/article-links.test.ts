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

  it('renders the cross-link now that both champion pages are published', () => {
    // The two champion pages point at each other. This is the live half of the
    // guard above: with both published the button must actually render, in
    // production as well as dev, or the guard could be satisfied by dropping
    // every link.
    for (const dev of [true, false]) {
      vi.stubEnv('DEV', dev);
      try {
        const pairs: Array<[string, string]> = [
          ['xiangqi-champions', '/blog/xiangqi-world-championship'],
          ['xiangqi-world-championship', '/blog/xiangqi-champions'],
        ];
        for (const [slug, href] of pairs) {
          const page = buildArticlePage(slug);
          const hrefs = [...page.querySelectorAll<HTMLAnchorElement>('.article-cta')].map((a) =>
            a.getAttribute('href'),
          );
          expect(hrefs, `${slug} (DEV=${dev}) should link to ${href}`).toContain(href);
        }
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  it('has drafts and rendered buttons, so the guard is not vacuous', () => {
    // The guard at the top of this file passes for free in two ways: if nothing
    // is a draft, or if no page renders a CTA at all. Until 2026-08-29 a second
    // test covered this by naming the world-title article as the draft to drop,
    // which stopped meaning anything the moment that article shipped. Assert the
    // two preconditions instead of naming an article whose status will change.
    const drafts = articles.filter((a) => a.status !== 'published');
    expect(drafts.length, 'no draft exists, so the drop guard checks nothing').toBeGreaterThan(0);

    vi.stubEnv('DEV', false);
    try {
      const rendered = articles
        .filter((a) => a.status === 'published')
        .flatMap((a) => [...buildArticlePage(a.slug).querySelectorAll('.article-cta')]);
      expect(rendered.length, 'no article renders a CTA, so nothing is checked').toBeGreaterThan(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
