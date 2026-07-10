import type { XiangqiSquare } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { renderShotSvg } from './frame.js';
import { PIECE_SIZE, squareCenter } from './geometry.js';
import { type ScenePlan, validateScenePlan } from './manifest.js';
import { inlinePieceImages } from './raster.js';
import { expandTimeline, type Shot } from './timeline.js';

const basePlan = (segments: ScenePlan['segments']): ScenePlan => ({
  id: 'test',
  title: 'Test',
  fps: 30,
  width: 1920,
  height: 1080,
  background: '#101418',
  segments,
});

describe('expandTimeline', () => {
  it('pads a segment out to its target duration', () => {
    const plan = basePlan([
      {
        id: 'a',
        durationMs: 5000,
        steps: [{ kind: 'position', position: 'empty', holdMs: 500 }],
      },
    ]);
    const timeline = expandTimeline(plan);
    expect(timeline.totalMs).toBe(5000);
    expect(timeline.segmentStartsMs.a).toBe(0);
  });

  it('lets long steps extend past the target (never cuts an animation)', () => {
    const plan = basePlan([
      {
        id: 'a',
        durationMs: 100,
        steps: [{ kind: 'position', position: 'empty', holdMs: 900 }],
      },
      { id: 'b', durationMs: 1000, steps: [] },
    ]);
    const timeline = expandTimeline(plan);
    expect(timeline.segmentStartsMs.b).toBe(900);
    expect(timeline.totalMs).toBe(1900);
  });

  it('expands a move into per-frame shots with a sound at landing', () => {
    const plan = basePlan([
      {
        id: 'a',
        durationMs: 0,
        steps: [
          {
            kind: 'position',
            position: [{ square: 'e5', color: 'red', role: 'chariot' }],
            holdMs: 100,
          },
          { kind: 'move', from: 'e5', to: 'e9', durationMs: 200, holdAfterMs: 100 },
        ],
      },
    ]);
    const timeline = expandTimeline(plan);
    const movingShots = timeline.shots.filter((shot) => shot.moving !== null);
    expect(movingShots.length).toBe(6); // 200ms at 30fps
    expect(movingShots.at(-1)?.moving?.t).toBe(1);
    expect(timeline.soundEvents).toEqual([{ atMs: 300, sound: 'move' }]);
    const settle = timeline.shots.at(-1);
    expect(settle?.board.e9?.role).toBe('chariot');
    expect(settle?.lastMove).toEqual({ from: 'e5', to: 'e9' });
  });

  it('marks captures with the capture sound and removes the victim', () => {
    const plan = basePlan([
      {
        id: 'a',
        durationMs: 0,
        steps: [
          {
            kind: 'position',
            position: [
              { square: 'c5', color: 'red', role: 'cannon' },
              { square: 'f5', color: 'red', role: 'horse' },
              { square: 'h5', color: 'black', role: 'chariot' },
            ],
            holdMs: 100,
          },
          { kind: 'move', from: 'c5', to: 'h5', durationMs: 100, holdAfterMs: 0 },
        ],
      },
    ]);
    const timeline = expandTimeline(plan);
    expect(timeline.soundEvents[0]?.sound).toBe('capture');
    const during = timeline.shots.find((shot) => shot.moving !== null);
    expect(during?.board.h5).toBeUndefined(); // victim hidden mid-flight
    expect(during?.board.c5).toBeUndefined();
  });

  it('keeps overlays sticky until cleared and drops them on position', () => {
    const plan = basePlan([
      {
        id: 'a',
        durationMs: 0,
        steps: [
          { kind: 'position', position: 'empty', holdMs: 100 },
          { kind: 'region', region: 'river', holdMs: 100 },
          { kind: 'hold', ms: 100 },
          { kind: 'clearOverlays', holdMs: 100 },
          { kind: 'position', position: 'start', holdMs: 100 },
        ],
      },
    ]);
    const timeline = expandTimeline(plan);
    const regions = timeline.shots.map((shot) => shot.overlays.region);
    expect(regions).toEqual([null, 'river', 'river', null, null]);
  });

  it('flash blinks and ends lit for the hold remainder', () => {
    const plan = basePlan([
      {
        id: 'a',
        durationMs: 0,
        steps: [
          {
            kind: 'position',
            position: [
              { square: 'e1', color: 'red', role: 'general' },
              { square: 'd10', color: 'black', role: 'general' },
            ],
            holdMs: 100,
          },
          { kind: 'flash', from: 'd10', to: 'e10', holdMs: 1500 },
        ],
      },
    ]);
    const timeline = expandTimeline(plan);
    const flashes = timeline.shots.slice(1).map((shot) => shot.overlays.flash !== null);
    expect(flashes).toEqual([true, false, true, false, true, true]);
  });
});

