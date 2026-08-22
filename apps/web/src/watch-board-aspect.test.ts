import { describe, expect, it } from 'vitest';
// Side-effect import: populates the server tenant registry the way
// apps/server/src/index.ts does, so the coverage check below derives its
// expected spec list from the server's source of truth rather than a
// hand-maintained literal (same pattern as watch-route.test.ts).
import '../../server/src/variant-tenant/register-tenants.js';
import { listWatchChannels } from '../../server/src/watch-channels.js';
import { boardAspectForSpec, DEFAULT_BOARD_ASPECT, hasBoardAspect } from './watch-board-aspect.js';

describe('boardAspectForSpec', () => {
  it('gives tall xiangqi boards a portrait ratio and banqi a wide one', () => {
    // The whole point of the table: these three must NOT all reserve the same
    // box, or the switch between them shifts layout.
    expect(boardAspectForSpec('xiangqi')).toBeCloseTo(0.9);
    expect(boardAspectForSpec('banqi')).toBeCloseTo(2);
    expect(boardAspectForSpec('dark-chess')).toBe(1);
  });

  it('falls back to a neutral square, never another variant, for unknown ids', () => {
    expect(boardAspectForSpec('not-a-variant')).toBe(DEFAULT_BOARD_ASPECT);
    expect(boardAspectForSpec(null)).toBe(DEFAULT_BOARD_ASPECT);
    expect(boardAspectForSpec(undefined)).toBe(DEFAULT_BOARD_ASPECT);
    expect(boardAspectForSpec('')).toBe(DEFAULT_BOARD_ASPECT);
  });

  it('covers every spec a watch channel can put on the board', () => {
    // A launched variant with no entry silently reserves a square box and
    // reintroduces the shift, which is invisible in review — so assert it here
    // rather than trusting the table to be kept up to date by hand.
    const specIds = [
      ...new Set(listWatchChannels().flatMap((channel) => [...channel.gameSpecIds])),
    ];
    const missing = specIds.filter((specId) => !hasBoardAspect(specId));
    expect(missing).toEqual([]);
  });
});
