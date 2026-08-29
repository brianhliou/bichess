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
