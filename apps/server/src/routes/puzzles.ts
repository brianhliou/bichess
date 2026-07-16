import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  attemptFortressXiangqiPuzzleLine,
  attemptJunglePuzzleLine,
  attemptMiniXiangqiPuzzleLine,
  attemptStandardXiangqiPuzzleLine,
  DROP_MINI_XIANGQI_SPEC_ID,
  FORTRESS_XIANGQI_PUZZLES,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiMove,
  type FortressXiangqiPuzzle,
  fortressXiangqiPuzzleById,
  fortressXiangqiPuzzleNextMove,
  fortressXiangqiPuzzleSideToMove,
  JUNGLE_PUZZLES,
  JUNGLE_SPEC_ID,
  type JungleMove,
  type JunglePuzzle,
  junglePuzzleById,
  junglePuzzleNextMove,
  junglePuzzleSideToMove,
  MINI_XIANGQI_PUZZLES,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiPuzzle,
  type MiniXiangqiPuzzleMove,
  type MiniXiangqiPuzzleVariant,
  miniXiangqiPuzzleById,
  miniXiangqiPuzzleNextMove,
  miniXiangqiPuzzleSideToMove,
  resolvePuzzleShortCode,
  standardXiangqiPuzzleById,
  standardXiangqiPuzzleNextMove,
  standardXiangqiPuzzleSideToMove,
  XIANGQI_PUZZLES,
  XIANGQI_SPEC_ID,
  type XiangqiMove,
  type XiangqiPuzzle,
} from '@mistboard/game';
import { currentAccountUser } from '../account-session.js';
import { getUserPuzzleRating, recordPuzzleAttempt } from '../persistence-puzzle-ratings.js';
import {
  currentDailyPuzzleDay,
  getOrCreateDailyPuzzleSelection,
  parseDailyPuzzleSlot,
} from '../persistence-puzzles.js';
import { seedPuzzleRating } from '../puzzle-rating.js';
import { type HttpApiContext, readJsonBody, requireMethod, writeJson } from './lib.js';

// The public puzzle surface spans the Mini/Drop-Mini registry, the Fortress
// Xiangqi registry, the Jungle registry, and the standard-xiangqi registry.
// Ids are prefix-disjoint across them, so resolution can try each, but every
// behavioural branch dispatches on `variant` (fail-closed: a new registry
// needs an explicit branch, not a fallthrough).
type PublicPuzzle = MiniXiangqiPuzzle | FortressXiangqiPuzzle | JunglePuzzle | XiangqiPuzzle;
type PublicPuzzleVariant =
  | MiniXiangqiPuzzleVariant
  | typeof FORTRESS_XIANGQI_SPEC_ID
  | typeof JUNGLE_SPEC_ID
  | typeof XIANGQI_SPEC_ID;
type PublicPuzzleMove = MiniXiangqiPuzzleMove | FortressXiangqiMove | JungleMove | XiangqiMove;

// Fortress is omitted from the discoverable pool (list + random) while the
// variant is demoted and its puzzles await a re-mine with the per-ply
// uniqueness gate. Its puzzles stay resolvable by id/short-code below
// (puzzleByExactId/allPuzzleIds), so existing links do not hard-404. Re-add the
// Fortress spread here when the re-mined corpus lands.
const ALL_PUZZLES: readonly PublicPuzzle[] = [
  ...MINI_XIANGQI_PUZZLES,
  ...JUNGLE_PUZZLES,
  ...XIANGQI_PUZZLES,
];

type PuzzleSummary = {
  id: string;
  variant: PublicPuzzleVariant;
  title: string;
  sideToMove: ReturnType<typeof miniXiangqiPuzzleSideToMove>;
  goal: PublicPuzzle['goal'];
  themes: readonly string[];
  solutionPlyCount: number;
};

