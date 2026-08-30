// One predicate for "draw this piece with the promoted-soldier art", shared by
// every surface that paints a xiangqi-family board square.
//
// It exists because the rule was open-coded at each renderer, and the copies
// drifted: the live board and the video frame had it, the article replay embed,
// the article diagrams and the whole fog surface did not, so the same soldier on
// the same square was a veteran in one place and a raw recruit in another. The
// river test itself belongs to the kernel (hasCrossedRiver), so this only adds
// the role check and gives the renderers a single name to import.
//
// Only the `international` and `international-flat` piece sets have crossed art;
// the rest ignore the flag, which is why passing it is always safe.

import { hasCrossedRiver, type XiangqiColor } from '@mistboard/game';

/**
 * `rank` is the 1-10 board rank (red's back rank is 1), matching coordOf().
 * Face-down pieces must NOT go through this: a jieqi back renders as a soldier
 * placeholder, and promoting it would assert a role the viewer has not seen.
 */
export function drawsCrossedSoldier(
  piece: { readonly color: XiangqiColor; readonly role: string },
  rank: number,
): boolean {
  return piece.role === 'soldier' && hasCrossedRiver(piece.color, rank);
}
