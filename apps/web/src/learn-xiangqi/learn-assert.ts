// Xiangqi Learn — success/failure predicate combinators (lila assert.ts port).
// All predicates read AssertData: the truth state after the latest move, the
// remaining apple set, and the scenario/vm flags.

import type { XiangqiColor, XiangqiPieceRole, XiangqiSquare } from '@mistboard/game';
import { isCheckAgainst, oppositeColor, piecesOf } from './learn-rules.js';
import type { LearnAssert } from './learn-types.js';

export const and =
  (...asserts: LearnAssert[]): LearnAssert =>
  (data) =>
    asserts.every((assert) => assert(data));

export const or =
  (...asserts: LearnAssert[]): LearnAssert =>
  (data) =>
    asserts.some((assert) => assert(data));

export const not =
  (assert: LearnAssert): LearnAssert =>
  (data) =>
    !assert(data);

/** A piece of `color` and `role` sits on `square`. */
export const pieceOn =
  (color: XiangqiColor, role: XiangqiPieceRole, square: XiangqiSquare): LearnAssert =>
  ({ state }) => {
    const piece = state.board[square];
    return piece !== undefined && piece.color === color && piece.role === role;
  };

export const pieceNotOn =
  (color: XiangqiColor, role: XiangqiPieceRole, square: XiangqiSquare): LearnAssert =>
  (data) =>
    !pieceOn(color, role, square)(data);

export const noPieceOn =
  (...squares: XiangqiSquare[]): LearnAssert =>
  ({ state }) =>
    squares.every((square) => state.board[square] === undefined);

/** `color` has no pieces left (capture stages: success = extinct('black')). */
export const extinct =
  (color: XiangqiColor): LearnAssert =>
  ({ state }) =>
    piecesOf(state.board, color).length === 0;

/** The opponent's general is in check after the player's move. Reads
 *  playerColor (not state.status.turn) so it is correct on both keepTurn
 *  levels (turn pinned to the player) and turn-alternating strict levels. */
export const check: LearnAssert = ({ state, playerColor }) => {
  if (state.status.type === 'playing') return isCheckAgainst(state, oppositeColor(playerColor));
  // A finished state (strict mode mate) the player delivered was a check.
  return (
    state.status.type === 'finished' &&
    state.status.reason === 'checkmate' &&
    state.status.winner === playerColor
  );
};

/** The player's move checkmated the opponent (strict-mode apply sets the
 *  terminal status; the winner check keeps a scripted opponent's mate from
 *  passing a player-goal assert). */
export const mate =
  (winner?: XiangqiColor): LearnAssert =>
  ({ state }) =>
    state.status.type === 'finished' &&
    state.status.reason === 'checkmate' &&
    (winner === undefined || state.status.winner === winner);

/** The player stalemated the opponent — a WIN in xiangqi (困毙). */
export const stalemateWin =
  (winner?: XiangqiColor): LearnAssert =>
  ({ state }) =>
    state.status.type === 'finished' &&
    state.status.reason === 'stalemate' &&
    (winner === undefined || state.status.winner === winner);

/** Delivered check within the first `nb` player moves (check-in-two). */
export const checkIn =
  (nb: number): LearnAssert =>
  (data) =>
    data.vm.moves <= nb && check(data);

export const noCheckIn =
  (nb: number): LearnAssert =>
  (data) =>
    data.vm.moves >= nb && !check(data);

export const scenarioComplete: LearnAssert = ({ vm }) => vm.scenarioComplete;
export const scenarioFailed: LearnAssert = ({ vm }) => vm.scenarioFailed;

/** All apples collected (the implicit default success for apple levels). */
export const applesEaten: LearnAssert = ({ items }) => items.size === 0;

/** The player still owns a piece of `role` (pawn-stage style guards). */
export const stillHas =
  (color: XiangqiColor, role: XiangqiPieceRole): LearnAssert =>
  ({ state }) =>
    Object.values(state.board).some(
      (piece) => piece !== undefined && piece.color === color && piece.role === role,
    );

/** The player's own general is in check after their move (relaxed-mode
 *  "moved into check" failure for offerIllegalMove levels). */
export const selfCheck =
  (playerColor: XiangqiColor): LearnAssert =>
  ({ state }) =>
    isCheckAgainst(state, playerColor);
