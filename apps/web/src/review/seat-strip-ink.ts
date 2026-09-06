import { type ReviewSeatColors, reviewColorForSeat } from './review-seat-colors.js';

/**
 * Which INK each seat strip renders, given a variant's perspective mapping.
 *
 * Tiny, but it exists as its own named thing because getting it wrong is silent.
 * The strips used to be painted from an `isRed` boolean -- "is this the variant's
 * first mover?" -- and every red/black variant made that look right. Chess does
 * not: its unflipped side is WHITE, so the white player's disc was painted RED on
 * every fog-chess review page, and no test noticed because nothing rendered the
 * strip at all.
 *
 * `perspective(false)` is the variant's unflipped side ('white' for the chess
 * family, 'red' for the xiangqi/jungle families) and `perspective(true)` the other,
 * so asking it twice yields the real ink for both slots and hardcodes no colour.
 *
 * Flip variants (Banqi, Flip Jungle) return a move-order SEAT here, not the ink
 * their opening flip bound, so what comes out still has to go through
 * `seatStripDisplayInk` before it is painted.
 */
export function seatStripInks<Color>(
  perspective: (flipped: boolean) => Color,
  flipped: boolean,
): { top: Color; bottom: Color } {
  // Bottom is the side the reader looks from, which is what `flipped` selects.
  return { bottom: perspective(flipped), top: perspective(!flipped) };
}

/** A seat whose ink nobody owns yet, because the opening flip has not happened. */
export const UNBOUND_SEAT_INK = 'unbound';

/**
 * What a seat strip actually paints.
 *
 * The strips were the LAST surface still painting a raw seat: on a finished Banqi
 * game they said Guest was black and Misty red while the meta card two inches away
 * said the reverse, and the meta card was right — it resolves through `seatColors`,
 * the mapping the opening flip establishes. Half of all flip games came out that
 * way, which is what makes this class of bug so easy to look at and not see.
 *
 * `bindsOnFlip` with no mapping yet is the honest pre-flip state: the seats exist,
 * the players are known, and nobody owns a colour. It renders neutral rather than
 * guessing, which is the same call the meta card and the /watch rows already make.
 */
export function seatStripDisplayInk(
  seat: string,
  seatColors: ReviewSeatColors | undefined,
  bindsOnFlip: boolean,
): string {
  // Chess hands us 'white' already — an ink, not a slot, so there is nothing to map.
  if (seat !== 'red' && seat !== 'black') return seat;
  if (bindsOnFlip && !seatColors) return UNBOUND_SEAT_INK;
  return reviewColorForSeat(seat, seatColors);
}
