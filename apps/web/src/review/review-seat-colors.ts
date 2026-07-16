export type ReviewSeat = 'red' | 'black';
export type ReviewSeatColors = Readonly<Record<ReviewSeat, ReviewSeat>>;

/** Resolve the ink used to display an analysis seat. Fixed-color games omit the
 * mapping and keep the usual red/black presentation; flip variants supply the
 * binding established by the opening reveal. */
export function reviewColorForSeat(
  seat: ReviewSeat,
  colors: ReviewSeatColors | undefined,
): ReviewSeat {
  return colors?.[seat] ?? seat;
}
