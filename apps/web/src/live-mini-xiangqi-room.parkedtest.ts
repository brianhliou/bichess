import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleDarkMiniXiangqiReplayKeyboard,
  isDarkMiniXiangqiLiveRoom,
  renderDarkMiniXiangqiRoom,
  resetDarkMiniXiangqiReplayState,
} from './live-mini-xiangqi-room.js';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';

type MiniView = {
  id: string;
  perspective: 'red' | 'black';
  board: Record<
    string,
    { piece: { color: string; role: string }; shrouded: false } | { color: string; shrouded: true }
  >;
  visibleSquares: string[];
  legalMoves: { from: string; to: string }[];
  status: { type: string; turn?: string; winner?: string | null; reason?: string };
  moveNumber: number;
  lastMove?: { from: string; to: string };
};

describe('Dark Mini Xiangqi live room', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    liveState.gameSpecId = 'dark-mini-xiangqi';
    liveState.connectionState = 'connected';
    liveState.closeReason = '';
    liveState.room = 'dmxq_test';
    liveState.roomMode = 'pvp';
    liveState.pveEngineId = null;
    liveState.seat = 'red';
    liveState.events = [];
    liveState.state = viewFixture() as never;
    liveState.abortDeadline = null;
    liveState.forfeitDeadline = null;
    liveState.rematch = { offers: {}, finalizedRoomId: null };
    liveState.timeControl = null;
    resetDarkMiniXiangqiReplayState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    document.body.classList.remove('live-route--mini-xiangqi');
    liveState.gameSpecId = null;
    liveState.connectionState = 'connecting';
    liveState.roomMode = 'pvp';
    liveState.pveEngineId = null;
    liveState.seat = 'spectator';
    liveState.events = [];
    liveState.state = null;
    liveState.rematch = { offers: {}, finalizedRoomId: null };
    liveState.timeControl = null;
    resetDarkMiniXiangqiReplayState();
  });

  it('detects a dark-mini-xiangqi live room', () => {
    expect(isDarkMiniXiangqiLiveRoom()).toBe(true);
    liveState.gameSpecId = 'dark-xiangqi';
    expect(isDarkMiniXiangqiLiveRoom()).toBe(false);
  });

  it('renders the 7x7 intersection board with a fog mask and tags the layout', () => {
    const refs = refsFixture();

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const svg = refs.board.querySelector('.mini-xq-board');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 516 516');
    expect(refs.board.querySelector('mask')).not.toBeNull();
    expect(document.body.classList.contains('live-route--mini-xiangqi')).toBe(true);
  });

  it('keeps shrouded live pieces role-neutral in the DOM', () => {
    const refs = refsFixture();

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.board.innerHTML).toContain('aria-label="black hidden piece"');
    expect(refs.board.innerHTML).not.toContain('aria-label="black soldier"');
  });

  it('submits a selected legal move from intersection click targets', () => {
    const refs = refsFixture();
    const sent: unknown[] = [];
    renderDarkMiniXiangqiRoom(refs, {
      reconnectNow: () => {},
      sendSocket: (payload) => {
        sent.push(payload);
        return true;
      },
    });

    refs.board.querySelector<SVGElement>('[data-square="b1"]')?.dispatchEvent(clickEvent());
    refs.board.querySelector<SVGElement>('[data-square="b2"]')?.dispatchEvent(clickEvent());

    expect(sent).toEqual([{ type: 'move', from: 'b1', to: 'b2' }]);
  });

  it('clears selected target dots on an outside click', () => {
    const refs = refsFixture();
    const outside = document.createElement('button');
    document.body.append(outside);
    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    refs.board.querySelector<SVGElement>('[data-square="b1"]')?.dispatchEvent(clickEvent());
    expect(refs.board.querySelector('.mini-xq-hint')).not.toBeNull();

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(refs.board.querySelector('.mini-xq-hint')).toBeNull();
    outside.remove();
  });

  it('shows resign controls only after the first-move window', () => {
    const refs = refsFixture();
    liveState.state = { ...viewFixture(), moveNumber: 2 } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toContain('Resign');
  });

  it('shows abort controls during the first-move window', () => {
    const refs = refsFixture();

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toContain('Abort');
  });

  it('renders aborted rooms without reading a side to move', () => {
    const refs = refsFixture();
    liveState.state = {
      ...viewFixture(),
      status: { type: 'aborted', reason: 'user-abort' },
      legalMoves: [],
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.actionStatus.textContent).toContain('Game aborted');
    expect(refs.gameControlsSection.hidden).toBe(true);
  });

  it('scrubs back through snapshots and returns to live', () => {
    const refs = refsFixture();
    const callbacks = { reconnectNow: () => {}, sendSocket: () => true };

    liveState.state = viewFixture() as never;
    renderDarkMiniXiangqiRoom(refs, callbacks);
    liveState.state = {
      ...viewFixture(),
      board: {
        b2: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
        b7: { color: 'black', shrouded: true },
      },
      lastMove: { from: 'b1', to: 'b2' },
      status: { type: 'playing', turn: 'black' },
      visibleSquares: ['b2', 'b7'],
    } as never;
    renderDarkMiniXiangqiRoom(refs, callbacks);

    expect(refs.replayMeta.textContent).toBe('Live · ply 1 of 1');
    refs.replayControls[0]!.dispatchEvent(clickEvent()); // first
    expect(refs.replayMeta.textContent).toBe('Replay · ply 0 of 1');
    refs.replayControls[1]!.dispatchEvent(clickEvent()); // next
    expect(refs.replayMeta.textContent).toBe('Live · ply 1 of 1');
  });

  it('renders visible moves in full-move rows with hidden opponent plies', () => {
    const refs = refsFixture();
    liveState.state = {
      ...viewFixture(),
      moveNumber: 2,
      status: { type: 'playing', turn: 'black' },
    } as never;
    liveState.events = [
      { type: 'move-played', at: 2, color: 'red', move: { from: 'b1', to: 'b2' }, ply: 1 },
      { type: 'move-played', at: 4, color: 'red', move: { from: 'b2', to: 'b3' }, ply: 3 },
    ] as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const rows = [...refs.moveList.querySelectorAll('.xiangqi-move-row')].map((row) =>
      row.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual(['1.b1-b2...', '2.b2-b3']);
  });

  it('highlights the viewer own last move', () => {
    const refs = refsFixture();
    liveState.seat = 'red';
    liveState.state = {
      ...viewFixture(),
      board: { a3: { piece: { color: 'red', role: 'soldier' }, shrouded: false } },
      visibleSquares: ['a3'],
      lastMove: { from: 'a2', to: 'a3' },
      status: { type: 'playing', turn: 'black' },
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.board.querySelector('.mini-xq-last')).not.toBeNull();
  });

  it('never highlights an opponent last move, even if a view carries one', () => {
    const refs = refsFixture();
    liveState.seat = 'red';
    // Simulate a view whose lastMove lands on a square holding Black's piece —
    // the render guard must drop it so Red never sees Black's move highlighted.
    liveState.state = {
      ...viewFixture(),
      board: { a5: { color: 'black', shrouded: true } },
      visibleSquares: ['a5'],
      lastMove: { from: 'a6', to: 'a5' },
      status: { type: 'playing', turn: 'red' },
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    expect(refs.board.querySelector('.mini-xq-last')).toBeNull();
  });

  it('offers a mutual-confirm rematch from a finished game (seated)', () => {
    const sendSocket = vi.fn(() => true);
    const refs = refsFixture();
    liveState.seat = 'red';
    liveState.rematch = { offers: {}, finalizedRoomId: null };
    liveState.state = {
      ...viewFixture(),
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      legalMoves: [],
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket });
    const rematch = [...refs.roomActions.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rematch',
    );
    expect(rematch).toBeDefined();
    // No instant play-again room is created for a seated finished game.
    expect(
      [...refs.roomActions.querySelectorAll('button')].some((b) => b.textContent === 'Play again'),
    ).toBe(false);
    rematch?.dispatchEvent(clickEvent());
    expect(sendSocket).toHaveBeenCalledWith({ type: 'rematch:offer' });
  });

  it('shows the opponent rematch offer with accept/decline', () => {
    const sendSocket = vi.fn(() => true);
    const refs = refsFixture();
    liveState.seat = 'red';
    liveState.rematch = { offers: { black: true }, finalizedRoomId: null };
    liveState.state = {
      ...viewFixture(),
      status: { type: 'finished', winner: 'black', reason: 'resignation' },
      legalMoves: [],
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket });
    const labels = [...refs.roomActions.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('Accept');
    expect(labels).toContain('Decline');
    [...refs.roomActions.querySelectorAll('button')]
      .find((b) => b.textContent === 'Accept')
      ?.dispatchEvent(clickEvent());
    expect(sendSocket).toHaveBeenCalledWith({ type: 'rematch:offer' });
  });

  it('offers play again, not rematch, after a finished PvE game', () => {
    const fetchMock = vi.fn((_: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: false,
        status: 503,
      } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    const sendSocket = vi.fn(() => true);
    const refs = refsFixture();
    liveState.roomMode = 'pve';
    liveState.pveEngineId = 'python-dmx-v1.0';
    liveState.seat = 'red';
    liveState.timeControl = { initialMs: 60_000, incrementMs: 1_000 };
    liveState.rematch = { offers: {}, finalizedRoomId: null };
    liveState.state = {
      ...viewFixture(),
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      legalMoves: [],
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket });
    const labels = [...refs.roomActions.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('Play again');
    expect(labels).not.toContain('Rematch');

    refs.roomActions.querySelector<HTMLButtonElement>('button')?.dispatchEvent(clickEvent());
    expect(sendSocket).not.toHaveBeenCalled();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      mode: 'pve',
      gameSpecId: 'dark-mini-xiangqi',
      preferredColor: 'black',
      engineId: 'python-dmx-v1.0',
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
    });
  });

  it('offers no actions after an abort (no play-again, no Home)', () => {
    const refs = refsFixture();
    liveState.state = {
      ...viewFixture(),
      status: { type: 'aborted' },
      legalMoves: [],
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });
    const labels = [...refs.roomActions.querySelectorAll('button, a')].map((el) => el.textContent);
    // An aborted game spun up a fresh solo room (mover could play before the
    // opponent joined, no cue to the opponent); chess shows nothing here either.
    // Home is gone too (lichess parity): the site nav is the way out.
    expect(labels).not.toContain('Play again');
    expect(labels).not.toContain('Home');
  });

  it('links to the postgame review from a finished game', () => {
    const refs = refsFixture();
    liveState.state = {
      ...viewFixture(),
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      legalMoves: [],
    } as never;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const review = [...refs.roomActions.querySelectorAll('a')].find(
      (anchor) => anchor.textContent === 'Review game',
    );
    expect(review?.getAttribute('href')).toBe('/dark-mini-xiangqi/game/dmxq_test');
  });

  it('shows the abort countdown to the waiting seat during the first-move window', () => {
    const refs = refsFixture();
    liveState.seat = 'black'; // red is to move, so black is waiting
    liveState.abortDeadline = Date.now() + 20_000;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const countdown = refs.gameControls.querySelector('[data-abort-countdown]');
    expect(countdown?.textContent).toContain('Waiting for first move');
    expect(countdown?.textContent).toContain('aborting in');
  });

  it('shows the forfeit countdown banner to the beneficiary after the first move', () => {
    const refs = refsFixture();
    liveState.state = { ...viewFixture(), moveNumber: 2 } as never;
    liveState.forfeitDeadline = Date.now() + 30_000;

    renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });

    const banner = refs.gameControls.querySelector('[data-forfeit-countdown]');
    expect(banner?.textContent).toContain('Opponent left, you win in');
  });
});

