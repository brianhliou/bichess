import { getGameFavoriteState, listFavoriteGames, setGameFavorite } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('game favorites', () => {
  test('favorites are idempotent, private, ordered by save time, and visibility-safe', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO users (id, email, email_verified_at, handle, display_name, profile_visibility)
         VALUES
           ('favorite-user', 'favorite@example.com', now(), 'favorite-user', 'Favorite User', 'public'),
           ('private-owner', 'owner@example.com', now(), 'private-owner', 'Private Owner', 'public')`,
      );
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_name, black_name, mode, status, visibility)
         VALUES
           ('favorite-public-old', 'xiangqi', 'red-wins', 'resignation', 42,
            now() - interval '2 days', now() - interval '2 days', 'Red', 'Black',
            'pvp', 'completed', 'public'),
           ('favorite-public-new', 'dark-xiangqi', 'black-wins', 'timeout', 54,
            now() - interval '1 day', now() - interval '1 day', 'Red', 'Black',
            'pvp', 'completed', 'link'),
           ('favorite-private-own', 'dark-chess', 'white-wins', 'resignation', 31,
            now() - interval '3 days', now() - interval '3 days', 'White', 'Black',
            'pvp', 'completed', 'private'),
           ('favorite-private-other', 'dark-chess', 'black-wins', 'resignation', 28,
            now() - interval '4 days', now() - interval '4 days', 'White', 'Black',
            'pvp', 'completed', 'private')`,
      );
      await client.query(
        `INSERT INTO game_participants
           (game_id, color, subject_type, subject_id, display_name, visibility)
         VALUES
           ('favorite-private-own', 'white', 'user', 'favorite-user', 'Favorite User', 'private'),
           ('favorite-private-other', 'white', 'user', 'private-owner', 'Private Owner', 'private')`,
      );
    } finally {
      await client.end();
    }

    assert.deepEqual(await getGameFavoriteState('favorite-public-old', 'favorite-user'), {
      accessible: true,
      favorited: false,
    });
    assert.deepEqual(await setGameFavorite('favorite-public-old', 'favorite-user', true), {
      accessible: true,
      favorited: true,
    });
    // A repeated PUT is a no-op, not a duplicate.
    assert.deepEqual(await setGameFavorite('favorite-public-old', 'favorite-user', true), {
      accessible: true,
      favorited: true,
    });
    assert.deepEqual(await setGameFavorite('favorite-public-new', 'favorite-user', true), {
      accessible: true,
      favorited: true,
    });
    assert.deepEqual(await setGameFavorite('favorite-private-own', 'favorite-user', true), {
      accessible: true,
      favorited: true,
    });
    assert.deepEqual(await setGameFavorite('favorite-private-other', 'favorite-user', true), {
      accessible: false,
      favorited: false,
    });
    assert.deepEqual(await setGameFavorite('missing-game', 'favorite-user', true), {
      accessible: false,
      favorited: false,
    });

    const orderClient = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await orderClient.connect();
    try {
      await orderClient.query(
        `UPDATE game_favorites
         SET created_at = CASE game_id
           WHEN 'favorite-public-old' THEN now() - interval '3 minutes'
           WHEN 'favorite-public-new' THEN now() - interval '2 minutes'
           ELSE now() - interval '1 minute'
         END
         WHERE user_id = 'favorite-user'`,
      );
    } finally {
      await orderClient.end();
    }

    const firstPage = await listFavoriteGames('favorite-user', 0, 2);
    assert.equal(firstPage.total, 3);
    assert.deepEqual(
      firstPage.games.map((game) => game.roomId),
      ['favorite-private-own', 'favorite-public-new'],
    );
    assert.equal(firstPage.games[0]?.participants[0]?.subjectId, 'favorite-user');
    // Saved-game list payloads are metadata only. In particular, adding this
    // endpoint must not create a second path for hidden boards or event history.
    const payload = JSON.stringify(firstPage);
    for (const hiddenStateKey of ['"events"', '"history"', '"view"', '"payload"']) {
      assert.equal(payload.includes(hiddenStateKey), false);
    }
    const secondPage = await listFavoriteGames('favorite-user', 2, 2);
    assert.equal(secondPage.total, 3);
    assert.deepEqual(
      secondPage.games.map((game) => game.roomId),
      ['favorite-public-old'],
    );

    // A public game that becomes private no longer appears to a non-participant,
    // even though its private bookmark row still exists.
    const privacyClient = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await privacyClient.connect();
    try {
      await privacyClient.query(
        `UPDATE games SET visibility = 'private' WHERE room_id = 'favorite-public-new'`,
      );
    } finally {
      await privacyClient.end();
    }
    assert.deepEqual(await getGameFavoriteState('favorite-public-new', 'favorite-user'), {
      accessible: false,
      favorited: true,
    });
    const afterPrivacyChange = await listFavoriteGames('favorite-user');
    assert.equal(afterPrivacyChange.total, 2);
    assert.deepEqual(
      afterPrivacyChange.games.map((game) => game.roomId),
      ['favorite-private-own', 'favorite-public-old'],
    );

    assert.deepEqual(await setGameFavorite('favorite-public-old', 'favorite-user', false), {
      accessible: true,
      favorited: false,
    });
  });
});
