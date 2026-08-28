import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaderboardVariants } from './variants.js';

describe('landing community widgets', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hydrates popular studies and the leader of each returned public ladder', async () => {
    const variant = leaderboardVariants[0]!;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/studies/public?limit=')) {
        return jsonResponse({
          studies: [
            {
              id: 'uXnuObfx',
              name: 'Seven Stars',
              owner: { handle: 'teacher', displayName: 'Teacher' },
              chapterCount: 3,
              likeCount: 12,
            },
            {
              id: 'studyOne',
              name: 'Horse and cannon attacks',
              owner: { handle: 'teacher', displayName: 'Teacher' },
              chapterCount: 1,
              likeCount: 4,
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
      expect(strip.querySelector('.landing-study-row')?.textContent).toContain('Seven Stars');
      expect(strip.querySelector('.landing-leaderboard-player')?.textContent).toBe('Champion');
    });
    const flagshipRow = strip.querySelector<HTMLAnchorElement>('.landing-study-row');
    expect(flagshipRow?.pathname).toBe('/study/uXnuObfx');
    expect(
      flagshipRow?.querySelector<HTMLImageElement>('.landing-study-thumbnail img'),
    ).toMatchObject({
      alt: '',
      loading: 'lazy',
      src: expect.stringContaining('/study-thumbnails/seven-stars.webp'),
    });
    const ordinaryRow = [...strip.querySelectorAll<HTMLAnchorElement>('.landing-study-row')].find(
      (row) => row.pathname === '/study/studyOne',
    );
    expect(ordinaryRow?.querySelector('.landing-study-thumbnail')).toBeNull();
    expect(strip.querySelector('.landing-study-likes')?.textContent).toBe('♥ 12');
    expect(strip.querySelector('.landing-leaderboard-category')?.textContent).toBe(variant.label);
    expect(strip.querySelector('.landing-leaderboard-rating')?.textContent).toBe('2412');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fits Top studies to whole rows against the body height and fills small slack', async () => {
    const study = (n: number) => ({
      id: `study_${n}`,
      name: `Study ${n}`,
      owner: { handle: 'teacher', displayName: 'Teacher' },
      chapterCount: n,
      likeCount: 0,
    });
    // A fresh Response per call: a body reads once, and this test hydrates twice.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ studies: [1, 2, 3, 4, 5].map(study) })),
    );
    // jsdom has no layout: stack the rows 40px apart by DOM order, body at 0.
    const rowHeight = 40;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = this.classList.contains('landing-study-row')
        ? Array.from(this.parentElement?.children ?? []).indexOf(this)
        : -1;
      const top = index < 0 ? 0 : index * rowHeight;
      const bottom = index < 0 ? 0 : top + rowHeight;
      return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top } as DOMRect;
    });
    const { buildTopStudiesWidget } = await import('./landing-community-widgets.js');

    const box = buildTopStudiesWidget();
    const body = box.querySelector<HTMLElement>('.site-box-body')!;
    // Four rows fit (160px), a fifth (200px) would clip; 20px of slack is
    // within the 28px-per-row spread, so the rows grow to fill it.
    Object.defineProperty(body, 'clientHeight', { value: 180, configurable: true });
    await vi.waitFor(() => {
      expect(body.querySelectorAll('.landing-study-row').length).toBe(4);
    });
    expect(body.classList.contains('landing-community-body--fill')).toBe(true);

    // Content-starved: the same rows in a much taller body keep their slack.
    const tall = buildTopStudiesWidget();
    const tallBody = tall.querySelector<HTMLElement>('.site-box-body')!;
    Object.defineProperty(tallBody, 'clientHeight', { value: 400, configurable: true });
    await vi.waitFor(() => {
      expect(tallBody.querySelectorAll('.landing-study-row').length).toBe(5);
    });
    expect(tallBody.classList.contains('landing-community-body--fill')).toBe(false);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}
