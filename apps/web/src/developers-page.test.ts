import {
  EMBED_DEFAULT_HEIGHT,
  EMBED_DEFAULT_WIDTH,
  EMBED_MAX_WIDTH,
  EMBED_MIN_WIDTH,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  embedSnippet,
  exampleEmbedUrl,
  exampleStudyUrl,
  mountDevelopers,
  oembedRequestUrl,
} from './developers-page.js';
import { embedStudyRouteFromPath } from './embed/embed-route.js';

const ORIGIN = 'https://mistboard.com';

// A docs page is a promise about behaviour, and the usual way it goes wrong is
// that the behaviour moves and the prose does not. The numbers cannot drift
// because both sides import them from @mistboard/game, so what is left to check
// is the part that is still hand-written: the URLs in the snippet.
describe('the developers page documents something real', () => {
  it('writes a snippet whose src the embed router actually accepts', () => {
    const snippet = embedSnippet(ORIGIN);
    const src = /src="([^"]+)"/.exec(snippet)?.[1];
    expect(src, 'snippet has no src').toBeTruthy();
    const path = new URL(src as string).pathname;
    // The real matcher from the real route, not a copy of its regex.
    expect(embedStudyRouteFromPath(path), `${path} is not an embed route`).not.toBeNull();
  });

  it('points the oEmbed example at a URL the provider pattern matches', () => {
    const target = new URL(oembedRequestUrl(ORIGIN)).searchParams.get('url');
    expect(target).toBe(exampleStudyUrl(ORIGIN));
    // The provider accepts the permalink AND the embed path; both resolve to
    // the same chapter, which is the property the page claims.
    const permalink = new URL(exampleStudyUrl(ORIGIN)).pathname;
    const embed = new URL(exampleEmbedUrl(ORIGIN)).pathname;
    const ids = /\/study\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(permalink);
    expect(embed).toBe(`/embed/study/${ids?.[1]}/${ids?.[2]}`);
  });

  it('sizes the snippet at the contract default', () => {
    const snippet = embedSnippet(ORIGIN);
    expect(snippet).toContain(`width="${EMBED_DEFAULT_WIDTH}"`);
    expect(snippet).toContain(`height="${EMBED_DEFAULT_HEIGHT}"`);
    // max-width is what keeps a fixed-width iframe from overflowing a phone,
    // and the page tells people to keep it, so it had better be in there.
    expect(snippet).toContain('max-width:100%');
  });

  it('renders the live example as a real frame, and states the real limits', () => {
    const root = document.createElement('div');
    mountDevelopers(root);

    const frame = root.querySelector<HTMLIFrameElement>('.developers-example iframe');
    expect(frame, 'no live example on the page').not.toBeNull();
    expect(embedStudyRouteFromPath(frame?.getAttribute('src') ?? '')).not.toBeNull();

    const text = root.textContent ?? '';
    expect(text).toContain(String(EMBED_MIN_WIDTH));
    expect(text).toContain(String(EMBED_MAX_WIDTH));
  });

  it('offers a copy button for every code block', () => {
    const root = document.createElement('div');
    mountDevelopers(root);
    const blocks = root.querySelectorAll('.developers-code');
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      expect(
        block.querySelector('.developers-copy'),
        'code block without a copy button',
      ).not.toBeNull();
    }
  });
});
