import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { RoomTimeControl, VariantId } from '@mistboard/game';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';
import type { HttpApiContext } from './routes/lib.js';
import { resolveBotRoomRequest, tryHandle } from './routes/rooms.js';
// The multi-variant resolve tests exercise Misty's banqi entry, which needs
// the banqi tenant registered (isBotSpecPlayable reads the launch flag through
// the tenant registry; the flag itself is read lazily per request).
import './variant-tenant/register-tenants.js';

process.env.MISTBOARD_BANQI_ENABLED = 'true';

import type { Room } from './server-types.js';
import { roomFixture } from './test-builders.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string | string[]>;
  status: number | null;
};

type RoomCreateArgs = {
  engineId: string;
  hiddenDraft960?: boolean;
  mode: 'pvp' | 'pve';
  options?: {
    creatorPreference?: 'white' | 'black';
    engineColor?: 'white' | 'black';
    engineReservationId?: string;
    botId?: string;
    randomSeating?: boolean;
    region?: string;
  };
  rated?: boolean;
  timeControl?: RoomTimeControl;
  variant: VariantId;
};

definePersistenceTests('room bot play requests', () => {
  test('room creation resolves a bot id to its active engine and play settings', async () => {
    await insertBotProfile('play-bot', 'Play Bot', 'public');
    let reserved: { color: 'white' | 'black'; engineId: string } | null = null;
    let created: RoomCreateArgs | null = null;
    const ctx = createContext({
      createRoom: async (mode, variant, engineId, hiddenDraft960, timeControl, rated, options) => {
        created = { engineId, hiddenDraft960, mode, options, rated, timeControl, variant };
        return roomFixture({
          id: 'bot-room',
          mode,
          pveBotId: options?.botId ?? null,
          pveEngineId: engineId,
          randomEngine: mode === 'pve',
          timeControl,
          variant,
        });
      },
      reserveLiveEngineSeat: async (engineId, color) => {
        reserved = { color, engineId };
        return 'reservation-1';
      },
    });
    const response = captureResponse();

    const handled = await tryHandle(
      ctx,
      jsonPost({ botId: 'play-bot', mode: 'pve', preferredColor: 'white' }),
      response,
      '/api/rooms',
    );

    assert.equal(handled, true);
    assert.equal(response.status, 201);
    assert.deepEqual(reserved, { color: 'black', engineId: 'python-v2-v1.6' });
    assert.deepEqual(created, {
      engineId: 'python-v2-v1.6',
      hiddenDraft960: false,
      mode: 'pve',
      options: { engineColor: 'black', engineReservationId: 'reservation-1', botId: 'play-bot' },
      rated: false,
      // The fixture's stored standing clock is the house 3+2, which fog engines
      // cannot honor (#283); the pin overrides it rather than 400-ing the create.
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      variant: 'dark-chess',
    });
    assert.equal((JSON.parse(response.body) as { url?: string }).url, '/room/bot-room');
  });

  test('a fog bot profile stored at an unplayable pace starts at the pin, not a 400', async () => {
    // Bot profiles carry a standing clock in the DB. The fog rows predate the
    // engine pin and sit at the house 3+2 (#283). A bot-id create that omits a
    // time control must still start a game: the pin overrides the stored pace
    // rather than rejecting it, so no profile migration is needed to keep bot
    // play working. Caught by hosted CI, which runs the Postgres-gated tests
    // this file's other cases live in.
    await insertBotProfile('paced-bot', 'Paced Bot', 'public');
    const startedPaces: (RoomTimeControl | undefined)[] = [];
    const ctx = createContext({
      createRoom: async (mode, _variant, _engineId, _hiddenDraft960, timeControl) => {
        startedPaces.push(timeControl);
        return roomFixture({ id: 'paced-bot-room', mode, timeControl });
      },
    });
    const response = captureResponse();

    const handled = await tryHandle(
      ctx,
      jsonPost({ botId: 'paced-bot', mode: 'pve' }),
      response,
      '/api/rooms',
    );

    assert.equal(handled, true);
    assert.equal(response.status, 201);
    assert.deepEqual(startedPaces, [{ initialMs: 300_000, incrementMs: 5_000 }]);
  });

  test('room creation rejects a bot id combined with a client-selected engine', async () => {
    await insertBotProfile('play-bot', 'Play Bot', 'public');
    const response = captureResponse();

    const handled = await tryHandle(
      createContext(),
      jsonPost({ botId: 'play-bot', engineId: 'python-v2-v1.6', mode: 'pve' }),
      response,
      '/api/rooms',
    );

    assert.equal(handled, true);
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'bot_engine_conflict' });
  });

  test('a legacy bot id canonicalizes to the merged identity before the lookup', async () => {
    await insertMistyProfile();
    const response = captureResponse();

    const resolved = await resolveBotRoomRequest(response, {
      botId: 'misty-dark-chess',
      mode: 'pve',
    });

    assert.ok(resolved);
    assert.equal(resolved.botId, 'misty');
    assert.equal(resolved.gameSpecId, 'dark-chess');
    assert.equal(resolved.engineId, 'python-v2-v1.6');
  });

  test('a multi-variant bot resolves the per-spec engine for a supported spec', async () => {
    await insertMistyProfile();
    const response = captureResponse();

    const resolved = await resolveBotRoomRequest(response, {
      botId: 'misty',
      gameSpecId: 'banqi',
      mode: 'pve',
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
    });

    assert.ok(resolved);
    assert.equal(resolved.botId, 'misty');
    assert.equal(resolved.gameSpecId, 'banqi');
    assert.equal(resolved.engineId, 'misty-banqi');
    // Caller-chosen pace passes through; the tenant gate downstream validates it.
    assert.deepEqual(resolved.timeControl, { initialMs: 60_000, incrementMs: 1_000 });
  });

  test('a spec outside the bot roster rejects with bot_game_spec_conflict', async () => {
    await insertMistyProfile();
    const response = captureResponse();

    const resolved = await resolveBotRoomRequest(response, {
      botId: 'misty',
      gameSpecId: 'xiangqi',
      mode: 'pve',
    });

    assert.equal(resolved, null);
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'bot_game_spec_conflict' });
  });
});

