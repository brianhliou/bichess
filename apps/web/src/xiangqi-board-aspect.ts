// The width/height ratio a xiangqi-family board currently renders at.
//
// Every surface that reserves a slot for one of these boards has to agree with
// its SVG viewBox, because the hosts clip with overflow:hidden -- a stale ratio
// silently eats the outer rank rather than letterboxing. That ratio now moves
// with TWO preferences (board layout, and whether coordinates reserve a label
// gutter), which is four combinations per board and far too many literals to
// keep correct by hand. Deriving it from the same geometry the renderer uses is
// the only way the two cannot drift.

import { readDisplayPreferences } from './display-preferences.js';
import { readStoredXiangqiBoardLayout } from './xiangqi-appearance-storage.js';
import { type XiangqiBoardGeometry, xiangqiBoardViewBox } from './xiangqi-board-geometry.js';

/** Current aspect for `geo`, honouring the stored layout and coordinate
 *  preferences. `geo` must carry the board's coordGutter; it is zeroed here
 *  when labels are off, matching what the renderer does. */
export function xiangqiBoardAspect(geo: XiangqiBoardGeometry): number {
  const layout = readStoredXiangqiBoardLayout();
  const withCoords = readDisplayPreferences().boardCoordinates
    ? geo
    : { ...geo, coordGutter: 0 };
  const vb = xiangqiBoardViewBox(layout, withCoords);
  return vb.width / vb.height;
}
