// Full prod web smoke: health + server-status (optionally pinned to a
// revision) + homepage brand text, then a real PvP room round-trip (create,
// seat both colors over WebSocket, abandon).
import WebSocket from 'ws';

import { resolveBaseUrl, revisionMatches } from './lib/base-url.mjs';
import { fetchJson, fetchText } from './lib/http.mjs';
import { parseSmokeArgs } from './lib/smoke-args.mjs';
import { reportResult } from './lib/smoke-report.mjs';

const DEFAULT_TIMEOUT_MS = 15_000;

const options = parseSmokeArgs(process.argv.slice(2), {
  usage: 'npm run prod:smoke -- [options]',
  flags: {
    '--base': {
      key: 'baseUrl',
      placeholder: '<url>',
      help: 'Base URL to smoke, default https://mistboard.com',
    },
    '--timeout-ms': {
      key: 'timeoutMs',
      placeholder: '<ms>',
      kind: 'positive-int',
      help: `Timeout per network step, default ${DEFAULT_TIMEOUT_MS}`,
    },
    '--expect-revision': {
      key: 'expectedRevision',
      placeholder: '<sha>',
      help: 'Fail unless /api/server-status reports this revision.',
    },
  },
});
const baseUrl = resolveBaseUrl(options.baseUrl);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
const expectedRevision = options.expectedRevision ?? process.env.MISTBOARD_EXPECT_REVISION ?? null;

const health = await fetchJson(new URL('/health', baseUrl), { timeoutMs });
if (health.status !== 200 || health.body?.ok !== true) {
  throw new Error(`/health failed: ${health.status} ${JSON.stringify(health.body)}`);
}

const serverStatus = await fetchJson(new URL('/api/server-status', baseUrl), { timeoutMs });
if (serverStatus.status !== 200) {
  throw new Error(`/api/server-status failed: ${serverStatus.status}`);
}
if (expectedRevision) {
  const actualRevision = serverStatus.body?.build?.revision;
  if (typeof actualRevision !== 'string' || !revisionMatches(actualRevision, expectedRevision)) {
    throw new Error(
      `revision mismatch: expected ${expectedRevision}, got ${actualRevision ?? 'missing'}`,
    );
  }
}

const index = await fetchText(new URL('/', baseUrl), { timeoutMs });
if (index.status !== 200) throw new Error(`/ failed: ${index.status}`);
if (!index.body.includes('Mistboard'))
  throw new Error('homepage did not include Mistboard brand text');

const room = await createRoom(baseUrl, timeoutMs);
const white = await connectSeat(baseUrl, room.roomId, 'white', timeoutMs);
const black = await connectSeat(baseUrl, room.roomId, 'black', timeoutMs);

white.socket.close();
black.socket.close();

const abandoned = await abandonRoom(baseUrl, room.roomId, white.hello.seatToken, timeoutMs);
if (!abandoned.ok) {
  throw new Error(`abandon failed for ${room.roomId}: ${JSON.stringify(abandoned)}`);
}

reportResult({
  ok: true,
  baseUrl: baseUrl.href,
  health: health.body,
  serverStatus: serverStatus.body,
  roomId: room.roomId,
  seats: [white.hello.seat, black.hello.seat],
  abandoned,
});

async function createRoom(baseUrl, timeoutMs) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetchJson(new URL('/api/rooms', baseUrl), {
      timeoutMs,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Pin preferredColor so the smoke's seat assertions are deterministic
        // regardless of the deployed server's preferredColor default. See
        // commit abfd18e for the underlying fix on master.
        body: JSON.stringify({ mode: 'pvp', variant: 'fog-of-war', preferredColor: 'white' }),
      },
    });
    if (response.status === 201) {
      if (typeof response.body?.roomId !== 'string')
        throw new Error('/api/rooms response missing roomId');
      if (attempt > 1) console.error(`/api/rooms succeeded on attempt ${attempt}`);
      return response.body;
    }
    lastError = new Error(`/api/rooms failed: ${response.status} ${JSON.stringify(response.body)}`);
    console.error(`/api/rooms attempt ${attempt} failed: ${response.status}`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2_000));
  }
  throw lastError;
}

async function connectSeat(baseUrl, roomId, expectedSeat, timeoutMs) {
  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('room', roomId);
  wsUrl.searchParams.set('client', `prod-smoke-${expectedSeat}-${Date.now()}`);

  const socket = new WebSocket(wsUrl, {
    headers: { origin: baseUrl.origin },
  });

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`timed out waiting for ${expectedSeat} hello`));
    }, timeoutMs);

    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== 'hello') return;
      if (message.seat !== expectedSeat) {
        clearTimeout(timer);
        socket.close();
        reject(new Error(`expected ${expectedSeat} seat, got ${message.seat ?? 'missing'}`));
        return;
      }
      if (typeof message.seatToken !== 'string') {
        clearTimeout(timer);
        socket.close();
        reject(new Error(`${expectedSeat} hello missing seatToken`));
        return;
      }
      clearTimeout(timer);
      resolve({ socket, hello: message });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on('close', (code, reason) => {
      clearTimeout(timer);
      reject(new Error(`socket closed before ${expectedSeat} hello: ${code} ${reason.toString()}`));
    });
  });
}

async function abandonRoom(baseUrl, roomId, seatToken, timeoutMs) {
  if (!seatToken) return { ok: false, reason: 'no_seat_token' };
  try {
    const response = await fetchJson(
      new URL(`/api/rooms/${encodeURIComponent(roomId)}/abandon`, baseUrl),
      {
        timeoutMs,
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seatToken }),
        },
      },
    );
    return { ok: response.status === 200, status: response.status, body: response.body };
  } catch (err) {
    return { ok: false, error: err.message ?? String(err) };
  }
}
