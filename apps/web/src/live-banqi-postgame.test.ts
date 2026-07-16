import {
  applyBanqiMove,
  type BanqiMove,
  banqiTruthView,
  createInitialBanqiState,
  getBanqiPlayerView,
  STANDARD_BANQI_DEAL,
} from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { banqiResultLabel } from './banqi-result-label.js';
import { banqiPostgameApiUrl, mountBanqiPostgame } from './live-banqi-postgame.js';

describe('banqiResultLabel translates the seat-keyed result to the bound ink', () => {
  // The reported bug: a game black-ink-wins (red side eaten), but the recorded
  // result is seat-keyed 'red-wins' (the first-mover seat survived) and the
  // notification read "Red wins" because the first-mover seat owns the black ink.
  it('maps the winning SEAT to its flip-bound ink', () => {
    // First-mover ('red') seat flipped black → owns black ink.
    expect(banqiResultLabel('red-wins', 'black')).toBe('Black wins');
    expect(banqiResultLabel('black-wins', 'black')).toBe('Red wins');
    // First-mover seat flipped red → seat == ink (the existing common case).
    expect(banqiResultLabel('red-wins', 'red')).toBe('Red wins');
    expect(banqiResultLabel('black-wins', 'red')).toBe('Black wins');
  });

  it('keeps draws ink-agnostic and falls back to move order before the flip binds', () => {
    expect(banqiResultLabel('draw', 'red')).toBe('Draw');
    expect(banqiResultLabel('red-wins', null)).toBe('First wins');
    expect(banqiResultLabel('black-wins', null)).toBe('Second wins');
  });
});

describe('Banqi postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BANQI_ENABLED', 'true');
    window.history.replaceState(null, '', '/');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('builds the family-native public postgame API URL', () => {
    expect(banqiPostgameApiUrl('bq room')).toBe('/api/banqi/games/bq%20room');
  });

  it('reconstructs the deal, renders one review board, and lists the flip move', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountBanqiPostgame(root, 'bq_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/banqi/games/bq_postgame');
    // Single clean left rail (meta card + spectator room) — no action buttons.
    expect(root.textContent).toContain('Spectator room');
    expect(root.textContent).toContain('Flip Xiangqi');
    expect(root.textContent).toContain('Red wins');
    expect(root.querySelector('.game-meta-card')).not.toBeNull();
    expect(root.textContent).not.toContain('Play again');
    // Exactly one board (banqi is symmetric — no per-seat split). Its presence
    // proves the deal reconstructed from history.revealed and the tree replayed.
    expect(root.querySelectorAll('.banqi-board')).toHaveLength(1);
    // The board renders MASKED as-played: the still-face-down tiles are backs, not
    // identified pieces (branching reveals them; the tree does not spoil the deal).
    const board = root.querySelector('.banqi-postgame-board') as HTMLElement;
    expect(board.innerHTML).toContain('banqi-back');

    // The move list shows the opening ply (a flip — a real banqi game's first move
    // is always a flip) in the numbered row's left cell.
    const row = root.querySelector('.review-move-list__row');
    expect(row).not.toBeNull();
    expect(row?.querySelector('.review-move-list__number')?.textContent).toBe('1');
    const firstMove = row?.querySelector<HTMLButtonElement>('.review-move-list__move');
    expect(firstMove?.querySelector('.review-move-list__san')?.textContent).toBe('a1');
    // Opens at the final ply (the flip is the mainline tip): the highlighted current
    // cell is that flip move. (The tree move list highlights via --current, not the
    // linear list's data-ply.)
    const current = root.querySelector('.review-move-list__move--current');
    expect(current?.querySelector('.review-move-list__san')?.textContent).toBe('a1');
    // Server-side computer analysis underboard is wired: a signed-out visitor sees the
    // sign-in CTA (the account-gated compute button) rather than nothing.
    const analyseButton = root.querySelector<HTMLButtonElement>('.xiangqi-review__analyse');
    expect(analyseButton).not.toBeNull();
    expect(analyseButton?.textContent).toContain('Sign in to request analysis');
  });

  it('steps through plies with the arrow keys', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountBanqiPostgame(root, 'bq_postgame');
    await flushPromises();

    // The control bar disables next/last at the final ply and first/prev at the
    // start; the shared review layout binds the keyboard on the mount root. (The
    // scrubber's "Ply X of Y" status was removed with the lichess control bar.)
    const nav = (label: string) =>
      root.querySelector<HTMLButtonElement>(`.review-controls__nav[aria-label="${label}"]`);
    // Opens at the final ply (1 of 1): next/last disabled.
    expect(nav('Next move')?.disabled).toBe(true);
    expect(nav('Previous move')?.disabled).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    // Ply 0: at the start, first/prev disabled.
    expect(nav('Previous move')?.disabled).toBe(true);
    expect(nav('Next move')?.disabled).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(nav('Next move')?.disabled).toBe(true);
  });
});

function postgameFixture() {
  // Build a REAL 1-ply banqi game with the kernel so the tree can reconstruct the
  // deal (from history.revealed's ply-0 truth board) and replay it: the deal is the
  // standard fixed arrangement, the opening move is the a1 flip (a real banqi game
  // always opens with a flip), then black resigns. Generating from the kernel keeps
  // the fixture legal — the tree replays through the same isBanqiLegalMove gate.
  const initial = createInitialBanqiState('bq_postgame', STANDARD_BANQI_DEAL);
  const flip: BanqiMove = { from: 'a1', to: 'a1' };
  const afterFlip = applyBanqiMove(initial, flip);
  return {
    game: {
      roomId: 'bq_postgame',
      variant: 'banqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-14T12:00:00.000Z',
      endedAt: '2026-06-14T12:05:00.000Z',
      rated: false,
      visibility: 'private',
      initialMs: 180000,
      incrementMs: 2000,
    },
    state: {
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      moveNumber: afterFlip.moveNumber,
      timeControl: { initialMs: 180000, incrementMs: 2000 },
    },
    timeline: [
      { type: 'move-played', at: 4, color: 'red', move: flip, ply: 1 },
      { type: 'seat-resigned', at: 5, color: 'black', winner: 'red' },
    ],
    // Final masked view (as-played) — the tree renders its own reconstruction, but
    // the payload still carries this for the watch adapter.
    view: getBanqiPlayerView(afterFlip, 'red'),
    history: {
      // Spoiler overlay: every identity unmasked per ply. The ply-0 board is the
      // full deal the adapter reconstructs from.
      revealed: [
        { ply: 0, view: banqiTruthView(initial) },
        { ply: 1, view: banqiTruthView(afterFlip) },
      ],
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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
