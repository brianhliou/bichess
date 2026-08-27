import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { buildCrosstable, CROSSTABLE_GAME_LIMIT, type CrosstableResponse } from './crosstable.js';
import { queryHeadToHeadGames, tallyHeadToHeadGames } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';
import { tryHandle } from './routes/games.js';
import type { HttpApiContext } from './routes/lib.js';
// Side-effect import: registers the xiangqi tenant so the route resolves the
// real '/xiangqi/game' review base for the end-to-end call below.
import './xiangqi-registration.js';

const ALICE = { subjectType: 'user', subjectId: 'alice' } as const;
const BOB = { subjectType: 'user', subjectId: 'bob' } as const;
const ENGINE = { subjectType: 'engine-version', subjectId: 'misty-xiangqi' } as const;

type SeededGame = {
  roomId: string;
  variant: string;
  result: string;
  daysAgo: number;
  status?: string;
  visibility?: string;
  red: { subjectType: string; subjectId: string | null; visibility?: string };
  black: { subjectType: string; subjectId: string | null; visibility?: string };
};

async function seedGames(client: pg.Client, games: readonly SeededGame[]): Promise<void> {
  for (const game of games) {
    const endedAt = new Date(Date.UTC(2026, 7, 27) - game.daysAgo * 24 * 60 * 60 * 1000);
    // A running game has no result/termination/ended_at yet (games_status_shape_check).
    const running = game.status === 'running';
    await client.query(
      `INSERT INTO games
         (room_id, variant, result, termination, ply_count, started_at, ended_at,
          white_name, black_name, mode, status, visibility)
       VALUES ($1, $2, $3, $4, 40, $5, $6, 'Red', 'Black', 'pvp', $7, $8)`,
      [
        game.roomId,
        game.variant,
        running ? null : game.result,
        running ? null : 'resignation',
        endedAt,
        running ? null : endedAt,
        game.status ?? 'completed',
        game.visibility ?? 'public',
      ],
    );
    await client.query(
      `INSERT INTO game_participants
         (game_id, color, subject_type, subject_id, display_name, visibility)
       VALUES
         ($1, 'red', $2, $3, $4, $5),
         ($1, 'black', $6, $7, $8, $9)`,
      [
        game.roomId,
        game.red.subjectType,
        game.red.subjectId,
        game.red.subjectId ?? 'Guest',
        game.red.visibility ?? 'public',
        game.black.subjectType,
        game.black.subjectId,
        game.black.subjectId ?? 'Guest',
        game.black.visibility ?? 'public',
      ],
    );
  }
}

type ResponseCapture = { body: string; status: number | null };

