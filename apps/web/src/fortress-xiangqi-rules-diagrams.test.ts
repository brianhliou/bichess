import {
  type FortressXiangqiDropRole,
  getFortressXiangqiLegalMoves,
  isFortressXiangqiDropMove,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  FORTRESS_XIANGQI_ADVISOR_DIAGRAM,
  FORTRESS_XIANGQI_CANNON_DIAGRAM,
  FORTRESS_XIANGQI_CHARIOT_DIAGRAM,
  FORTRESS_XIANGQI_DROP_REGIONS_DIAGRAM,
  FORTRESS_XIANGQI_ELEPHANT_DIAGRAM,
  FORTRESS_XIANGQI_GENERAL_DIAGRAM,
  FORTRESS_XIANGQI_HORSE_DIAGRAM,
  FORTRESS_XIANGQI_SOLDIER_DIAGRAM,
  FORTRESS_XIANGQI_START_BOARD,
  FORTRESS_XIANGQI_TREASURE_DIAGRAM,
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

// ── Drop regions ────────────────────────────────────────────────────────────
//
// The drop figure draws ONE board for the five free-dropping pieces, rendered
// from the chariot's targets. That is only honest while all five really share a
// region, so the first test asks the kernel rather than trusting the grouping.

function dropTargetsOf(role: FortressXiangqiDropRole): string[] {
  const state = {
    id: 'drop-region-test',
    board: {
      b2: { color: 'red', role: 'general' },
      f7: { color: 'black', role: 'general' },
    },
    hands: { red: { [role]: 1 }, black: {} },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    positionCounts: {},
  } as unknown as Parameters<typeof getFortressXiangqiLegalMoves>[0];
  return getFortressXiangqiLegalMoves(state)
    .filter((move) => isFortressXiangqiDropMove(move) && move.drop === role)
    .map((move) => (move as unknown as { to: string }).to)
    .sort();
}

describe('fortress drop regions', () => {
  it('the five pieces drawn on the free-drop board really share one region', () => {
    const chariot = dropTargetsOf('chariot');
    for (const role of ['horse', 'cannon', 'soldier', 'treasure'] as const) {
      expect(dropTargetsOf(role), `${role} does not share the chariot's drop region`).toEqual(
        chariot,
      );
    }
  });

  it('holds the elephant to its own half and the advisor to its own palace', () => {
    const free = dropTargetsOf('chariot');
    const elephant = dropTargetsOf('elephant');
    const advisor = dropTargetsOf('advisor');

    // Own half is ranks 1-4; own palace is files a-c on ranks 1-3.
    expect(elephant.every((sq) => Number(sq[1]) <= 4)).toBe(true);
    expect(advisor.every((sq) => sq[0] <= 'c' && Number(sq[1]) <= 3)).toBe(true);
    // Strictly nested, so the three boards show three different pictures.
    expect(elephant.length).toBeLessThan(free.length);
    expect(advisor.length).toBeLessThan(elephant.length);
  });

  it('occupied points are never drop targets', () => {
    for (const role of ['chariot', 'elephant', 'advisor'] as const) {
      const targets = dropTargetsOf(role);
      expect(targets).not.toContain('b2');
      expect(targets).not.toContain('f7');
    }
  });

  it('lays out three boards, each under the pieces that use it', () => {
    const svg = FORTRESS_XIANGQI_DROP_REGIONS_DIAGRAM();
    const tags = boardTags(svg);
    expect(tags).toHaveLength(3);

    const xs = tags.map((tag) => Number(attr(tag, 'x')));
    const widths = tags.map((tag) => Number(attr(tag, 'width')));
    expect(xs[1]).toBeGreaterThanOrEqual(xs[0] + widths[0]);
    expect(xs[2]).toBeGreaterThanOrEqual(xs[1] + widths[1]);
    // Boards clear the piece strip and the region label above them.
    for (const tag of tags) expect(Number(attr(tag, 'y'))).toBeGreaterThan(0);

    for (const label of ['ANY EMPTY POINT', 'YOUR OWN HALF', 'YOUR OWN PALACE']) {
      expect(svg).toContain(`>${label}</text>`);
    }
  });

  it('names five pieces over the free-drop board and one over each restricted board', () => {
    const svg = FORTRESS_XIANGQI_DROP_REGIONS_DIAGRAM();
    const labels = (svg.match(/aria-label="red (?!general)[a-z]+"/g) ?? []).map((m) =>
      m.replace('aria-label="red ', '').replace('"', ''),
    );

    // Five free droppers plus the elephant and the advisor, and nothing else.
    expect(labels).toEqual([
      'chariot',
      'horse',
      'cannon',
      'soldier',
      'treasure',
      'elephant',
      'advisor',
    ]);
  });
});

// ── Generals are state, not scenery ─────────────────────────────────────────
//
// Every position on this page carries both generals because the kernel scores a
// side without one as having no legal moves at all, so dropping them from the
// state would empty every target on the page. They are drawn only on the two
// figures that are about the general.

function generalGlyphs(svg: string): string[] {
  return (svg.match(/aria-label="(red|black) general"/g) ?? []).map((m) =>
    m.replace('aria-label="', '').replace('"', ''),
  );
}

describe('fortress rules diagrams, general visibility', () => {
  const hidden = [
    ['chariot', FORTRESS_XIANGQI_CHARIOT_DIAGRAM],
    ['cannon', FORTRESS_XIANGQI_CANNON_DIAGRAM],
    ['horse', FORTRESS_XIANGQI_HORSE_DIAGRAM],
    ['elephant', FORTRESS_XIANGQI_ELEPHANT_DIAGRAM],
    ['advisor', FORTRESS_XIANGQI_ADVISOR_DIAGRAM],
    ['soldier', FORTRESS_XIANGQI_SOLDIER_DIAGRAM],
    ['treasure', FORTRESS_XIANGQI_TREASURE_DIAGRAM],
    ['drop regions', FORTRESS_XIANGQI_DROP_REGIONS_DIAGRAM],
  ] as const;

  it.each(hidden)('the %s figure draws no general', (_name, diagram) => {
    expect(generalGlyphs(diagram())).toEqual([]);
  });

  it('the opening position and the general figure still draw both', () => {
    expect(generalGlyphs(FORTRESS_XIANGQI_START_BOARD())).toEqual(['red general', 'black general']);
    expect(generalGlyphs(FORTRESS_XIANGQI_GENERAL_DIAGRAM()).sort()).toEqual([
      'black general',
      'red general',
    ]);
  });

  // Hiding the generals removes the two holes their occupancy punched in each
  // drop region, so the boards must now show whole territories: the full board,
  // the full near half, the full palace. A hole here would read as a rendering
  // fault, since there is no longer a piece on screen to explain it.
  it('draws whole drop territories, with no hole where a general stands', () => {
    const svg = FORTRESS_XIANGQI_DROP_REGIONS_DIAGRAM();
    const perBoard = svg
      .split('aria-label="Storm the Fortress board"')
      .slice(1)
      .map((chunk) => (chunk.split('</svg>')[0].match(/class="fxq-hint"/g) ?? []).length);

    // 7x8 board, ranks 1-4 of it, and the 3x3 palace.
    expect(perBoard).toEqual([56, 28, 9]);
  });
});
