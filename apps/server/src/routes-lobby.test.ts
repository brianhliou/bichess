import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import {
  CROSSROADS_CHESS_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  type RoomTimeControl,
} from '@mistboard/game';
import { crossroadsChessEnabled, darkMiniXiangqiEnabled } from './feature-flags.js';
import { type HttpApiContext, isAllowedFullTimeControl } from './routes/lib.js';
import { tryHandle } from './routes/lobby.js';
import type { Room } from './server-types.js';
import { registerVariantTenant } from './variant-tenant/registry.js';

const darkMiniXiangqiFlag = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';
const crossroadsChessFlag = 'MISTBOARD_CROSSROADS_CHESS_ENABLED';

type ResponseCapture = { body: string; headers: Record<string, string>; status: number | null };

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {} as Record<string, string>,
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string>) {
      capture.status = status;
      capture.headers = headers ?? {};
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}

function responseJson(response: ResponseCapture): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

function lobbyPost(body: Record<string, unknown>): IncomingMessage {
  const json = JSON.stringify(body);
  async function* chunks() {
    yield Buffer.from(json);
  }
  const req = chunks() as unknown as IncomingMessage & Record<string, unknown>;
  req.method = 'POST';
  req.headers = {};
  return req;
}

type CreateRoomCall = unknown[];
type TenantLobbyCall = [RoomTimeControl | undefined, boolean];

// Lobby tenant dispatch goes through the global VariantTenant registry, so the
// test registers fakes under the real kinds/spec ids/flags. The lobby
// createRoom recorders live at module scope and are reset per testContext().
const dmxCalls: TenantLobbyCall[] = [];
const crossroadsCalls: TenantLobbyCall[] = [];
let dmxRoomSeq = 0;
let crossroadsRoomSeq = 0;

function registerFakeLobbyTenant(options: {
  kind: string;
  gameSpecId: string;
  roomIdPrefix: string;
  errorPrefix: string;
  enabled(): boolean;
  supportsRated: boolean;
  allowsTimeControl(timeControl: RoomTimeControl): boolean;
  createRoom(
    timeControl: RoomTimeControl | undefined,
    rated: boolean,
  ): Promise<{ id: string; region: string }>;
}): void {
  registerVariantTenant({
    kind: options.kind,
    gameSpecId: options.gameSpecId,
    roomIdPrefix: options.roomIdPrefix,
    ownsSpecRouting: true,
    errorPrefix: options.errorPrefix,
    enabled: options.enabled,
    rooms: new Map(),
    activeGameCount: () => 0,
    getOrLoadRoom: async () => null,
    attachWebSocket: async () => {
      throw new Error('unexpected ws attach in lobby test');
    },
    clearRuntimeTimers: () => {},
    clearRooms: () => {},
    http: {
      matchesCreateRequest: () => false,
      handleCreate: async () => {
        throw new Error('unexpected http create in lobby test');
      },
    },
    lobby: {
      supportsRated: options.supportsRated,
      allowsTimeControl: options.allowsTimeControl,
      createRoom: options.createRoom,
    },
    sweepDueDeadline: null,
  });
}

registerFakeLobbyTenant({
  kind: 'dark-mini-xiangqi',
  gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
  roomIdPrefix: 'dmxq_',
  errorPrefix: 'dark_mini_xiangqi',
  enabled: darkMiniXiangqiEnabled,
  supportsRated: true,
  allowsTimeControl: () => true,
  createRoom: async (timeControl, rated) => {
    dmxCalls.push([timeControl, rated]);
    dmxRoomSeq += 1;
    return { id: `dmxq_lobby_${dmxRoomSeq}`, region: 'global' };
  },
});

registerFakeLobbyTenant({
  kind: 'crossroads-chess',
  gameSpecId: CROSSROADS_CHESS_SPEC_ID,
  roomIdPrefix: 'dchess_',
  errorPrefix: 'crossroads_chess',
  enabled: crossroadsChessEnabled,
  supportsRated: false,
  allowsTimeControl: isAllowedFullTimeControl,
  createRoom: async (timeControl, rated) => {
    crossroadsCalls.push([timeControl, rated]);
    crossroadsRoomSeq += 1;
    return { id: `dchess_lobby_${crossroadsRoomSeq}`, region: 'global' };
  },
});

