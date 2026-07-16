import { describe, expect, it } from 'vitest';
import type { FeaturedGame } from './game-display.js';
import { createGameTable } from './game-table.js';
import {
  buildWatchScrubber,
  formatWatchScope,
  renderWatchChannelList,
  renderWatchQueue,
  renderWatchReplaySkeleton,
  resultLabel,
  shouldPlayWatchMoveSound,
  watchFeedIsDark,
  watchPovToggleApplies,
  watchQueueMatchupLabel,
  watchQueueResultLabel,
} from './watch-route.js';

describe('watch move sounds', () => {
  it('sounds only a single forward ply, not initial paint, jumps, or loop resets', () => {
    expect(shouldPlayWatchMoveSound(null, 0)).toBe(false);
    expect(shouldPlayWatchMoveSound(0, 1)).toBe(true);
    expect(shouldPlayWatchMoveSound(1, 2)).toBe(true);
    expect(shouldPlayWatchMoveSound(2, 2)).toBe(false);
    expect(shouldPlayWatchMoveSound(2, 8)).toBe(false);
    expect(shouldPlayWatchMoveSound(8, 0)).toBe(false);
  });
});

describe('watch route copy helpers', () => {
  it('scopes sealed watch copy to dark channels', () => {
    const darkFeed = {
      activeChannel: 'dark-mini-xiangqi',
      channels: [
        {
          family: 'xiangqi',
          gameSpecIds: ['dark-mini-xiangqi'],
          id: 'dark-mini-xiangqi',
          label: 'Dark Mini Xiangqi',
          sealedCount: 1,
          unlockedCount: 2,
        },
      ],
      unlockLimit: 64,
    };
    const visibleFeed = {
      activeChannel: 'rapid',
      channels: [
        {
          family: 'chess',
          gameSpecIds: ['chess'],
          id: 'rapid',
          label: 'Rapid',
          sealedCount: 1,
          unlockedCount: 2,
        },
      ],
      unlockLimit: 32,
    };

    expect(watchFeedIsDark(darkFeed)).toBe(true);
    expect(formatWatchScope(darkFeed)).toBe('dark variants · latest 64');
    expect(watchFeedIsDark(visibleFeed)).toBe(false);
    expect(formatWatchScope(visibleFeed)).toBe('latest 32');
  });

  it('renders red/black Dark Mini Xiangqi queue labels', () => {
    const game: FeaturedGame = {
      blackName: null,
      corpusId: null,
      mode: 'pve',
      participants: [
        {
          color: 'red',
          displayName: 'Red Human',
          subjectId: null,
          subjectType: 'guest',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'Misty',
          subjectId: 'python-dmx-v1.0',
          subjectType: 'engine-version',
          visibility: 'public',
        },
      ],
      plyCount: 12,
      result: 'red-wins',
      roomId: 'dmxq_watch',
      termination: 'general-captured',
      variant: 'dark-mini-xiangqi',
      whiteName: null,
    };

    expect(watchQueueMatchupLabel(game)).toBe('Red Human vs Misty DMX 1.0');
    expect(resultLabel(game.result)).toBe('Red wins');
  });

  it('renders white/red Crossroads Chess queue labels', () => {
    const game: FeaturedGame = {
      blackName: null,
      corpusId: null,
      mode: 'pve',
      participants: [
        {
          color: 'white',
          displayName: 'White Human',
          subjectId: null,
          subjectType: 'guest',
          visibility: 'public',
        },
        {
          color: 'red',
          displayName: 'Misty',
          subjectId: 'fairy-stockfish-crossroads-strong',
          subjectType: 'engine-version',
          visibility: 'public',
        },
      ],
      plyCount: 16,
      result: 'red-wins',
      roomId: 'dchess_watch',
      termination: 'resignation',
      variant: 'crossroads-chess',
      whiteName: null,
    };

    expect(watchQueueMatchupLabel(game)).toBe('White Human vs Misty');
    expect(resultLabel(game.result)).toBe('Red wins');
  });

  it('labels a banqi queue result by bound ink, not the seat token', () => {
    const base: FeaturedGame = {
      blackName: null,
      corpusId: null,
      mode: 'pvp',
      plyCount: 40,
      result: 'red-wins',
      roomId: 'bq_watch',
      termination: 'stalemate',
      variant: 'banqi',
      whiteName: null,
    };
    // First-mover ('red') seat won, but it flipped BLACK on the opening move, so
    // the surviving pieces are black ink: the queue must read "Black wins".
    expect(watchQueueResultLabel({ ...base, firstColor: 'black' })).toBe('Black wins');
    // Same seat result, red ink (the seat == ink case) stays "Red wins".
    expect(watchQueueResultLabel({ ...base, firstColor: 'red' })).toBe('Red wins');
    // No firstColor (unreplayable/legacy) falls back to move order, never a wrong ink.
    expect(watchQueueResultLabel(base)).toBe('First wins');
    // Non-banqi variants are untouched by the ink translation.
    expect(watchQueueResultLabel({ ...base, variant: 'crossroads-chess' })).toBe('Red wins');
  });
});

