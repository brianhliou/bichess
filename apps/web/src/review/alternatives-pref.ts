// Viewer preference: show the ranked alternatives block under a judged move.
//
// OFF by default. The move already carries its glyph and an advice line naming
// the best move ("Blunder. b2-b4 was best."), which is the whole story for most
// readers; the ranked set with win% is a second, denser layer that made the move
// list hard to scan when it was always on. So it is opt-in, and when on it shows
// ONE alternative plus the move actually played — enough to compare, not a table.
//
// Absent storage reads as OFF, deliberately: a preference whose default is off
// must treat "no value" and "false" identically, or the first visit silently gets
// the opposite of the documented default.

const STORAGE_KEY = 'mistboard:review:alternatives';

/** How many alternatives to list alongside the played move when the block is on. */
export const ALTERNATIVES_SHOWN = 1;

/** True only when the viewer has explicitly turned the block on. Storage can be
 *  unavailable (private windows, blocked site data), so every access is guarded
 *  and falls back to the default rather than throwing during a render. */
export function alternativesEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAlternativesEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // A viewer who cannot persist the choice still gets it for this page view;
    // the in-memory flag is what drives the render.
  }
}

/**
 * Trim a ranked candidate set to what the block shows: the top `limit`
 * alternatives, plus the played move so the comparison is visible. Order is
 * preserved (the server sends them best-first), and the played move is appended
 * only when it did not already make the cut.
 */
export function trimAlternatives<T extends { played?: boolean }>(
  candidates: readonly T[],
  limit: number = ALTERNATIVES_SHOWN,
): T[] {
  const shown: T[] = [];
  for (const candidate of candidates) {
    if (candidate.played) continue;
    if (shown.length >= limit) break;
    shown.push(candidate);
  }
  const played = candidates.find((candidate) => candidate.played);
  if (played) shown.push(played);
  return shown;
}