async function callCrosstable(roomId: string): Promise<ResponseCapture> {
  const url = `/api/games/${encodeURIComponent(roomId)}/crosstable`;
  const request = Readable.from([]) as unknown as IncomingMessage;
  request.method = 'GET';
  request.url = url;
  request.headers = {};
  Object.defineProperty(request, 'socket', { value: { remoteAddress: '127.0.0.1' } });
  const capture: ResponseCapture & {
    writeHead(status: number): unknown;
    end(chunk?: string): unknown;
  } = {
    body: '',
    status: null,
    writeHead(status: number) {
      capture.status = status;
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  const parsed = new URL(url, 'http://localhost');
  const ctx = {
    rooms: new Map(),
    inMemoryGameSummary: () => null,
  } as unknown as HttpApiContext;
  const handled = await tryHandle(
    ctx,
    request,
    capture as unknown as ServerResponse,
    parsed.pathname,
    parsed,
  );
  assert.equal(handled, true, `route did not handle ${url}`);
  return { body: capture.body, status: capture.status };
}

definePersistenceTests('crosstable', () => {
  test('persistence crosstable counts the pair in either seat order, same variant, public seats only', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO users (id, email, email_verified_at, handle, display_name, profile_visibility)
         VALUES
           ('alice', 'alice@example.com', now(), 'alice', 'Alice', 'public'),
           ('bob', 'bob@example.com', now(), 'bob', 'Bob', 'public')`,
      );
      await seedGames(client, [
        // The record, oldest to newest: alice wins, bob wins, alice wins, draw, bob wins.
        {
          roomId: 'xq_h2h_1',
          variant: 'xiangqi',
          result: 'red-wins',
          daysAgo: 5,
          red: ALICE,
          black: BOB,
        },
        {
          roomId: 'xq_h2h_2',
          variant: 'xiangqi',
          result: 'red-wins',
          daysAgo: 4,
          red: BOB,
          black: ALICE,
        },
        {
          roomId: 'xq_h2h_3',
          variant: 'xiangqi',
          result: 'black-wins',
          daysAgo: 3,
          red: BOB,
          black: ALICE,
        },
        {
          roomId: 'xq_h2h_4',
          variant: 'xiangqi',
          result: 'draw',
          daysAgo: 2,
          red: ALICE,
          black: BOB,
        },
        {
          roomId: 'xq_current',
          variant: 'xiangqi',
          result: 'black-wins',
          daysAgo: 1,
          red: ALICE,
          black: BOB,
        },
        // Excluded: another variant.
        {
          roomId: 'dxq_other',
          variant: 'dark-xiangqi',
          result: 'red-wins',
          daysAgo: 1,
          red: ALICE,
          black: BOB,
        },
        // Excluded: a private seat.
        {
          roomId: 'xq_private_seat',
          variant: 'xiangqi',
          result: 'red-wins',
          daysAgo: 1,
          red: { ...ALICE, visibility: 'private' },
          black: BOB,
        },
        // Excluded: a private game.
        {
          roomId: 'xq_private_game',
          variant: 'xiangqi',
          result: 'red-wins',
          daysAgo: 1,
          visibility: 'private',
          red: ALICE,
          black: BOB,
        },
        // Excluded: not the pair (a guest opponent).
        {
          roomId: 'xq_guest',
          variant: 'xiangqi',
          result: 'red-wins',
          daysAgo: 1,
          red: ALICE,
          black: { subjectType: 'guest', subjectId: null },
        },
        // Excluded: still running.
        {
          roomId: 'xq_running',
          variant: 'xiangqi',
          result: 'red-wins',
          daysAgo: 0,
          status: 'running',
          red: ALICE,
          black: BOB,
        },
        // A second pair: alice against the engine, both seat orders, engine wins both.
        {
          roomId: 'xq_eng_1',
          variant: 'xiangqi',
          result: 'black-wins',
          daysAgo: 3,
          red: ALICE,
          black: ENGINE,
        },
        {
          roomId: 'xq_eng_2',
          variant: 'xiangqi',
          result: 'red-wins',
          daysAgo: 2,
          red: ENGINE,
          black: ALICE,
        },
      ]);
    } finally {
      await client.end();
    }

    // Alice's side, from either seat order of the pair.
    const games = await queryHeadToHeadGames(ALICE, BOB, 'xiangqi', CROSSTABLE_GAME_LIMIT);
    assert.deepEqual(
      games.map((game) => [game.roomId, game.aColor, game.result]),
      [
        ['xq_current', 'red', 'black-wins'],
        ['xq_h2h_4', 'red', 'draw'],
        ['xq_h2h_3', 'black', 'black-wins'],
        ['xq_h2h_2', 'black', 'red-wins'],
        ['xq_h2h_1', 'red', 'red-wins'],
      ],
    );
    assert.ok(games.every((game) => game.endedAt instanceof Date && game.variant === 'xiangqi'));

    const tallies = await tallyHeadToHeadGames(ALICE, BOB, 'xiangqi');
    const body = buildCrosstable({
      variant: 'xiangqi',
      players: [
        { name: 'Alice', kind: 'account' },
        { name: 'Bob', kind: 'account' },
      ],
      games,
      tallies,
    });
    assert.equal(body.available, true);
    if (!body.available) return;
    assert.deepEqual(body.score, { a: 2, b: 2, draws: 1, total: 5 });
    assert.deepEqual(
      body.games.map((game) => [game.roomId, game.aSeat, game.outcome]),
      [
        ['xq_current', 'white', 'b'],
        ['xq_h2h_4', 'white', 'draw'],
        ['xq_h2h_3', 'black', 'a'],
        ['xq_h2h_2', 'black', 'b'],
        ['xq_h2h_1', 'white', 'a'],
      ],
    );

    // Swapping the pair flips the perspective, not the set.
    const reversed = await tallyHeadToHeadGames(BOB, ALICE, 'xiangqi');
    const reversedBody = buildCrosstable({
      variant: 'xiangqi',
      players: [
        { name: 'Bob', kind: 'account' },
        { name: 'Alice', kind: 'account' },
      ],
      games: [],
      tallies: reversed,
    });
    assert.deepEqual(reversedBody.available && reversedBody.score, {
      a: 2,
      b: 2,
      draws: 1,
      total: 5,
    });

    // The engine pair matches on the version-less subject id, in either seat.
    const engineTallies = await tallyHeadToHeadGames(ALICE, ENGINE, 'xiangqi');
    const engineBody = buildCrosstable({
      variant: 'xiangqi',
      players: [
        { name: 'Alice', kind: 'account' },
        { name: 'misty-xiangqi', kind: 'engine' },
      ],
      games: await queryHeadToHeadGames(ALICE, ENGINE, 'xiangqi', CROSSTABLE_GAME_LIMIT),
      tallies: engineTallies,
    });
    assert.equal(engineBody.available, true);
    if (!engineBody.available) return;
    assert.deepEqual(engineBody.score, { a: 0, b: 2, draws: 0, total: 2 });
    assert.deepEqual(
      engineBody.games.map((game) => [game.roomId, game.aSeat, game.outcome]),
      [
        ['xq_eng_2', 'black', 'b'],
        ['xq_eng_1', 'white', 'b'],
      ],
    );

    // No games at all in the other direction of an unrelated variant.
    assert.deepEqual(await tallyHeadToHeadGames(ALICE, BOB, 'banqi'), []);
    assert.deepEqual(await queryHeadToHeadGames(ALICE, BOB, 'banqi', 5), []);

    // End to end through the route: the current room resolves its own pair.
    const routed = await callCrosstable('xq_current');
    assert.equal(routed.status, 200);
    const payload = JSON.parse(routed.body) as CrosstableResponse;
    assert.equal(payload.available, true);
    if (!payload.available) return;
    assert.equal(payload.variant, 'xiangqi');
    assert.deepEqual(payload.players, [
      { name: 'alice', kind: 'account' },
      { name: 'bob', kind: 'account' },
    ]);
    assert.deepEqual(payload.score, { a: 2, b: 2, draws: 1, total: 5 });
    assert.deepEqual(payload.games[0], {
      roomId: 'xq_current',
      reviewUrl: '/xiangqi/game/xq_current',
      endedAt: '2026-08-26T00:00:00.000Z',
      aSeat: 'white',
      outcome: 'b',
    });
    assert.equal(payload.games.length, 5);

    // The route gates on the room's own seats: a guest seat, a private seat,
    // and a missing room.
    const guestRoom = await callCrosstable('xq_guest');
    assert.deepEqual(JSON.parse(guestRoom.body), { available: false, reason: 'guest' });
    const privateRoom = await callCrosstable('xq_private_seat');
    assert.deepEqual(JSON.parse(privateRoom.body), { available: false, reason: 'private' });
    const missing = await callCrosstable('xq_nope');
    assert.equal(missing.status, 404);
    assert.deepEqual(JSON.parse(missing.body), { error: 'not_found' });
    // A running room has no completed summary yet.
    const running = await callCrosstable('xq_running');
    assert.equal(running.status, 404);
  });

  test('persistence crosstable lists at most the newest 20 games but scores the whole record', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO users (id, email, email_verified_at, handle, display_name, profile_visibility)
         VALUES
           ('alice', 'alice@example.com', now(), 'alice', 'Alice', 'public'),
           ('bob', 'bob@example.com', now(), 'bob', 'Bob', 'public')`,
      );
      const games: SeededGame[] = [];
      for (let index = 0; index < 25; index += 1) {
        const aliceRed = index % 2 === 0;
        games.push({
          roomId: `xq_many_${String(index).padStart(2, '0')}`,
          variant: 'xiangqi',
          // Red wins every game: alice wins the even ones, bob the odd ones.
          result: 'red-wins',
          daysAgo: 25 - index,
          red: aliceRed ? ALICE : BOB,
          black: aliceRed ? BOB : ALICE,
        });
      }
      await seedGames(client, games);
    } finally {
      await client.end();
    }

    const games = await queryHeadToHeadGames(ALICE, BOB, 'xiangqi', CROSSTABLE_GAME_LIMIT);
    assert.equal(games.length, 20);
    assert.equal(games[0]?.roomId, 'xq_many_24');
    assert.equal(games[19]?.roomId, 'xq_many_05');
    const tallies = await tallyHeadToHeadGames(ALICE, BOB, 'xiangqi');
    const body = buildCrosstable({
      variant: 'xiangqi',
      players: [
        { name: 'Alice', kind: 'account' },
        { name: 'Bob', kind: 'account' },
      ],
      games,
      tallies,
    });
    assert.deepEqual(body.available && body.score, { a: 13, b: 12, draws: 0, total: 25 });
    assert.equal(body.available && body.games.length, 20);
  });
});
