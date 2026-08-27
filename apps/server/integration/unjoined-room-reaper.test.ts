// Abandoned-invite-link reaping, over a REAL booted server with real
// WebSockets — the unit coverage in variant-tenant/reaper-coverage.test.ts
// calls the scheduler directly, which proves the logic but NOT that production
// ever invokes it. The whole bug was a room nothing ever acted on, so "is the
// scheduler wired to the connect/disconnect path" is the load-bearing question
// and it can only be answered by the real ws runtime.
//
// A room whose seats are not all filled used to be claimed by nothing: the
// pregame window never opened (nobody owes a move), the forfeit window needs
// moveNumber >= 2, and the durable guest-prestart sweep skips any room with a
// `clock-started` event, which a timed tenant room emits at creation. It sat in
// `playing` until the process restarted, counting toward "games in play".

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABORT_WINDOW_MS, JOIN_WINDOW_MS } from '../src/lifecycle-windows.js';
import { registeredVariantTenants } from '../src/variant-tenant/registry.js';
import { connectClient, startTestServer, type TestServer } from './harness.js';

const jungleKey = 'MISTBOARD_JUNGLE_ENABLED';

function jungleRoom(roomId: string) {
  for (const registration of registeredVariantTenants()) {
    if (registration.gameSpecId !== 'jungle') continue;
    const room = registration.rooms.get(roomId);
    if (room) return room as unknown as { abortPhase: string | null; abortDeadline: number | null };
  }
  throw new Error(`jungle room ${roomId} not found in the tenant registry`);
}

// The server processes its own socket 'close' asynchronously, after the client
// side resolves, so poll rather than asserting on the next tick.
async function waitForAbortPhase(roomId: string, expected: string | null, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const room = jungleRoom(roomId);
    if (room.abortPhase === expected) return room;
    if (Date.now() > deadline) return room;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function createJungleRoom(server: TestServer): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${server.port}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pvp',
      gameSpecId: 'jungle',
      preferredColor: 'red',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    }),
  });
  assert.equal(response.status, 201);
  return ((await response.json()) as { roomId: string }).roomId;
}

test('an invite link nobody joined is claimed once its creator leaves', async () => {
  const before = process.env[jungleKey];
  process.env[jungleKey] = 'true';
  const server = await startTestServer();
  try {
    const roomId = await createJungleRoom(server);

    // Creator opens the page and takes a seat. The opponent seat is still open,
    // so the room is 'unjoined' — but somebody is sitting in it, and a player
    // waiting for a friend must NEVER have the room aborted under them.
    const red = await connectClient({ url: server.url, room: roomId, gameSpecId: 'jungle' });
    assert.equal(red.seat, 'red');
    assert.equal(
      jungleRoom(roomId).abortPhase,
      null,
      'a room someone is sitting in is not pending abort',
    );
    assert.equal(jungleRoom(roomId).abortDeadline, null);

    // Creator closes the tab. Nobody is left and the opponent never came: this
    // is the abandoned invite link, and the join window must now be running.
    const closedAt = Date.now();
    await red.disconnect();

    const room = await waitForAbortPhase(roomId, 'unjoined');
    assert.equal(room.abortPhase, 'unjoined', 'an empty unjoined room must be pending abort');
    assert.notEqual(room.abortDeadline, null);
    const deadline = room.abortDeadline as number;
    assert.ok(
      deadline >= closedAt && deadline <= Date.now() + JOIN_WINDOW_MS + 1_000,
      `join deadline ${deadline} should be ~JOIN_WINDOW_MS out, not ${deadline - closedAt}ms`,
    );
  } finally {
    restoreEnv(jungleKey, before);
    await server.close();
  }
});

test('the join window is cancelled when the opponent actually arrives', async () => {
  const before = process.env[jungleKey];
  process.env[jungleKey] = 'true';
  const server = await startTestServer();
  try {
    const roomId = await createJungleRoom(server);
    const red = await connectClient({ url: server.url, room: roomId, gameSpecId: 'jungle' });
    await red.disconnect();
    assert.equal(
      (await waitForAbortPhase(roomId, 'unjoined')).abortPhase,
      'unjoined',
      'precondition: join window armed',
    );

    // The opponent arrives and takes the open seat. Both seats are now filled,
    // so the room leaves 'unjoined' and falls back to the short pregame window.
    // The phase CHANGE is what forces the deadline to be recomputed: without it
    // the room would keep counting down the long join window while two players
    // sat at the board.
    const opponent = await connectClient({ url: server.url, room: roomId, gameSpecId: 'jungle' });
    assert.notEqual(opponent.seat, 'spectator', 'the arriving player must get the open seat');

    const room = jungleRoom(roomId);
    assert.notEqual(room.abortPhase, 'unjoined');
    assert.ok(
      room.abortDeadline !== null && room.abortDeadline - Date.now() <= ABORT_WINDOW_MS,
      `a seated room must fall back to the short pregame window, got ${
        (room.abortDeadline ?? 0) - Date.now()
      }ms`,
    );

    await opponent.disconnect();
  } finally {
    restoreEnv(jungleKey, before);
    await server.close();
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