type PuzzleDetail = PuzzleSummary & {
  initial: PublicPuzzle['initial'];
  // Denormalized attribution for the "From game" card (standard-xiangqi mined
  // puzzles only). The source game itself is not hosted until license-cleared,
  // so this is display metadata, not a link target.
  sourceGame?: XiangqiPuzzle['sourceGame'];
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname === '/api/puzzles') {
    if (!requireMethod(request, response, 'GET')) return true;
    const variant = parsePuzzleVariant(parsedUrl.searchParams.get('variant'));
    if (variant === 'invalid') {
      writeJson(response, 400, { error: 'invalid_variant' });
      return true;
    }
    const puzzles = variant
      ? ALL_PUZZLES.filter((puzzle) => puzzle.variant === variant)
      : ALL_PUZZLES;
    writeJson(response, 200, { puzzles: puzzles.map(puzzleSummary) });
    return true;
  }

  if (pathname === '/api/puzzles/daily') {
    if (!requireMethod(request, response, 'GET')) return true;
    const slot = parseDailyPuzzleSlot(parsedUrl.searchParams.get('slot'));
    if (!slot) {
      writeJson(response, 400, { error: 'invalid_slot' });
      return true;
    }
    const daily = await getOrCreateDailyPuzzleSelection(currentDailyPuzzleDay(), slot);
    writeJson(response, 200, {
      daily: {
        day: daily.day,
        persisted: daily.persisted,
        selectedAt: daily.selectedAt,
        slot: daily.slot,
        source: daily.source,
      },
      puzzle: puzzleDetail(daily.puzzle),
    });
    return true;
  }

  // The signed-in user's puzzle rating for a variant (null when unrated / anon).
  // Checked before the `:id` detail route so "rating" is not read as a puzzle id.
  if (pathname === '/api/puzzles/rating') {
    if (!requireMethod(request, response, 'GET')) return true;
    const variant = parsePuzzleVariant(parsedUrl.searchParams.get('variant'));
    if (variant === 'invalid' || variant === null) {
      writeJson(response, 400, { error: 'invalid_variant' });
      return true;
    }
    const user = await currentAccountUser(request);
    const rating = user ? await getUserPuzzleRating(user.id, variant) : null;
    writeJson(response, 200, {
      rating: rating
        ? {
            rating: rating.rating,
            provisional: rating.provisional,
            solved: rating.solved,
            attempts: rating.attempts,
          }
        : null,
    });
    return true;
  }

  const attemptMatch = pathname.match(/^\/api\/puzzles\/([^/]+)\/attempt$/);
  if (attemptMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    const puzzle = puzzleById(decodeURIComponent(attemptMatch[1]!));
    if (!puzzle) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const body = await readJsonBody(request);
    const moves = parsePuzzleMoves(body.moves);
    if (!moves) {
      writeJson(response, 400, { error: 'invalid_moves' });
      return true;
    }
    const attempt = attemptPuzzle(puzzle, moves);
    const rating = await recordAttemptRating(request, puzzle, attempt, body.rated !== false);
    writeJson(response, 200, { attempt, ...(rating ? { rating } : {}) });
    return true;
  }

  // Solution-exposure endpoint (lichess "view solution" / "get a hint"). This is
  // the ONLY route that returns solution move data; the detail + attempt routes
  // stay solution-hidden. `mode:'solution'` returns the full line; `mode:'hint'`
  // returns just the next correct move for the given played-ply count. Either
  // action books a FAILED rated attempt for the user (idempotent per user+puzzle
  // via ON CONFLICT DO NOTHING, so a prior wrong-move fail or a later solve is a
  // rating no-op — first terminal action wins, matching lichess).
  const revealMatch = pathname.match(/^\/api\/puzzles\/([^/]+)\/reveal$/);
  if (revealMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    const puzzle = puzzleById(decodeURIComponent(revealMatch[1]!));
    if (!puzzle) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const body = await readJsonBody(request);
    const rated = body.rated !== false;
    const rating = await recordOutcomeRating(request, puzzle, false, rated);
    if (body.mode === 'hint') {
      const move = puzzleNextMove(puzzle, parsePlayedPlyCount(body.playedPlyCount));
      writeJson(response, 200, { move, ...(rating ? { rating } : {}) });
      return true;
    }
    writeJson(response, 200, { solution: puzzle.solution, ...(rating ? { rating } : {}) });
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/puzzles\/([^/]+)$/);
  if (!detailMatch) return false;
  if (!requireMethod(request, response, 'GET')) return true;

  const puzzle = puzzleById(decodeURIComponent(detailMatch[1]!));
  if (!puzzle) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, { puzzle: puzzleDetail(puzzle) });
  return true;
}