function createContext(
  overrides: Partial<Pick<HttpApiContext, 'createRoom' | 'reserveLiveEngineSeat'>> = {},
): HttpApiContext {
  return {
    abandonRoom: async () => ({ ok: false, error: 'not_found' }),
    activeGameCount: () => 0,
    annotationsFile: '',
    createRoom: async () => roomFixture({ id: 'room' }),
    databaseRequired: true,
    drainDeadlineMs: () => null,
    inMemoryGameSummary: () => null,
    isDraining: () => false,
    liveClockIncrementMs: 2_000,
    liveClockInitialMs: 180_000,
    lobbyQueue: [],
    lobbyTickets: new Map(),
    pveBuiltinEngineClientId: 'python-v2-v1.6',
    releaseLiveEngineReservation: () => {},
    reserveLiveEngineSeat: async () => 'reservation',
    rooms: new Map<string, Room>(),
    ...overrides,
  };
}

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {} as Record<string, string | string[]>,
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string | string[]>) {
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

function jsonPost(body: Record<string, unknown>): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  request.method = 'POST';
  request.headers = { accept: 'application/json', 'content-type': 'application/json' };
  return request;
}

// The merged Misty row as migration 111 writes it (the harness truncates
// bot_profiles between tests, so each test re-inserts what it needs).
async function insertMistyProfile(): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO bot_profiles
         (id, display_name, bio, owner_type, active_engine_id, default_game_spec_id,
          supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
       VALUES ('misty', 'Misty', '', 'system', 'python-v2-v1.6', 'dark-chess',
               ARRAY['dark-chess', 'dark-draft960', 'dark-xiangqi', 'banqi', 'jungle', 'jungle-flip'],
               180000, 2000, 'public')`,
    );
  } finally {
    await client.end();
  }
}

async function insertBotProfile(
  id: string,
  displayName: string,
  visibility: 'private' | 'unlisted' | 'public',
): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO bot_profiles
         (id, display_name, bio, owner_type, active_engine_id, default_game_spec_id,
          supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
       VALUES ($1, $2, '', 'system', 'python-v2-v1.6', 'dark-chess',
               ARRAY['dark-chess'], 180000, 2000, $3)`,
      [id, displayName, visibility],
    );
  } finally {
    await client.end();
  }
}

