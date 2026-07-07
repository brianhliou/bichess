import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createClock, expireClock, type GameEvent, replayGameEvents } from '@mistboard/game';
import {
  adminDebugTokenFromProtocolHeader,
  canExposeFullEventReplay,
  canObserveLiveRoom,
  eventReplayResponse,
  isAdminDebugToken,
  isAllowedWebSocketOrigin,
  isClientRoute,
  isDatabaseRequired,
  isDrainToken,
  isPrivateOrReservedIp,
  isReviewShellRoute,
  proxyTrustWarningFor,
  type RuntimeEnv,
  recordMessageTimestamp,
  seatTokenFromProtocolHeader,
} from './server-policy.js';

test('live persisted events are not public replay data', () => {
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'live-room', variant: 'dark-chess', offer: [] },
    {
      type: 'move-played',
      at: 2,
      roomId: 'live-room',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
  ];

  assert.equal(canExposeFullEventReplay(events), false);
  assert.deepEqual(eventReplayResponse(events), {
    status: 403,
    body: { error: 'game_not_public' },
  });
});

test('unknown room-family event logs fail closed for replay APIs', () => {
  const events = [
    { type: 'room-created', at: 1, roomId: 'dxq-policy', gameSpecId: 'dark-xiangqi' },
  ] as unknown as GameEvent[];

  assert.equal(canExposeFullEventReplay(events), false);
  assert.deepEqual(eventReplayResponse(events), {
    status: 403,
    body: { error: 'game_not_public' },
  });
});

test('finished Dark Xiangqi event logs stay out of the generic chess replay API', () => {
  const events = [
    { type: 'room-created', at: 1, roomId: 'dxq-postgame', gameSpecId: 'dark-xiangqi' },
    {
      type: 'seat-resigned',
      at: 2,
      roomId: 'dxq-postgame',
      color: 'red',
    },
  ] as unknown as GameEvent[];

  assert.equal(canExposeFullEventReplay(events), false);
  assert.deepEqual(eventReplayResponse(events), {
    status: 403,
    body: { error: 'game_not_public' },
  });
});

test('live replay API returns 403 for every mode (PvP, PvE, EvE)', () => {
  // Uniform rule: live games are private to the seated players regardless of
  // mode. The replay endpoint only exposes finished games.
  const pvp: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'pvp-live', variant: 'dark-chess', offer: [] },
    { type: 'seat-assigned', at: 1, roomId: 'pvp-live', clientId: 'human-white', seat: 'white' },
    { type: 'seat-assigned', at: 1, roomId: 'pvp-live', clientId: 'human-black', seat: 'black' },
    {
      type: 'move-played',
      at: 2,
      roomId: 'pvp-live',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
  ];
  const pve: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'pve-live', variant: 'dark-chess', offer: [] },
    { type: 'seat-assigned', at: 1, roomId: 'pve-live', clientId: 'human-white', seat: 'white' },
    { type: 'seat-assigned', at: 1, roomId: 'pve-live', clientId: 'random-engine', seat: 'black' },
    {
      type: 'move-played',
      at: 2,
      roomId: 'pve-live',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
    {
      type: 'move-played',
      at: 3,
      roomId: 'pve-live',
      color: 'black',
      move: { from: 'e7', to: 'e5' },
    },
  ];
  const eve: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'eve-live', variant: 'dark-chess', offer: [] },
    { type: 'seat-assigned', at: 1, roomId: 'eve-live', clientId: 'engine:white', seat: 'white' },
    { type: 'seat-assigned', at: 1, roomId: 'eve-live', clientId: 'engine:black', seat: 'black' },
    {
      type: 'move-played',
      at: 2,
      roomId: 'eve-live',
      color: 'white',
      move: { from: 'e2', to: 'e4' },
    },
  ];

  for (const events of [pvp, pve, eve]) {
    assert.equal(canExposeFullEventReplay(events), false);
    assert.deepEqual(eventReplayResponse(events), {
      status: 403,
      body: { error: 'game_not_public' },
    });
  }
});