// Ids of every puzzle resolvable below, built once for short-code inversion.
// Keep the four registries in sync with puzzleByExactId().
let allPuzzleIdsCache: string[] | null = null;
function allPuzzleIds(): string[] {
  if (!allPuzzleIdsCache) {
    allPuzzleIdsCache = [
      ...MINI_XIANGQI_PUZZLES,
      ...FORTRESS_XIANGQI_PUZZLES,
      ...JUNGLE_PUZZLES,
      ...XIANGQI_PUZZLES,
    ].map((puzzle) => puzzle.id);
  }
  return allPuzzleIdsCache;
}

function puzzleByExactId(id: string): PublicPuzzle | null {
  return (
    miniXiangqiPuzzleById(id) ??
    fortressXiangqiPuzzleById(id) ??
    junglePuzzleById(id) ??
    standardXiangqiPuzzleById(id)
  );
}

// Accepts either a full puzzle id (the URL slug today) or a lichess-style short
// code (e.g. "bMpKA", shown in the puzzle info card). Full ids resolve directly;
// only when that misses do we invert a short code — resolvePuzzleShortCode
// short-circuits on anything that is not code-shaped, so this stays cheap for
// the common full-id path.
function puzzleById(id: string): PublicPuzzle | null {
  const direct = puzzleByExactId(id);
  if (direct) return direct;
  const fullId = resolvePuzzleShortCode(id, allPuzzleIds());
  return fullId ? puzzleByExactId(fullId) : null;
}

function puzzleSideToMove(puzzle: PublicPuzzle): ReturnType<typeof miniXiangqiPuzzleSideToMove> {
  if (puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) return fortressXiangqiPuzzleSideToMove(puzzle);
  if (puzzle.variant === JUNGLE_SPEC_ID) return junglePuzzleSideToMove(puzzle);
  if (puzzle.variant === XIANGQI_SPEC_ID) return standardXiangqiPuzzleSideToMove(puzzle);
  return miniXiangqiPuzzleSideToMove(puzzle);
}

function attemptPuzzle(puzzle: PublicPuzzle, moves: PublicPuzzleMove[]) {
  if (puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) {
    return attemptFortressXiangqiPuzzleLine(puzzle, moves as FortressXiangqiMove[]);
  }
  if (puzzle.variant === JUNGLE_SPEC_ID) {
    return attemptJunglePuzzleLine(puzzle, moves as JungleMove[]);
  }
  if (puzzle.variant === XIANGQI_SPEC_ID) {
    return attemptStandardXiangqiPuzzleLine(puzzle, moves as XiangqiMove[]);
  }
  return attemptMiniXiangqiPuzzleLine(puzzle, moves as MiniXiangqiPuzzleMove[]);
}

// The next scripted move for a played-ply count (solver move on even plies,
// scripted defender reply on odd). Reads `puzzle.solution` generically via the
// per-variant helpers. Fail-closed: a new registry needs an explicit branch.
function puzzleNextMove(puzzle: PublicPuzzle, playedPlyCount: number): PublicPuzzleMove | null {
  if (puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) {
    return fortressXiangqiPuzzleNextMove(puzzle, playedPlyCount);
  }
  if (puzzle.variant === JUNGLE_SPEC_ID) {
    return junglePuzzleNextMove(puzzle, playedPlyCount);
  }
  if (puzzle.variant === XIANGQI_SPEC_ID) {
    return standardXiangqiPuzzleNextMove(puzzle, playedPlyCount);
  }
  return miniXiangqiPuzzleNextMove(puzzle, playedPlyCount);
}

// Non-negative ply count the client has already played (used to pick the hint's
// target move). Malformed/negative/out-of-range values fall back to 0 (the
// puzzle's first move), never an exception.
function parsePlayedPlyCount(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 64) {
    return value;
  }
  return 0;
}

