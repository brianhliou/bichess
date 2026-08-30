// The path matcher on its own, with no imports. main.ts needs to know whether a
// URL is an embed before it decides what to load; importing the page module for
// that would pull the replay widget and its CSS into the initial bundle for
// every visitor, which is the opposite of what a lazily-mounted route is for.

export type EmbedStudyRoute = { studyId: string; chapterId: string };

/** `/embed/study/:studyId/:chapterId`, or null when the path is not one. */
export function embedStudyRouteFromPath(pathname: string): EmbedStudyRoute | null {
  const m = /^\/embed\/study\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})\/?$/.exec(pathname);
  if (!m) return null;
  return { studyId: m[1] as string, chapterId: m[2] as string };
}

/**
 * `?theme=light` / `?theme=dark` on an embed URL, pinning the board to one
 * theme instead of following the reader's OS.
 *
 * An embed runs inside someone else's page, and that page may have only one
 * theme. Mistboard's own default is `system`, so a light-only site framing an
 * embed shows a dark board to every reader whose OS is dark, and there is no
 * fix on the embedder's side: `prefers-color-scheme` inside the frame is the
 * browser's, and `color-scheme` on the <iframe> element does not reach the
 * framed document. The embedder has to be able to say it in the URL.
 *
 * Anything else, including no param at all, returns null and the embed keeps
 * following the reader.
 */
export function embedThemeFromSearch(search: string): 'light' | 'dark' | null {
  const value = new URLSearchParams(search).get('theme');
  return value === 'light' || value === 'dark' ? value : null;
}
