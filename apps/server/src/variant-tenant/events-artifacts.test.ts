import assert from 'node:assert/strict';
import test from 'node:test';
import type { Color, Move, RoomTimeControl } from '@mistboard/game';
import { type DarkChessTenantEvent, darkChessTenant } from '../dark-chess-tenant.js';
import type { GameDebugArtifactInput } from '../persistence.js';
import { appendTenantEvent, type TenantEventWriterPersistence } from './events.js';
import { createTenantRuntimeRoomFromEvents } from './runtime.js';

// Per-move engine decision artifacts are queued on the room and flushed by the
// event writer right after the games row is written. Tenants that omit
// recordGameStart have no games row until game end, and the artifacts table's
// game_id is a foreign key onto it: the first prod attempt to write at move time
// (2026-09-02) violated that FK on every xiangqi ply. Pinned through the
// dark-chess tenant, like the other event-writer tests; the mechanism is
// tenant-agnostic.

const LIVE_TC: RoomTimeControl = { initialMs: 180_000, incrementMs: 2_000 };

function roomEvents(roomId: string): DarkChessTenantEvent[] {
  return [
    { type: 'room-created', at: 1_000, roomId, gameSpecId: 'dark-chess', timeControl: LIVE_TC },
    {
      type: 'clock-started',
      at: 1_000,
      roomId,
      clock: {
        activeColor: null,
        incrementMs: LIVE_TC.incrementMs,
        initialMs: LIVE_TC.initialMs,
        remainingMs: { black: LIVE_TC.initialMs, white: LIVE_TC.initialMs },
        runningSince: null,
      },
    },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'white-client', seat: 'white' },
    { type: 'seat-assigned', at: 5_000, roomId, clientId: 'black-client', seat: 'black' },
  ];
}

function move(roomId: string, at: number, color: Color, mv: Move): DarkChessTenantEvent {
  return { type: 'move-played', at, roomId, color, move: mv };
}

function hydrate(events: DarkChessTenantEvent[]) {
  const hydrated = createTenantRuntimeRoomFromEvents(darkChessTenant, events);
  assert.ok(hydrated.ok, 'fixture event log must hydrate');
  return hydrated.room;
}

type Recording = TenantEventWriterPersistence<Color, Move, 'dark-chess'> & {
  artifacts: GameDebugArtifactInput[];
  gameEnds: number;
  /** Order of persistence calls, to prove the flush waits for the games row. */
  calls: string[];
};

function recording(opts: { gameEndFails?: boolean } = {}): Recording {
  const p: Recording = {
    artifacts: [],
    gameEnds: 0,
    calls: [],
    abortRunningGame: async () => true,
    appendRoomEvent: async () => {},
    deleteRoomDeadline: async () => {},
    isInitialized: () => true,
    recordGameDebugArtifact: async (artifact) => {
      p.calls.push('artifact');
      p.artifacts.push(artifact);
    },
    recordGameEnd: async () => {
      p.calls.push('game-end');
      if (opts.gameEndFails) throw new Error('db down');
      p.gameEnds += 1;
    },
    upsertRoomDeadline: async () => {},
    upsertRoomSeatToken: async () => {},
  };
  return p;
}

function decision(roomId: string, ply: number): GameDebugArtifactInput {
  return {
    gameId: roomId,
    ply,
    engineColor: null,
    artifactType: 'live-engine-decision',
    payload: { ply, move: 'e2e4' },
  };
}

test('queued decision artifacts flush after the games row is recorded, in order', async () => {
  const roomId = 'dchx_artifact_flush';
  const room = hydrate([
    ...roomEvents(roomId),
    move(roomId, 10_000, 'white', { from: 'e2', to: 'e4' }),
  ]);
  const persistence = recording();
  room.pendingDebugArtifacts = [decision(roomId, 0), decision(roomId, 2)];

  // Mid-game move: nothing flushes yet (there is no games row to reference).
  await appendTenantEvent(
    darkChessTenant,
    room,
    move(roomId, 11_000, 'black', { from: 'e7', to: 'e5' }),
    { persistence },
  );
  assert.equal(persistence.artifacts.length, 0);
  assert.equal(room.pendingDebugArtifacts?.length, 2);

  // Terminal event: games row first, then every queued artifact, queue cleared.
  await appendTenantEvent(
    darkChessTenant,
    room,
    { type: 'seat-resigned', at: 12_000, roomId, color: 'white' },
    { persistence },
  );
  assert.equal(persistence.gameEnds, 1);
  assert.deepEqual(persistence.calls, ['game-end', 'artifact', 'artifact']);
  assert.deepEqual(
    persistence.artifacts.map((a) => a.ply),
    [0, 2],
  );
  assert.equal(room.pendingDebugArtifacts, undefined);
});

test('an aborted room drops its queue: there is no game to attach it to', async () => {
  const roomId = 'dchx_artifact_abort';
  const room = hydrate(roomEvents(roomId));
  const persistence = recording();
  room.pendingDebugArtifacts = [decision(roomId, 0)];

  await appendTenantEvent(
    darkChessTenant,
    room,
    { type: 'game-aborted', at: 6_000, roomId, reason: 'user-abort' },
    { persistence },
  );
  assert.deepEqual(persistence.artifacts, []);
  assert.equal(room.pendingDebugArtifacts, undefined);
});

test('a failed games-row write never flushes (the FK would fail anyway)', async () => {
  const roomId = 'dchx_artifact_no_row';
  const room = hydrate([
    ...roomEvents(roomId),
    move(roomId, 10_000, 'white', { from: 'e2', to: 'e4' }),
  ]);
  const persistence = recording({ gameEndFails: true });
  room.pendingDebugArtifacts = [decision(roomId, 0)];

  await appendTenantEvent(
    darkChessTenant,
    room,
    { type: 'seat-resigned', at: 12_000, roomId, color: 'white' },
    { persistence },
  );
  assert.equal(persistence.gameEnds, 0);
  assert.deepEqual(persistence.artifacts, []);
  assert.equal(room.pendingDebugArtifacts, undefined);
});

test('a writer without artifact support leaves the game-end path untouched', async () => {
  const roomId = 'dchx_artifact_legacy_writer';
  const room = hydrate([
    ...roomEvents(roomId),
    move(roomId, 10_000, 'white', { from: 'e2', to: 'e4' }),
  ]);
  const persistence = recording();
  const { recordGameDebugArtifact: _omitted, ...legacy } = persistence;
  room.pendingDebugArtifacts = [decision(roomId, 0)];

  await appendTenantEvent(
    darkChessTenant,
    room,
    { type: 'seat-resigned', at: 12_000, roomId, color: 'white' },
    { persistence: legacy },
  );
  assert.equal(persistence.gameEnds, 1);
  assert.deepEqual(persistence.artifacts, []);
});
