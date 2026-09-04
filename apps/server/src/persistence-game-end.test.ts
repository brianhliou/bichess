import { getGameSummary, recordGameEnd } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('game end', () => {
  // #296: an engine cannot abandon, so an engine failure must not persist as a
  // completed game with a winner. It rides recordGameEnd rather than
  // abortRunningGame because abortRunningGame is UPDATE ... WHERE status =
  // 'running', and most tenants omit recordGameStart, so there is no row for it
  // to touch -- and it writes no game_participants either, so routing an engine
  // failure to it would drop the game out of the database entirely.
  test('recordGameEnd persists an engine failure as an abort with no result, keeping participants', async () => {
    const now = new Date();
    await recordGameEnd('engine-failure-room', {
      variant: 'dark-xiangqi',
      mode: 'pve' as const,
      // The kernel finished the room as an abandonment win for the human; that
      // is what live clients saw, and it must NOT be what the row says.
      result: 'red-wins' as const,
      termination: 'abandonment' as const,
      plyCount: 11,
      startedAt: now,
      endedAt: now,
      whiteClient: null,
      blackClient: null,
      whiteName: null,
      blackName: null,
      corpusId: null,
      participants: [
        {
          color: 'red' as const,
          subjectType: 'user' as const,
          subjectId: null,
          displayName: 'someone',
          visibility: 'public' as const,
        },
        {
          color: 'black' as const,
          subjectType: 'engine-version' as const,
          subjectId: null,
          displayName: 'Misty DXQ 1.1',
          visibility: 'public' as const,
        },
      ],
      abortedAs: {
        termination: 'engine-failure' as const,
        abortedReason: 'pve engine failed to move',
      },
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query(
        'SELECT status, result, termination, aborted_reason FROM games WHERE room_id = $1',
        ['engine-failure-room'],
      );
      assert.equal(rows.length, 1, 'the game must still exist, not vanish');
      assert.equal(rows[0].status, 'aborted');
      assert.equal(rows[0].result, null, 'an aborted game awards nobody the win');
      assert.equal(rows[0].termination, 'engine-failure');
      assert.equal(rows[0].aborted_reason, 'pve engine failed to move');

      // The participants are the reason this goes through recordGameEnd at all.
      const participants = await client.query(
        // game_participants.game_id holds the room id directly (recordGameEnd
        // passes roomId straight into it); there is no surrogate games.id.
        'SELECT color, subject_type FROM game_participants WHERE game_id = $1 ORDER BY color',
        ['engine-failure-room'],
      );
      assert.equal(participants.rows.length, 2);
      assert.equal(
        participants.rows.find((r: { color: string }) => r.color === 'black')?.subject_type,
        'engine-version',
      );
    } finally {
      await client.end();
    }
  });

  test('recordGameEnd is idempotent', async () => {
    const now = new Date();
    const summary = {
      variant: 'dark-chess',
      result: 'white-wins' as const,
      termination: 'king-captured' as const,
      plyCount: 12,
      startedAt: now,
      endedAt: now,
      whiteClient: 'client-w',
      blackClient: 'client-b',
      whiteName: null,
      blackName: null,
      corpusId: null,
    };
    await recordGameEnd('idempotent-room', summary);
    await recordGameEnd('idempotent-room', summary);
    // Second call should not throw and should leave a single row.
  });

  test('recordGameEnd completes an existing running game row', async () => {
    const now = new Date();
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at, mode, status)
         VALUES ($1, 'dark-chess', NULL, NULL, 0, $2, NULL, 'eve', 'running')`,
        ['running-to-finished', now],
      );
    } finally {
      await client.end();
    }

    await recordGameEnd('running-to-finished', {
      variant: 'dark-chess',
      mode: 'eve',
      result: 'black-wins',
      termination: 'timeout',
      plyCount: 42,
      startedAt: now,
      endedAt: now,
      whiteClient: null,
      blackClient: null,
      whiteName: 'engine-a',
      blackName: 'engine-b',
      corpusId: null,
    });

    const verifyClient = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await verifyClient.connect();
    try {
      const { rows } = await verifyClient.query<{
        status: string;
        result: string | null;
        termination: string | null;
        ply_count: number;
      }>('SELECT status, result, termination, ply_count FROM games WHERE room_id = $1', [
        'running-to-finished',
      ]);
      assert.deepEqual(rows, [
        {
          status: 'completed',
          result: 'black-wins',
          termination: 'timeout',
          ply_count: 42,
        },
      ]);
    } finally {
      await verifyClient.end();
    }
  });

  test('recordGameEnd writes durable participant attribution', async () => {
    const now = new Date();
    await recordGameEnd('pve-attribution', {
      variant: 'dark-chess',
      mode: 'pve',
      result: 'white-wins',
      termination: 'king-captured',
      plyCount: 18,
      startedAt: now,
      endedAt: now,
      whiteClient: 'human-browser-client',
      blackClient: 'random-engine',
      whiteName: null,
      blackName: null,
      corpusId: null,
    });

    const summary = await getGameSummary('pve-attribution');
    assert.deepEqual(summary?.participants, [
      {
        color: 'white',
        displayName: 'Guest',
        subjectType: 'guest',
        subjectId: null,
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: 'Misty Random',
        subjectType: 'engine-version',
        subjectId: 'builtin-random-legal',
        visibility: 'public',
      },
    ]);
  });

  test('recordGameEnd accepts explicit signed-in user participant attribution', async () => {
    const now = new Date();
    await recordGameEnd('signed-in-pve-attribution', {
      variant: 'dark-chess',
      mode: 'pve',
      result: 'black-wins',
      termination: 'timeout',
      plyCount: 22,
      startedAt: now,
      endedAt: now,
      whiteClient: 'signed-in-browser-client',
      blackClient: 'builtin-random-legal',
      whiteName: 'alice',
      blackName: 'Random Legal',
      corpusId: null,
      participants: [
        {
          color: 'white',
          displayName: 'alice',
          subjectType: 'user',
          subjectId: 'user_alice',
          visibility: 'private',
        },
        {
          color: 'black',
          displayName: 'Random Legal',
          subjectType: 'engine-version',
          subjectId: 'builtin-random-legal',
          visibility: 'public',
        },
      ],
      visibility: 'private',
    });

    const summary = await getGameSummary('signed-in-pve-attribution');
    assert.equal(summary?.visibility, 'private');
    assert.deepEqual(summary?.participants, [
      {
        color: 'white',
        displayName: 'alice',
        subjectType: 'user',
        subjectId: 'user_alice',
        visibility: 'private',
      },
      {
        color: 'black',
        displayName: 'Random Legal',
        subjectType: 'engine-version',
        subjectId: 'builtin-random-legal',
        visibility: 'public',
      },
    ]);
  });
});
