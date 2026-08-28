// Positive move annotations for standard xiangqi: `!!` (brilliant) and `!`
// (great), the two glyphs the review tree renders but nothing computed until
// now. The negative judgments (blunder / mistake / inaccuracy) stay in
// analysis.ts, a port of lichess; lichess computes no positive glyph at all.
//
// The rules follow chess.com's published Game Review definitions, which every
// open-source clone with a real rule (WintrCat's freechess, en-croissant,
// Brilliant-Chess) converges on:
//
//   Brilliant  "a good piece sacrifice": the engine's choice or nearly, a piece
//              left to be taken at a profit, the mover not worse afterwards,
//              and not "completely winning even if you hadn't found the move".
//   Great      "the only good move": the engine's choice, every alternative at
//              least a mistake worse, and the opponent's last move an error it
//              punishes.
//
// What this deliberately does NOT do is model how hard a move was for a human
// to see. A 2026-08-28 attempt used a weak engine budget as a stand-in for a
// human and measured that it disagrees with the strong search exactly when the
// choice does not matter, never when it does (docs-private/
// xiangqi-positive-annotations-research.md, issue #314). The published work
// that does model it (arXiv 2406.11895) rests on Maia, an engine trained on
// human games; xiangqi has none. chess.com dropped its own "engine needed
// depth" criterion for the sacrifice rule for the same reason: a sacrifice is
// a move that looks wrong and is right, which is the perceptual gap written
// into the position itself.
//
// The sacrifice test is STATIC (xiangqi-exchange.ts): one ply, exchange-
// evaluated, net of what the move captured and of what the piece was already
// exposed to. Three earlier detectors read the material balance over later
// plies and were each wrong in a different way; the fixture that records them
// is the first acceptance test (packages/game/fixtures/
// xiangqi-move-classification/known-cases.json).

import type { XiangqiGameState, XiangqiMove } from './variants-xiangqi.js';
import {
  applyStandardXiangqiMove,
  getStandardXiangqiLegalMoves,
  isStandardXiangqiGeneralInCheck,
} from './variants-xiangqi-standard.js';
import {
  type XiangqiEnPrise,
  type XiangqiLineSettlement,
  type XiangqiMoveMaterial,
  xiangqiEnPrisePieces,
  xiangqiMaterialBalance,
  xiangqiMoveMaterial,
  xiangqiSettleAlongLine,
  xiangqiStaticExchange,
} from './xiangqi-exchange.js';

export type XiangqiPositiveGlyph = 'brilliant' | 'great';

export const XIANGQI_POSITIVE_GLYPH_SYMBOL: Readonly<Record<XiangqiPositiveGlyph, string>> = {
  brilliant: '!!',
  great: '!',
};

/** NAG codes for the two glyphs (1 = `!`, 3 = `!!`), the codes the review tree stores. */
export const XIANGQI_POSITIVE_GLYPH_NAG: Readonly<Record<XiangqiPositiveGlyph, number>> = {
  brilliant: 3,
  great: 1,
};

export type XiangqiPositiveThresholds = {
  /** Least net exchange value a move must offer to count as a sacrifice. */
  sacrificeMin: number;
  /** "Nearly best": at most this many win% points (mover POV) below the engine's best. */
  nearBestDrop: number;
  /**
   * Brilliant needs a position not already won without the move: the SECOND
   * best line's win% (or, without MultiPV, the position's) at most this.
   */
  brilliantMaxWinWithout: number;
  /**
   * And the mover not worse after it (freechess: eval >= 0). A piece given up
   * from a bad position is nearly always the least bad concession, not an
   * offer; this bound is what keeps those out.
   */
  brilliantMinWinAfter: number;
  /** Great needs every alternative at least a mistake: second-best this many win% points below. */
  greatOnlyMoveGap: number;
  /** And an opponent error to punish: the mover's win% up by this much over two plies. */
  greatMinPunish: number;
  /** A capture that wins this much by static exchange is taking what was left, not finding a move. */
  greatObviousCapture: number;
  /**
   * Great ends with the mover at least equal (chess.com: "turning a losing
   * position into an equal one, an equal position into a winning one"). An
   * only-move that merely holds a worse position is defence, and a general or
   * elephant dodging for its life will be the only move ply after ply.
   */
  greatMinWinAfter: number;
  /** Great in a won position is bookkeeping, not greatness: win% before at most this. */
  greatMaxWinBefore: number;
};

