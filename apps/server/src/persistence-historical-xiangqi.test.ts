import type { IncomingMessage, ServerResponse } from 'node:http';
import type { XiangqiMove } from '@mistboard/game';
import {
  buildHistoricalXiangqiGameQueryWhere,
  getHistoricalXiangqiGame,
  insertHistoricalXiangqiGame,
  normalizeHistoricalXiangqiPlayerName,
  queryHistoricalXiangqiGames,
  upsertHistoricalXiangqiSource,
} from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';
import { tryHandle as tryHandleHistoricalRoute } from './routes/historical-xiangqi-games.js';

definePersistenceTests('historical xiangqi', () => {
  test('normalizes player names conservatively', () => {
    assert.equal(normalizeHistoricalXiangqiPlayerName('  Hu   Ronghua  '), 'hu ronghua');
    assert.equal(normalizeHistoricalXiangqiPlayerName('Ｈｕ　Ｒｏｎｇｈｕａ'), 'hu ronghua');
  });

  test('historical query where binds every filter value', () => {
    const injection = `x'; DROP TABLE historical_xiangqi_games; --`;
    const { clause, values } = buildHistoricalXiangqiGameQueryWhere({
      sourceSlug: 'fixture',
      player: 'Hu Ronghua',
      event: injection,
      result: '1-0',
      playedFrom: '1982-01-01',
      playedTo: '1983-01-01',
      visibility: 'public',
    });
    assert.ok(!clause.includes(injection), 'event value must not be interpolated');
    assert.match(clause, /sources\.slug = \$1/);
    assert.match(clause, /red_players\.normalized_name LIKE \$2/);
    assert.match(clause, /black_players\.normalized_name LIKE \$3/);
    assert.match(clause, /games\.event_name ILIKE \$4/);
    assert.match(clause, /games\.result = \$5/);
    assert.match(clause, /games\.played_on >= \$6::date/);
    assert.match(clause, /games\.played_on < \$7::date/);
    assert.match(clause, /games\.visibility = \$8/);
    assert.deepEqual(values, [
      'fixture',
      '%hu ronghua%',
      '%hu ronghua%',
      `%${injection}%`,
      '1-0',
      '1982-01-01',
      '1983-01-01',
      'public',
    ]);
  });

  test('inserts an idempotent historical game with source and players', async () => {
    const source = await upsertHistoricalXiangqiSource({
      slug: 'famous-xiangqi-test',
      name: 'Famous Xiangqi Test',
      sourceType: 'fixture',
      license: 'test-only',
      licenseStatus: 'test-only',
    });
    assert.equal(source.licenseStatus, 'test-only');

    const input = {
      sourceId: source.id,
      sourceGameId: 'game-001',
      eventName: 'Test Masters',
      playedOn: '1982-04-03',
      redNameRaw: 'Hu Ronghua',
      blackNameRaw: 'Liu Dahua',
      result: '1-0' as const,
      moveFormat: 'coordinate' as const,
      moves: [
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
        { from: 'h1', to: 'g3' },
      ] satisfies XiangqiMove[],
      tags: { rawFile: '001.dhtmlxq' },
    };

    const first = await insertHistoricalXiangqiGame(input);
    const second = await insertHistoricalXiangqiGame(input);
    assert.equal(second.id, first.id);
    assert.equal(second.plyCount, 3);
    assert.equal(second.redNameRaw, 'Hu Ronghua');
    assert.equal(second.blackNameRaw, 'Liu Dahua');
    assert.equal(second.tags.rawFile, '001.dhtmlxq');
    assert.ok(second.redPlayerId);
    assert.ok(second.blackPlayerId);

    const loaded = await getHistoricalXiangqiGame(first.id);
    assert.deepEqual(loaded?.moves, input.moves);
    assert.equal(loaded?.eventName, 'Test Masters');
    assert.equal(loaded?.playedOn, '1982-04-03');
  });

  test('queries historical games by source, player, event, result, and date', async () => {
    const source = await upsertHistoricalXiangqiSource({
      slug: 'classic-query-test',
      name: 'Classic Query Test',
      sourceType: 'fixture',
      license: 'test-only',
    });
    await insertHistoricalXiangqiGame({
      sourceId: source.id,
      sourceGameId: 'query-001',
      eventName: 'Silver River Cup',
      playedOn: '1982-04-03',
      redNameRaw: 'Hu Ronghua',
      blackNameRaw: 'Liu Dahua',
      result: '1-0',
      moveFormat: 'coordinate',
      moves: [
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
      ] satisfies XiangqiMove[],
      visibility: 'public',
    });
    await insertHistoricalXiangqiGame({
      sourceId: source.id,
      sourceGameId: 'query-002',
      eventName: 'Silver River Cup',
      playedOn: '1983-04-03',
      redNameRaw: 'Liu Dahua',
      blackNameRaw: 'Zhao Guorong',
      result: '0-1',
      moveFormat: 'coordinate',
      moves: [
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
      ] satisfies XiangqiMove[],
      visibility: 'public',
    });

    const page = await queryHistoricalXiangqiGames({
      sourceSlug: 'classic-query-test',
      player: 'Ｈｕ　Ｒｏｎｇｈｕａ',
      event: 'River',
      result: '1-0',
      playedFrom: '1982-01-01',
      playedTo: '1983-01-01',
      visibility: 'public',
    });

    assert.equal(page.total, 1);
    assert.equal(page.games[0]?.sourceSlug, 'classic-query-test');
    assert.equal(page.games[0]?.eventName, 'Silver River Cup');
    assert.equal(page.games[0]?.playedOn, '1982-04-03');
    assert.equal(page.games[0]?.redNameRaw, 'Hu Ronghua');
    assert.equal(page.games[0]?.blackNameRaw, 'Liu Dahua');
  });

  // The browsable games list is what a visitor means by "the xiangqi games
  // database". Two ways it used to misrepresent itself: engine-vs-engine
  // calibration rows outnumbered the real games, and the reported total was the
  // number of rows fetched, so it grew with the page size.
  test('games list hides engine-lab rows, names live seats, and counts honestly', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const at = (min: number) => new Date(Date.UTC(2026, 6, 3, 10, min, 0));
      const insertGame = async (
        roomId: string,
        mode: string,
        endedAt: Date,
        names: { white: string | null; black: string | null },
      ) => {
        await client.query(
          `INSERT INTO games
             (room_id, variant, result, termination, ply_count, started_at, ended_at,
              white_name, black_name, mode, status, visibility)
           VALUES ($1, 'xiangqi', 'red-wins', 'king-captured', 44, $2, $2, $3, $4, $5,
                   'completed', 'public')`,
          [roomId, endedAt, names.white, names.black, mode],
        );
      };

      await insertGame('unified-lab-a', 'eve', at(1), { white: 'Pikafish', black: 'Pikafish' });
      await insertGame('unified-lab-b', 'eve', at(2), { white: 'Pikafish', black: 'Pikafish' });
      // A real game keeps its seats on game_participants and leaves the games
      // row's name columns null.
      //
      // The seat colours here are 'red'/'black' because that is what a xiangqi
      // game actually stores. Seeding 'white' would test the reader against the
      // reader's own assumption: an earlier version of this fixture did exactly
      // that, passed, and shipped a listing whose red seat was always nameless.
      await insertGame('unified-human', 'pvp', at(3), { white: null, black: null });
      for (const [color, name] of [
        ['red', 'redseat'],
        ['black', 'blackseat'],
      ] as const) {
        await client.query(
          `INSERT INTO game_participants (game_id, color, subject_type, display_name, visibility)
           VALUES ($1, $2, 'guest', $3, 'public')`,
          ['unified-human', color, name],
        );
      }

      const respond = async (query: string) => {
        const capture = captureResponse();
        await tryHandleHistoricalRoute(
          {} as never,
          { method: 'GET', headers: {} } as unknown as IncomingMessage,
          capture,
          '/api/historical-xiangqi/games',
          new URL(`http://test.local/api/historical-xiangqi/games?${query}`),
        );
        assert.equal(capture.status, 200);
        return JSON.parse(capture.body) as {
          games: { id: string; redNameRaw: string | null; blackNameRaw: string | null }[];
          total: number;
        };
      };

      const all = await respond('limit=50');
      const ids = all.games.map((game) => game.id);
      assert.ok(!ids.includes('unified-lab-a'), 'engine-lab rows are not browsable games');
      assert.ok(!ids.includes('unified-lab-b'), 'engine-lab rows are not browsable games');
      assert.ok(ids.includes('unified-human'), 'a played game is listed');

      const human = all.games.find((game) => game.id === 'unified-human');
      assert.equal(human?.redNameRaw, 'redseat', 'seat names fall back to the participants');
      assert.equal(human?.blackNameRaw, 'blackseat');

      // The count describes the set, so asking for fewer rows must not shrink it.
      const narrow = await respond('limit=1');
      assert.equal(narrow.games.length, 1);
      assert.equal(narrow.total, all.total, 'total is a count, not the size of the page');
    } finally {
      await client.end();
    }
  });

  test('detail route serves an unlisted game by id but hides a private one', async () => {
    const source = await upsertHistoricalXiangqiSource({
      slug: 'gate-test',
      name: 'Gate Test',
      sourceType: 'platform-export',
      license: 'GPL-3.0',
      licenseStatus: 'cleared',
    });
    // Two DIFFERENT games. Row identity is the content digest (date, result,
    // moves) and deliberately not the source's own labels, so a pair that shared
    // its moves and differed only in sourceGameId would be one row: the second
    // insert would upsert onto the first and flip its visibility, and this test
    // would be asserting against a single game wearing both hats.
    const unlisted = await insertHistoricalXiangqiGame({
      sourceId: source.id,
      sourceGameId: 'gate-unlisted',
      result: '1-0',
      moveFormat: 'coordinate',
      moves: [{ from: 'h3', to: 'e3' }] as XiangqiMove[],
      visibility: 'unlisted',
    });
    const priv = await insertHistoricalXiangqiGame({
      sourceId: source.id,
      sourceGameId: 'gate-private',
      result: '1-0',
      moveFormat: 'coordinate',
      moves: [{ from: 'b3', to: 'e3' }] as XiangqiMove[],
      visibility: 'private',
    });

    // Unlisted is linked from the opening explorer's "Top games", so a direct id
    // must resolve even though it never appears in the browsable list.
    const okResp = captureResponse();
    await tryHandleHistoricalRoute(
      {} as never,
      { method: 'GET', headers: {} } as unknown as IncomingMessage,
      okResp,
      `/api/historical-xiangqi/games/${unlisted.id}`,
      new URL(`http://test.local/api/historical-xiangqi/games/${unlisted.id}`),
    );
    assert.equal(okResp.status, 200);
    assert.equal(JSON.parse(okResp.body).game.id, unlisted.id);

    // Private stays hidden by id.
    const hiddenResp = captureResponse();
    await tryHandleHistoricalRoute(
      {} as never,
      { method: 'GET', headers: {} } as unknown as IncomingMessage,
      hiddenResp,
      `/api/historical-xiangqi/games/${priv.id}`,
      new URL(`http://test.local/api/historical-xiangqi/games/${priv.id}`),
    );
    assert.equal(hiddenResp.status, 404);
  });
});

type ResponseCapture = { body: string; status: number | null };

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    status: null as number | null,
    writeHead(status: number) {
      capture.status = status;
      return capture;
    },
    setHeader() {
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}