test('canObserveLiveRoom returns false for every live mode and true only when finished', () => {
  const roomCreated: GameEvent = {
    type: 'room-created',
    at: 1,
    roomId: 'policy-room',
    variant: 'dark-chess',
    offer: [],
  };

  // Live PvP: no observation.
  assert.equal(canObserveLiveRoom(replayGameEvents([roomCreated])), false);
  // Live PvE: no observation (changed — was true under the per-mode rule).
  assert.equal(
    canObserveLiveRoom(
      replayGameEvents([
        roomCreated,
        {
          type: 'seat-assigned',
          at: 1,
          roomId: 'policy-room',
          clientId: 'human-white',
          seat: 'white',
        },
        {
          type: 'seat-assigned',
          at: 1,
          roomId: 'policy-room',
          clientId: 'random-engine',
          seat: 'black',
        },
      ]),
    ),
    false,
  );
  // Live EvE: no observation (changed — was true under the per-mode rule).
  assert.equal(
    canObserveLiveRoom(
      replayGameEvents([
        roomCreated,
        {
          type: 'seat-assigned',
          at: 1,
          roomId: 'policy-room',
          clientId: 'engine:white',
          seat: 'white',
        },
        {
          type: 'seat-assigned',
          at: 1,
          roomId: 'policy-room',
          clientId: 'engine:black',
          seat: 'black',
        },
      ]),
    ),
    false,
  );
  // Finished game (any mode): observation allowed via replay.
  const clock = expireClock(createClock(1, 1, 0), 2, 'white');
  assert.ok(clock);
  assert.equal(
    canObserveLiveRoom(
      replayGameEvents([
        roomCreated,
        { type: 'clock-expired', at: 2, roomId: 'policy-room', color: 'white', clock },
      ]),
    ),
    true,
  );
});

test('finished persisted events are public replay data', () => {
  const clock = expireClock(createClock(1, 1, 0), 2, 'white');
  assert.ok(clock);
  const events: GameEvent[] = [
    { type: 'room-created', at: 1, roomId: 'finished-room', variant: 'dark-chess', offer: [] },
    { type: 'clock-expired', at: 2, roomId: 'finished-room', color: 'white', clock },
  ];

  assert.equal(canExposeFullEventReplay(events), true);
  assert.deepEqual(eventReplayResponse(events), { status: 200, body: { events } });
});

test('missing persisted events return not found for replay API', () => {
  assert.deepEqual(eventReplayResponse(null), { status: 404, body: { error: 'not_found' } });
});

test('production-like runtime requires database unless explicitly allowed', () => {
  assert.equal(isDatabaseRequired({ NODE_ENV: 'production' }), true);
  assert.equal(isDatabaseRequired({ RAILWAY_SERVICE_NAME: 'mistboard' }), true);
  assert.equal(
    isDatabaseRequired({ NODE_ENV: 'production', MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE: 'true' }),
    false,
  );
  assert.equal(isDatabaseRequired({ MISTBOARD_REQUIRE_DATABASE: '1' }), true);
  assert.equal(isDatabaseRequired({}), false);
});

test('admin debug token is required and constant-length checked', () => {
  const env: RuntimeEnv = { MISTBOARD_ADMIN_DEBUG_TOKEN: 'secret-admin-token' };

  assert.equal(isAdminDebugToken(undefined, env), false);
  assert.equal(isAdminDebugToken('wrong', env), false);
  assert.equal(isAdminDebugToken('secret-admin-token', env), true);
  assert.equal(isAdminDebugToken('secret-admin-token', {}), false);
});

test('drain token is separate from debug token and constant-length checked', () => {
  const env: RuntimeEnv = { MISTBOARD_DRAIN_TOKEN: 'secret-drain-token' };

  assert.equal(isDrainToken(undefined, env), false);
  assert.equal(isDrainToken('wrong', env), false);
  assert.equal(isDrainToken('secret-drain-token', env), true);
  assert.equal(isDrainToken('secret-drain-token', {}), false);
  // Debug token must NOT validate as drain token, even with same value.
  const mixed: RuntimeEnv = { MISTBOARD_ADMIN_DEBUG_TOKEN: 'secret-drain-token' };
  assert.equal(isDrainToken('secret-drain-token', mixed), false);
});

