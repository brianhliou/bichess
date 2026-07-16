import { describe, expect, it } from 'vitest';
import { createAdvantageChart } from './advantage-chart.js';
import type { PlyEval } from './game-analysis.js';

const evals: PlyEval[] = [
  { ply: 0, cp: 0, mate: null, best: null },
  { ply: 1, cp: 100, mate: null, best: null },
  { ply: 2, cp: -50, mate: null, best: null },
  { ply: 3, cp: 200, mate: null, best: null },
];

function ghost(el: HTMLElement): SVGPolylineElement {
  return el.querySelector('.advantage-chart__ghost') as SVGPolylineElement;
}
function band(el: HTMLElement): SVGPolygonElement {
  return el.querySelector('.advantage-chart__luck-band') as SVGPolygonElement;
}
function legend(el: HTMLElement): HTMLElement {
  return el.querySelector('.advantage-chart__legend') as HTMLElement;
}

describe('advantage chart luck overlay', () => {
  it('uses bound ink colors without changing the first-seat eval direction', () => {
    const chart = createAdvantageChart(evals, {
      onJump: () => {},
      seatColors: { red: 'black', black: 'red' },
    });
    const zones = chart.el.querySelectorAll('.advantage-chart__zone');
    expect(zones[0]?.classList).toContain('advantage-chart__zone--black');
    expect(zones[1]?.classList).toContain('advantage-chart__zone--red');
  });

  it('has no ghost/band and a hidden legend until the overlay is set', () => {
    const chart = createAdvantageChart(evals, { onJump: () => {} });
    expect(ghost(chart.el).getAttribute('points')).toBe('');
    expect(band(chart.el).getAttribute('points')).toBe('');
    expect(legend(chart.el).hidden).toBe(true);
  });

  it('draws the ghost line + band + legend when reveals moved the needle', () => {
    const chart = createAdvantageChart(evals, { onJump: () => {} });
    // Red reveal at ply 1 (+20 for red), black-flavoured luck already mapped to red-POV at ply 3.
    chart.setLuckOverlay(
      new Map([
        [1, 20],
        [3, -30],
      ]),
    );
    expect(ghost(chart.el).getAttribute('points')).not.toBe('');
    expect(band(chart.el).getAttribute('points')).not.toBe('');
    expect(legend(chart.el).hidden).toBe(false);
  });

  it('ghost diverges from the realized line by the cumulative luck', () => {
    const chart = createAdvantageChart(evals, { onJump: () => {} });
    chart.setLuckOverlay(new Map([[1, 20]]));
    const real = (chart.el.querySelector('.advantage-chart__line') as SVGPolylineElement)
      .getAttribute('points')!
      .split(' ');
    const g = ghost(chart.el).getAttribute('points')!.split(' ');
    // Ply 0 (before any reveal) coincides; ply 1 onward the ghost sits at a different y.
    expect(g[0]).toBe(real[0]);
    expect(g[1]).not.toBe(real[1]);
  });

  it('skips the overlay when no reveal actually moved the win%', () => {
    const chart = createAdvantageChart(evals, { onJump: () => {} });
    chart.setLuckOverlay(
      new Map([
        [1, 0],
        [3, 0],
      ]),
    );
    expect(ghost(chart.el).getAttribute('points')).toBe('');
    expect(legend(chart.el).hidden).toBe(true);
  });
});
