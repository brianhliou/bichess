// Static exchange evaluation for standard xiangqi, and the one-ply material
// facts a positive move classifier needs: what a move captured, what it left
// en prise, and whether that was already so before the move.
//
// Everything here is STATIC. It reads the board before and after ONE move and
// never a later ply. That is deliberate. Three earlier "sacrifice" detectors
// read the material balance over the plies that followed, and each was wrong
// in its own way (packages/game/fixtures/xiangqi-move-classification/
// known-cases.json): a chariot capture read as a nine-point sacrifice because
// an unrelated exchange three plies later dipped the balance; a quiet move
// inherited the swing of two later captures; a losing trade read as a
// sacrifice because material really was lost. None of those can happen here,
// because nothing after the move is consulted. What the opponent can win by
// capturing is settled by a swap-list exchange on each square, the way an
// engine's SEE settles it, and a piece that was already en prise before the
// move is not something this move offered.

import type { Square as EoSquare } from 'elephantops';
import { attacks as eoAttacks } from 'elephantops/attacks';
import type { Board as EoBoard } from 'elephantops/board';
import type { SquareSet } from 'elephantops/squareSet';
import {
  makeSquare as eoMakeSquare,
  parseSquare as eoParseSquare,
  opposite,
} from 'elephantops/util';
import {
  boardToEoBoard,
  coordOf,
  hasCrossedRiver,
  type XiangqiBoard,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPieceRole,
  type XiangqiSquare,
} from './variants-xiangqi.js';
import {
  applyStandardXiangqiMove,
  getStandardXiangqiLegalMoves,
  isStandardXiangqiGeneralInCheck,
} from './variants-xiangqi-standard.js';

// Conventional exchange values (chariot 9, cannon 4.5, horse 4, advisor and
// elephant 2, soldier 1, 2 once over the river). The general is priced so that
// no exchange ever prefers to lose it; it never appears as a hanging piece
// because standard legal play cannot leave it capturable.
export const XIANGQI_EXCHANGE_VALUE: Readonly<Record<XiangqiPieceRole, number>> = {
  chariot: 9,
  cannon: 4.5,
  horse: 4,
  advisor: 2,
  elephant: 2,
  soldier: 1,
  general: 1000,
};

export function xiangqiExchangeValue(piece: XiangqiPiece, square: XiangqiSquare): number {
  if (piece.role === 'soldier' && hasCrossedRiver(piece.color, coordOf(square).rank)) return 2;
  return XIANGQI_EXCHANGE_VALUE[piece.role];
}

export type XiangqiExchange = {
  /** Material `attacker` wins by opening a capture on the square (0 when no capture pays). */
  gain: number;
  /** The least valuable piece that opens the exchange, or null when nothing can capture. */
  capturer: XiangqiSquare | null;
};

type Occupancy = { eo: EoBoard; occupied: SquareSet };

function attackersOf(
  { eo, occupied }: Occupancy,
  target: EoSquare,
  color: XiangqiColor,
): EoSquare[] {
  const out: EoSquare[] = [];
  for (const from of occupied) {
    const piece = eo.get(from);
    if (!piece || piece.color !== color) continue;
    if (eoAttacks(piece, from, occupied).has(target)) out.push(from);
  }
  return out;
}

function valueAtEo(board: XiangqiBoard, square: EoSquare): number {
  const name = eoMakeSquare(square);
  const piece = board[name];
  return piece ? xiangqiExchangeValue(piece, name) : 0;
}

/**
 * Swap-list static exchange evaluation on `target`, which must hold a piece of
 * the colour opposite to `attacker`. Each side keeps capturing with its least
 * valuable attacker while that pays and stops when it does not; the result is
 * what `attacker` nets by starting. A general joins the exchange only when the
 * square is undefended after it lands (it may not capture into check). Pins
 * and other legality are not modelled beyond that; `firstCapturers` lets the
 * caller restrict the OPENING capture to moves it knows to be legal.
 */
