import WebSocket from 'ws';

const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_TIMEOUT_MS = 80_000;

const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(
  options.baseUrl ?? process.env.MISTBOARD_BASE_URL ?? DEFAULT_BASE_URL,
);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const created = await createRoom(baseUrl, timeoutMs);
if (created.skipped) {
  console.log(
    JSON.stringify({ ok: true, skipped: true, reason: created.reason, baseUrl: baseUrl.href }),
  );
} else {
  const result = await smokeRoom(baseUrl, created, timeoutMs);
  console.log(JSON.stringify(result));
}

async function createRoom(baseUrl, timeoutMs) {
  const response = await fetchWithTimeout(new URL('/api/rooms', baseUrl), timeoutMs, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      gameSpecId: 'dark-xiangqi',
      mode: 'pve',
      // Human black makes the DXQ engine red, so the smoke proves the opening
      // engine move and can still clean up with a pregame abort.
      preferredColor: 'black',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    }),
  });
  const body = await parseJsonResponse(response);
  // The variant is feature-flagged per environment. When the flag is off, the
  // request gate answers 404 `<spec>_disabled` — a clean, deterministic signal,
  // not a deploy regression. Skip (exit 0) so the release smoke doesn't red on a
  // deliberately-disabled variant; the check turns real the moment the flag flips.
  if (response.status === 404 && /_disabled$/.test(body?.error ?? '')) {
    return { skipped: true, reason: body.error };
  }
  if (response.status !== 201 || typeof body?.roomId !== 'string') {
    throw new Error(`room creation failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function smokeRoom(baseUrl, created, timeoutMs) {
  const startedAt = Date.now();
  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('room', created.roomId);
  wsUrl.searchParams.set('client', `prod-dxq-smoke-${Date.now()}`);

  const socket = new WebSocket(wsUrl, {
    headers: { origin: baseUrl.origin },
  });

  let capturedSeatToken = null;
  let engineReplyState = null;
  let sentAbort = false;
  let settled = false;

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(new Error('timed out waiting for DXQ engine opening move'));
    }, timeoutMs);

    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(value);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      reject(err);
    }

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (err) {
        fail(err);
        return;
      }

      if (message.type === 'hello') {
        if (message.seat !== 'black') {
          fail(new Error(`expected black seat, got ${message.seat ?? 'missing'}`));
          return;
        }
        if (typeof message.seatToken === 'string') capturedSeatToken = message.seatToken;
      }

      const state = message.state;
      if (!state) return;
      if (
        !sentAbort &&
        state.status?.type === 'playing' &&
        state.status.turn === 'black' &&
        state.moveNumber === 1 &&
        // version-agnostic: any Dark Xiangqi engine id (python-fdx-*). Pinning a
        // specific version here silently breaks the smoke on every engine bump —
        // the check never matches the new seat id and the smoke times out on a
        // perfectly healthy engine (hit exactly this on the v1.0 -> v1.1 flip).
        typeof message.seats?.red === 'string' &&
        message.seats.red.startsWith('python-fdx-')
      ) {
        engineReplyState = {
          moveNumber: state.moveNumber,
          turn: state.status.turn,
          lastMove: state.lastMove ?? null,
        };
        sentAbort = true;
        socket.send(JSON.stringify({ type: 'abort' }));
        return;
      }

      if (sentAbort && state.status?.type === 'aborted') {
        finish({
          ok: true,
          baseUrl: baseUrl.href,
          roomId: created.roomId,
          mode: created.mode,
          gameSpecId: created.gameSpecId,
          elapsedMs: Date.now() - startedAt,
          seat: 'black',
          hadSeatToken: typeof capturedSeatToken === 'string',
          engineReplyState,
          finalStatus: state.status,
        });
      }

      if (state.status?.type === 'finished') {
        fail(
          new Error(
            `DXQ game ${created.roomId} finished before smoke completed: ${JSON.stringify(
              state.status,
            )}`,
          ),
        );
      }
    });

    socket.on('error', fail);
    socket.on('close', (code, reason) => {
      if (!settled) {
        fail(new Error(`socket closed before DXQ smoke finished: ${code} ${reason.toString()}`));
      }
    });
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response from ${response.url}: ${text.slice(0, 120)}`);
  }
}

async function fetchWithTimeout(url, timeoutMs, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(args) {
  const result = {
    baseUrl: null,
    timeoutMs: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--base') {
      result.baseUrl = requiredValue(args, ++index, '--base');
    } else if (arg === '--timeout-ms') {
      result.timeoutMs = parsePositiveInteger(
        requiredValue(args, ++index, '--timeout-ms'),
        '--timeout-ms',
      );
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return result;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function printHelp() {
  console.log(`Usage: npm run prod:smoke:dxq -- [options]

Options:
  --base <url>       Base URL to smoke, default ${DEFAULT_BASE_URL}
  --timeout-ms <ms>  Timeout per network step, default ${DEFAULT_TIMEOUT_MS}
`);
}
