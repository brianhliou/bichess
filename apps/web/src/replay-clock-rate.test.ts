// A CLOCK ONLY EVER TICKS AT ONE SECOND PER SECOND.
//
// The homepage TV and /watch have exactly two clock states, and this file pins both:
//
//   live    — the server's clock projected against Date.now(): ticks at real speed.
//   replay  — the ply's recorded value, held STATIC until the next move lands.
//
// The third state, removed 2026-09-04, drained the mover's clock by the real time the move
// cost across the CLAMPED playback window (moveDelays, [700, 2500] ms). Delta real, window
// compressed, so the rate was the ratio between them: measured on one homepage game, the bot
// read a uniform 1.61x and the human swung 1.00x-7.60x. The whole suite was green when that
// shipped because nothing asserted the RATE, only the endpoints. So: assert the rate.
import type { JieqiColor, JieqiMove, JieqiPlayerBoard, JieqiPlayerView } from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JieqiPostgameResponse } from './live-jieqi-postgame.js';
import { mountJieqiWatchReplay } from './watch-jieqi-replay.js';

// Fixed epoch so runningSince arithmetic is exact under fake timers.
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

describe('replay clock tick rate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('holds a replay clock still between plies, however long the move really took', async () => {
    // Ply 3 is a 19-SECOND think played back in a 2500 ms window: the 7.6x case from the
    // reported homepage game, and the one any reinstated drain would fail on first.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(replayFixture())),
    );
    const root = document.createElement('div');
    const handle = await mountJieqiWatchReplay(root, 'jq_rate', { autoplay: true, compact: true });

    // moveDelays = [0, 700 (first move: unknown think), 2000, 2500 (the 19s think), 2000].
    // 700 + 2000 lands on ply 2, with Red to move and 19 s about to come off her clock.
    await vi.advanceTimersByTimeAsync(2700);
    const atPly2 = handle.clockAtPly?.();
    expect(atPly2).toEqual({ first: 605_000, second: 603_000, toMove: 'first' });

    // Holding still must not mean showing nothing: the seats carry real clock readings, and
    // "unchanged" below is only meaningful because there is something on screen to change.
    const rendered = seatClockText(root);
    expect(rendered).toHaveLength(2);
    for (const text of rendered) expect(text).toMatch(/^\d+:\d{2}$/);

    // A fifth of the way through the playback window. The drain used to report 601_200 here
    // (605_000 minus a fifth of the real 19 s); the recorded value has not changed, so
    // neither may the display.
    await vi.advanceTimersByTimeAsync(500);
    expect(handle.clockAtPly?.()).toEqual(atPly2);
    expect(seatClockText(root)).toEqual(rendered);

    // Still inside the same window at 2400 ms of 2500 ms: no creep at the far end either.
    await vi.advanceTimersByTimeAsync(1900);
    expect(handle.clockAtPly?.()).toEqual(atPly2);
    expect(seatClockText(root)).toEqual(rendered);

    handle.destroy();
  });

  it('advances a replay clock only when the next move lands, and by the recorded amount', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(replayFixture())),
    );
    const root = document.createElement('div');
    const handle = await mountJieqiWatchReplay(root, 'jq_rate', { autoplay: true, compact: true });

    await vi.advanceTimersByTimeAsync(2700);
    expect(handle.clockAtPly?.()).toMatchObject({ first: 605_000 });

    // Crossing into ply 3 charges Red the full 19 s and credits the 5 s increment at once:
    // 605_000 - 19_000 + 5_000. The jump is the point — it is where the time actually went.
    await vi.advanceTimersByTimeAsync(2500);
    expect(handle.clockAtPly?.()).toEqual({ first: 591_000, second: 603_000, toMove: 'second' });

    handle.destroy();
  });

  it('ticks a LIVE clock at exactly one second per second', async () => {
    // The other half of the doctrine: removing the replay drain must not stop live games
    // from counting down, and they count down against the wall, not against a window.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(liveFixture())),
    );
    const root = document.createElement('div');
    const handle = await mountJieqiWatchReplay(root, 'jq_live', {
      autoplay: false,
      compact: true,
      live: true,
    });

    expect(handle.clockAtPly?.()).toMatchObject({ first: 300_000, second: 240_000 });

    await vi.advanceTimersByTimeAsync(3_000);
    // Red is on the clock: exactly 3 s gone, not 1.61x of it. Black is idle and unmoved.
    expect(handle.clockAtPly?.()).toMatchObject({ first: 297_000, second: 240_000 });

    await vi.advanceTimersByTimeAsync(7_000);
    expect(handle.clockAtPly?.()).toMatchObject({ first: 290_000, second: 240_000 });

    handle.destroy();
  });
});

