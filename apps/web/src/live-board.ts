import { hiddenSquareClasses } from '@mistboard/board-render/interactive';
import type { Color, Move, PlayerView, Square } from '@mistboard/game';
import type * as cg from 'chessground/types';
import { isLive } from './live-replay.js';
import { liveState } from './live-state.js';
import { files } from './web-utils.js';

export function boardHighlightClasses(view: PlayerView, orientation: Color): cg.SquareClasses {
  const classes = hiddenSquareClasses(view, orientation, { preserveFogOnFinished: true });
  const finishSquare = finalMovePulseSquare(view);
  if (finishSquare) appendSquareClass(classes, finishSquare, 'game-finish-square');
  return classes;
}

export function boardResultClass(view: PlayerView | null): string | null {
  if (view?.status.type !== 'finished' || !isLive()) return null;

  const winner = view.status.winner;
  if (!winner) return null;

  const seat = liveState.seat;
  if ((seat === 'white' || seat === 'black') && winner !== seat) return null;

  return `king-celebrating-${winner}`;
}

export function legalDests(view: PlayerView): cg.Dests {
  const dests = new Map<cg.Key, cg.Key[]>();
  for (const move of view.legalMoves) {
    const from = move.from as cg.Key;
    const to = move.to as cg.Key;
    dests.set(from, [...(dests.get(from) ?? []), to]);
  }
  addCastlingDestinationAliases(view, dests);
  return dests;
}

export function castlingKingDestinationFromView(view: PlayerView, move: Move): Square | null {
  const piece = view.board[move.from];
  const rook = view.board[move.to];
  if (piece?.role !== 'king' || !rook || rook.role !== 'rook' || rook.color !== piece.color)
    return null;
  if (rankOf(move.from) !== rankOf(move.to)) return null;
  return `${squareFileIndex(move.to) > squareFileIndex(move.from) ? 'g' : 'c'}${rankOf(move.from)}` as Square;
}

export function squareFileIndex(square: Square): number {
  return files.indexOf(square[0] as (typeof files)[number]);
}

function finalMovePulseSquare(view: PlayerView): Square | null {
  if (view.status.type !== 'finished' || view.status.reason !== 'king-captured') return null;
  return view.lastMove?.to ?? null;
}

function appendSquareClass(classes: cg.SquareClasses, square: Square, className: string): void {
  const key = square as cg.Key;
  const existing = classes.get(key);
  classes.set(key, existing ? `${existing} ${className}` : className);
}

function addCastlingDestinationAliases(view: PlayerView, dests: cg.Dests): void {
  for (const move of view.legalMoves) {
    const alias = castlingKingDestinationFromView(view, move);
    if (!alias) continue;
    const from = move.from as cg.Key;
    const current = dests.get(from) ?? [];
    if (!current.includes(alias as cg.Key)) dests.set(from, [...current, alias as cg.Key]);
  }
}

function rankOf(square: Square): string {
  return square[1] ?? '';
}