// An engine that cannot honor a pace must not be handed one: Misty's per-move
// cost in fog has a floor the 1s and 2s increments do not cover, so it loses on
// time in long games (#283). The picker narrows to the pin; this is the
// defense in depth that a hand-crafted POST hits.
test('a fog PvE create that names no pace starts at the pin, not the house default', async () => {
  // The room factory's default clock is the house 3+2 — the pace the pin exists
  // to refuse (#283). Callers that omit a time control (the prod engine smokes,
  // API clients) would bypass the pin entirely if it only validated explicit
  // input, so an omitted pace RESOLVES to the pin here.
  const startedPaces: (RoomTimeControl | undefined)[] = [];
  const base = createContext({
    createRoom: async (mode, _variant, _engineId, _hiddenDraft960, timeControl) => {
      startedPaces.push(timeControl);
      return roomFixture({ id: 'defaulted-room', mode, timeControl });
    },
  });
  const ctx: HttpApiContext = { ...base, databaseRequired: false };

  const response = captureResponse();
  await tryHandle(ctx, jsonPost({ mode: 'pve', variant: 'dark-chess' }), response, '/api/rooms');
  assert.equal(response.status, 201);

  // A human game with no named pace still takes the room factory default: the
  // pin is a PvE constraint, not a new global default.
  const human = captureResponse();
  await tryHandle(ctx, jsonPost({ mode: 'pvp', variant: 'dark-chess' }), human, '/api/rooms');
  assert.equal(human.status, 201);

  assert.deepEqual(startedPaces, [{ initialMs: 300_000, incrementMs: 5_000 }, undefined]);
});

test('room creation rejects a fog chess bot game at a pace the engine cannot honor', async () => {
  for (const timeControl of [
    { initialMs: 180_000, incrementMs: 2_000 },
    { initialMs: 60_000, incrementMs: 1_000 },
  ]) {
    const response = captureResponse();
    const handled = await tryHandle(
      createContext(),
      jsonPost({ mode: 'pve', variant: 'dark-chess', timeControl }),
      response,
      '/api/rooms',
    );

    assert.equal(handled, true);
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'engine_time_control_unsupported' });
  }
});

test('the fog chess engine pin covers draft960, which is the same engine', async () => {
  const response = captureResponse();
  const handled = await tryHandle(
    createContext(),
    jsonPost({
      mode: 'pve',
      variant: 'dark-chess',
      hiddenDraft960: true,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    }),
    response,
    '/api/rooms',
  );

  assert.equal(handled, true);
  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'engine_time_control_unsupported' });
});

test('the engine pin admits its own pace and leaves human games alone', async () => {
  // Collected rather than assigned to a `let`: a callback write does not narrow,
  // so reading a property off the captured value would type as `never`.
  const startedPaces: (RoomTimeControl | undefined)[] = [];
  const base = createContext({
    createRoom: async (mode, _variant, _engineId, _hiddenDraft960, timeControl) => {
      startedPaces.push(timeControl);
      return roomFixture({ id: 'paced-room', mode, timeControl });
    },
  });
  // No Postgres in this unit path; the pin is checked before the persistence gate.
  const ctx: HttpApiContext = { ...base, databaseRequired: false };

  const pinned = captureResponse();
  await tryHandle(
    ctx,
    jsonPost({
      mode: 'pve',
      variant: 'dark-chess',
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
    }),
    pinned,
    '/api/rooms',
  );
  assert.equal(pinned.status, 201);
  assert.deepEqual(startedPaces, [{ initialMs: 300_000, incrementMs: 5_000 }]);

  // PvP at the same pace the bot is refused: the floor belongs to the engine,
  // not to Fog Chess, so humans keep every official control.
  const human = captureResponse();
  await tryHandle(
    ctx,
    jsonPost({
      mode: 'pvp',
      variant: 'dark-chess',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    }),
    human,
    '/api/rooms',
  );
  assert.equal(human.status, 201);
  assert.deepEqual(startedPaces, [
    { initialMs: 300_000, incrementMs: 5_000 },
    { initialMs: 180_000, incrementMs: 2_000 },
  ]);
});
