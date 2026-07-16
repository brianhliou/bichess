import type { GameEvent, Move } from '@mistboard/game';
import './game-shell.css';
import './landing.css';
import './game-route.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*) the other fog
// variants ride; the board renderer + its fog theme live in our own files.
import './dark-xiangqi-postgame.css';
import { mountDarkChessReview } from './review/dark-chess-review.js';
import { buildReviewMeta, labelize, reviewResultLabel } from './review/game-review-meta.js';
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

export function mountDarkChessPostgame(
  root: HTMLElement,
  game: FeaturedGame,
  events: GameEvent[],
): void {
  setBoardFamily('chess');
  // Route class matches the fog siblings so the shared dxq-postgame heading
  // colors (var(--site-heading)) apply on this dark-themed review page.
  root.classList.add('landing-page', 'game-route', 'dark-chess-postgame-route');

  const moves: Move[] = events
    .filter((event): event is Extract<GameEvent, { type: 'move-played' }> => {
      return event.type === 'move-played';
    })
    .map((event) => event.move);

  const status = `${reviewResultLabel(game.result)} by ${labelize(game.termination)}`;
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
    // No client/server whole-game analysis for fog yet (the fog engine is a
    // separate worker piece); the review is the interactive triptych + tree.
    analysis: null,
  });
}