test('admin debug token can be read from a websocket subprotocol header', () => {
  assert.equal(
    adminDebugTokenFromProtocolHeader('foo, mistboard-admin-debug.secret-admin-token, bar'),
    'secret-admin-token',
  );
  assert.equal(
    adminDebugTokenFromProtocolHeader(['foo', 'mistboard-admin-debug.secret-admin-token']),
    'secret-admin-token',
  );
  assert.equal(adminDebugTokenFromProtocolHeader('foo, bar'), undefined);
});

test('seat token can be read from a websocket subprotocol header', () => {
  assert.equal(
    seatTokenFromProtocolHeader('foo, mistboard-seat.seat-token-123, bar'),
    'seat-token-123',
  );
  assert.equal(
    seatTokenFromProtocolHeader(['foo', 'mistboard-seat.seat-token-456']),
    'seat-token-456',
  );
  assert.equal(seatTokenFromProtocolHeader('foo, bar'), undefined);
});

test('production websocket origin defaults to https host and supports explicit allowlist', () => {
  const prod: RuntimeEnv = { NODE_ENV: 'production' };

  assert.equal(isAllowedWebSocketOrigin(undefined, 'mistboard.com', prod), false);
  assert.equal(isAllowedWebSocketOrigin('http://mistboard.com', 'mistboard.com', prod), false);
  assert.equal(isAllowedWebSocketOrigin('https://mistboard.com', 'mistboard.com', prod), true);
  assert.equal(
    isAllowedWebSocketOrigin('https://staging.mistboard.com', 'mistboard.com', {
      ...prod,
      MISTBOARD_ALLOWED_ORIGINS: 'https://mistboard.com, https://staging.mistboard.com',
    }),
    true,
  );
  assert.equal(isAllowedWebSocketOrigin(undefined, 'localhost:3001', {}), true);
});

test('websocket message rate window rejects over-limit bursts and recovers after window', () => {
  const timestamps: number[] = [];

  assert.equal(recordMessageTimestamp(timestamps, 1_000, 2, 1_000), true);
  assert.equal(recordMessageTimestamp(timestamps, 1_100, 2, 1_000), true);
  assert.equal(recordMessageTimestamp(timestamps, 1_200, 2, 1_000), false);
  assert.equal(recordMessageTimestamp(timestamps, 2_300, 2, 1_000), true);
  assert.deepEqual(timestamps, [2_300]);
});

// Parity: every literal client route in apps/web/src/main.ts must be in the SPA
// fallback allowlist. Static parse of main.ts catches the bug class where a new
// route is wired client-side but the server still 404s direct hits.
// Intentionally-parked or DEV-only client routes that should NOT 200 in prod.
const PARKED_CLIENT_ROUTES = new Set<string>([
  '/xiangqi-spike', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/pixel-lab', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/variant-marks', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/sound-lab', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/deepdive', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/engine-review', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/showcase-sheet', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/postgame-sheet', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/luzhanqi-preview', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/dobutsu-chess-preview', // DEV-only; gated by import.meta.env.DEV in main.ts
  '/dobutsu-ui-preview', // DEV-only; gated by import.meta.env.DEV in main.ts
]);

test('isClientRoute covers every literal route declared in main.ts', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const mainPath = resolve(here, '..', '..', 'web', 'src', 'main.ts');
  const source = readFileSync(mainPath, 'utf-8');
  // Matches `path === '/foo'` or `path === '/foo/bar'` — the canonical pattern
  // for top-level routes in main.ts (e.g. wantsAbout, wantsContact). Parametric
  // routes (/game/:id, /@/:handle, /articles/:slug, /room/:id) live in helper
  // functions and are exercised by the literal startsWith branches below.
  const literalRoutes = Array.from(source.matchAll(/path === '(\/[^']*)'/g))
    .map((match) => match[1]!)
    // `/` is served as the static index.html itself, no SPA fallback needed.
    .filter((route) => route !== '/' && !PARKED_CLIENT_ROUTES.has(route));
  assert.ok(literalRoutes.length > 0, 'expected to find literal routes in main.ts');
  for (const route of literalRoutes) {
    assert.equal(
      isClientRoute(route),
      true,
      `main.ts routes ${route} client-side but server isClientRoute() returns 404`,
    );
  }
});