export function xiangqiStaticExchange(
  board: XiangqiBoard,
  target: XiangqiSquare,
  attacker: XiangqiColor,
  opts: { firstCapturers?: ReadonlySet<XiangqiSquare> } = {},
): XiangqiExchange {
  const victim = board[target];
  if (!victim || victim.color === attacker) return { gain: 0, capturer: null };
  const targetEo = eoParseSquare(target);
  if (targetEo === undefined) return { gain: 0, capturer: null };

  const eo = boardToEoBoard(board);
  let occupied = eo.occupied;
  let side: XiangqiColor = attacker;

  const leastValuableAttacker = (opening: boolean): EoSquare | undefined => {
    let candidates = attackersOf({ eo, occupied }, targetEo, side);
    if (opening && opts.firstCapturers) {
      const allowed = opts.firstCapturers;
      candidates = candidates.filter((sq) => allowed.has(eoMakeSquare(sq)));
    }
    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => valueAtEo(board, a) - valueAtEo(board, b));
    const from = candidates[0]!;
    if (eo.get(from)?.role === 'king') {
      // The general may take only if nothing recaptures: that would be moving into check.
      const defended =
        attackersOf({ eo, occupied: occupied.without(from) }, targetEo, opposite(side)).length > 0;
      if (defended) return undefined;
    }
    return from;
  };

  let from = leastValuableAttacker(true);
  if (from === undefined) return { gain: 0, capturer: null };
  const capturer = eoMakeSquare(from);

  const gains: number[] = [xiangqiExchangeValue(victim, target)];
  let depth = 0;
  while (from !== undefined) {
    depth += 1;
    gains[depth] = valueAtEo(board, from) - gains[depth - 1]!;
    occupied = occupied.without(from);
    side = opposite(side);
    from = leastValuableAttacker(false);
  }
  for (let i = depth - 1; i >= 1; i -= 1) {
    gains[i - 1] = -Math.max(-gains[i - 1]!, gains[i]!);
  }
  return { gain: Math.max(0, gains[0]!), capturer };
}

export type XiangqiEnPrise = {
  square: XiangqiSquare;
  piece: XiangqiPiece;
  value: number;
  /** What the opponent nets by taking it, exchange included. */
  gain: number;
  capturer: XiangqiSquare;
};

/**
 * Every piece of `owner` (generals excluded) that the other side can take at a
 * profit. `legalCaptures`, when given, restricts each opening capture to the
 * from-squares that are actually legal; without it the attack geometry alone
 * decides, which is the right reading for a side that is not on move.
 */
export function xiangqiEnPrisePieces(
  board: XiangqiBoard,
  owner: XiangqiColor,
  legalCaptures?: ReadonlyMap<XiangqiSquare, ReadonlySet<XiangqiSquare>>,
): XiangqiEnPrise[] {
  const taker = opposite(owner);
  const out: XiangqiEnPrise[] = [];
  for (const [name, piece] of Object.entries(board) as Array<[XiangqiSquare, XiangqiPiece]>) {
    if (piece.color !== owner || piece.role === 'general') continue;
    const firstCapturers = legalCaptures ? (legalCaptures.get(name) ?? new Set()) : undefined;
    if (firstCapturers && firstCapturers.size === 0) continue;
    const { gain, capturer } = xiangqiStaticExchange(board, name, taker, { firstCapturers });
    if (gain <= 0 || !capturer) continue;
    out.push({ square: name, piece, value: xiangqiExchangeValue(piece, name), gain, capturer });
  }
  return out;
}

export type XiangqiMoveMaterial = {
  /** Exchange value of the piece the move captured (0 for a quiet move). */
  captured: number;
  /**
   * The most the opponent can now win, exchange included, that this move is
   * responsible for: net of what the move captured, and net of what the piece
   * was already exposed to before the move (where it stood, for the piece that
   * moved). 0 when the move offers nothing.
   */
  offered: number;
  /** The piece behind `offered`, or null when nothing is offered. */
  offeredPiece: { square: XiangqiSquare; role: XiangqiPieceRole; capturer: XiangqiSquare } | null;
  /** Everything of the mover's the opponent can profitably take after the move. */
  enPriseAfter: XiangqiEnPrise[];
};

function legalCaptureMap(state: XiangqiGameState): Map<XiangqiSquare, Set<XiangqiSquare>> {
  const map = new Map<XiangqiSquare, Set<XiangqiSquare>>();
  for (const move of getStandardXiangqiLegalMoves(state)) {
    if (!state.board[move.to]) continue;
    let froms = map.get(move.to);
    if (!froms) {
      froms = new Set();
      map.set(move.to, froms);
    }
    froms.add(move.from);
  }
  return map;
}

/**
 * The static material story of one legal move in a standard xiangqi position:
 * what it took, and what it left the opponent able to take that they could not
 * take before. Throws when the move is not legal from `before`.
 */