function testContext(overrides: Partial<HttpApiContext> = {}): {
  ctx: HttpApiContext;
  chessCalls: CreateRoomCall[];
  crossroadsCalls: TenantLobbyCall[];
  dmxCalls: TenantLobbyCall[];
} {
  dmxCalls.length = 0;
  crossroadsCalls.length = 0;
  dmxRoomSeq = 0;
  crossroadsRoomSeq = 0;
  const chessCalls: CreateRoomCall[] = [];
  let chessRoomSeq = 0;
  const ctx: HttpApiContext = {
    abandonRoom: async () => ({ ok: false, error: 'not_found' }),
    activeGameCount: () => 0,
    annotationsFile: '',
    createRoom: async (...args) => {
      chessCalls.push(args);
      chessRoomSeq += 1;
      return { id: `room_chess_${chessRoomSeq}`, region: 'global' } as unknown as Room;
    },
    databaseRequired: false,
    drainDeadlineMs: () => null,
    inMemoryGameSummary: () => null,
    isDraining: () => false,
    liveClockIncrementMs: 2000,
    liveClockInitialMs: 180000,
    lobbyQueue: [],
    lobbyTickets: new Map(),
    pveBuiltinEngineClientId: 'engine',
    releaseLiveEngineReservation: () => {},
    reserveLiveEngineSeat: async () => null,
    rooms: new Map(),
    ...overrides,
  };
  return { ctx, chessCalls, crossroadsCalls, dmxCalls };
}

const tc = { initialMs: 180000, incrementMs: 2000 };

async function post(ctx: HttpApiContext, body: Record<string, unknown>): Promise<ResponseCapture> {
  const response = captureResponse();
  const handled = await tryHandle(ctx, lobbyPost(body), response, '/api/lobby');
  assert.equal(handled, true);
  return response;
}

// ── Chess baseline (must stay identical across the variant-aware refactor) ──

test('lobby: a single chess request waits (202)', async () => {
  const { ctx, chessCalls } = testContext();
  const res = await post(ctx, { timeControl: tc });
  assert.equal(res.status, 202);
  const json = responseJson(res);
  assert.equal(json.status, 'waiting');
  assert.equal(json.gameSpecId, 'dark-chess');
  assert.equal(chessCalls.length, 0);
});

test('lobby: two matching chess requests create one dark-chess room with the exact args', async () => {
  const { ctx, chessCalls } = testContext();
  const first = await post(ctx, { timeControl: tc });
  assert.equal(first.status, 202);
  const second = await post(ctx, { timeControl: tc });
  assert.equal(second.status, 201);
  assert.equal(responseJson(second).status, 'matched');
  assert.equal(responseJson(second).roomId, 'room_chess_1');

  assert.equal(chessCalls.length, 1);
  assert.deepEqual(chessCalls[0], [
    'pvp',
    'dark-chess',
    'engine',
    false,
    tc,
    false,
    { randomSeating: true },
  ]);
});

test('lobby: chess requests with different time controls do not match', async () => {
  const { ctx, chessCalls } = testContext();
  await post(ctx, { timeControl: tc }); // 3+2
  // 1+1 is a different allowed bucket (the allowlist now scopes chess matchmaking
  // to 1+1 / 3+2; an off-menu TC like 1+0 is rejected — see the allowlist test).
  const other = await post(ctx, { timeControl: { initialMs: 60000, incrementMs: 1000 } });
  assert.equal(other.status, 202);
  assert.equal(chessCalls.length, 0);
  assert.equal(ctx.lobbyQueue.length, 2);
});

test('lobby: chess request with an off-menu time control is rejected', async () => {
  const { ctx } = testContext();
  // 1+0 is not an official playable TC — matchmaking must reject it so the queue
  // can't fragment into off-menu buckets.
  const res = await post(ctx, { timeControl: { initialMs: 60000, incrementMs: 0 } });
  assert.equal(res.status, 400);
  assert.equal(ctx.lobbyQueue.length, 0);
});

