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

/**
 * `?notation=wxf` (or `chinese`, `iccs`, `coordinate`) on an embed URL, pinning
 * the move labels instead of following the reader's own setting.
 *
 * Same shape of problem as `theme`, for the same reason: the reader of an embed
 * is on the EMBEDDER's page, and almost never has a stored Mistboard preference,
 * so they get the site default of coordinates. That default is right for a
 * general visitor and wrong for an article about endgame technique, where the
 * source material is written in WXF or Chinese and `a5-a9` is the one form no
 * manual uses. The embedder knows which their readers need; Mistboard does not.
 *
 * Anything else, including no param, returns null and the embed follows the
 * reader. Deliberately does NOT write the preference: the embed is on
 * mistboard.com's origin, so a write would change the reader's setting for the
 * whole site from inside someone else's page.
 */
export function embedNotationFromSearch(
  search: string,
): 'coordinate' | 'chinese' | 'wxf' | 'iccs' | null {
  const value = new URLSearchParams(search).get('notation');
  return value === 'coordinate' || value === 'chinese' || value === 'wxf' || value === 'iccs'
    ? value
    : null;
}
