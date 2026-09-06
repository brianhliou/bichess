import { describe, expect, it } from 'vitest';
import { jungleBareDenSvg, jungleBareTrapSvg } from './jungle-skins.js';

// The bare board's den/trap marks are Lucide icons, which are SEVERAL separate
// stroked elements rather than one path. That makes a translucent stroke colour
// the wrong way to soften one: each element composites on its own, so wherever
// two of them overlap the ink doubles. Crosshair's four ticks end exactly on the
// circle's centreline with round caps, so it has four such overlaps, and they
// rendered ~25% darker than the circle they sat on (0.947 ink against 0.755).
// Softening belongs on the GROUP, which flattens before compositing.
describe('bare jungle terrain marks', () => {
  const opacityAttrs = (svg: string) => [...svg.matchAll(/\sopacity="([\d.]+)"/g)].map((m) => m[1]);

  it('softens the trap mark with a group opacity, not a translucent stroke', () => {
    const svg = jungleBareTrapSvg(0, 0, 48);

    for (const stroke of [...svg.matchAll(/stroke="([^"]+)"/g)].map((m) => m[1])) {
      expect(stroke).not.toMatch(/rgba|hsla/);
      expect(stroke).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(svg).not.toMatch(/stroke-opacity=/);
    expect(opacityAttrs(svg)).toEqual(['0.75']);
    // The opacity sits on the icon group, so it covers every element inside it.
    expect(svg).toMatch(/<g transform="[^"]*" opacity="0\.75"/);
  });

  it('leaves the full-strength den mark without an opacity attribute at all', () => {
    const svg = jungleBareDenSvg(0, 0, 48);

    expect(opacityAttrs(svg)).toEqual([]);
    expect(svg).not.toMatch(/rgba|hsla|stroke-opacity=/);
  });

  it('keeps both marks centred on their own tile', () => {
    // Guards against a regression that shifts a mark off-cell while the opacity
    // work moves attributes around on the same <g>. The icon box is 24 units
    // scaled by `scale`, so its centre is translate + 12 * scale.
    const centre = (svg: string) => {
      const m = svg.match(/translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)/);
      if (!m) throw new Error(`no icon transform in: ${svg}`);
      const [tx, ty, scale] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return { x: tx + 12 * scale, y: ty + 12 * scale };
    };

    for (const svg of [jungleBareTrapSvg(96, 48, 48), jungleBareDenSvg(96, 48, 48)]) {
      const { x, y } = centre(svg);
      expect(x).toBeCloseTo(96 + 24, 6);
      expect(y).toBeCloseTo(48 + 24, 6);
    }
  });
});
