import { describe, expect, it } from 'vitest';
import {
  FORTRESS_XIANGQI_CANNON_DIAGRAM,
  FORTRESS_XIANGQI_ELEPHANT_DIAGRAM,
  FORTRESS_XIANGQI_HORSE_DIAGRAM,
} from './fortress-xiangqi-rules-diagrams.js';

// The three two-board rows on /rules/fortress-xiangqi shipped broken: the row
// layout positioned each board by string-replacing the literal opening tag
// `<svg class="fxq-board" `, and when the live renderer grew layout and theme
// classes the replace silently stopped matching. The boards kept the global
// `.fxq-board { width: 100% }` rule and no x/y, so both filled the whole
// wrapper viewport and stacked on each other and on their labels. These pin the
// composition itself rather than the string that happens to implement it.

const ROWS = [
  ['cannon', FORTRESS_XIANGQI_CANNON_DIAGRAM, ['MOVES', 'SCREEN CAPTURE']],
  ['horse', FORTRESS_XIANGQI_HORSE_DIAGRAM, ['MOVES', 'LEG BLOCKED']],
  ['elephant', FORTRESS_XIANGQI_ELEPHANT_DIAGRAM, ['RIVER-LOCKED', 'EYE BLOCKED']],
] as const;

// The board <svg>s inside a row, as their opening tags.
function boardTags(svg: string): string[] {
  return (svg.match(/<svg[^>]*aria-label="Storm the Fortress board"[^>]*>/g) ?? []).map(
    (tag) => tag,
  );
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

describe.each(ROWS)('fortress %s rules row', (_name, diagram, labels) => {
  it('lays both boards out side by side, each with its own box', () => {
    const tags = boardTags(diagram());
    expect(tags).toHaveLength(2);

    const xs = tags.map((tag) => Number(attr(tag, 'x')));
    const widths = tags.map((tag) => Number(attr(tag, 'width')));
    const heights = tags.map((tag) => Number(attr(tag, 'height')));

    // Every board is placed and sized, and the second starts clear of the first.
    expect(xs.every(Number.isFinite)).toBe(true);
    expect(widths.every((w) => w > 0)).toBe(true);
    expect(heights.every((h) => h > 0)).toBe(true);
    expect(xs[1]).toBeGreaterThanOrEqual(xs[0] + widths[0]);

    // Boards sit below the label band, so nothing overlaps the caption.
    for (const tag of tags) expect(Number(attr(tag, 'y'))).toBeGreaterThan(0);
  });

  it('drops the fxq-board class, whose width:100% would beat the width attribute', () => {
    for (const tag of boardTags(diagram())) {
      const classes = (attr(tag, 'class') ?? '').split(/\s+/);
      expect(classes).not.toContain('fxq-board');
      // The layout/theme classes the installed styles key on must survive.
      expect(classes).toContain('xq-surface');
    }
  });

  it('captions both boards', () => {
    const svg = diagram();
    for (const label of labels) expect(svg).toContain(`>${label}</text>`);
  });

  it('sizes the wrapper viewBox to hold both boards', () => {
    const svg = diagram();
    const tags = boardTags(svg);
    const wrapper = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const rightEdge = Math.max(
      ...tags.map((tag) => Number(attr(tag, 'x')) + Number(attr(tag, 'width'))),
    );
    const bottomEdge = Math.max(
      ...tags.map((tag) => Number(attr(tag, 'y')) + Number(attr(tag, 'height'))),
    );

    expect(wrapper).not.toBeNull();
    expect(Number(wrapper?.[1])).toBeGreaterThanOrEqual(rightEdge);
    expect(Number(wrapper?.[2])).toBeGreaterThanOrEqual(bottomEdge);
  });
});
