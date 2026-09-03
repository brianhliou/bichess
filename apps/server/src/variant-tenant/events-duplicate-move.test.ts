import assert from 'node:assert/strict';
import test from 'node:test';
import type { Color, Move, RoomTimeControl } from '@mistboard/game';
import { type DarkChessTenantEvent, darkChessTenant } from '../dark-chess-tenant.js';
import { appendTenantEvent, type TenantEventWriterPersistence } from './events.js';
import { createTenantRuntimeRoomFromEvents } from './runtime.js';

// room.events must never outrun the kernel. The projection silently drops an
// out-of-turn move-played; the append used to push and PERSIST it anyway, so a
// client double-submit (or a resend inside the window between the WebSocket turn
// guard reading the projection and this write completing) left the room's event
// log longer than the real game.
//
// That log is what the engine adapter replays into Fairy-Stockfish. On
// 2026-09-03 a Fortress room carried three phantom plies; FSF's position parser
// stopped at the first impossible token, searched a five-ply-stale position,
// proposed a move legal only there, and the guard resigned the bot's seat — the
// DB then recorded it as a human win by resignation.

const LIVE_TC: RoomTimeControl = { initialMs: 180_000, incrementMs: 2_000 };

function baseEvents(roomId: string): DarkChessTenantEvent[] {
  return [
    { type: 'room-created', at: 1_000, roomId, gameSpecId: 'dark-chess', timeControl: LIVE_TC },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'white-client', seat: 'white' },
    { type: 'seat-assigned', at: 3_000, roomId, clientId: 'black-client', seat: 'black' },
  ];
}

function move(roomId: string, at: number, color: Color, mv: Move): DarkChessTenantEvent {
  return { type: 'move-played', at, roomId, color, move: mv };
}

function recording(): TenantEventWriterPersistence<Color, Move, 'dark-chess'> & {
  appended: number;
} {
  const p = {
    appended: 0,
    abortRunningGame: async () => true,
    appendRoomEvent: async () => {
      p.appended += 1;
    },
    deleteRoomDeadline: async () => {},
    isInitialized: () => true,
    recordGameDebugArtifact: async () => {},
    recordGameEnd: async () => {},
    upsertRoomDeadline: async () => {},
    upsertRoomSeatToken: async () => {},
  };
  return p;
}

test('a resubmitted move is neither recorded nor persisted', async () => {
  const roomId = 'dup-room';
  const hydrated = createTenantRuntimeRoomFromEvents(darkChessTenant, baseEvents(roomId));
  assert.ok(hydrated.ok, 'fixture event log must hydrate');
  const room = hydrated.room;
  const persistence = recording();

  const e2e4 = move(roomId, 4_000, 'white', { from: 'e2', to: 'e4' } as Move);
  await appendTenantEvent(darkChessTenant, room, e2e4, { persistence });
  const afterFirst = room.events.length;
  const plyAfterFirst = room.projection.state.moveNumber;

  // The same frame again: white is no longer to move, so the projection refuses.
  await appendTenantEvent(darkChessTenant, room, e2e4, { persistence });

  assert.equal(room.events.length, afterFirst, 'duplicate must not enter room.events');
  assert.equal(room.projection.state.moveNumber, plyAfterFirst, 'projection must not advance');
  assert.equal(persistence.appended, 1, 'duplicate must not reach the events table');
});

test('the event log and the kernel agree ply for ply across a real line', async () => {
  const roomId = 'agree-room';
  const hydrated = createTenantRuntimeRoomFromEvents(darkChessTenant, baseEvents(roomId));
  assert.ok(hydrated.ok);
  const room = hydrated.room;
  const persistence = recording();
  const setup = room.events.length;

  const line: Array<[Color, Move]> = [
    ['white', { from: 'e2', to: 'e4' } as Move],
    ['black', { from: 'e7', to: 'e5' } as Move],
    ['white', { from: 'g1', to: 'f3' } as Move],
  ];
  for (const [color, mv] of line) {
    await appendTenantEvent(darkChessTenant, room, move(roomId, 5_000, color, mv), {
      persistence,
    });
    // And a stray resend of the move just played, every time.
    await appendTenantEvent(darkChessTenant, room, move(roomId, 5_001, color, mv), {
      persistence,
    });
  }

  const moveEvents = room.events.length - setup;
  assert.equal(moveEvents, line.length, 'one event per real ply, resends dropped');
  assert.equal(persistence.appended, line.length, 'one row per real ply');
});
