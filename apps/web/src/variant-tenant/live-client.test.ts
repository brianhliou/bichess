// Unit tests for the generic live-client core: frame application, replay
// capture policies, the two-column move list (masked and unmasked), and the
// disabled branch. Drives a client through the socketFactory test seam with a
// minimal two-color test variant; no real WebSocket.

import { beforeEach, describe, expect, it } from 'vitest';
import type { LiveRefs } from '../live-state.js';
import {
  createTenantLiveClient,
  type TenantLiveClient,
  type TenantLiveClientConfig,
  type TenantLiveEvent,
  type TenantLiveFrame,
  type TenantMovePlayed,
  type TenantPendingAnimation,
} from './live-client.js';
import type { TenantWebView, WebVariantTenant } from './room-chrome.js';
import type { TenantSocketClientOptions } from './socket-client.js';

type TColor = 'red' | 'blue';
type TMove = { from: string; to: string };
type TView = TenantWebView<TColor> & {
  perspective: TColor;
  squares: Record<string, TColor>;
};

const tenant: WebVariantTenant<TColor> = {
  displayName: 'Testline',
  colors: ['red', 'blue'],
  isColor: (value): value is TColor => value === 'red' || value === 'blue',
  oppositeColor: (color) => (color === 'red' ? 'blue' : 'red'),
  enabled: () => enabledFlag,
  reviewUrl: (roomId) => `/testline/game/${roomId}`,
  reasonPhrase: () => 'the rules',
  disabledTitle: 'Testline disabled',
  disabledBody: 'off',
  rejectedBody: 'rejected',
  spectatorBody: 'watching',
  selectInstruction: 'pick',
};

let enabledFlag = true;

function isTestMoveEvent(event: TenantLiveEvent): event is TenantMovePlayed<TColor, TMove> {
  return event.type === 'move-played';
}

function view(overrides: Partial<TView> = {}): TView {
  return {
    id: 'room1',
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    perspective: 'red',
    squares: {},
    ...overrides,
  };
}

type Harness = {
  client: TenantLiveClient<TColor, TView>;
  feedHello(frame: Partial<TenantLiveFrame<TColor, TView>>): void;
  feedSnapshot(frame: Partial<TenantLiveFrame<TColor, TView>>): void;
  feedEvent(frame: Partial<TenantLiveFrame<TColor, TView>>): void;
  sent: unknown[];
  boardRenders: Array<TView | null>;
  refs(): LiveRefs;
};

function createHarness(
  configOverrides: Partial<TenantLiveClientConfig<TColor, TView, TMove>> = {},
  { masked = false }: { masked?: boolean } = {},
): Harness {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '/room/tst_room1');

  let socketOptions: TenantSocketClientOptions | null = null;
  const sent: unknown[] = [];
  const boardRenders: Array<TView | null> = [];
  let liveRefs: LiveRefs | null = null;

  const client = createTenantLiveClient<TColor, TView, TMove>({
    tenant,
    gameSpecId: 'testline',
    defaultRoomId: 'tst_dev',
    boardClass: 'testline-live-board',
    playAgainRequestBody: () => ({ mode: 'pvp', gameSpecId: 'testline' }),
    renderBoard: (refs, v) => {
      liveRefs = refs;
      boardRenders.push(v);
      refs.board.className = 'board testline-live-board';
    },
    setup: () => {},
    moveList: {
      rowClass: 'move-row test-move-row',
      cellPrefix: 'test-move-row',
      masked,
      notate: (move) => `${move.from}-${move.to}`,
      isMoveEvent: isTestMoveEvent,
    },
    replayCapture: {
      positionKey: (v) => JSON.stringify(v.squares),
      plyForView: (_v, ctx) => ctx.events.filter(isTestMoveEvent).length,
    },
    socketFactory: (options) => {
      socketOptions = options;
      return {
        connect: () => {},
        close: () => {},
        reconnectNow: () => {},
        send: (payload: unknown) => {
          sent.push(payload);
          return true;
        },
        startPing: () => {},
        connection: () => 'connected',
        noticeTier: () => 'none',
        closeReason: () => '',
        clientId: () => 'test-client',
        latencyMs: () => null,
        reconnectAttempt: () => 0,
      };
    },
    ...configOverrides,
  });

  client.bootstrap();
  if (!socketOptions) throw new Error('socketFactory was not called');
  const options: TenantSocketClientOptions = socketOptions;

  function base(frame: Partial<TenantLiveFrame<TColor, TView>>): TenantLiveFrame<TColor, TView> {
    return {
      type: 'snapshot',
      seat: 'red',
      seats: {},
      state: view(),
      ...frame,
    } as TenantLiveFrame<TColor, TView>;
  }

  return {
    client,
    sent,
    boardRenders,
    refs: () => {
      if (!liveRefs) throw new Error('renderBoard never ran');
      return liveRefs;
    },
    feedHello: (frame) => {
      options.applyHello(base({ type: 'hello', ...frame }));
      options.render();
    },
    feedSnapshot: (frame) => {
      options.applySnapshot(base(frame));
      options.render();
    },
    feedEvent: (frame) => {
      options.applyEvent(base({ type: 'event-appended', ...frame }));
      options.render();
    },
  };
}

