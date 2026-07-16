// Fortress Xiangqi adapter for the shared GameTree spine. Fortress is
// PERFECT-INFORMATION (crazyhouse-style drops, but the full board + both hands are
// public), so like the xiangqi/jungle adapters `project` returns a single truth
// view (length 1) and the client reconstructs every position from the move list
// via applyFortressXiangqiMove (drops in the mainline replay correctly). Every hook
// is a one-liner over the existing @mistboard/game fortress kernel. Unlike Jungle,
// Fortress has a real Fairy-Stockfish engine, so moveKey/toEngineUci are the actual
// FSF UCI dialect (board 'a1b2', drop 'Q@e5'), shared with the engine panel + ceval.

import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiPlayerView,
  fortressXiangqiMoveToFsfUci,
  fsfUciToFortressXiangqiMove,
  getFortressXiangqiPlayerView,
  isFortressXiangqiLegalMove,
} from '@mistboard/game';
import { fortressXiangqiMoveLabel } from '../fortress-xiangqi-view.js';
import type { ProjectedView, VariantTreeAdapter } from './game-tree.js';

export const fortressXiangqiTreeAdapter: VariantTreeAdapter<
  FortressXiangqiMove,
  FortressXiangqiGameState,
  FortressXiangqiPlayerView
> = {
  mode: 'perfect-info',
  initialTruth: () => createInitialFortressXiangqiState('analysis'),
  isLegal: (truth, move) =>
    truth.status.type === 'playing' && isFortressXiangqiLegalMove(truth, move),
  // applyFortressXiangqiMove returns `state` unchanged on an illegal move; the tree
  // only calls this after isLegal, so the successor is always the real result.
  applyMove: (truth, move) => applyFortressXiangqiMove(truth, move),
  project: (truth): ProjectedView<FortressXiangqiPlayerView>[] => [
    {
      key: 'truth',
      label: 'Board',
      tier: 'primary',
      // Open information → project for the SIDE TO MOVE so the view's legalMoves are
      // populated for the color the interactive board is about to play.
      view: getFortressXiangqiPlayerView(
        truth,
        truth.status.type === 'playing' ? truth.status.turn : 'red',
      ),
    },
  ],
  moveLabel: (move) => fortressXiangqiMoveLabel(move),
  // FSF UCI is the canonical NodeId + engine dialect (board 'a1b2', drop 'Q@e5').
  moveKey: (move) => fortressXiangqiMoveToFsfUci(move),
  toEngineUci: (move) => fortressXiangqiMoveToFsfUci(move),
  fromUci: (uci) => fsfUciToFortressXiangqiMove(uci),
};
