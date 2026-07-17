import {
  applyCrossroadsChessOpenMove,
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessPlayerView,
  createInitialCrossroadsChessState,
  gameSpecForId,
  getCrossroadsChessOpenView,
} from '@mistboard/game';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCrossroadsChessLiveClientForTest,
  crossroadsChessLifecycleAnalyticsInput,
  crossroadsChessReviewUrl,
  crossroadsChessTerminalActionsMarkup,
  crossroadsLivePlayAgainRequestBody,
  crossroadsLiveTimeControlLabel,
} from './live-crossroads-chess.js';
import type {
  TenantSocketClientOptions,
  TenantSocketFrame,
} from './variant-tenant/socket-client.js';

describe('Crossroads Chess live room terminal actions', () => {
  it('links finished games to the Crossroads review page', () => {
    const actions = crossroadsChessTerminalActionsMarkup('dchess_test', 'finished');

    expect(actions).toContain('href="/crossroads-chess/game/dchess_test"');
    expect(actions).toContain('Review game');
    expect(actions).toContain('Play again');
    expect(actions).not.toContain('href="/crossroads-chess"');
    expect(actions).toContain('href="/"');
    expect(actions).toContain('Home');
  });

  it('does not offer review or new-game actions after aborts', () => {
    const actions = crossroadsChessTerminalActionsMarkup('dchess_abort', 'aborted');

    expect(actions).not.toContain('Review game');
    expect(actions).not.toContain('/crossroads-chess/game/dchess_abort');
    expect(actions).not.toContain('href="/crossroads-chess"');
    expect(actions).not.toContain('Play again');
    expect(actions).toContain('href="/"');
    expect(actions).toContain('Home');
  });

  it('encodes room ids in review URLs', () => {
    expect(crossroadsChessReviewUrl('dchess room')).toBe('/crossroads-chess/game/dchess%20room');
  });

  it('creates play-again room requests with the current time control', () => {
    expect(crossroadsLivePlayAgainRequestBody({ initialMs: 300_000, incrementMs: 5_000 })).toEqual({
      mode: 'pvp',
      gameSpecId: 'crossroads-chess',
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      rated: false,
      preferredColor: 'random',
    });
  });

  it('creates PvE play-again room requests with the same engine and swapped color', () => {
    expect(
      crossroadsLivePlayAgainRequestBody(
        { initialMs: 60_000, incrementMs: 1_000 },
        {
          mode: 'pve',
          pveEngineId: 'fairy-stockfish-crossroads-very-strong',
          seat: 'white',
        },
      ),
    ).toEqual({
      mode: 'pve',
      gameSpecId: 'crossroads-chess',
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
      rated: false,
      preferredColor: 'red',
      engineId: 'fairy-stockfish-crossroads-very-strong',
    });
  });

  it('falls back to 5+5 when a finished live room had no time control', () => {
    expect(crossroadsLivePlayAgainRequestBody(null).timeControl).toEqual({
      initialMs: 300_000,
      incrementMs: 5_000,
    });
  });

  it('formats Crossroads room time controls for the live metadata panel', () => {
    expect(crossroadsLiveTimeControlLabel({ initialMs: 300_000, incrementMs: 5_000 })).toBe('5+5');
    expect(crossroadsLiveTimeControlLabel({ initialMs: 300_000, incrementMs: 0 })).toBe('5+0');
    expect(crossroadsLiveTimeControlLabel(null)).toBeNull();
  });

  it('builds Crossroads lifecycle analytics with canonical spec fields', () => {
    const spec = gameSpecForId(CROSSROADS_CHESS_SPEC_ID);
    const view = getCrossroadsChessOpenView(
      {
        ...createInitialCrossroadsChessState('dchess_telemetry'),
        moveNumber: 4,
        status: { type: 'finished', winner: 'red', reason: 'race' },
      },
      'white',
    );

    expect(
      crossroadsChessLifecycleAnalyticsInput(view, {
        roomMode: 'pve',
        timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      }),
    ).toEqual({
      statusType: 'finished',
      baseProps: {
        gameId: 'dchess_telemetry',
        game_spec: spec.id,
        family: spec.family,
        setup: spec.setup,
        visibility: spec.visibility,
        rating_pool: spec.ratingPoolBase,
        rated: false,
        roomMode: 'pve',
        initialMs: 300_000,
        incrementMs: 5_000,
        time_class: 'rapid',
      },
      outcome: { winner: 'red', reason: 'race', moveNumber: 4 },
    });
  });
});

