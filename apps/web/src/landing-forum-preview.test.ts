import { afterEach, describe, expect, it, vi } from 'vitest';

describe('landing forum preview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates the homepage forum box with one dense row per active topic', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          topics: [
            {
              id: 'topic_1',
              slug: 'first-topic',
              title: 'First topic',
              category: {
                slug: 'general-discussion',
                name: 'General Games Discussion',
              },
              latestPost: {
                post: { id: 'post_2' },
                author: { handle: 'alice', displayName: 'Alice' },
                createdAt: '2026-06-01T00:05:00.000Z',
              },
              postCount: 26,
              pinned: false,
              locked: false,
              lastPostAt: '2026-06-01T00:05:00.000Z',
            },
            {
              id: 'topic_2',
              slug: 'second-topic',
              title: 'Second topic',
              category: {
                slug: 'feedback',
                name: 'Mistboard Feedback',
              },
              latestPost: null,
              postCount: 1,
              pinned: true,
              locked: false,
              lastPostAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { buildLandingForumPreview } = await import('./landing-forum-preview.js');

    const box = buildLandingForumPreview();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).toHaveBeenCalledWith('/api/forum/topics?limit=5', {
      headers: { accept: 'application/json' },
    });
    expect(box.querySelector('.site-box-title')?.textContent).toBe('Active forum topics');
    const rows = box.querySelectorAll<HTMLAnchorElement>('a.landing-forum-topic');
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute('href')).toBe('/forum/t/topic_1/first-topic?page=2#post_post_2');
    expect(rows[0]?.textContent).toContain('First topic');
    expect(rows[0]?.textContent).toContain('General Games Discussion');
    expect(rows[0]?.textContent).toContain('Alice');
    expect(rows[0]?.textContent).toContain('25');
    // The row itself is the only link: no nested anchors per topic.
    expect(rows[0]?.querySelectorAll('a').length).toBe(0);
    expect(rows[1]?.getAttribute('href')).toBe('/forum/t/topic_2/second-topic');
    expect(rows[1]?.classList.contains('is-pinned')).toBe(true);
  });
});