// win% <-> cp under the lichess curve analysis.ts uses (K = 0.00368):
//   90% ~ +600cp, 80% ~ +375cp, 65% ~ +190cp, 50% = 0cp, 35% ~ -190cp, 15% ~ -375cp.
// The 10-point only-move gap is lila's mistake threshold ("every other move was
// at least a mistake"); the 5-point punish floor is its inaccuracy threshold.
export const XIANGQI_POSITIVE_THRESHOLDS: Readonly<XiangqiPositiveThresholds> = {
  sacrificeMin: 2,
  nearBestDrop: 2,
  brilliantMaxWinWithout: 90,
  brilliantMinWinAfter: 50,
  greatOnlyMoveGap: 10,
  greatMinPunish: 5,
  greatObviousCapture: 2,
  greatMinWinAfter: 50,
  greatMaxWinBefore: 90,
};

export type XiangqiMoveClassificationInput = {
  /** The position the move was played from (mover to play). */
  before: XiangqiGameState;
  move: XiangqiMove;
  /** Mover-POV win% of the position before the move (the engine's best line). */
  winBefore: number;
  /** Mover-POV win% of the position after the played move. */
  winAfter: number;
  /** The played move is the engine's top choice for `before`. */
  playedBest: boolean;
  /**
   * Mover-POV win% of the engine's SECOND-best move from `before` (MultiPV),
   * when known. Without it `great` can never fire; `brilliant` does not need it.
   */
  secondBestWin?: number | null;
  /**
   * Mover-POV win% of the position two plies earlier (before the opponent's
   * last move), when known: the difference to `winBefore` is the error the
   * move punishes. Without it `great` can never fire.
   */
  winTwoPliesAgo?: number | null;
  /**
   * The engine's principal variation from the position AFTER the move (the
   * opponent's reply first), when known. When it takes the offered piece it
   * settles whether that was a sacrifice or a trade the engine sees through:
   * along the engine's own reply the material either comes back or it does
   * not. A line that declines the piece settles nothing by itself (an even
   * trade is declined as readily as a poisoned piece), so `pvAfterCapture` is
   * needed then.
   */
  pvAfter?: readonly XiangqiMove[] | null;
  /**
   * The engine's line from the position after the opponent TAKES the offered
   * piece (`material.offeredPiece.capturer` x `square`), when the PV declined
   * it. The same material test runs along this line. Without it a declined
   * offer stays unverified and gets no glyph.
   */
  pvAfterCapture?: readonly XiangqiMove[] | null;
  thresholds?: Partial<XiangqiPositiveThresholds>;
};

export type XiangqiMoveClassification = {
  glyph: XiangqiPositiveGlyph | null;
  /** Why (or why not), in a fixed vocabulary, so a corpus scan can be tabulated. */
  reason: string;
  material: XiangqiMoveMaterial;
  /**
   * What the move actually gave up: the mover's material still down where the
   * engine's line (the PV when it takes, else the capture line) goes quiet,
   * capped at what was offered; the full offer when that line mates the
   * opponent first. 0 for a trade, and when nothing was offered or nothing
   * could be verified.
   */
  sacrifice: number;
  /** How `sacrifice` was settled. */
  sacrificeEvidence: 'none' | 'pv-takes' | 'capture-line' | 'unverified';
  inCheck: boolean;
  legalMoves: number;
  /** A piece of the mover's was en prise before the move and is not after it. */
  rescued: boolean;
};

function rescuedPiece(
  move: XiangqiMove,
  exposedBefore: readonly XiangqiEnPrise[],
  enPriseAfter: readonly XiangqiEnPrise[],
  minValue: number,
): boolean {
  const afterSquares = new Set(enPriseAfter.map((piece) => piece.square));
  for (const piece of exposedBefore) {
    if (piece.gain < minValue) continue;
    const now = piece.square === move.from ? move.to : piece.square;
    if (!afterSquares.has(now)) return true;
  }
  return false;
}