test('isClientRoute matches parametric SPA routes', () => {
  assert.equal(isClientRoute('/game/abc123'), true);
  assert.equal(isClientRoute('/dark-xiangqi/game/dxq_abc123'), true);
  assert.equal(isClientRoute('/mini-xiangqi/game/mxq_abc123'), true);
  assert.equal(isClientRoute('/dark-mini-xiangqi/game/dmxq_abc123'), true);
  assert.equal(isClientRoute('/dark-shogi/game/dsg_abc123'), true);
  assert.equal(isClientRoute('/crossroads-chess/game/dchess_abc123'), true);
  assert.equal(isClientRoute('/jungle/game/jgl_abc123'), true);
  assert.equal(isClientRoute('/jungle-flip/game/jgf_abc123'), true);
  assert.equal(isClientRoute('/room/abc123'), true);
  assert.equal(isClientRoute('/challenge/seek_abc123'), true);
  assert.equal(isClientRoute('/puzzles/mini-xiangqi-red-back-rank-net-1'), true);
  assert.equal(isClientRoute('/account/settings/privacy'), true);
  assert.equal(isClientRoute('/@/brianhliou'), true);
  assert.equal(isClientRoute('/articles/dark-chess-concepts'), true);
  assert.equal(isClientRoute('/zh-hans/articles'), true);
  assert.equal(isClientRoute('/zh-hant/articles'), true);
  assert.equal(isClientRoute('/rules/dark-chess'), true);
  assert.equal(isClientRoute('/rules/dark-draft960'), true);
  assert.equal(isClientRoute('/forum/general-discussion'), true);
  assert.equal(isClientRoute('/forum/t/topic_123/example-topic'), true);
  assert.equal(isClientRoute('/forum/redirect/post/post_123'), true);
  assert.equal(isClientRoute('/broadcast/xiangqi/2025-wxc-sample'), true);
  assert.equal(isClientRoute('/broadcast/xiangqi/2025-wxc-sample/round/men-r1'), true);
  assert.equal(isClientRoute('/broadcast/xiangqi/board/2025-wxc-sample-men-r1-b01'), true);
  assert.equal(isClientRoute('/zh-hans/rules/dark-chess'), true);
  assert.equal(isClientRoute('/zh-hant/rules/dark-chess'), true);
  assert.equal(isClientRoute('/engine/random-engine'), true); // admin engine-profile page
  assert.equal(isClientRoute('/analysis/xiangqi'), true); // standalone analysis board
});

test('isClientRoute lets vendored ceval engine assets fall through to static', () => {
  // /engine/:id is the admin engine-profile SPA page, but /engine/fairy-stockfish/*
  // are real vendored files. They MUST NOT be rewritten to index.html, or the local
  // analysis engine (ceval) loads HTML as a script and dies with "engine global
  // missing after script load" (prod regression 2026-07-05: `startsWith('/engine/')`
  // swallowed the asset subtree).
  assert.equal(isClientRoute('/engine/fairy-stockfish/stockfish.js'), false);
  assert.equal(isClientRoute('/engine/fairy-stockfish/stockfish.wasm'), false);
  assert.equal(isClientRoute('/engine/fairy-stockfish/stockfish.worker.js'), false);
  assert.equal(isClientRoute('/engine/fairy-stockfish/fortress-xiangqi.ini'), false);
});

test('isReviewShellRoute matches postgame review documents (COOP/COEP scope)', () => {
  // Bare dark-chess review + every /<variant>/game/:id review tenant.
  assert.equal(isReviewShellRoute('/game/abc123'), true);
  assert.equal(isReviewShellRoute('/xiangqi/game/xq_abc123'), true);
  assert.equal(isReviewShellRoute('/dark-xiangqi/game/dxq_abc123'), true);
  assert.equal(isReviewShellRoute('/fortress-xiangqi/game/fxq_abc123'), true);
  assert.equal(isReviewShellRoute('/jungle-flip/game/jgf_abc123'), true);
  assert.equal(isReviewShellRoute('/game/abc123?ply=4'.split('?', 1)[0]!), true);
  // The standalone analysis board mounts the same ceval engine, so it needs the
  // COOP/COEP isolation headers too (else SharedArrayBuffer is unavailable).
  assert.equal(isReviewShellRoute('/analysis/xiangqi'), true);
});

