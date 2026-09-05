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
 * Known limit: flip variants (Banqi, Flip Jungle) return a move-order SEAT here,
 * not the ink their opening flip bound, so their strips stay seat-keyed. See
 * flip-seat-ink.ts for the mapping that fixes that on the surfaces which have it.
 */
export function seatStripInks<Color>(
  perspective: (flipped: boolean) => Color,
  flipped: boolean,
): { top: Color; bottom: Color } {
  // Bottom is the side the reader looks from, which is what `flipped` selects.
  return { bottom: perspective(flipped), top: perspective(!flipped) };
}