// ── Migrated live room on the tenant core (#84): kernel-rebuilt replay history
// (#80) + the clickable ply-jump move list, driven over the socket test seam
// with a real two-ply game replayed through the OPEN kernel. ─────────────────

describe('Crossroads Chess live room on the tenant core', () => {
  const ROOM = 'dchess_room1';

  // A real two-ply game: the kernel picks the moves so the fixtures are
  // guaranteed legal (the client re-replays them through the same kernel).
  function twoPlyGame() {
    const s0 = createInitialCrossroadsChessState(ROOM);
    const whiteMove = getCrossroadsChessOpenView(s0, 'white').legalMoves[0];
    const s1 = applyCrossroadsChessOpenMove(s0, whiteMove);
    const redMove = getCrossroadsChessOpenView(s1, 'red').legalMoves[0];
    const s2 = applyCrossroadsChessOpenMove(s1, redMove);
    return { whiteMove, redMove, finalView: getCrossroadsChessOpenView(s2, 'white') };
  }

  function createHarness() {
    document.body.innerHTML = '<div id="app"></div>';
    window.history.replaceState(null, '', `/room/${ROOM}`);
    let socketOptions: TenantSocketClientOptions | null = null;
    const client = createCrossroadsChessLiveClientForTest((options) => {
      socketOptions = options;
      return {
        connect: () => {},
        close: () => {},
        reconnectNow: () => {},
        send: () => true,
        startPing: () => {},
        connection: () => 'connected',
        noticeTier: () => 'none',
        closeReason: () => '',
        clientId: () => 'test-client',
        latencyMs: () => null,
        reconnectAttempt: () => 0,
      };
    });
    client.bootstrap();
    if (!socketOptions) throw new Error('socketFactory was not called');
    const options: TenantSocketClientOptions = socketOptions;
    return { client, options };
  }

  function helloFrame(finalView: CrossroadsChessPlayerView, events: unknown[]): TenantSocketFrame {
    return {
      type: 'hello',
      seat: 'white',
      seats: {},
      state: finalView,
      events,
    } as unknown as TenantSocketFrame;
  }

  function jumpButtons(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>('.move-row button')];
  }

  beforeEach(() => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
  });

  it('#80: rebuilds the full per-ply history from the hello event log', () => {
    const { client, options } = createHarness();
    const { whiteMove, redMove, finalView } = twoPlyGame();
    options.applyHello(
      helloFrame(finalView, [
        { type: 'move-played', color: 'white', move: whiteMove, at: 1, ply: 1 },
        { type: 'move-played', color: 'red', move: redMove, at: 2, ply: 2 },
      ]),
    );
    options.render();
    // Initial position + two plies, from a single frame — reconnects scrub.
    expect(client.replay.historyLength()).toBe(3);
    expect(client.replay.latestPly()).toBe(2);
    expect(client.replay.controlDisabled('prev')).toBe(false);
    client.replay.handleControl('prev');
    const scrubbed = client.replay.currentView(client.state.view);
    expect(scrubbed?.lastMove).toEqual(whiteMove);
    expect(scrubbed?.status).toEqual({ type: 'playing', turn: 'red' });
  });

  it('#84: the clickable move list jumps to a ply and back to live', () => {
    const { client, options } = createHarness();
    const { whiteMove, redMove, finalView } = twoPlyGame();
    options.applyHello(
      helloFrame(finalView, [
        { type: 'move-played', color: 'white', move: whiteMove, at: 1, ply: 1 },
        { type: 'move-played', color: 'red', move: redMove, at: 2, ply: 2 },
      ]),
    );
    options.render();
    const buttons = jumpButtons();
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe(`${whiteMove.from}${whiteMove.to}`);

    buttons[0].click();
    expect(client.replay.isLive()).toBe(false);
    expect(client.replay.activePly()).toBe(1);
    // The re-render highlights the scrubbed ply.
    expect(jumpButtons()[0].className).toBe('active');

    // Jumping to the latest ply returns to live.
    jumpButtons()[1].click();
    expect(client.replay.isLive()).toBe(true);
  });
});