test('isReviewShellRoute excludes non-review surfaces (keeps them non-isolated)', () => {
  // Live rooms are postgame-engine-free; the rest of the site must stay
  // non-isolated so cross-origin flows (e.g. patron's Stripe redirect) are unaffected.
  assert.equal(isReviewShellRoute('/room/abc123'), false);
  assert.equal(isReviewShellRoute('/'), false);
  assert.equal(isReviewShellRoute('/patron'), false);
  assert.equal(isReviewShellRoute('/play'), false);
  assert.equal(isReviewShellRoute('/broadcast/xiangqi/board/2025-wxc-sample-men-r1-b01'), false);
  assert.equal(isReviewShellRoute('/xiangqi/game/'), false); // no game id
  assert.equal(isReviewShellRoute('/articles/dark-chess-concepts'), false);
  assert.equal(isReviewShellRoute('/a/b/game/c'), false); // too many segments
});

test('isClientRoute does not expose standalone Crossroads Chess play routes', () => {
  assert.equal(isClientRoute('/crossroads-chess'), false);
  assert.equal(isClientRoute('/crossroads-chess-play'), false);
  assert.equal(isClientRoute('/dual-chess-play'), false);
});

test('isClientRoute rejects unknown paths', () => {
  assert.equal(isClientRoute('/does-not-exist'), false);
  assert.equal(isClientRoute('/api/games/recent'), false);
  assert.equal(isClientRoute('/broadcast/xiangqi/board'), false);
  assert.equal(isClientRoute('/forum/general-discussion/extra'), false);
});

test('isPrivateOrReservedIp flags private, reserved, and unparseable addresses', () => {
  for (const ip of [
    '10.0.0.1',
    '172.16.5.4',
    '172.31.255.255',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.10.1', // link-local
    '100.64.0.1', // CGNAT
    '100.127.255.1', // CGNAT upper
    '0.0.0.0',
    '::1', // IPv6 loopback
    'fc00::1', // unique-local
    'fd12:3456:789a::1', // unique-local
    'fe80::1ff:fe23:4567:890a', // link-local
    '::ffff:10.0.0.1', // IPv4-mapped private
    'unknown',
    '',
  ]) {
    assert.equal(isPrivateOrReservedIp(ip), true, `expected private/reserved: ${ip}`);
  }
});

test('isPrivateOrReservedIp treats real public addresses as public', () => {
  for (const ip of [
    '203.0.113.7',
    '8.8.8.8',
    '172.15.0.1', // just below 172.16/12
    '172.32.0.1', // just above 172.31
    '100.63.0.1', // just below CGNAT
    '100.128.0.1', // just above CGNAT
    '::ffff:8.8.8.8', // IPv4-mapped public
    '2606:4700:4700::1111', // public IPv6
  ]) {
    assert.equal(isPrivateOrReservedIp(ip), false, `expected public: ${ip}`);
  }
});

test('proxyTrustWarningFor warns only in production when the resolved IP is private', () => {
  const prod: RuntimeEnv = { RAILWAY_SERVICE_NAME: 'web' };
  // prod + private resolved IP → warns, and names the IP + hops in the message
  const warning = proxyTrustWarningFor('10.0.0.5', 1, prod);
  assert.ok(warning?.includes('10.0.0.5') && warning.includes('MISTBOARD_TRUSTED_PROXY_HOPS=1'));
  // prod + public resolved IP → no warning
  assert.equal(proxyTrustWarningFor('203.0.113.7', 1, prod), null);
  // non-production → never warns, even for a private IP
  assert.equal(proxyTrustWarningFor('10.0.0.5', 1, {}), null);
});