describe('watchPovToggleApplies', () => {
  it('shows the fog-perspective toggle only for asymmetric fog (dark) variants', () => {
    // Asymmetric fog: distinct per-side views, so the toggle is meaningful.
    expect(watchPovToggleApplies('dark-chess')).toBe(true);
    expect(watchPovToggleApplies('dark-xiangqi')).toBe(true);
    expect(watchPovToggleApplies('dark-crossroads-chess')).toBe(true);
    // Symmetric-mask hidden identity (one view) — no toggle.
    expect(watchPovToggleApplies('jieqi')).toBe(false);
    expect(watchPovToggleApplies('banqi')).toBe(false);
    // Open information (one shared board) — no toggle.
    expect(watchPovToggleApplies('xiangqi')).toBe(false);
    expect(watchPovToggleApplies('crossroads-chess')).toBe(false);
    // Unknown variant resolves to no spec — no toggle, never throws.
    expect(watchPovToggleApplies('not-a-variant')).toBe(false);
  });
});

describe('renderWatchReplaySkeleton', () => {
  it('fills the slot with the board placeholder the CSS targets', () => {
    const root = document.createElement('div');
    root.append(document.createElement('span'));
    renderWatchReplaySkeleton(root);
    expect(root.querySelector('.watch-replay-skeleton-board')).not.toBeNull();
    // It replaces prior content rather than appending to it.
    expect(root.querySelector('span')).toBeNull();
    expect(root.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('buildWatchScrubber', () => {
  const button = (el: HTMLElement, label: string) =>
    el.querySelector<HTMLButtonElement>(`.review-scrubber__button[aria-label="${label}"]`);

  it('jumps to the right ply, reading the live ply at click time', () => {
    const ply = 3;
    const jumps: number[] = [];
    const scrubber = buildWatchScrubber(
      (p) => jumps.push(p),
      () => ply,
      () => 10,
    );
    button(scrubber.el, 'First move')?.click();
    button(scrubber.el, 'Previous move')?.click();
    button(scrubber.el, 'Next move')?.click();
    button(scrubber.el, 'Last move')?.click();
    // prev/next resolve against getPly() (3), not a stale captured value.
    expect(jumps).toEqual([0, 2, 4, 10]);
  });

  it('disables the end buttons at the bounds', () => {
    const scrubber = buildWatchScrubber(
      () => {},
      () => 0,
      () => 8,
    );
    scrubber.setBounds(0, 8);
    expect(button(scrubber.el, 'First move')?.disabled).toBe(true);
    expect(button(scrubber.el, 'Previous move')?.disabled).toBe(true);
    expect(button(scrubber.el, 'Next move')?.disabled).toBe(false);
    expect(button(scrubber.el, 'Last move')?.disabled).toBe(false);

    scrubber.setBounds(8, 8);
    expect(button(scrubber.el, 'First move')?.disabled).toBe(false);
    expect(button(scrubber.el, 'Next move')?.disabled).toBe(true);
    expect(button(scrubber.el, 'Last move')?.disabled).toBe(true);
  });

  it('binds the same controls used by live room game tables', () => {
    const table = createGameTable();
    const jumps: number[] = [];
    const scrubber = buildWatchScrubber(
      (ply) => jumps.push(ply),
      () => 4,
      () => 12,
      table.refs.replayControlsRoot,
    );

    table.refs.replayControlsRoot.querySelector<HTMLButtonElement>('[data-replay="prev"]')?.click();
    table.refs.replayControlsRoot
      .querySelector<HTMLButtonElement>('[data-replay="latest"]')
      ?.click();

    expect(scrubber.el).toBe(table.refs.replayControlsRoot);
    expect(jumps).toEqual([3, 12]);
  });
});

describe('renderWatchChannelList', () => {
  function channel(id: string, label: string) {
    return { family: 'xiangqi', gameSpecIds: [id], id, label, sealedCount: 0, unlockedCount: 1 };
  }

  // Regression: every launchable channel needs either a variant marker mapping
  // or a dedicated cross-variant marker, or its rail slot renders empty.
  it('renders a marker for every launched watch channel', () => {
    const feed = {
      activeChannel: 'dark-chess',
      channels: [
        channel('engines', 'Engines'),
        channel('dark-chess', 'Fog Chess'),
        channel('mini-xiangqi', 'Mini Xiangqi'),
        channel('dark-mini-xiangqi', 'Dark Mini Xiangqi'),
        channel('dark-xiangqi', 'Fog Xiangqi'),
        channel('jieqi', 'Reveal Xiangqi'),
        channel('banqi', 'Flip Xiangqi'),
        channel('reveal-chess', 'Reveal Chess'),
        channel('crossroads-chess', 'Crossroads Chess'),
        channel('dark-crossroads-chess', 'Dark Crossroads Chess'),
        channel('dark-shogi', 'Fog Shogi'),
        channel('dark-crazyhouse', 'Dark Crazyhouse'),
        channel('kriegspiel', 'Kriegspiel'),
      ],
      now: '2026-06-17T00:00:00.000Z',
      unlockLimit: 64,
      sealedCount: 0,
      unlocked: [],
    };
    const root = document.createElement('nav');
    renderWatchChannelList(root, feed);

    const links = root.querySelectorAll('a.watch-channel-link');
    expect(links).toHaveLength(13);
    for (const link of links) {
      const thumb = link.querySelector('.watch-channel-thumb');
      expect(
        thumb?.querySelector('svg, .variant-marker'),
        `${link.textContent} marker`,
      ).not.toBeNull();
    }
  });
});

describe('renderWatchQueue', () => {
  it('renders only two final-position board mount points', () => {
    const game = (roomId: string): FeaturedGame => ({
      blackName: 'Black',
      corpusId: null,
      mode: 'pvp',
      plyCount: 24,
      result: 'white-wins',
      roomId,
      termination: 'resignation',
      variant: 'dark-chess',
      whiteName: 'White',
    });
    const root = document.createElement('section');
    const previews = renderWatchQueue(
      root,
      {
        activeChannel: 'dark-chess',
        channels: [
          {
            family: 'chess',
            gameSpecIds: ['dark-chess'],
            id: 'dark-chess',
            label: 'Fog Chess',
            sealedCount: 0,
            unlockedCount: 3,
          },
        ],
        now: '2026-07-13T00:00:00.000Z',
        sealedCount: 0,
        unlockLimit: 64,
        unlocked: [game('newest'), game('previous'), game('older')],
      },
      'newest',
    );

    expect(previews.map(({ game: previewGame }) => previewGame.roomId)).toEqual([
      'newest',
      'previous',
    ]);
    expect(root.querySelectorAll('.watch-queue-preview')).toHaveLength(2);
    expect(root.querySelector('[data-room-id="older"]')).toBeNull();
  });
});
