import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import {
  DARK_CRAZYHOUSE_SPEC_ID,
  defaultClockIncrementMs,
  defaultClockInitialMs,
} from '@mistboard/game';
import type { DarkCrazyhouseRuntimeRoom } from './dark-crazyhouse-runtime.js';
import {
  type DarkCrazyhouseCreateContext,
  handleDarkCrazyhouseCreate,
  requestsDarkCrazyhouse,
} from './routes/dark-crazyhouse-rooms.js';

const darkCrazyhouseFlag = 'MISTBOARD_DARK_CRAZYHOUSE_ENABLED';

type ResponseCapture = {
  body: string;
  headers: Record<string, string>;
  status: number | null;
};

test('Dark Crazyhouse room route only claims canonical Dark Crazyhouse game spec requests', () => {
  assert.equal(requestsDarkCrazyhouse({ gameSpecId: DARK_CRAZYHOUSE_SPEC_ID }), true);
  assert.equal(requestsDarkCrazyhouse({ variant: DARK_CRAZYHOUSE_SPEC_ID }), false);
  assert.equal(requestsDarkCrazyhouse({ gameSpecId: 'dark-chess' }), false);
  assert.equal(requestsDarkCrazyhouse({ variant: 'dark-chess' }), false);
});

test('Dark Crazyhouse room route returns disabled when the launch flag is off', async () => {
  const before = process.env[darkCrazyhouseFlag];
  delete process.env[darkCrazyhouseFlag];
  try {
    const response = captureResponse();
    await handleDarkCrazyhouseCreate(testContext(), response, {
      gameSpecId: DARK_CRAZYHOUSE_SPEC_ID,
      mode: 'pvp',
    });

    assert.equal(response.status, 404);
    assert.deepEqual(responseJson(response), { error: 'dark_crazyhouse_disabled' });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Crazyhouse room route rejects legacy variant requests when the flag is on', async () => {
  const before = process.env[darkCrazyhouseFlag];
  process.env[darkCrazyhouseFlag] = 'true';
  try {
    const response = captureResponse();
    await handleDarkCrazyhouseCreate(testContext(), response, {
      mode: 'pvp',
      variant: DARK_CRAZYHOUSE_SPEC_ID,
    });

    assert.equal(response.status, 501);
    assert.deepEqual(responseJson(response), { error: 'dark_crazyhouse_not_integrated' });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Crazyhouse room route rejects unsupported create surfaces before room creation', async () => {
  const before = process.env[darkCrazyhouseFlag];
  process.env[darkCrazyhouseFlag] = 'true';
  try {
    for (const body of [
      { gameSpecId: DARK_CRAZYHOUSE_SPEC_ID, mode: 'pve' },
      { gameSpecId: DARK_CRAZYHOUSE_SPEC_ID, mode: 'pvp', rated: true },
      { engineId: 'engine', gameSpecId: DARK_CRAZYHOUSE_SPEC_ID, mode: 'pvp' },
    ]) {
      let createCalls = 0;
      const response = captureResponse();
      await handleDarkCrazyhouseCreate(
        testContext({
          createDarkCrazyhouseRoom: async () => {
            createCalls += 1;
            return { ok: true, room: darkCrazyhouseRoom('dczh_unreachable') };
          },
        }),
        response,
        body,
      );

      assert.equal(response.status, 501);
      assert.deepEqual(responseJson(response), { error: 'dark_crazyhouse_unsupported_surface' });
      assert.equal(createCalls, 0);
    }
  } finally {
    restoreFlag(before);
  }
});

test('Dark Crazyhouse room route accepts valid PvP time controls and preferred colors', async () => {
  const before = process.env[darkCrazyhouseFlag];
  process.env[darkCrazyhouseFlag] = 'true';
  try {
    let requestedTimeControl: unknown;
    let requestedColor: unknown;
    const response = captureResponse();
    await handleDarkCrazyhouseCreate(
      testContext({
        createDarkCrazyhouseRoom: async (timeControl, preferredColor) => {
          requestedTimeControl = timeControl;
          requestedColor = preferredColor;
          return { ok: true, room: darkCrazyhouseRoom('dczh_clocked') };
        },
      }),
      response,
      {
        gameSpecId: DARK_CRAZYHOUSE_SPEC_ID,
        mode: 'pvp',
        preferredColor: 'black',
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      },
    );

    assert.equal(response.status, 201);
    assert.deepEqual(requestedTimeControl, { initialMs: 180_000, incrementMs: 2_000 });
    assert.equal(requestedColor, 'black');
    assert.deepEqual(responseJson(response), {
      roomId: 'dczh_clocked',
      url: '/room/dczh_clocked',
      mode: 'pvp',
      gameSpecId: DARK_CRAZYHOUSE_SPEC_ID,
      region: 'global',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Crazyhouse room route rejects invalid time controls before room creation', async () => {
  const before = process.env[darkCrazyhouseFlag];
  process.env[darkCrazyhouseFlag] = 'true';
  try {
    let createCalls = 0;
    const response = captureResponse();
    await handleDarkCrazyhouseCreate(
      testContext({
        createDarkCrazyhouseRoom: async () => {
          createCalls += 1;
          return { ok: true, room: darkCrazyhouseRoom('dczh_unreachable') };
        },
      }),
      response,
      { gameSpecId: DARK_CRAZYHOUSE_SPEC_ID, mode: 'pvp', timeControl: { id: '3m2' } },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(responseJson(response), { error: 'invalid_time_control' });
    assert.equal(createCalls, 0);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Crazyhouse room route creates a direct PvP room response', async () => {
  const before = process.env[darkCrazyhouseFlag];
  process.env[darkCrazyhouseFlag] = 'true';
  try {
    const response = captureResponse();
    await handleDarkCrazyhouseCreate(testContext(), response, {
      gameSpecId: DARK_CRAZYHOUSE_SPEC_ID,
      mode: 'pvp',
    });

    assert.equal(response.status, 201);
    assert.deepEqual(responseJson(response), {
      roomId: 'dczh_route',
      url: '/room/dczh_route',
      mode: 'pvp',
      gameSpecId: DARK_CRAZYHOUSE_SPEC_ID,
      region: 'global',
      // A create that omits timeControl now gets the shared default clock
      // instead of no clock at all: a clockless room past move 1 with both
      // players gone is claimed by no reaper, so it sat in `playing` until the
      // process restarted (see variant-tenant/reaper-coverage.test.ts).
      timeControl: { initialMs: defaultClockInitialMs, incrementMs: defaultClockIncrementMs },
    });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Crazyhouse room route returns server draining before room creation', async () => {
  const before = process.env[darkCrazyhouseFlag];
  process.env[darkCrazyhouseFlag] = 'true';
  try {
    let createCalls = 0;
    const response = captureResponse();
    await handleDarkCrazyhouseCreate(
      testContext({
        createDarkCrazyhouseRoom: async () => {
          createCalls += 1;
          return { ok: true, room: darkCrazyhouseRoom('dczh_unreachable') };
        },
        drainDeadlineMs: () => 123_456,
        isDraining: () => true,
      }),
      response,
      { gameSpecId: DARK_CRAZYHOUSE_SPEC_ID, mode: 'pvp' },
    );

    assert.equal(response.status, 503);
    assert.deepEqual(responseJson(response), {
      error: 'server_draining',
      restartAt: 123_456,
    });
    assert.equal(createCalls, 0);
  } finally {
    restoreFlag(before);
  }
});

test('Dark Crazyhouse room route maps room factory failures', async () => {
  const before = process.env[darkCrazyhouseFlag];
  process.env[darkCrazyhouseFlag] = 'true';
  try {
    for (const { error, status } of [
      { error: 'dark_crazyhouse_disabled' as const, status: 404 },
      { error: 'persistence_failure' as const, status: 503 },
      { error: 'room_id_collision' as const, status: 500 },
    ]) {
      const response = captureResponse();
      await handleDarkCrazyhouseCreate(
        testContext({
          createDarkCrazyhouseRoom: async () => ({ ok: false, error }),
        }),
        response,
        { gameSpecId: DARK_CRAZYHOUSE_SPEC_ID, mode: 'pvp' },
      );

      assert.equal(response.status, status);
      assert.deepEqual(responseJson(response), { error });
    }
  } finally {
    restoreFlag(before);
  }
});

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {},
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
  return capture as ServerResponse & ResponseCapture;
}

function responseJson(response: ResponseCapture): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

function testContext(
  overrides: Partial<DarkCrazyhouseCreateContext> = {},
): DarkCrazyhouseCreateContext {
  return {
    createDarkCrazyhouseRoom: async () => ({ ok: true, room: darkCrazyhouseRoom('dczh_route') }),
    databaseRequired: false,
    drainDeadlineMs: () => null,
    isDraining: () => false,
    ...overrides,
  };
}

function darkCrazyhouseRoom(id: string): DarkCrazyhouseRuntimeRoom {
  return {
    id,
    gameSpecId: DARK_CRAZYHOUSE_SPEC_ID,
  } as DarkCrazyhouseRuntimeRoom;
}

function restoreFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[darkCrazyhouseFlag];
    return;
  }
  process.env[darkCrazyhouseFlag] = value;
}
