// Fog-of-war chess engine smoke: for each playable engine, create a PvE room
// as white, play e2e4, wait for the engine's reply, then abandon the room.
// Does not fit the variant runner (white seat, per-engine iteration, one JSON
// line per engine); shares the arg/base-url/fetch helpers from scripts/lib.
import WebSocket from 'ws';

import { resolveBaseUrl } from './lib/base-url.mjs';
import { fetchWithTimeout } from './lib/http.mjs';
import { parseSmokeArgs } from './lib/smoke-args.mjs';
import { reportResult } from './lib/smoke-report.mjs';

const DEFAULT_TIMEOUT_MS = 20_000;

const options = parseSmokeArgs(process.argv.slice(2), {
  usage: 'npm run prod:smoke:engines -- [options]',
  flags: {
    '--base': {
      key: 'baseUrl',
      placeholder: '<url>',
      help: 'Base URL to smoke, default https://mistboard.com',
    },
    '--engine': {
      key: 'engineIds',
      placeholder: '<engineId>',
      repeatable: true,
      help: 'Engine to smoke. Repeatable. Defaults to all playable engines.',
    },
    '--timeout-ms': {
      key: 'timeoutMs',
      placeholder: '<ms>',
      kind: 'positive-int',
      help: `Per-engine timeout, default ${DEFAULT_TIMEOUT_MS}`,
    },
  },
});
const baseUrl = resolveBaseUrl(options.baseUrl);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const playable = await fetchPlayableEngines(baseUrl);
const requestedEngineIds =
  options.engineIds.length > 0 ? options.engineIds : playable.map((engine) => engine.id);
const playableIds = new Set(playable.map((engine) => engine.id));
const unknown = requestedEngineIds.filter((engineId) => !playableIds.has(engineId));
if (unknown.length > 0) {
  throw new Error(`unknown playable engine(s): ${unknown.join(', ')}`);
}

for (const engineId of requestedEngineIds) {
  const result = await smokeEngine(baseUrl, engineId, timeoutMs);
  const abandoned = await abandonRoom(baseUrl, result.roomId, result.seatToken, timeoutMs);
  if (!abandoned.ok) {
    throw new Error(
      `abandon failed for ${engineId} room ${result.roomId}: ${JSON.stringify(abandoned)}`,
    );
  }
  const { seatToken: _seatToken, ...publicResult } = result;
  reportResult({ ...publicResult, abandoned });
}

async function fetchPlayableEngines(baseUrl) {
  const response = await fetch(new URL('/api/engines/playable', baseUrl));
  if (!response.ok)
    throw new Error(`engine list failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  if (!Array.isArray(body.engines)) throw new Error('engine list response missing engines');
  return body.engines;
}

async function smokeEngine(baseUrl, engineId, timeoutMs) {
  const created = await createRoom(baseUrl, engineId);
  const startedAt = Date.now();
  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('room', created.roomId);
  wsUrl.searchParams.set('client', `prod-engine-smoke-${engineId}-${Date.now()}`);

  const socket = new WebSocket(wsUrl, {
    headers: { origin: baseUrl.origin },
  });

  let sentMove = false;
  let settled = false;
  let capturedSeatToken = null;

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(new Error(`timed out waiting for ${engineId} engine reply`));
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
      const message = JSON.parse(raw.toString());
      if (message.type === 'hello' && typeof message.seatToken === 'string') {
        capturedSeatToken = message.seatToken;
      }
      const state = message.state;
      if (!state) return;

      const legalMoves = Array.isArray(state.legalMoves) ? state.legalMoves : [];
      if (!sentMove && legalMoves.some((move) => move.from === 'e2' && move.to === 'e4')) {
        sentMove = true;
        socket.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
        return;
      }

      if (
        sentMove &&
        state.status?.type === 'playing' &&
        state.status.turn === 'white' &&
        state.moveNumber >= 2
      ) {
        finish({
          ok: true,
          engineId,
          roomId: created.roomId,
          seatToken: capturedSeatToken,
          elapsedMs: Date.now() - startedAt,
          moveNumber: state.moveNumber,
        });
      }
    });

    socket.on('error', fail);
    socket.on('close', (code, reason) => {
      if (!settled)
        fail(new Error(`socket closed before ${engineId} replied: ${code} ${reason.toString()}`));
    });
  });
}

async function createRoom(baseUrl, engineId) {
  const response = await fetch(new URL('/api/rooms', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pve',
      variant: 'fog-of-war',
      engineId,
      // Smoke plays e2→e4 (white's opening), so the human seat must be white.
      // Pin explicitly so deployed servers with a 'random' default for
      // preferredColor don't coin-flip us onto black.
      preferredColor: 'white',
    }),
  });
  if (!response.ok)
    throw new Error(
      `room creation failed for ${engineId}: ${response.status} ${await response.text()}`,
    );
  const body = await response.json();
  if (typeof body.roomId !== 'string')
    throw new Error(`room creation response missing roomId for ${engineId}`);
  return body;
}

async function abandonRoom(baseUrl, roomId, seatToken, timeoutMs) {
  if (!seatToken) return { ok: false, reason: 'no_seat_token' };
  const url = new URL(`/api/rooms/${encodeURIComponent(roomId)}/abandon`, baseUrl);
  try {
    const response = await fetchWithTimeout(url, timeoutMs, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seatToken }),
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    return { ok: response.status === 200, status: response.status, body };
  } catch (err) {
    return { ok: false, error: err.message ?? String(err) };
  }
}
