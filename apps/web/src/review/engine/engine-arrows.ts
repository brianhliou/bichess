// Engine output → board-arrow specs for the review board's arrow overlay.
// Pure mapping (no DOM): the review glue feeds these to the interactive board's
// setArrows(). Rank is encoded as visual weight — PV1 heaviest and drawn LAST
// (on top); PV2/PV3 fade and thin out. FSF xiangqi UCI matches our square
// notation, so fsfUciToXiangqiSquares is a plain split.

import { fsfUciToXiangqiSquares } from '@mistboard/game';
import type { XiangqiBoardArrow } from '../../xiangqi-board.js';
import type { CevalLine } from './ceval.js';

/** PV1 can also show the expected reply as a faint dashed second segment (the
 *  "length encodes strength" nod). OFF for now (2026-07-10): the dashed enemy
 *  arrow read as noise next to the ranked candidate arrows. */
export const SHOW_PV1_REPLY_SEGMENT = false;

const MAX_ARROW_LINES = 3;

/** Visual weight by PV rank (index 0 = best line). */
const RANK_STYLE: ReadonlyArray<{ opacity: number; width: number }> = [
  { opacity: 0.9, width: 9 },
  { opacity: 0.55, width: 8 },
  { opacity: 0.35, width: 7 },
];

const REPLY_STYLE = { opacity: 0.25, width: 7, dashed: true } as const;

/** Arrows for the first move of each MultiPV line (up to 3), weakest first so
 *  the strongest renders on top. When enabled, PV1's reply move is prepended as
 *  a faint dashed segment (bottom of the stack). */
export function engineArrowsFromLines(lines: readonly CevalLine[]): XiangqiBoardArrow[] {
  const ranked = [...lines].sort((a, b) => a.multipv - b.multipv).slice(0, MAX_ARROW_LINES);
  const arrows: XiangqiBoardArrow[] = [];
  for (let rank = ranked.length - 1; rank >= 0; rank -= 1) {
    const move = fsfUciToXiangqiSquares(ranked[rank]?.pvUci[0] ?? '');
    if (!move) continue;
    const style = RANK_STYLE[Math.min(rank, RANK_STYLE.length - 1)] ?? RANK_STYLE[0]!;
    arrows.push({ ...move, ...style, className: `xq-arrow--pv${rank + 1}` });
  }
  if (SHOW_PV1_REPLY_SEGMENT) {
    const reply = fsfUciToXiangqiSquares(ranked[0]?.pvUci[1] ?? '');
    if (reply) arrows.unshift({ ...reply, ...REPLY_STYLE, className: 'xq-arrow--pv1-reply' });
  }
  return arrows;
}

/** Single best-move arrow from a whole-game analysis ply (server Pikafish path
 *  or the client sweep — both hand back our square notation). Empty when the
 *  move does not parse. */
export function bestMoveArrow(uci: string | null | undefined): XiangqiBoardArrow[] {
  const move = fsfUciToXiangqiSquares(uci ?? '');
  if (!move) return [];
  const style = RANK_STYLE[0]!;
  return [{ ...move, ...style, className: 'xq-arrow--best' }];
}