test('lobby: rated chess request from a guest is rejected', async () => {
  await withRatedFlag(true, async () => {
    const { ctx } = testContext();
    const res = await post(ctx, { rated: true, timeControl: tc });
    assert.equal(res.status, 401);
    assert.deepEqual(responseJson(res), { error: 'rated_requires_account' });
    assert.equal(ctx.lobbyQueue.length, 0);
  });
});

// ── Dark Mini Xiangqi ──────────────────────────────────────────────────────

test('lobby: a single Dark Mini Xiangqi request waits (202)', async () => {
  await withFlag(true, async () => {
    const { ctx, dmxCalls } = testContext();
    const res = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(res.status, 202);
    assert.equal(responseJson(res).gameSpecId, DARK_MINI_XIANGQI_SPEC_ID);
    assert.equal(dmxCalls.length, 0);
  });
});

test('lobby: two Dark Mini Xiangqi requests match into a DMX room', async () => {
  await withFlag(true, async () => {
    const { ctx, dmxCalls, chessCalls } = testContext();
    const first = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(first.status, 202);
    const second = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(second.status, 201);
    assert.equal(responseJson(second).status, 'matched');
    assert.equal(responseJson(second).roomId, 'dmxq_lobby_1');
    assert.equal(dmxCalls.length, 1);
    assert.deepEqual(dmxCalls[0], [tc, false]);
    assert.equal(chessCalls.length, 0, 'chess factory must not be touched');
  });
});

test('lobby: guest Dark Mini Xiangqi rated request is rejected', async () => {
  await withFlag(true, async () => {
    await withRatedFlag(true, async () => {
      const { ctx, dmxCalls } = testContext();
      const res = await post(ctx, {
        gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
        rated: true,
        timeControl: tc,
      });
      assert.equal(res.status, 401);
      assert.deepEqual(responseJson(res), { error: 'rated_requires_account' });
      assert.equal(dmxCalls.length, 0);
    });
  });
});

test('lobby: Dark Mini Xiangqi requests are disabled when the launch flag is off', async () => {
  await withFlag(false, async () => {
    const { ctx } = testContext();
    const res = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(res.status, 404);
    assert.deepEqual(responseJson(res), { error: 'dark_mini_xiangqi_disabled' });
    assert.equal(ctx.lobbyQueue.length, 0);
  });
});

test('lobby: chess and Dark Mini Xiangqi seekers never match each other', async () => {
  await withFlag(true, async () => {
    const { ctx, chessCalls, dmxCalls } = testContext();
    const chess = await post(ctx, { timeControl: tc });
    const dmx = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(chess.status, 202);
    assert.equal(dmx.status, 202);
    assert.equal(chessCalls.length, 0);
    assert.equal(dmxCalls.length, 0);
    assert.equal(ctx.lobbyQueue.length, 2);
  });
});

// ── Crossroads Chess ───────────────────────────────────────────────────────

test('lobby: a single Crossroads Chess request waits (202)', async () => {
  await withCrossroadsFlag(true, async () => {
    const { ctx, crossroadsCalls } = testContext();
    const res = await post(ctx, { gameSpecId: CROSSROADS_CHESS_SPEC_ID, timeControl: tc });
    assert.equal(res.status, 202);
    assert.equal(responseJson(res).gameSpecId, CROSSROADS_CHESS_SPEC_ID);
    assert.equal(crossroadsCalls.length, 0);
  });
});

