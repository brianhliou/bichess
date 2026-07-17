/**
 * Local-storage persistence for the puzzles page (solved markers, seen-set
 * rotation, auto-next + rated preferences) and the visit-scoped queue rotation
 * built on the seen-set. All best-effort: puzzle play works without storage.
 */

import type { PuzzleSummary } from './adapter.js';

const SOLVED_PUZZLES_STORAGE_KEY = 'mistboard:puzzles:solved';
const SEEN_PUZZLES_STORAGE_KEY = 'mistboard:puzzles:seen';
const AUTO_NEXT_STORAGE_KEY = 'mistboard:puzzles:auto-next';
const RATED_STORAGE_KEY = 'mistboard:puzzles:rated';
// Rotation only needs "have I seen this lately," so cap the persisted seen-set
// to the most-recently-seen ids rather than growing an unbounded history.
const SEEN_PUZZLES_CAP = 200;

export function loadSolvedPuzzleIds(): Set<string> {
  try {
    const raw = window.localStorage?.getItem(SOLVED_PUZZLES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function saveSolvedPuzzleIds(ids: ReadonlySet<string>): void {
  try {
    window.localStorage?.setItem(SOLVED_PUZZLES_STORAGE_KEY, JSON.stringify([...ids].sort()));
  } catch {
    // Solved markers are a convenience only; puzzle play should work without storage.
  }
}

// Order puzzles for rotation: unseen first (shuffled for real variety), then
// seen puzzles from least- to most-recently-seen so revisits resurface the
// oldest ones first. Real randomness is intentional here — this is client-side
// UX ordering, not a replay path — and rating-adaptive selection is a separate,
// later work item (issue #142).
export function rotatePuzzleOrder(
  puzzles: readonly PuzzleSummary[],
  seen: ReadonlyMap<string, number>,
): PuzzleSummary[] {
  const unseen: PuzzleSummary[] = [];
  const seenList: PuzzleSummary[] = [];
  for (const puzzle of puzzles) {
    if (seen.has(puzzle.id)) seenList.push(puzzle);
    else unseen.push(puzzle);
  }
  shufflePuzzles(unseen);
  seenList.sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0));
  return [...unseen, ...seenList];
}

function shufflePuzzles(puzzles: PuzzleSummary[]): void {
  // Fisher-Yates in place.
  for (let i = puzzles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = puzzles[i]!;
    puzzles[i] = puzzles[j]!;
    puzzles[j] = swap;
  }
}

export function loadSeenPuzzles(): Map<string, number> {
  try {
    const raw = window.localStorage?.getItem(SEEN_PUZZLES_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    const seen = new Map<string, number>();
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) seen.set(id, at);
    }
    return seen;
  } catch {
    return new Map();
  }
}

export function saveSeenPuzzles(seen: ReadonlyMap<string, number>): void {
  try {
    // Keep only the most-recently-seen ids so the store stays bounded.
    const capped = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, SEEN_PUZZLES_CAP);
    window.localStorage?.setItem(
      SEEN_PUZZLES_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(capped)),
    );
  } catch {
    // Seen markers are a convenience only; puzzle play works without storage.
  }
}

export function loadAutoNextEnabled(): boolean {
  try {
    return window.localStorage?.getItem(AUTO_NEXT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveAutoNextEnabled(enabled: boolean): void {
  try {
    window.localStorage?.setItem(AUTO_NEXT_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Puzzle preferences are best-effort convenience state.
  }
}

export function loadRatedEnabled(): boolean {
  try {
    // Rated is the default; only an explicit opt-out is stored.
    return window.localStorage?.getItem(RATED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function saveRatedEnabled(enabled: boolean): void {
  try {
    window.localStorage?.setItem(RATED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Puzzle preferences are best-effort convenience state.
  }
}