export function xiangqiMoveMaterial(
  before: XiangqiGameState,
  move: XiangqiMove,
): XiangqiMoveMaterial {
  if (before.status.type !== 'playing') throw new Error('xiangqiMoveMaterial: game is not in play');
  const mover = before.status.turn;
  const after = applyStandardXiangqiMove(before, move);
  if (after === before) throw new Error(`xiangqiMoveMaterial: illegal move ${move.from}${move.to}`);

  const victim = before.board[move.to];
  const captured = victim ? xiangqiExchangeValue(victim, move.to) : 0;

  // Before the move the mover is on move, so "en prise" is what the opponent
  // could take if handed the move: attack geometry, no legality filter.
  const exposedBefore = new Map<XiangqiSquare, number>();
  for (const piece of xiangqiEnPrisePieces(before.board, mover)) {
    exposedBefore.set(piece.square, piece.gain);
  }

  const enPriseAfter =
    after.status.type === 'playing'
      ? xiangqiEnPrisePieces(after.board, mover, legalCaptureMap(after))
      : [];

  let offered = 0;
  let offeredPiece: XiangqiMoveMaterial['offeredPiece'] = null;
  for (const piece of enPriseAfter) {
    const priorExposure =
      piece.square === move.to
        ? (exposedBefore.get(move.from) ?? 0)
        : (exposedBefore.get(piece.square) ?? 0);
    const net = piece.gain - captured - priorExposure;
    if (net > offered) {
      offered = net;
      offeredPiece = { square: piece.square, role: piece.piece.role, capturer: piece.capturer };
    }
  }
  return { captured, offered, offeredPiece, enPriseAfter };
}

/** Exchange value of `color`'s pieces minus the other side's. */
export function xiangqiMaterialBalance(board: XiangqiBoard, color: XiangqiColor): number {
  let balance = 0;
  for (const [name, piece] of Object.entries(board) as Array<[XiangqiSquare, XiangqiPiece]>) {
    if (piece.role === 'general') continue;
    const value = xiangqiExchangeValue(piece, name);
    balance += piece.color === color ? value : -value;
  }
  return balance;
}

export type XiangqiLineSettlement = {
  /** The line's first move takes a piece of `mover`'s. */
  firstTakes: boolean;
  /** `mover`'s material balance where the line goes quiet (or ends). */
  settledBalance: number;
  /** Line plies actually replayed (an illegal continuation stops the replay). */
  plies: number;
  /** The line ends with `mover` having delivered mate (or the opponent stalemated). */
  matesOpponent: boolean;
};

/**
 * Follow a line (an engine PV) from `state` and report where `mover`'s
 * material balance settles: the first point after which two consecutive plies
 * neither capture nor give check, or the line's end, within `maxPlies`. A
 * check keeps a sequence forcing (the chariot that mates in six checks and
 * wins the piece back on the way has not "gone quiet" after two of them).
 * This is how an apparent sacrifice is told from a trade the engine already
 * sees through: along the engine's own reply the material either comes back
 * or it does not. The line is the engine's answer to the move, so, unlike the
 * game record, nothing in it is unrelated to the move.
 */
export function xiangqiSettleAlongLine(
  state: XiangqiGameState,
  line: readonly XiangqiMove[],
  mover: XiangqiColor,
  maxPlies = 10,
): XiangqiLineSettlement {
  let current = state;
  let quiet = 0;
  let plies = 0;
  let firstTakes = false;
  let matesOpponent = false;
  let settledBalance = xiangqiMaterialBalance(state.board, mover);
  for (const move of line) {
    if (plies >= maxPlies || current.status.type !== 'playing') break;
    const victim = current.board[move.to];
    const next = applyStandardXiangqiMove(current, move);
    if (next === current) break;
    if (plies === 0) firstTakes = victim?.color === mover;
    plies += 1;
    current = next;
    if (victim) settledBalance = xiangqiMaterialBalance(current.board, mover);
    if (current.status.type === 'finished') {
      matesOpponent = current.status.winner === mover;
      break;
    }
    const forcing =
      victim !== undefined ||
      (current.status.type === 'playing' &&
        isStandardXiangqiGeneralInCheck(current, current.status.turn));
    quiet = forcing ? 0 : quiet + 1;
    if (quiet >= 2) break;
  }
  return { firstTakes, settledBalance, plies, matesOpponent };
}
