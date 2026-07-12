import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import {
  applyDropMiniXiangqiMove,
  createInitialDropMiniXiangqiState,
  type DropMiniXiangqiMove,
  getLegalDropMiniXiangqiMoves,
  type MiniXiangqiColor,
} from '@mistboard/game';
import { dropMiniXiangqiTenant } from './drop-mini-xiangqi-tenant.js';
import {
  DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
  dropMiniXiangqiEngineSeatFor,
  dropMiniXiangqiMoveToUci,
  isDropMiniXiangqiEngineClientId,
  legalMoveForUci,
  playDropMiniXiangqiEngineMoveIfReady,
  scheduleDropMiniXiangqiEngineMove,
} from './server-drop-mini-xiangqi-engine.js';
import { appendTenantRuntimeEvent, createTenantRuntimeRoom } from './variant-tenant/runtime.js';

type DropMiniEngineRoom = Parameters<typeof playDropMiniXiangqiEngineMoveIfReady>[1];
type DropMiniEngineContext = Parameters<typeof playDropMiniXiangqiEngineMoveIfReady>[0];

const dropMiniFlagBefore = process.env.MISTBOARD_DROP_MINI_XIANGQI_ENABLED;
process.env.MISTBOARD_DROP_MINI_XIANGQI_ENABLED = 'true';
after(() => {
  if (dropMiniFlagBefore === undefined) delete process.env.MISTBOARD_DROP_MINI_XIANGQI_ENABLED;
  else process.env.MISTBOARD_DROP_MINI_XIANGQI_ENABLED = dropMiniFlagBefore;
});

// The live move source is Fairy-Stockfish (a subprocess), so the unit tests cover
// the deterministic, FSF-free surface: seat detection, scheduling gating, and the
// Drop-Mini-specific UCI translation. Live FSF play is covered by the self-play
// parity harness (scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts).

test('every legal start move round-trips through UCI', () => {
  const state = createInitialDropMiniXiangqiState('fsf-roundtrip');
  const legal = getLegalDropMiniXiangqiMoves(state);
  assert.ok(legal.length > 0, 'start position should have legal moves');
  for (const move of legal) {
    const uci = dropMiniXiangqiMoveToUci(move);
    assert.deepEqual(legalMoveForUci(legal, uci), move, `round-trip failed for ${uci}`);
  }
});

test('drop moves map to FSF letter notation and back', () => {
  const drops: DropMiniXiangqiMove[] = [
    { drop: 'cannon', to: 'd4' },
    { drop: 'horse', to: 'b3' },
    { drop: 'chariot', to: 'f2' },
    { drop: 'soldier', to: 'a5' },
  ];
  assert.equal(dropMiniXiangqiMoveToUci(drops[0]!), 'C@d4');
  assert.equal(dropMiniXiangqiMoveToUci(drops[1]!), 'N@b3');
  assert.equal(dropMiniXiangqiMoveToUci(drops[2]!), 'R@f2');
  assert.equal(dropMiniXiangqiMoveToUci(drops[3]!), 'P@a5');
  for (const drop of drops) {
    assert.deepEqual(legalMoveForUci(drops, dropMiniXiangqiMoveToUci(drop)), drop);
  }
});

test('legalMoveForUci rejects moves outside the legal set', () => {
  const state = createInitialDropMiniXiangqiState('fsf-reject');
  const legal = getLegalDropMiniXiangqiMoves(state);
  // No piece is in hand at the start, so no drop is legal.
  assert.equal(legalMoveForUci(legal, 'C@d4'), null);
  // Malformed UCI is rejected.
  assert.equal(legalMoveForUci(legal, 'not-a-move'), null);
});

test('engine client id recognises the playable tiers', () => {
  assert.equal(isDropMiniXiangqiEngineClientId(DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID), true);
  assert.equal(isDropMiniXiangqiEngineClientId('fairy-stockfish-drop-mini-xiangqi-amateur'), true);
  assert.equal(
    isDropMiniXiangqiEngineClientId('fairy-stockfish-drop-mini-xiangqi-very-strong'),
    true,
  );
  assert.equal(isDropMiniXiangqiEngineClientId('human'), false);
  assert.equal(isDropMiniXiangqiEngineClientId(undefined), false);
});

test('Drop Mini Xiangqi engine scheduler waits until the engine is on turn', () => {
  const room = pveRoom('black');
  const ctx = engineCtx(room);

  scheduleDropMiniXiangqiEngineMove(ctx, room);

  assert.equal(dropMiniXiangqiEngineSeatFor(room), 'black');
  // Red (human) is to move first, so the engine scheduler must not arm a timer.
  assert.equal(room.engineTimer, null);
});

test('engine fails closed (resigns) instead of fabricating a move when FSF output is never kernel-legal', async () => {
  const room = pveRoom('black'); // engine plays black
  // Human (red) makes one legal move so it becomes the engine's turn.
  const redMove = getLegalDropMiniXiangqiMoves(room.projection.state)[0]!;
  appendTenantRuntimeEvent(dropMiniXiangqiTenant, room, {
    type: 'move-played',
    at: 3,
    roomId: room.id,
    color: 'red',
    move: redMove,
  });
  const movesBefore = room.events.filter((e) => e.type === 'move-played').length;

  const ctx = engineCtx(room);
  // Provider returns a well-formed but illegal drop (no cannon in hand) every time.
  let calls = 0;
  const badProvider = async (): Promise<string> => {
    calls += 1;
    return 'C@d4';
  };
  await playDropMiniXiangqiEngineMoveIfReady(ctx, room, badProvider);

  assert.ok(calls >= 2, 'should retry before failing closed');
  const movesAfter = room.events.filter((e) => e.type === 'move-played').length;
  assert.equal(movesAfter, movesBefore, 'engine must NOT fabricate a move on fail-closed');
  const resign = room.events.find((e) => e.type === 'seat-resigned');
  assert.ok(resign, 'engine should resign on fail-closed');
  assert.equal(
    resign && 'color' in resign ? resign.color : null,
    'black',
    'the engine seat resigns',
  );
});

function pveRoom(engineSeat: MiniXiangqiColor): DropMiniEngineRoom {
  const created = createTenantRuntimeRoom(dropMiniXiangqiTenant, 'dmxqd_engine_test', { now: 1 });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('room create failed');
  const room = created.room as DropMiniEngineRoom;
  appendTenantRuntimeEvent(dropMiniXiangqiTenant, room, {
    type: 'seat-assigned',
    at: 1,
    roomId: room.id,
    clientId: DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
    seat: engineSeat,
  });
  appendTenantRuntimeEvent(dropMiniXiangqiTenant, room, {
    type: 'seat-assigned',
    at: 2,
    roomId: room.id,
    clientId: 'human',
    seat: engineSeat === 'red' ? 'black' : 'red',
  });
  return room;
}

function engineCtx(room: DropMiniEngineRoom): DropMiniEngineContext {
  return {
    appendEvent: async (_room, event) =>
      appendTenantRuntimeEvent(dropMiniXiangqiTenant, room, event),
    broadcastEventAppended: () => {},
    now: () => 1_000,
  };
}

// Keep an applyDropMiniXiangqiMove reference exercised so the import stays honest
// if the kernel signature changes under us.
test('kernel apply advances the turn', () => {
  const state = createInitialDropMiniXiangqiState('fsf-apply');
  const [first] = getLegalDropMiniXiangqiMoves(state);
  assert.ok(first);
  const after = applyDropMiniXiangqiMove(state, first);
  assert.notEqual(
    after.status.type === 'playing' && after.status.turn,
    state.status.type === 'playing' && state.status.turn,
  );
});
