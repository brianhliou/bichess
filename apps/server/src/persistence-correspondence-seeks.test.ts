import {
  closeUserAccount,
  correspondenceStartRecipient,
  countOpenSeeksForUser,
  createCorrespondenceSeek,
  createUser,
  deleteCorrespondenceSeek,
  deleteExpiredCorrespondenceSeeks,
  getCorrespondenceSeek,
  listChallengesForUser,
  listOpenCorrespondenceSeeks,
  updateUserAccountPreference,
  userExists,
} from './persistence.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

definePersistenceTests('correspondence seeks', () => {
  const at = new Date('2026-06-13T12:00:00Z');
  const seedUser = (id: string, handle: string, displayName: string) =>
    createUser({
      id,
      email: `${id}@example.com`,
      emailVerifiedAt: at,
      handle,
      displayName,
      now: at,
    });

  test('create, count, list with creator name, get, and delete-wins-the-race', async () => {
    const alice = await seedUser('seek-alice', 'alice', 'Alice');
    const bob = await seedUser('seek-bob', 'bob', 'Bob');

    await createCorrespondenceSeek({
      id: 'seek-1',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'first',
      targetUserId: null,
      visibility: 'public',
      expiresAt: null,
    });
    await createCorrespondenceSeek({
      id: 'seek-2',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 1,
      preferredColor: 'random',
      targetUserId: null,
      visibility: 'public',
      expiresAt: null,
    });
    await createCorrespondenceSeek({
      id: 'seek-3',
      creatorUserId: bob.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 7,
      preferredColor: 'second',
      targetUserId: null,
      visibility: 'public',
      expiresAt: null,
    });

    assert.equal(await countOpenSeeksForUser(alice.id), 2);
    assert.equal(await countOpenSeeksForUser(bob.id), 1);

    const open = await listOpenCorrespondenceSeeks();
    assert.equal(open.length, 3);
    assert.equal(open[0]?.id, 'seek-3'); // newest first
    const aliceSeek = open.find((seek) => seek.id === 'seek-1');
    assert.equal(aliceSeek?.creatorName, 'Alice');
    // Round-trips the neutral move-order value the fixture inserted (migration 106).
    assert.equal(aliceSeek?.preferredColor, 'first');
    assert.equal(aliceSeek?.daysPerMove, 3);

    assert.equal((await getCorrespondenceSeek('seek-1'))?.creatorUserId, alice.id);
    assert.equal(await getCorrespondenceSeek('missing'), null);

    // First delete wins (true); a second delete of the same id loses (false) —
    // the guard the accept flow relies on when two players accept at once.
    assert.equal(await deleteCorrespondenceSeek('seek-1'), true);
    assert.equal(await deleteCorrespondenceSeek('seek-1'), false);
    assert.equal(await countOpenSeeksForUser(alice.id), 1);
  });

  test('owner-scoped cancel removes only the creator-owned seek', async () => {
    const alice = await seedUser('cancel-alice', 'calice', 'Alice');
    const bob = await seedUser('cancel-bob', 'cbob', 'Bob');
    await createCorrespondenceSeek({
      id: 'cseek',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'first',
      targetUserId: null,
      visibility: 'public',
      expiresAt: null,
    });

    // Bob cannot cancel Alice's seek; Alice can.
    assert.equal(await deleteCorrespondenceSeek('cseek', bob.id), false);
    assert.notEqual(await getCorrespondenceSeek('cseek'), null);
    assert.equal(await deleteCorrespondenceSeek('cseek', alice.id), true);
    assert.equal(await getCorrespondenceSeek('cseek'), null);
  });

  test('challenges: board hides directed + link seeks; incoming lists directed', async () => {
    const alice = await seedUser('ch-alice', 'chalice', 'Alice');
    const bob = await seedUser('ch-bob', 'chbob', 'Bob');

    // A plain public board seek.
    await createCorrespondenceSeek({
      id: 'ch-public',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'first',
      targetUserId: null,
      visibility: 'public',
      expiresAt: null,
    });
    // A link challenge (off-board, no target).
    await createCorrespondenceSeek({
      id: 'ch-link',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'random',
      targetUserId: null,
      visibility: 'private',
      expiresAt: null,
    });
    // A directed challenge to Bob.
    await createCorrespondenceSeek({
      id: 'ch-direct',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 1,
      preferredColor: 'second',
      targetUserId: bob.id,
      visibility: 'private',
      expiresAt: null,
    });

    // The public board shows only the public, untargeted seek.
    const board = await listOpenCorrespondenceSeeks();
    assert.deepEqual(
      board.map((s) => s.id),
      ['ch-public'],
    );

    // Bob's incoming challenges are the directed ones addressed to him.
    const incoming = await listChallengesForUser(bob.id);
    assert.deepEqual(
      incoming.map((s) => s.id),
      ['ch-direct'],
    );
    assert.equal(incoming[0]?.creatorName, 'Alice');
    assert.equal(incoming[0]?.visibility, 'private');
    assert.equal(await listChallengesForUser(alice.id).then((r) => r.length), 0);

    // getCorrespondenceSeek round-trips the new dimensions.
    const direct = await getCorrespondenceSeek('ch-direct');
    assert.equal(direct?.targetUserId, bob.id);
    assert.equal(direct?.visibility, 'private');
    const link = await getCorrespondenceSeek('ch-link');
    assert.equal(link?.targetUserId, null);
    assert.equal(link?.visibility, 'private');

    // The cap counts every outstanding invitation, board or challenge.
    assert.equal(await countOpenSeeksForUser(alice.id), 3);

    // userExists validates challenge targets.
    assert.equal(await userExists(bob.id), true);
    assert.equal(await userExists('nobody'), false);
  });

  test('expiry: lapsed challenges drop from incoming and get swept', async () => {
    const alice = await seedUser('exp-alice', 'expalice', 'Alice');
    const bob = await seedUser('exp-bob', 'expbob', 'Bob');
    // The list filter and the sweep compare against the DB's real clock, so the
    // fixtures are relative to real now — not the fixed `at` used elsewhere.
    const now = new Date();
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 60_000);

    // A lapsed direct challenge, a still-live one, and a never-expiring board seek.
    await createCorrespondenceSeek({
      id: 'exp-lapsed',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'first',
      targetUserId: bob.id,
      visibility: 'private',
      expiresAt: past,
    });
    await createCorrespondenceSeek({
      id: 'exp-live',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'first',
      targetUserId: bob.id,
      visibility: 'private',
      expiresAt: future,
    });
    await createCorrespondenceSeek({
      id: 'exp-board',
      creatorUserId: alice.id,
      gameSpecId: 'dark-chess',
      daysPerMove: 3,
      preferredColor: 'first',
      targetUserId: null,
      visibility: 'public',
      expiresAt: null,
    });

    // Incoming hides the lapsed challenge, keeps the live one.
    const incoming = await listChallengesForUser(bob.id);
    assert.deepEqual(
      incoming.map((s) => s.id),
      ['exp-live'],
    );

    // The sweep removes only rows past their expiry — never the live challenge
    // or the never-expiring board seek. It reports the count removed.
    assert.equal(await deleteExpiredCorrespondenceSeeks(now), 1);
    assert.equal(await getCorrespondenceSeek('exp-lapsed'), null);
    assert.notEqual(await getCorrespondenceSeek('exp-live'), null);
    assert.notEqual(await getCorrespondenceSeek('exp-board'), null);
    // Idempotent: nothing left to reap.
    assert.equal(await deleteExpiredCorrespondenceSeeks(now), 0);
  });

  test('correspondenceStartRecipient honours the opt-out and skips closed accounts', async () => {
    const player = await seedUser('start-mail-player', 'startmail', 'Start Mail');

    // Never-touched preference: the key is absent from the JSON entirely, and
    // the query must read that as opted IN. This is the case every real
    // account is in until it visits the settings page, so a fail-closed
    // COALESCE here would silently mute the email for everybody.
    assert.equal((await correspondenceStartRecipient(player.id))?.email, player.email);

    await updateUserAccountPreference(player.id, 'correspondenceStartEmail', false, at);
    assert.equal(await correspondenceStartRecipient(player.id), null);

    // The two correspondence emails opt out independently.
    await updateUserAccountPreference(player.id, 'correspondenceStartEmail', true, at);
    await updateUserAccountPreference(player.id, 'correspondenceDeadlineEmail', false, at);
    assert.equal((await correspondenceStartRecipient(player.id))?.email, player.email);

    assert.equal(await correspondenceStartRecipient('nobody-at-all'), null);

    const quitter = await seedUser('start-mail-quitter', 'quitter', 'Quitter');
    await closeUserAccount(
      quitter.id,
      {
        closedEmailHash: 'hash-quitter',
        closedHandle: 'closed-quitter',
        placeholderEmail: 'closed-quitter@example.invalid',
      },
      at,
    );
    assert.equal(await correspondenceStartRecipient(quitter.id), null);
  });
});