type PuzzleAttempt = ReturnType<typeof attemptPuzzle>;

type PuzzleAttemptRating = {
  userRating: number;
  delta: number;
  provisional: boolean;
  ratingChanged: boolean;
  firstAttempt: boolean;
};

// true = solved, false = a genuine wrong answer, null = not a terminal outcome
// (a correct-but-incomplete move on a multi-move puzzle, or a malformed submit).
function attemptOutcome(attempt: PuzzleAttempt): boolean | null {
  if (attempt.ok) return attempt.complete ? true : null;
  return attempt.code === 'incorrect-move' ? false : null;
}

// Record + rate the outcome for a signed-in user, once per (user, puzzle). Anon
// users, non-terminal moves, and persistence-off all return null (no rating).
async function recordAttemptRating(
  request: IncomingMessage,
  puzzle: PublicPuzzle,
  attempt: PuzzleAttempt,
  rated: boolean,
): Promise<PuzzleAttemptRating | null> {
  const outcome = attemptOutcome(attempt);
  if (outcome === null) return null;
  return recordOutcomeRating(request, puzzle, outcome, rated);
}

// Book a single terminal outcome (solved/failed) for a signed-in user. The
// puzzle_attempts primary key makes this idempotent per (user, puzzle): only the
// FIRST terminal outcome moves ratings, so a wrong-move fail followed by a
// reveal, or a reveal followed by a completed line, records once and returns
// firstAttempt=false / ratingChanged=false on the repeat. Anon users and
// persistence-off return null (no rating).
async function recordOutcomeRating(
  request: IncomingMessage,
  puzzle: PublicPuzzle,
  solved: boolean,
  rated: boolean,
): Promise<PuzzleAttemptRating | null> {
  const user = await currentAccountUser(request);
  if (!user) return null;
  const result = await recordPuzzleAttempt({
    userId: user.id,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    solved,
    rated,
    seedRating: seedPuzzleRating(puzzle.solution.length),
  });
  if (!result) return null;
  return {
    userRating: result.userRating,
    delta: result.userRatingDelta,
    provisional: result.provisional,
    ratingChanged: result.ratingChanged,
    firstAttempt: result.firstAttempt,
  };
}

function parsePuzzleVariant(value: string | null): PublicPuzzleVariant | null | 'invalid' {
  if (value === null || value === '') return null;
  if (
    value === MINI_XIANGQI_SPEC_ID ||
    value === DROP_MINI_XIANGQI_SPEC_ID ||
    value === FORTRESS_XIANGQI_SPEC_ID ||
    value === JUNGLE_SPEC_ID ||
    value === XIANGQI_SPEC_ID
  ) {
    return value;
  }
  return 'invalid';
}

function puzzleSummary(puzzle: PublicPuzzle): PuzzleSummary {
  return {
    id: puzzle.id,
    variant: puzzle.variant,
    title: puzzle.title,
    sideToMove: puzzleSideToMove(puzzle),
    goal: puzzle.goal,
    themes: puzzle.themes,
    solutionPlyCount: puzzle.solution.length,
  };
}

function puzzleDetail(puzzle: PublicPuzzle): PuzzleDetail {
  return {
    ...puzzleSummary(puzzle),
    initial: puzzle.initial,
    ...(puzzle.variant === XIANGQI_SPEC_ID && puzzle.sourceGame
      ? { sourceGame: puzzle.sourceGame }
      : {}),
  };
}

function parsePuzzleMoves(value: unknown): PublicPuzzleMove[] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const moves: PublicPuzzleMove[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const move = raw as Record<string, unknown>;
    if (typeof move.drop === 'string' && typeof move.to === 'string') {
      moves.push({ drop: move.drop, to: move.to } as PublicPuzzleMove);
      continue;
    }
    if (typeof move.from === 'string' && typeof move.to === 'string') {
      moves.push({ from: move.from, to: move.to } as PublicPuzzleMove);
      continue;
    }
    return null;
  }
  return moves;
}
