// Jungle Chess (Dou Shou Qi) adapter for the shared GameTree spine. Jungle is
// PERFECT-INFORMATION (nothing hidden), so like the standard-xiangqi adapter
// `project` returns a single truth view (length 1) and the client reconstructs
// every position from the move list (it matches the server truth). Every hook is a
// one-liner over the existing `@mistboard/game` jungle kernel — the same functions
// the live/replay pipeline already uses. This is the second concrete
// VariantTreeAdapter and the first non-xiangqi consumer of mountTreeReview.

import {
  ALL_JUNGLE_SQUARES,
  applyJungleMove,
  createInitialJungleState,
  getJunglePlayerView,
  isJungleLegalMove,
  type JungleGameState,
  type JungleMove,
  type JunglePlayerView,
  type JungleSquare,
} from '@mistboard/game';
import type { ProjectedView, VariantTreeAdapter } from './game-tree.js';

const JUNGLE_SQUARE_SET = new Set<string>(ALL_JUNGLE_SQUARES);

/** A JungleSquare is exactly `${file}${rank}` (2 chars); validate against the
 *  enumerated set rather than trusting a substring. */
function parseJungleSquare(token: string): JungleSquare | null {
  return JUNGLE_SQUARE_SET.has(token) ? (token as JungleSquare) : null;
}

export const jungleTreeAdapter: VariantTreeAdapter<JungleMove, JungleGameState, JunglePlayerView> =
  {
    mode: 'perfect-info',
    initialTruth: () => createInitialJungleState('analysis'),
    isLegal: (truth, move) => truth.status.type === 'playing' && isJungleLegalMove(truth, move),
    // applyJungleMove returns `state` unchanged on an illegal move; the tree only
    // calls this after isLegal, so the successor is always the real move result.
    applyMove: (truth, move) => applyJungleMove(truth, move),
    project: (truth): ProjectedView<JunglePlayerView>[] => [
      {
        key: 'truth',
        label: 'Board',
        tier: 'primary',
        // Open information → the "player view" is the full truth. Project for the
        // SIDE TO MOVE so the view's legalMoves are populated for the color the
        // interactive board is about to play (a fixed 'red' projection would leave
        // black with no legal moves at odd plies, rejecting every black move).
        view: getJunglePlayerView(
          truth,
          truth.status.type === 'playing' ? truth.status.turn : 'red',
        ),
      },
    ],
    moveLabel: (move) => `${move.from}-${move.to}`,
    // Jungle's engine is server-only and the review board runs no client ceval, so
    // there is no engine UCI dialect to honor: a from+to concatenation is a stable,
    // reversible key for the NodeId + sibling dedup, and `fromUci` splits it back.
    moveKey: (move) => `${move.from}${move.to}`,
    toEngineUci: (move) => `${move.from}${move.to}`,
    fromUci: (uci) => {
      if (uci.length !== 4) return null;
      const from = parseJungleSquare(uci.slice(0, 2));
      const to = parseJungleSquare(uci.slice(2, 4));
      return from && to ? { from, to } : null;
    },
  };
