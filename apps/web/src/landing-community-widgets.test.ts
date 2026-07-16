import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaderboardVariants } from './variants.js';

describe('landing community widgets', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('hydrates popular studies and the leader of each returned public ladder', async () => {
    const variant = leaderboardVariants[0]!;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/studies/public') {
        return jsonResponse({
          studies: [
            {
              id: 'studyOne',
              name: 'Horse and cannon attacks',
              owner: { handle: 'teacher', displayName: 'Teacher' },
              chapterCount: 3,
              likeCount: 12,
            },
          ],
        });
      }
      if (url === '/api/leaderboard/summary?limit=1') {
        return jsonResponse({
          ladders: [
            {
              variant: variant.id,
              leaderboard: [
                {
                  handle: 'champion',
                  displayName: 'Champion',
                  eloRating: 2412,
                  provisional: false,
                },
              ],
            },
          ],
        });
      }
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { buildLandingCommunityWidgets } = await import('./landing-community-widgets.js');

    const strip = buildLandingCommunityWidgets();
    document.body.append(strip);

    await vi.waitFor(() => {
      expect(strip.querySelector('.landing-study-row')?.textContent).toContain(
        'Horse and cannon attacks',
      );
      expect(strip.querySelector('.landing-leaderboard-player')?.textContent).toBe('Champion');
    });
    expect(strip.querySelector<HTMLAnchorElement>('.landing-study-row')?.pathname).toBe(
      '/study/studyOne',
    );
    expect(strip.querySelector('.landing-study-likes')?.textContent).toBe('♥ 12');
    expect(strip.querySelector('.landing-leaderboard-category')?.textContent).toBe(variant.label);
    expect(strip.querySelector('.landing-leaderboard-rating')?.textContent).toBe('2412');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}
