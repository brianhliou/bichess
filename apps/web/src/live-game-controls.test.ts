import type { PlayerView } from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeAccountPreference } from './account-preferences.js';
import { renderGameControls } from './live-game-controls.js';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'controls-room',
    variant: 'dark-chess',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 2,
    ...overrides,
  };
}

function makeRefs(): Pick<LiveRefs, 'gameControlsSection' | 'gameControls'> {
  return {
    gameControlsSection: document.createElement('section'),
    gameControls: document.createElement('div'),
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryStorage(),
  });
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

afterEach(() => {
  liveState.roomMode = 'pvp';
  liveState.seat = 'spectator';
  liveState.solo = false;
  liveState.abortDeadline = null;
  liveState.forfeitDeadline = null;
  liveState.timeControl = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const CORRESPONDENCE_TC = { initialMs: 3 * 86_400_000, incrementMs: 0, daysPerMove: 3 };

describe('renderGameControls', () => {
  it('shows resign for seated PvP players after the first-move abort window', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pvp';
    liveState.seat = 'white';

    renderGameControls(refs, makeView(), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toBe('Resign');
  });

  it('localizes the resign control', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pvp';
    liveState.seat = 'white';

    renderGameControls(refs, makeView(), vi.fn(), 'zh-Hant');

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toBe('認輸');
  });

  it('shows resign for seated PvE players after the first-move abort window', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pve';
    liveState.seat = 'white';

    renderGameControls(refs, makeView(), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toBe('Resign');
  });

  it('keeps PvE controls hidden for spectators', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pve';
    liveState.seat = 'spectator';

    renderGameControls(refs, makeView(), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(true);
    expect(refs.gameControls.childElementCount).toBe(0);
  });

  it('shows resign for seated correspondence players after the first move', () => {
    const refs = makeRefs();
    liveState.roomMode = 'correspondence';
    liveState.seat = 'white';
    liveState.timeControl = CORRESPONDENCE_TC;

    renderGameControls(refs, makeView(), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toBe('Resign');
  });

  it('shows abort but no seconds countdown for correspondence before the first move', () => {
    const refs = makeRefs();
    liveState.roomMode = 'correspondence';
    liveState.seat = 'white';
    liveState.timeControl = CORRESPONDENCE_TC;
    // A live PvE room would render the abort-countdown span from this; day-scale
    // rooms must suppress it (the day clock shows the deadline) yet keep Abort.
    liveState.abortDeadline = Date.now() + 10_000;

    renderGameControls(refs, makeView({ moveNumber: 0 }), vi.fn());

    expect(refs.gameControls.querySelector('button')?.textContent).toBe('Abort');
    expect(refs.gameControls.querySelector('[data-abort-countdown]')).toBeNull();
    expect(refs.gameControls.textContent).toBe('Abort');
  });

  it('shows abort instead of resign during the PvE first-move abort window', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pve';
    liveState.seat = 'white';
    liveState.abortDeadline = Date.now() + 10_000;

    renderGameControls(refs, makeView({ moveNumber: 1 }), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.querySelector('button')?.textContent).toBe('Abort');
    expect(refs.gameControls.textContent).not.toContain('Resign');
  });

  it('localizes the abort countdown and control', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pve';
    liveState.seat = 'white';
    liveState.abortDeadline = Date.now() + 10_000;

    renderGameControls(refs, makeView({ moveNumber: 1 }), vi.fn(), 'zh-Hant');

    expect(refs.gameControls.querySelector('[data-abort-countdown]')?.textContent).toContain(
      '請走第一步',
    );
    expect(refs.gameControls.querySelector('button')?.textContent).toBe('中止');
  });

  it('sends resign immediately when game-action confirmation is disabled', () => {
    const refs = makeRefs();
    const sendSocket = vi.fn(() => true);
    liveState.roomMode = 'pvp';
    liveState.seat = 'white';
    writeAccountPreference('confirmGameActions', false);

    renderGameControls(refs, makeView(), sendSocket);
    refs.gameControls.querySelector<HTMLButtonElement>('button')?.click();

    expect(sendSocket).toHaveBeenCalledWith({ type: 'resign' });
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('sends abort immediately when game-action confirmation is disabled', () => {
    const refs = makeRefs();
    const sendSocket = vi.fn(() => true);
    liveState.roomMode = 'pvp';
    liveState.seat = 'white';
    writeAccountPreference('confirmGameActions', false);

    renderGameControls(refs, makeView({ moveNumber: 0 }), sendSocket);
    refs.gameControls.querySelector<HTMLButtonElement>('button')?.click();

    expect(sendSocket).toHaveBeenCalledWith({ type: 'abort' });
    expect(document.querySelector('dialog')).toBeNull();
  });
});
