// Advantage chart for the review board's underboard slot (P3.5). A win%-per-ply
// curve over a red/black split field: above the midline Red is favoured, below it
// Black. The advantage area is filled in the leading side's colour (the curve
// clipped against each half), lichess-style. Click anywhere to jump to that ply;
// a cursor marks the current ply. Win% (bounded, mate-aware) is used instead of
// raw cp so mates don't spike the axis.
import { winPercent } from '@mistboard/game';
import './advantage-chart.css';
import type { PlyEval } from './game-analysis.js';
import { type ReviewSeatColors, reviewColorForSeat } from './review-seat-colors.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 300;
const VIEW_H = 100;

/** Unique clip-path ids per mounted chart (re-mounts must not collide). */
let chartInstance = 0;

export interface AdvantageChart {
  el: HTMLElement;
  setPly(ply: number): void;
  /** Overlay the decision-vs-luck "ghost" line (chance variants only). `redLuckByPly` is the
   *  per-ply luck in RED-POV win points (a reveal by black flips sign). Draws a dashed "if
   *  reveals ran average" line = realized minus cumulative luck, plus a shaded band whose gap is
   *  the cumulative luck, plus a legend. Safe to call once decisions load. */
  setLuckOverlay(redLuckByPly: ReadonlyMap<number, number>): void;
}

function svg(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function createAdvantageChart(
  evals: PlyEval[],
  opts: { onJump: (ply: number) => void; seatColors?: ReviewSeatColors },
): AdvantageChart {
  const maxPly = Math.max(1, evals.length - 1);
  const xOf = (ply: number) => (ply / maxPly) * VIEW_W;
  const yOf = (e: PlyEval) => (1 - winPercent(e.cp, e.mate) / 100) * VIEW_H;

  const el = document.createElement('section');
  el.className = 'advantage-chart';
  const firstColor = reviewColorForSeat('red', opts.seatColors);
  const secondColor = reviewColorForSeat('black', opts.seatColors);

  const chart = svg('svg', {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'none',
    class: 'advantage-chart__svg',
  });

  // One clip rect per half: the SAME advantage polygon renders twice, clipped to
  // the red (top) and black (bottom) halves, so each side's advantage fills in
  // that side's colour.
  chartInstance += 1;
  const redClipId = `advantage-chart-red-${chartInstance}`;
  const blackClipId = `advantage-chart-black-${chartInstance}`;
  const defs = svg('defs', {});
  const redClip = svg('clipPath', { id: redClipId });
  redClip.append(svg('rect', { x: '0', y: '0', width: `${VIEW_W}`, height: `${VIEW_H / 2}` }));
  const blackClip = svg('clipPath', { id: blackClipId });
  blackClip.append(
    svg('rect', { x: '0', y: `${VIEW_H / 2}`, width: `${VIEW_W}`, height: `${VIEW_H / 2}` }),
  );
  defs.append(redClip, blackClip);

  chart.append(
    defs,
    svg('rect', {
      x: '0',
      y: '0',
      width: `${VIEW_W}`,
      height: `${VIEW_H / 2}`,
      class: `advantage-chart__zone advantage-chart__zone--${firstColor}`,
    }),
    svg('rect', {
      x: '0',
      y: `${VIEW_H / 2}`,
      width: `${VIEW_W}`,
      height: `${VIEW_H / 2}`,
      class: `advantage-chart__zone advantage-chart__zone--${secondColor}`,
    }),
    svg('line', {
      x1: '0',
      y1: `${VIEW_H / 2}`,
      x2: `${VIEW_W}`,
      y2: `${VIEW_H / 2}`,
      class: 'advantage-chart__mid',
    }),
  );

  // Filled area between the curve and the midline (once per colour half), then
  // the curve on top.
  const points = evals.map((e) => `${xOf(e.ply).toFixed(1)},${yOf(e).toFixed(1)}`);
  const areaPoints = `0,${VIEW_H / 2} ${points.join(' ')} ${VIEW_W},${VIEW_H / 2}`;
  const areaRed = svg('polygon', {
    points: areaPoints,
    'clip-path': `url(#${redClipId})`,
    class: `advantage-chart__area advantage-chart__area--${firstColor}`,
  });
  const areaBlack = svg('polygon', {
    points: areaPoints,
    'clip-path': `url(#${blackClipId})`,
    class: `advantage-chart__area advantage-chart__area--${secondColor}`,
  });
  const line = svg('polyline', { points: points.join(' '), class: 'advantage-chart__line' });
  const cursor = svg('line', {
    x1: '0',
    y1: '0',
    x2: '0',
    y2: `${VIEW_H}`,
    class: 'advantage-chart__cursor',
  });
  // Luck overlay layers (populated by setLuckOverlay when decisions load). The band sits UNDER
  // the realized line/cursor; the ghost line sits just under the cursor so the real line reads as
  // primary. Kept as stable nodes so a re-call just rewrites their points.
  const luckBand = svg('polygon', { points: '', class: 'advantage-chart__luck-band' });
  const ghostLine = svg('polyline', { points: '', class: 'advantage-chart__ghost' });
  chart.append(luckBand, areaRed, areaBlack, ghostLine, line, cursor);
  el.append(chart);

  // Legend (hidden until the luck overlay is set): explains solid vs dashed.
  const legend = document.createElement('div');
  legend.className = 'advantage-chart__legend';
  legend.hidden = true;
  legend.innerHTML =
    '<span class="advantage-chart__legend-item"><span class="advantage-chart__legend-swatch advantage-chart__legend-swatch--real"></span>Your line</span>' +
    '<span class="advantage-chart__legend-item"><span class="advantage-chart__legend-swatch advantage-chart__legend-swatch--ghost"></span>If reveals ran average</span>';
  el.append(legend);

  el.addEventListener('click', (event) => {
    const box = chart.getBoundingClientRect();
    if (box.width === 0) return;
    const frac = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    opts.onJump(Math.round(frac * maxPly));
  });

  function setPly(ply: number): void {
    const x = `${xOf(Math.max(0, Math.min(maxPly, ply)))}`;
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
  }

  function setLuckOverlay(redLuckByPly: ReadonlyMap<number, number>): void {
    // Ghost = realized win% MINUS the cumulative red-POV luck up to each ply — i.e. the
    // trajectory if every reveal had come out at its average. The per-ply luck is added at the
    // ply the reveal lands on (that ply's realized win% already includes it). Additive-in-win%
    // is an approximation (win% is non-linear), but it's the standard, legible luck-adjusted
    // curve. If no reveal ever moved the needle, skip the overlay entirely.
    if (![...redLuckByPly.values()].some((v) => Math.abs(v) > 0.05)) return;
    let cumulative = 0;
    const ghostPoints: string[] = [];
    for (const e of evals) {
      cumulative += redLuckByPly.get(e.ply) ?? 0;
      const ghostWin = Math.max(0, Math.min(100, winPercent(e.cp, e.mate) - cumulative));
      ghostPoints.push(`${xOf(e.ply).toFixed(1)},${((1 - ghostWin / 100) * VIEW_H).toFixed(1)}`);
    }
    ghostLine.setAttribute('points', ghostPoints.join(' '));
    // Band between the realized line and the ghost line: realized forward, ghost back.
    luckBand.setAttribute('points', `${points.join(' ')} ${[...ghostPoints].reverse().join(' ')}`);
    legend.hidden = false;
  }

  return { el, setPly, setLuckOverlay };
}