describe('renderShotSvg', () => {
  const shot = (over: Partial<Shot>): Shot => ({
    board: { e5: { color: 'red', role: 'chariot' } },
    lastMove: null,
    overlays: {
      glow: [],
      dimOthers: false,
      points: [],
      pointsCapture: false,
      raysFrom: null,
      region: null,
      arrows: [],
      flash: null,
    },
    moving: null,
    durationMs: 100,
    ...over,
  });
  const plan = basePlan([{ id: 'a', durationMs: 100, steps: [] }]);

  it('places the piece where the geometry mirror says it is (drift guard)', () => {
    const svg = renderShotSvg(plan, shot({}));
    const center = squareCenter('e5' as XiangqiSquare, 'red');
    expect(svg).toContain(`x="${center.x - PIECE_SIZE / 2}"`);
    expect(svg).toContain(`y="${center.y - PIECE_SIZE / 2}"`);
  });

  it('renders kernel rays as hint markers', () => {
    const svg = renderShotSvg(
      plan,
      shot({ overlays: { ...shot({}).overlays, raysFrom: 'e5' as XiangqiSquare } }),
    );
    // A lone chariot on e5 sees 17 destinations (8 horizontal + 9 vertical).
    expect(svg.match(/<circle class="xq-live-hint-dot"/g)?.length).toBe(17);
  });

  it('renders the moving piece at interpolated coordinates', () => {
    const from = squareCenter('e5' as XiangqiSquare, 'red');
    const to = squareCenter('e9' as XiangqiSquare, 'red');
    const svg = renderShotSvg(
      plan,
      shot({
        board: {},
        moving: {
          piece: { color: 'red', role: 'chariot' },
          from: 'e5' as XiangqiSquare,
          to: 'e9' as XiangqiSquare,
          t: 0.5,
        },
      }),
    );
    const midY = (from.y + to.y) / 2 - PIECE_SIZE / 2;
    expect(svg).toContain(`y="${midY}"`);
  });

  it('dims the board and re-lights glowed pieces', () => {
    const svg = renderShotSvg(
      plan,
      shot({
        overlays: {
          ...shot({}).overlays,
          glow: ['e5' as XiangqiSquare],
          dimOthers: true,
        },
      }),
    );
    expect(svg).toContain('xqv-dim');
    expect(svg).toContain('xqv-glow-ring');
  });
});

describe('inlinePieceImages', () => {
  it('rewrites piece hrefs to data URIs and strips cache-bust params', () => {
    const svg = '<image href="/piece-sets/xiangqi/international/red-chariot.png?v=7"/>';
    const out = inlinePieceImages(svg, () => Buffer.from('png-bytes'));
    expect(out).toContain('href="data:image/png;base64,');
    expect(out).not.toContain('?v=7');
  });
});

describe('validateScenePlan', () => {
  it('flags bad squares, bad durations, and duplicate ids', () => {
    const errors = validateScenePlan(
      basePlan([
        { id: 'a', durationMs: 0, steps: [] },
        {
          id: 'a',
          durationMs: Number.NaN,
          steps: [{ kind: 'move', from: 'z9' as XiangqiSquare, to: 'e5' as XiangqiSquare }],
        },
      ]),
    );
    expect(errors.some((error) => error.includes('duplicate segment id'))).toBe(true);
    expect(errors.some((error) => error.includes("bad square 'z9'"))).toBe(true);
    expect(errors.some((error) => error.includes('durationMs'))).toBe(true);
    expect(errors.some((error) => error.includes('neither duration nor steps'))).toBe(true);
  });
});
