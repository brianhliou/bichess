import { darkChessFen, type GameEvent, type Move } from '@mistboard/game';
import './game-shell.css';
import './landing.css';
import './game-route.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*) the other fog
// variants ride; the board renderer + its fog theme live in our own files.
import './dark-xiangqi-postgame.css';
import { crosstableConfig } from './review/crosstable.js';
import { mountDarkChessReview } from './review/dark-chess-review.js';
import { gameExportShareExtra } from './review/game-export-links.js';
import {
  buildReviewMeta,
  reviewOutcomeLine,
  reviewResultLabel,
} from './review/game-review-meta.js';
import { analysisHref, editorHref } from './review/position-links.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

// Postgame review for the flagship Dark Chess (8x8 fog-of-war chess). The
// interactive tree reconstructs every position — the fully-revealed truth board
// plus each seat's fogged POV — CLIENT-side by replaying the true move list through
// the fog kernel, and lets the reviewer branch alternate lines. This is the
// chess-family sibling of the Fog Xiangqi review; both ride the shared tree
// controller (mountTreeReview) via their own presentation bundle.

type FeaturedGame = {
  roomId: string;
  variant: string;
  result: string;
  termination: string;
  plyCount: number;
  whiteName: string | null;
  blackName: string | null;
  endedAt?: string;
  rated?: boolean;
  initialMs?: number | null;
  incrementMs?: number | null;
  timeControl?: Record<string, unknown> | null;
  players?: Array<{
    color: string;
    name: string;
    rating: number | null;
    kind: 'account' | 'guest' | 'engine';
  }>;
};

type MovePlayedEvent = Extract<GameEvent, { type: 'move-played' }>;

function isMovePlayed(event: GameEvent): event is MovePlayedEvent {
  return event.type === 'move-played';
}

// Per-ply think time for the Move times tab. The live stack stamps thinkTimeMs
// on every move; older logs fall back to consecutive event timestamps, the
// first ply measured from the earliest event, as the xiangqi siblings do.
function moveTimesFromEvents(
  events: GameEvent[],
  moveEvents: MovePlayedEvent[],
): number[] | undefined {
  let prevAt = events[0]?.at ?? moveEvents[0]?.at ?? 0;
  const times = moveEvents.map((event) => {
    const delta =
      typeof event.thinkTimeMs === 'number' ? event.thinkTimeMs : Math.max(0, event.at - prevAt);
    prevAt = event.at;
    return delta;
  });
  return times.some((ms) => ms > 0) ? times : undefined;
}

function playerName(game: FeaturedGame, color: 'white' | 'black'): string | undefined {
  const seat = game.players?.find((player) => player.color === color)?.name;
  if (seat) return seat;
  return (color === 'white' ? game.whiteName : game.blackName) ?? undefined;
}

// The shell names its seats red/black (first mover first); for chess the first
// seat plays white, so white's name goes under the `red` key.
function reviewPlayers(game: FeaturedGame): { red?: string; black?: string } {
  const white = playerName(game, 'white');
  const black = playerName(game, 'black');
  return { ...(white ? { red: white } : {}), ...(black ? { black } : {}) };
}

function resultScore(result: string): string {
  if (result === 'white-wins') return '1-0';
  if (result === 'black-wins') return '0-1';
  if (result === 'draw') return '½-½';
  return '*';
}

export function mountDarkChessPostgame(
  root: HTMLElement,
  game: FeaturedGame,
  events: GameEvent[],
): void {
  setBoardFamily('chess');
  // Route class matches the fog siblings so the shared dxq-postgame heading
  // colors (var(--site-heading)) apply on this dark-themed review page.
  root.classList.add('landing-page', 'game-route', 'dark-chess-postgame-route');

  const moveEvents = events.filter(isMovePlayed);
  const moves: Move[] = moveEvents.map((event) => event.move);

  const status = reviewOutcomeLine(reviewResultLabel(game.result), game.termination);
  const { metaCard, details } = buildReviewMeta({
    markerId: 'dark-chess',
    variantName: 'Fog Chess',
    game,
    status,
  });

  root.replaceChildren(buildNav());
  mountDarkChessReview(root, {
    pageClassName: 'dark-chess-review',
    ariaLabel: 'Dark Chess postgame',
    title: 'Dark Chess',
    summary: `${status} · ${game.plyCount} plies`,
    metaCard,
    details,
    moves,
    // Position hand-offs: continue this node on /analysis, or open it in the editor.
    analyseFromHere: (truth) => analysisHref('dark-chess', darkChessFen(truth)),
    boardEditorHref: (truth) => editorHref('dark-chess', darkChessFen(truth)),
    // Underboard parity with the xiangqi-family siblings (lichess anatomy):
    // Move times, Crosstable, and Share & export carrying the PGN/JSON downloads.
    moveTimes: moveTimesFromEvents(events, moveEvents),
    players: reviewPlayers(game),
    result: { score: resultScore(game.result), label: status },
    ...crosstableConfig(game.roomId, game.players),
    // Draft960 is absent from the export table (its PGN needs [SetUp]/[FEN]), so
    // the row is omitted there rather than offering a broken file.
    ...gameExportShareExtra(game.variant, game.roomId),
    // No client/server whole-game analysis for fog yet (the fog engine is a
    // separate worker piece); the review is the interactive triptych + tree.
    analysis: null,
  });
}
