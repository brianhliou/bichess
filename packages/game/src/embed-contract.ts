// The embed contract, shared by the provider that serves it and the page that
// documents it.
//
// These numbers appear in three places that must agree: the oEmbed response the
// server returns, the iframe snippet a developer copies off /developers, and the
// prose on that page telling them what the limits are. Documentation drifting
// from behaviour is the ordinary outcome when the doc restates a constant, so
// the doc imports the constant instead.
//
// packages/game is the home because apps/server cannot import apps/web and vice
// versa, and this sits beside engine-protocol.ts, which is here for the same
// reason: it is a contract between two things that cannot import each other.

/** Width the provider returns when a consumer asks for no particular size. */
export const EMBED_DEFAULT_WIDTH = 720;

/** Height at the default width. Every other height is derived from the ratio. */
export const EMBED_DEFAULT_HEIGHT = 560;

/** Below this the move list and the board stop coexisting. */
export const EMBED_MIN_WIDTH = 320;

/** Above this the board stops being the reason the page is on screen. */
export const EMBED_MAX_WIDTH = 1200;

/** The oEmbed provider endpoint, relative to the site origin. */
export const OEMBED_ENDPOINT = '/api/oembed';

/**
 * A consumer's `maxwidth` is a request, not an instruction: it is clamped into
 * the range the widget actually works in, and a junk value falls back to the
 * default rather than erroring, which is what oEmbed consumers expect.
 */
export function clampEmbedWidth(raw: string | number | null | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return EMBED_DEFAULT_WIDTH;
  return Math.min(EMBED_MAX_WIDTH, Math.max(EMBED_MIN_WIDTH, Math.round(value)));
}

/** Height that preserves the default aspect ratio at `width`. */
export function embedHeightForWidth(width: number): number {
  return Math.round(width * (EMBED_DEFAULT_HEIGHT / EMBED_DEFAULT_WIDTH));
}

/** `/embed/study/:studyId/:chapterId`, the frameable page itself. */
export function embedStudyPath(studyId: string, chapterId: string): string {
  return `/embed/study/${studyId}/${chapterId}`;
}