function moveEvent(color: TColor, from: string, to: string, ply: number): TenantLiveEvent {
  return { type: 'move-played', color, move: { from, to }, at: 0, ply };
}

beforeEach(() => {
  enabledFlag = true;
});

describe('tenant live-client core', () => {
  it('applies hello frames into shared state', () => {
    const h = createHarness();
    h.feedHello({
      seat: 'blue',
      state: view({ status: { type: 'playing', turn: 'red' } }),
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
      connectedSeats: { red: true, blue: false },
      events: [moveEvent('red', 'a1', 'a2', 1)],
    });
    expect(h.client.state.seat).toBe('blue');
    expect(h.client.state.timeControl).toEqual({ initialMs: 60_000, incrementMs: 1_000 });
    expect(h.client.state.connectedSeats).toEqual({ red: true, blue: false });
    expect(h.client.state.events).toHaveLength(1);
  });

  it('event frames append to the existing event log', () => {
    const h = createHarness();
    h.feedHello({ events: [moveEvent('red', 'a1', 'a2', 1)] });
    h.feedEvent({ event: moveEvent('blue', 'b1', 'b2', 2) });
    expect(h.client.state.events).toHaveLength(2);
  });

  it('keeps sticky fields when later frames omit them', () => {
    const h = createHarness();
    h.feedHello({ timeControl: { initialMs: 60_000, incrementMs: 0 } });
    h.feedSnapshot({});
    expect(h.client.state.timeControl).toEqual({ initialMs: 60_000, incrementMs: 0 });
  });

  it('renders the unmasked two-column move list with a fallback for missing plies', () => {
    const h = createHarness();
    h.feedHello({
      events: [moveEvent('red', 'a1', 'a2', 1), moveEvent('blue', 'b1', 'b2', 2)],
      state: view({ squares: { a2: 'red', b2: 'blue' } }),
    });
    const rows = [...h.refs().moveList.querySelectorAll('li')];
    expect(rows).toHaveLength(1);
    const cells = [...rows[0].querySelectorAll('span')];
    expect(cells[0].textContent).toBe('1.');
    expect(cells[1].textContent).toBe('a1-a2');
    expect(cells[2].textContent).toBe('b1-b2');
  });

  it('masks redacted plies in fog mode instead of leaving them blank', () => {
    const h = createHarness(
      {
        replayCapture: {
          positionKey: (v) => JSON.stringify(v.squares),
          // Fog policy: derive the ply from moveNumber + turn (red moves first),
          // since redacted opponent moves never arrive as events.
          plyForView: (v) =>
            Math.max(0, v.moveNumber - 1) * 2 +
            (v.status.type === 'playing' && v.status.turn === 'red' ? 0 : 1),
        },
      },
      { masked: true },
    );
    // Two plies played (moveNumber 2, red to move), but only the viewer's own
    // move arrived on the wire — ply 2 is the opponent's redacted move.
    h.feedHello({
      events: [moveEvent('red', 'a1', 'a2', 1)],
      state: view({ moveNumber: 2, squares: { a2: 'red', z9: 'blue' } }),
    });
    const masked = h.refs().moveList.querySelector('.test-move-row__move.masked');
    expect(masked).not.toBeNull();
  });

  it('captures one replay snapshot per distinct position', () => {
    const h = createHarness();
    h.feedHello({ state: view({ squares: {} }) });
    expect(h.client.replay.historyLength()).toBe(1);
    const moved = view({ squares: { a2: 'red' } });
    h.feedSnapshot({ events: [moveEvent('red', 'a1', 'a2', 1)], state: moved });
    expect(h.client.replay.historyLength()).toBe(2);
    expect(h.client.replay.latestPly()).toBe(1);
    // Same position re-sent: no duplicate snapshot.
    h.feedSnapshot({ events: [moveEvent('red', 'a1', 'a2', 1)], state: { ...moved } });
    expect(h.client.replay.historyLength()).toBe(2);
  });

  it('clears the board and skips the move list when the tenant flag is off', () => {
    let disabledCalls = 0;
    const h = createHarness({ onDisabled: () => (disabledCalls += 1) });
    h.feedHello({});
    enabledFlag = false;
    h.client.renderAll();
    expect(disabledCalls).toBeGreaterThan(0);
    const board = document.querySelector('.testline-live-board--disabled');
    expect(board).not.toBeNull();
  });

  it('routes send through the socket', () => {
    const h = createHarness();
    h.feedHello({});
    expect(h.client.send({ type: 'move', from: 'a1', to: 'a2' })).toBe(true);
    expect(h.sent).toContainEqual({ type: 'move', from: 'a1', to: 'a2' });
  });
});