function feed(refs: LiveRefs, view: MiniView): void {
  liveState.state = view as never;
  renderDarkMiniXiangqiRoom(refs, { reconnectNow: () => {}, sendSocket: () => true });
}

function clickReplay(refs: LiveRefs, action: string): void {
  for (const button of refs.replayControls) {
    if (button.dataset.replay === action) {
      button.click();
      return;
    }
  }
}

describe('Dark Mini Xiangqi replay scrubber', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    liveState.gameSpecId = 'dark-mini-xiangqi';
    liveState.connectionState = 'connected';
    liveState.seat = 'red';
    liveState.events = [];
    resetDarkMiniXiangqiReplayState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    liveState.gameSpecId = null;
  });

  // bug #1: under fog an opponent's hidden move can leave this player's board,
  // vision, lastMove, and moveNumber unchanged — only the side to move flips
  // (Red's move does not bump moveNumber). The old position key omitted `turn`,
  // so the hidden ply collapsed into the previous one and the back-scroll
  // truncated. The key now includes the side to move.
  it('records a side-to-move-only hidden ply as a distinct snapshot', () => {
    const refs = refsFixture();
    // Black's perspective. It is Red's turn (ply 4); Red has nothing visible here.
    const beforeHidden: MiniView = {
      id: 'g',
      perspective: 'black',
      board: { d7: { piece: { color: 'black', role: 'general' }, shrouded: false } },
      visibleSquares: ['d7'],
      legalMoves: [],
      status: { type: 'playing', turn: 'red' },
      moveNumber: 3,
      lastMove: { from: 'd6', to: 'd7' },
    };
    feed(refs, beforeHidden);
    // Red plays a hidden move: identical view except the side to move flips to
    // Black (ply 5). moveNumber is unchanged because Red's move doesn't bump it.
    feed(refs, { ...beforeHidden, status: { type: 'playing', turn: 'black' } });

    // The hidden ply is its own snapshot (ply 5), not collapsed into ply 4.
    expect(refs.replayMeta.textContent).toBe('Live · ply 5 of 5');
    clickReplay(refs, 'prev');
    expect(refs.replayMeta.textContent).toBe('Replay · ply 4 of 5');
  });

  // bug #2: the live position IS the last captured snapshot, so one back-step
  // must move exactly one ply (no redundant duplicate of the final ply), and the
  // scrubber must reach the starting position.
  it('steps one ply back from live and scrolls to the start', () => {
    const refs = refsFixture();
    const frames: MiniView[] = [
      {
        id: 'g',
        perspective: 'red',
        board: { d1: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d1'],
        legalMoves: [],
        status: { type: 'playing', turn: 'red' },
        moveNumber: 1,
      },
      {
        id: 'g',
        perspective: 'red',
        board: { d2: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d2'],
        legalMoves: [],
        status: { type: 'playing', turn: 'black' },
        moveNumber: 1,
        lastMove: { from: 'd1', to: 'd2' },
      },
      {
        id: 'g',
        perspective: 'red',
        board: { d3: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d3'],
        legalMoves: [],
        status: { type: 'playing', turn: 'red' },
        moveNumber: 2,
        lastMove: { from: 'd2', to: 'd3' },
      },
      {
        id: 'g',
        perspective: 'red',
        board: { e7: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['e7', 'd7', 'e6'],
        legalMoves: [],
        status: { type: 'finished', winner: 'red', reason: 'general-captured' },
        moveNumber: 2,
        lastMove: { from: 'd3', to: 'e7' },
      },
    ];
    for (const frame of frames) feed(refs, frame);

    expect(refs.replayMeta.textContent).toBe('Live · ply 3 of 3');
    clickReplay(refs, 'prev');
    expect(refs.replayMeta.textContent).toBe('Replay · ply 2 of 3');
    clickReplay(refs, 'first');
    expect(refs.replayMeta.textContent).toBe('Replay · ply 0 of 3');
  });

  it('navigates live replay snapshots from arrow keys', () => {
    const refs = refsFixture();
    const frames: MiniView[] = [
      {
        id: 'g',
        perspective: 'red',
        board: { d1: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d1'],
        legalMoves: [],
        status: { type: 'playing', turn: 'red' },
        moveNumber: 1,
      },
      {
        id: 'g',
        perspective: 'red',
        board: { d2: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d2'],
        legalMoves: [],
        status: { type: 'playing', turn: 'black' },
        moveNumber: 1,
        lastMove: { from: 'd1', to: 'd2' },
      },
      {
        id: 'g',
        perspective: 'red',
        board: { d3: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d3'],
        legalMoves: [],
        status: { type: 'playing', turn: 'red' },
        moveNumber: 2,
        lastMove: { from: 'd2', to: 'd3' },
      },
      {
        id: 'g',
        perspective: 'red',
        board: { e7: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['e7', 'd7', 'e6'],
        legalMoves: [],
        status: { type: 'finished', winner: 'red', reason: 'general-captured' },
        moveNumber: 2,
        lastMove: { from: 'd3', to: 'e7' },
      },
    ];
    for (const frame of frames) feed(refs, frame);

    handleDarkMiniXiangqiReplayKeyboard(replayKey('ArrowUp'));
    expect(refs.replayMeta.textContent).toBe('Replay · ply 0 of 3');
    handleDarkMiniXiangqiReplayKeyboard(replayKey('ArrowDown'));
    expect(refs.replayMeta.textContent).toBe('Live · ply 3 of 3');
    handleDarkMiniXiangqiReplayKeyboard(replayKey('ArrowLeft'));
    expect(refs.replayMeta.textContent).toBe('Replay · ply 2 of 3');
    handleDarkMiniXiangqiReplayKeyboard(replayKey('ArrowRight'));
    expect(refs.replayMeta.textContent).toBe('Live · ply 3 of 3');
  });

  // Regression: stepping back must keep every move row rendered — only the
  // highlight moves. The list used to be capped at the scrubbed ply, so
  // back-scrolling made later moves vanish and reappear on the way forward.
  it('keeps every move row when scrubbing back, moving only the highlight', () => {
    const refs = refsFixture();
    // Red (the viewer) plays plies 1 and 3; Black's reply at ply 2 stays hidden.
    liveState.events = [
      { type: 'move-played', at: 1, color: 'red', move: { from: 'd1', to: 'd2' }, ply: 1 },
      { type: 'move-played', at: 3, color: 'red', move: { from: 'd2', to: 'd3' }, ply: 3 },
    ] as never;
    const frames: MiniView[] = [
      {
        id: 'g',
        perspective: 'red',
        board: { d2: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d2'],
        legalMoves: [],
        status: { type: 'playing', turn: 'black' },
        moveNumber: 1,
        lastMove: { from: 'd1', to: 'd2' },
      },
      {
        id: 'g',
        perspective: 'red',
        board: { d2: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d2'],
        legalMoves: [],
        status: { type: 'playing', turn: 'red' },
        moveNumber: 2,
        lastMove: { from: 'd1', to: 'd2' },
      },
      {
        id: 'g',
        perspective: 'red',
        board: { d3: { piece: { color: 'red', role: 'general' }, shrouded: false } },
        visibleSquares: ['d3'],
        legalMoves: [],
        status: { type: 'playing', turn: 'black' },
        moveNumber: 2,
        lastMove: { from: 'd2', to: 'd3' },
      },
    ];
    for (const frame of frames) feed(refs, frame);

    const rowText = () =>
      [...refs.moveList.querySelectorAll('.xiangqi-move-row')].map((row) =>
        row.textContent?.replace(/\s+/g, ' ').trim(),
      );

    // Live: both full-move rows present, nothing highlighted.
    expect(refs.replayMeta.textContent).toBe('Live · ply 3 of 3');
    expect(rowText()).toEqual(['1.d1-d2...', '2.d2-d3']);
    expect(refs.moveList.querySelectorAll('.xiangqi-move-row__move.active').length).toBe(0);

    // Step all the way back: the rows must NOT collapse — the highlight moves
    // onto Red's first move (ply 1) while the full list stays put.
    clickReplay(refs, 'first');
    expect(refs.replayMeta.textContent).toBe('Replay · ply 1 of 3');
    expect(rowText()).toEqual(['1.d1-d2...', '2.d2-d3']);
    const active = refs.moveList.querySelectorAll('.xiangqi-move-row__move.active');
    expect(active.length).toBe(1);
    expect(active[0]?.textContent).toBe('d1-d2');
  });
});

function viewFixture(): MiniView {
  return {
    id: 'mxq-test',
    perspective: 'red',
    board: {
      b1: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
      b7: { color: 'black', shrouded: true },
    },
    visibleSquares: ['b1', 'b2', 'b7'],
    legalMoves: [{ from: 'b1', to: 'b2' }],
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
  };
}

function refsFixture(): LiveRefs {
  const root = document.createElement('div');
  // first/next stay at indices 0/1 (positionally referenced by existing tests);
  // prev/latest are appended for the scrubber tests (which select by data-replay).
  root.innerHTML =
    '<button data-replay="first"></button><button data-replay="next"></button>' +
    '<button data-replay="prev"></button><button data-replay="latest"></button>';
  return {
    actionSection: el('section'),
    actionStatus: el('div'),
    board: el('div'),
    boardPaused: el('div'),
    boardStatus: el('div'),
    capturesBottom: el('div'),
    capturesTop: el('div'),
    clockBottom: el('div'),
    clockNote: el('p'),
    clockTop: el('div'),
    devViews: el('div'),
    devViewsSection: el('section'),
    draftPicker: el('div'),
    gameControls: el('div'),
    gameControlsSection: el('section'),
    gameInfo: el('div'),
    hiddenPool: el('div'),
    moveList: el('ol'),
    offerSection: el('section'),
    playerBottom: el('div'),
    playerTop: el('div'),
    promotion: el('div'),
    replayControls: root.querySelectorAll<HTMLButtonElement>('[data-replay]'),
    replayMeta: el('p'),
    roomActions: el('div'),
    roomMeta: el('p'),
    selectionList: el('div'),
    selectionSection: el('section'),
    starts: el('div'),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
  return document.createElement(tagName);
}

function clickEvent(): MouseEvent {
  return new MouseEvent('click', { bubbles: true });
}

function replayKey(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, cancelable: true });
}
