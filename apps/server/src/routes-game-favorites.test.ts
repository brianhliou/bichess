import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { accountSessionCookie, hashSecret } from './account-session.js';
import { createAccountSession, createUser } from './persistence.js';
import { definePersistenceTests, pg, TEST_DATABASE_URL, test } from './persistence-test-support.js';
import { tryHandle } from './routes/games.js';
import type { HttpApiContext } from './routes/lib.js';

type ResponseCapture = { body: string; headers: Record<string, string>; status: number | null };

definePersistenceTests('game favorite routes', () => {
  test('state, save, list, remove, and private-game denial follow the account session', async () => {
    const now = new Date('2026-07-14T12:00:00.000Z');
    const userId = 'favorite-route-user';
    const token = 'favorite-route-token';
    await createUser({
      id: userId,
      email: 'favorite-route@example.com',
      emailVerifiedAt: now,
      handle: 'favorite-route',
      displayName: 'Favorite Route',
      now,
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await createAccountSession({
      id: 'favorite-route-session',
      userId,
      tokenHash: hashSecret(token),
      expiresAt,
    });
    const cookie = accountSessionCookie('favorite-route-session', token, expiresAt).split(';')[0];

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            mode, status, visibility)
         VALUES
           ('favorite-route-public', 'xiangqi', 'red-wins', 'resignation', 40,
            now(), now(), 'pvp', 'completed', 'public'),
           ('favorite-route-private', 'dark-chess', 'white-wins', 'resignation', 30,
            now(), now(), 'pvp', 'completed', 'private')`,
      );
    } finally {
      await client.end();
    }

    const anonymous = await call('GET', '/api/games/favorite-route-public/favorite');
    assert.equal(anonymous.status, 200);
    assert.deepEqual(JSON.parse(anonymous.body), { authenticated: false, favorited: false });

    const saved = await call('PUT', '/api/games/favorite-route-public/favorite', cookie);
    assert.equal(saved.status, 200);
    assert.deepEqual(JSON.parse(saved.body), { authenticated: true, favorited: true });

    const state = await call('GET', '/api/games/favorite-route-public/favorite', cookie);
    assert.equal(state.status, 200);
    assert.deepEqual(JSON.parse(state.body), { authenticated: true, favorited: true });

    const page = await call('GET', '/api/games/favorites?offset=0&limit=15', cookie);
    assert.equal(page.status, 200);
    const pageBody = JSON.parse(page.body) as {
      games: Array<Record<string, unknown>>;
      total: number;
    };
    assert.equal(pageBody.total, 1);
    assert.equal(pageBody.games[0]?.roomId, 'favorite-route-public');
    for (const hiddenStateKey of ['events', 'history', 'view', 'payload']) {
      assert.equal(hiddenStateKey in (pageBody.games[0] ?? {}), false);
    }

    const denied = await call('PUT', '/api/games/favorite-route-private/favorite', cookie);
    assert.equal(denied.status, 404);
    assert.deepEqual(JSON.parse(denied.body), { error: 'not_found' });

    const removed = await call('DELETE', '/api/games/favorite-route-public/favorite', cookie);
    assert.equal(removed.status, 200);
    assert.deepEqual(JSON.parse(removed.body), { authenticated: true, favorited: false });

    const signedOutList = await call('GET', '/api/games/favorites');
    assert.equal(signedOutList.status, 401);
    assert.deepEqual(JSON.parse(signedOutList.body), { error: 'authentication_required' });
  });
});

async function call(method: string, url: string, cookie?: string): Promise<ResponseCapture> {
  const request = Readable.from([]) as unknown as IncomingMessage;
  request.method = method;
  request.url = url;
  request.headers = cookie ? { cookie } : {};
  Object.defineProperty(request, 'socket', { value: { remoteAddress: '127.0.0.1' } });
  const response = captureResponse();
  const parsed = new URL(url, 'http://localhost');
  const handled = await tryHandle(
    {} as HttpApiContext,
    request,
    response as unknown as ServerResponse,
    parsed.pathname,
    parsed,
  );
  assert.equal(handled, true);
  return response;
}

function captureResponse(): ResponseCapture & ServerResponse {
  const capture = {
    body: '',
    headers: {} as Record<string, string>,
    status: null as number | null,
    setHeader(name: string, value: string) {
      capture.headers[name] = value;
      return capture;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      capture.status = status;
      capture.headers = { ...capture.headers, ...(headers ?? {}) };
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ResponseCapture & ServerResponse;
}