export function classifyXiangqiMove(
  input: XiangqiMoveClassificationInput,
): XiangqiMoveClassification {
  const t: XiangqiPositiveThresholds = { ...XIANGQI_POSITIVE_THRESHOLDS, ...input.thresholds };
  const { before, move, winBefore, winAfter, playedBest } = input;
  if (before.status.type !== 'playing') throw new Error('classifyXiangqiMove: game is not in play');
  const mover = before.status.turn;

  const material = xiangqiMoveMaterial(before, move);
  const legalMoves = getStandardXiangqiLegalMoves(before).length;
  const inCheck = isStandardXiangqiGeneralInCheck(before, mover);
  const exposedBefore = xiangqiEnPrisePieces(before.board, mover);
  const rescued = rescuedPiece(move, exposedBefore, material.enPriseAfter, t.sacrificeMin);
  let sacrifice = 0;
  let sacrificeEvidence: XiangqiMoveClassification['sacrificeEvidence'] = 'none';
  if (material.offered > 0 && material.offeredPiece) {
    sacrificeEvidence = 'unverified';
    const balanceBefore = xiangqiMaterialBalance(before.board, mover);
    const givenUp = (settled: XiangqiLineSettlement): number =>
      settled.matesOpponent
        ? material.offered
        : Math.max(0, Math.min(material.offered, balanceBefore - settled.settledBalance));
    const after = applyStandardXiangqiMove(before, move);
    const pv = input.pvAfter ?? null;
    if (pv && pv.length > 0 && after.status.type === 'playing') {
      const settled = xiangqiSettleAlongLine(after, pv, mover);
      if (settled.plies > 0 && settled.firstTakes) {
        sacrifice = givenUp(settled);
        sacrificeEvidence = 'pv-takes';
      }
    }
    const captureLine = input.pvAfterCapture ?? null;
    if (sacrificeEvidence === 'unverified' && captureLine && after.status.type === 'playing') {
      const { capturer, square } = material.offeredPiece;
      const taken = applyStandardXiangqiMove(after, { from: capturer, to: square });
      if (taken !== after) {
        const settled = xiangqiSettleAlongLine(taken, captureLine, mover);
        sacrifice = givenUp(settled);
        sacrificeEvidence = 'capture-line';
      }
    }
  }

  const base = { material, sacrifice, sacrificeEvidence, inCheck, legalMoves, rescued };
  const nearBest = playedBest || winBefore - winAfter <= t.nearBestDrop;
  if (!nearBest) return { glyph: null, reason: 'not-best', ...base };
  // A move made in check, or with no alternative, was forced, whatever it gave up.
  if (inCheck) return { glyph: null, reason: 'in-check', ...base };
  if (legalMoves < 2) return { glyph: null, reason: 'forced', ...base };

  // Only a PIECE offered counts: an advisor, elephant or soldier left to take is
  // most often the price of a defensive move, and never what an annotator means
  // by a sacrifice on its own.
  const offeredRole = material.offeredPiece?.role;
  const offersPiece =
    offeredRole === 'chariot' || offeredRole === 'cannon' || offeredRole === 'horse';
  const second = input.secondBestWin ?? null;
  if (offersPiece && material.offered >= t.sacrificeMin && sacrifice < t.sacrificeMin) {
    return {
      glyph: null,
      reason: sacrificeEvidence === 'unverified' ? 'sacrifice-unverified' : 'sacrifice-recovered',
      ...base,
    };
  }
  if (offersPiece && sacrifice >= t.sacrificeMin) {
    // "Completely winning even if you hadn't found the move" is the second-best
    // line when we have it; the position itself is the stand-in when we do not.
    const winWithout = second ?? winBefore;
    if (winWithout > t.brilliantMaxWinWithout) {
      return { glyph: null, reason: 'sacrifice-already-winning', ...base };
    }
    if (winAfter < t.brilliantMinWinAfter) {
      return { glyph: null, reason: 'sacrifice-worse-after', ...base };
    }
    return {
      glyph: 'brilliant',
      reason: `sacrifice:${offeredRole}@${material.offeredPiece?.square}`,
      ...base,
    };
  }

  if (second == null) return { glyph: null, reason: 'no-second-best', ...base };
  if (!playedBest) return { glyph: null, reason: 'not-top-choice', ...base };
  if (winBefore - second < t.greatOnlyMoveGap) {
    return { glyph: null, reason: 'alternatives-exist', ...base };
  }
  const twoAgo = input.winTwoPliesAgo ?? null;
  if (twoAgo == null) return { glyph: null, reason: 'no-prior-eval', ...base };
  if (winBefore - twoAgo < t.greatMinPunish) {
    return { glyph: null, reason: 'nothing-to-punish', ...base };
  }
  // Only-moves that take what was left hanging, take back on the square just
  // captured on, or step a piece out of a threat are the obvious kind; the
  // glyph is for the other kind.
  if (material.captured > 0) {
    if (before.lastMove?.to === move.to) return { glyph: null, reason: 'recapture', ...base };
    if (xiangqiStaticExchange(before.board, move.to, mover).gain >= t.greatObviousCapture) {
      return { glyph: null, reason: 'free-capture', ...base };
    }
  }
  if (rescued) return { glyph: null, reason: 'only-move-rescue', ...base };
  if (winBefore > t.greatMaxWinBefore) {
    return { glyph: null, reason: 'only-move-already-winning', ...base };
  }
  if (winAfter < t.greatMinWinAfter)
    return { glyph: null, reason: 'only-move-still-worse', ...base };
  return { glyph: 'great', reason: 'only-move', ...base };
}