describe('animateBoard hook (one-shot pending-animation channel)', () => {
  type Pending = TenantPendingAnimation<TColor, TView, TMove> | null;

  function animatedHarness(opts: { masked?: boolean } = {}): Harness & { pendings: Pending[] } {
    const pendings: Pending[] = [];
    const h = createHarness(
      {
        animateBoard: (_refs, _view, takePendingAnimation) => {
          pendings.push(takePendingAnimation());
        },
      },
      opts,
    );
    return Object.assign(h, { pendings });
  }

  it('delivers a live pending exactly once for a move event that passes the move gate', () => {
    const h = animatedHarness();
    h.feedHello({});
    expect(h.pendings.at(-1)).toBeNull();
    h.feedEvent({
      event: moveEvent('blue', 'b1', 'b2', 1),
      state: view({ squares: { b2: 'blue' } }),
    });
    expect(h.pendings.at(-1)).toEqual({
      kind: 'live',
      move: { from: 'b1', to: 'b2' },
      color: 'blue',
    });
    // One-shot: the channel is drained by the render that followed the event.
    h.client.renderAll();
    expect(h.pendings.at(-1)).toBeNull();
  });

  it('fog safety: a redacted opponent event changes the board but NEVER arms an animation', () => {
    // On fog tenants the server strips opponent move payloads; what arrives is
    // a non-move event plus a new view. The hook must see NO pending for it —
    // the client never derives a glide by diffing the two boards, so a fogged
    // origin square can never be implied client-side. Only events that pass
    // the tenant's isMoveEvent gate (here: the viewer's own move) animate.
    const h = animatedHarness({ masked: true });
    h.feedHello({ seat: 'red' });
    // Own move arrives as a real move event: pending delivered.
    h.feedEvent({
      seat: 'red',
      event: moveEvent('red', 'a1', 'a2', 1),
      state: view({ squares: { a2: 'red' } }),
    });
    expect(h.pendings.at(-1)).toEqual({
      kind: 'live',
      move: { from: 'a1', to: 'a2' },
      color: 'red',
    });
    // Redacted opponent ply: the view changes (a blue piece appears) but the
    // event carries no move shape, so the channel stays empty.
    h.feedEvent({
      seat: 'red',
      event: { type: 'ply-advanced', color: 'blue', at: 0 },
      state: view({ moveNumber: 2, squares: { a2: 'red', z9: 'blue' } }),
    });
    expect(h.pendings.at(-1)).toBeNull();
  });

  it('maps adjacent replay steps to scrub pendings carrying the previously displayed view', () => {
    const h = animatedHarness();
    h.feedHello({ state: view({ squares: {} }) });
    const moved = view({ squares: { a2: 'red' } });
    h.feedSnapshot({ events: [moveEvent('red', 'a1', 'a2', 1)], state: moved });
    expect(h.client.replay.historyLength()).toBe(2);

    h.client.replay.handleControl('prev');
    h.client.renderAll();
    const back = h.pendings.at(-1);
    expect(back).toMatchObject({ kind: 'scrub', direction: 'back' });
    // prevView is the view we stepped away from — its lastMove is what a
    // tenant reverse-animates.
    expect((back as Extract<Pending, { kind: 'scrub' }>).prevView?.squares).toEqual({ a2: 'red' });

    h.client.replay.handleControl('next');
    h.client.renderAll();
    expect(h.pendings.at(-1)).toMatchObject({ kind: 'scrub', direction: 'forward' });
    // Drained again on the following render.
    h.client.renderAll();
    expect(h.pendings.at(-1)).toBeNull();
  });
});