function seatClockText(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.showcase-seat-clock')].map((el) => el.textContent ?? '');
}

// Four plies, 10+5, whose third move is a 19-second think. clockSeries reconstructs:
//   [0] 600_000 / 600_000   [1] 605_000 / 600_000   [2] 605_000 / 603_000
//   [3] 591_000 / 603_000   [4] 591_000 / 606_000
function replayFixture(): JieqiPostgameResponse {
  const move: JieqiMove = { from: 'a4', to: 'a5' };
  const playingRed = { type: 'playing' as const, turn: 'red' as const };
  const playingBlack = { type: 'playing' as const, turn: 'black' as const };
  const at = (ply: number): { type: 'playing'; turn: JieqiColor } =>
    ply % 2 === 0 ? playingRed : playingBlack;

  return {
    game: {
      roomId: 'jq_rate',
      variant: 'jieqi',
      mode: 'pve',
      result: 'red-wins',
      termination: 'checkmate',
      plyCount: 4,
      startedAt: '2026-09-04T12:00:00.000Z',
      endedAt: '2026-09-04T12:01:00.000Z',
      rated: false,
      visibility: 'public',
      initialMs: 600_000,
      incrementMs: 5_000,
    },
    state: {
      status: { type: 'finished', winner: 'red', reason: 'checkmate' },
      moveNumber: 3,
      timeControl: { initialMs: 600_000, incrementMs: 5_000 },
    },
    // The gaps are what matter: 2 s, then NINETEEN, then 2 s.
    timeline: [
      { type: 'move-played', at: 1_000, color: 'red', move, ply: 1 },
      { type: 'move-played', at: 3_000, color: 'black', move, ply: 2 },
      { type: 'move-played', at: 22_000, color: 'red', move, ply: 3 },
      { type: 'move-played', at: 24_000, color: 'black', move, ply: 4 },
    ],
    view: view('red', board(4), move, at(4)),
    history: {
      truth: [0, 1, 2, 3, 4].map((ply) => ({
        ply,
        view: view('red', board(ply), ply === 0 ? undefined : move, at(ply)),
      })),
      masked: [0, 1, 2, 3, 4].map((ply) => ({
        ply,
        view: view('red', board(ply), ply === 0 ? undefined : move, at(ply)),
      })),
    },
  };
}

// An in-progress game whose server clock has Red running since exactly `NOW`.
function liveFixture(): JieqiPostgameResponse {
  const playingRed = { type: 'playing' as const, turn: 'red' as const };
  return {
    game: {
      roomId: 'jq_live',
      variant: 'jieqi',
      mode: 'pve',
      result: 'in-progress',
      termination: null,
      plyCount: 0,
      startedAt: '2026-09-04T12:00:00.000Z',
      endedAt: null,
      rated: false,
      visibility: 'public',
      initialMs: 300_000,
      incrementMs: 0,
    },
    state: {
      status: playingRed,
      moveNumber: 1,
      timeControl: { initialMs: 300_000, incrementMs: 0 },
      clock: {
        activeColor: 'red',
        incrementMs: 0,
        initialMs: 300_000,
        remainingMs: { red: 300_000, black: 240_000 },
        runningSince: NOW,
      },
    },
    timeline: [],
    view: view('red', board(0), undefined, playingRed),
    history: {
      truth: [{ ply: 0, view: view('red', board(0), undefined, playingRed) }],
      masked: [{ ply: 0, view: view('red', board(0), undefined, playingRed) }],
    },
  } as unknown as JieqiPostgameResponse;
}

// Board contents are irrelevant here; only the piece square moves so each ply's view is
// distinct enough for the renderer to redraw.
function board(ply: number): JieqiPlayerBoard {
  const files = ['a4', 'a5', 'a6', 'a7', 'a8'];
  return {
    e1: { color: 'red', role: 'general', faceDown: false },
    e10: { color: 'black', role: 'general', faceDown: false },
    [files[ply] ?? 'a4']: { color: 'red', role: 'soldier', faceDown: false },
  };
}

function view(
  perspective: JieqiColor,
  pieces: JieqiPlayerBoard,
  lastMove: JieqiMove | undefined,
  status: JieqiPlayerView['status'],
): JieqiPlayerView {
  return {
    id: `${perspective}-${Object.keys(pieces).join('')}`,
    perspective,
    board: pieces,
    legalMoves: [],
    captured: [],
    inCheck: false,
    status,
    moveNumber: 1,
    ...(lastMove ? { lastMove } : {}),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}
