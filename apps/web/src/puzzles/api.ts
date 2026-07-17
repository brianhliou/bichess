/**
 * The puzzles HTTP surface (list/detail/attempt/reveal/rating) plus the
 * rating-preference singletons. One puzzle page is mounted at a time, so the
 * rated preference and the "an attempt just changed my rating" callback live
 * as module singletons the free-function attempt path can reach without
 * threading them through every call.
 */

import type { PuzzleDetail, PuzzleMove, PuzzleState, PuzzleSummary } from './adapter.js';

export type PuzzleAttempt =
  | {
      ok: true;
      playedMoves: PuzzleMove[];
      solverMoves: PuzzleMove[];
      complete: boolean;
      ply: number;
      state: PuzzleState;
      lastMove?: PuzzleMove;
    }
  | {
      ok: false;
      code: 'incorrect-move' | 'illegal-move' | 'line-too-long' | 'wrong-move-shape';
      ply: number;
      state: PuzzleState;
      move: PuzzleMove;
    };

// The signed-in user's puzzle rating for the current variant (from
// /api/puzzles/rating), and the rating change returned by a rated attempt.
export type UserPuzzleRating = {
  rating: number;
  provisional: boolean;
  solved: number;
  attempts: number;
};

export type PuzzleAttemptRating = {
  userRating: number;
  delta: number;
  provisional: boolean;
  ratingChanged: boolean;
  firstAttempt: boolean;
};

let puzzleRatedPref = true;
let onAttemptRating: ((rating: PuzzleAttemptRating) => void) | null = null;

export function setPuzzleRatedPref(enabled: boolean): void {
  puzzleRatedPref = enabled;
}

export function setOnAttemptRating(callback: ((rating: PuzzleAttemptRating) => void) | null): void {
  onAttemptRating = callback;
}

export function reportAttemptRating(rating: PuzzleAttemptRating): void {
  onAttemptRating?.(rating);
}

export async function fetchPuzzleList(): Promise<PuzzleSummary[]> {
  const response = await fetch('/api/puzzles');
  if (!response.ok) throw new Error(`Puzzle list failed: ${response.status}`);
  const body = (await response.json()) as { puzzles?: PuzzleSummary[] };
  return Array.isArray(body.puzzles) ? body.puzzles : [];
}

export async function fetchPuzzleDetail(id: string): Promise<PuzzleDetail | null> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Puzzle detail failed: ${response.status}`);
  const body = (await response.json()) as { puzzle?: PuzzleDetail };
  return body.puzzle ?? null;
}

export async function submitPuzzleAttempt(
  id: string,
  moves: readonly PuzzleMove[],
): Promise<{ attempt: PuzzleAttempt; rating: PuzzleAttemptRating | null }> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}/attempt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moves, rated: puzzleRatedPref }),
  });
  if (!response.ok) throw new Error(`Puzzle attempt failed: ${response.status}`);
  const body = (await response.json()) as {
    attempt?: PuzzleAttempt;
    rating?: PuzzleAttemptRating;
  };
  if (!body.attempt) throw new Error('Puzzle attempt response missing attempt.');
  return { attempt: body.attempt, rating: body.rating ?? null };
}

// Fetch the full solution line (the reveal endpoint is the only route that
// exposes solution moves). POST because it books a failed rated attempt.
export async function fetchPuzzleSolution(
  id: string,
): Promise<{ solution: PuzzleMove[] | null; rating: PuzzleAttemptRating | null }> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}/reveal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'solution', rated: puzzleRatedPref }),
  });
  if (!response.ok) throw new Error(`Puzzle reveal failed: ${response.status}`);
  const body = (await response.json()) as {
    solution?: PuzzleMove[];
    rating?: PuzzleAttemptRating;
  };
  return { solution: body.solution ?? null, rating: body.rating ?? null };
}

// Fetch just the next correct move for the current ply (server computes it via
// the per-variant *PuzzleNextMove helpers; the client never holds the full line
// for a hint). POST because it books a failed rated attempt.
export async function fetchPuzzleHint(
  id: string,
  playedPlyCount: number,
): Promise<{ move: PuzzleMove | null; rating: PuzzleAttemptRating | null }> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}/reveal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'hint', playedPlyCount, rated: puzzleRatedPref }),
  });
  if (!response.ok) throw new Error(`Puzzle hint failed: ${response.status}`);
  const body = (await response.json()) as {
    move?: PuzzleMove | null;
    rating?: PuzzleAttemptRating;
  };
  return { move: body.move ?? null, rating: body.rating ?? null };
}

export async function fetchUserPuzzleRating(variant: string): Promise<UserPuzzleRating | null> {
  try {
    const response = await fetch(`/api/puzzles/rating?variant=${encodeURIComponent(variant)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { rating?: UserPuzzleRating | null };
    return body.rating ?? null;
  } catch {
    return null;
  }
}