test('lobby: two Crossroads Chess requests match into a Crossroads room', async () => {
  await withCrossroadsFlag(true, async () => {
    const { ctx, chessCalls, crossroadsCalls, dmxCalls } = testContext();
    const first = await post(ctx, { gameSpecId: CROSSROADS_CHESS_SPEC_ID, timeControl: tc });
    assert.equal(first.status, 202);
    const second = await post(ctx, { gameSpecId: CROSSROADS_CHESS_SPEC_ID, timeControl: tc });
    assert.equal(second.status, 201);
    assert.equal(responseJson(second).status, 'matched');
    assert.equal(responseJson(second).roomId, 'dchess_lobby_1');
    assert.equal(crossroadsCalls.length, 1);
    assert.deepEqual(crossroadsCalls[0], [tc, false]);
    assert.equal(chessCalls.length, 0, 'chess factory must not be touched');
    assert.equal(dmxCalls.length, 0, 'DMX factory must not be touched');
  });
});

test('lobby: Crossroads Chess allows 5+5 and rejects off-menu time controls', async () => {
  await withCrossroadsFlag(true, async () => {
    const { ctx, crossroadsCalls } = testContext();
    const rapid = await post(ctx, {
      gameSpecId: CROSSROADS_CHESS_SPEC_ID,
      timeControl: { initialMs: 300000, incrementMs: 5000 },
    });
    assert.equal(rapid.status, 202);
    const offMenu = await post(ctx, {
      gameSpecId: CROSSROADS_CHESS_SPEC_ID,
      timeControl: { initialMs: 60000, incrementMs: 0 },
    });
    assert.equal(offMenu.status, 400);
    assert.deepEqual(responseJson(offMenu), { error: 'time_control_unsupported' });
    assert.equal(crossroadsCalls.length, 0);
  });
});

test('lobby: Crossroads Chess requests are disabled when the launch flag is off', async () => {
  await withCrossroadsFlag(false, async () => {
    const { ctx } = testContext();
    const res = await post(ctx, { gameSpecId: CROSSROADS_CHESS_SPEC_ID, timeControl: tc });
    assert.equal(res.status, 404);
    assert.deepEqual(responseJson(res), { error: 'crossroads_chess_disabled' });
    assert.equal(ctx.lobbyQueue.length, 0);
  });
});

test('lobby: chess, DMX, and Crossroads seekers never match each other', async () => {
  await withFlag(true, async () => {
    await withCrossroadsFlag(true, async () => {
      const { ctx, chessCalls, crossroadsCalls, dmxCalls } = testContext();
      const chess = await post(ctx, { timeControl: tc });
      const dmx = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
      const crossroads = await post(ctx, {
        gameSpecId: CROSSROADS_CHESS_SPEC_ID,
        timeControl: tc,
      });
      assert.equal(chess.status, 202);
      assert.equal(dmx.status, 202);
      assert.equal(crossroads.status, 202);
      assert.equal(chessCalls.length, 0);
      assert.equal(dmxCalls.length, 0);
      assert.equal(crossroadsCalls.length, 0);
      assert.equal(ctx.lobbyQueue.length, 3);
    });
  });
});

async function withCrossroadsFlag<T>(enabled: boolean, fn: () => Promise<T>): Promise<T> {
  const previous = process.env[crossroadsChessFlag];
  process.env[crossroadsChessFlag] = enabled ? 'true' : 'false';
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[crossroadsChessFlag];
    else process.env[crossroadsChessFlag] = previous;
  }
}

function withRatedFlag(value: boolean, fn: () => Promise<void>): Promise<void> {
  const before = process.env.MISTBOARD_RATED_ENABLED;
  if (value) process.env.MISTBOARD_RATED_ENABLED = 'true';
  else delete process.env.MISTBOARD_RATED_ENABLED;
  return fn().finally(() => {
    if (before === undefined) delete process.env.MISTBOARD_RATED_ENABLED;
    else process.env.MISTBOARD_RATED_ENABLED = before;
  });
}

function withFlag(value: boolean, fn: () => Promise<void>): Promise<void> {
  const before = process.env[darkMiniXiangqiFlag];
  if (value) process.env[darkMiniXiangqiFlag] = 'true';
  else delete process.env[darkMiniXiangqiFlag];
  return fn().finally(() => {
    if (before === undefined) delete process.env[darkMiniXiangqiFlag];
    else process.env[darkMiniXiangqiFlag] = before;
  });
}

export { post, responseJson, tc, testContext, withFlag };
