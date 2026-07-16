import {
  consumeAuthRateLimitBucket,
  consumeEmailLoginChallenge,
  createAccountSession,
  createEmailLoginChallenge,
  createUser,
  deleteEmailLoginChallenge,
  findUserByEmail,
  getUserByAccountSession,
  markUserEmailVerified,
  revokeAccountSession,
  supersedeEmailLoginChallenges,
  updateUserLocale,
  updateUserProfile,
} from './persistence.js';
import { assert, definePersistenceTests, sha256, test } from './persistence-test-support.js';

definePersistenceTests('accounts', () => {
  test('email login challenges are one-time and expire', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const codeHash = sha256('12345678');
    await createEmailLoginChallenge({
      id: 'login-valid',
      email: 'alice@example.com',
      codeHash,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    assert.deepEqual(await consumeEmailLoginChallenge('login-valid', codeHash, now), {
      email: 'alice@example.com',
    });
    assert.equal(await consumeEmailLoginChallenge('login-valid', codeHash, now), null);

    await createEmailLoginChallenge({
      id: 'login-expired',
      email: 'alice@example.com',
      codeHash,
      expiresAt: new Date(now.getTime() - 1_000),
    });
    assert.equal(await consumeEmailLoginChallenge('login-expired', codeHash, now), null);
  });

  test('email login challenges lock out after too many wrong codes', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const correctHash = sha256('11112222');
    const wrongHash = sha256('99998888');
    await createEmailLoginChallenge({
      id: 'login-bruteforce',
      email: 'mallory@example.com',
      codeHash: correctHash,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    // Five wrong guesses exhaust the default attempt cap. The challenge is
    // still inside its TTL the whole time, so only the cap can stop it.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(await consumeEmailLoginChallenge('login-bruteforce', wrongHash, now), null);
    }

    // The correct code is now rejected too: the challenge is locked, not just
    // the individual guesses. An attacker who burned the budget can't recover.
    assert.equal(await consumeEmailLoginChallenge('login-bruteforce', correctHash, now), null);
  });

  test('email login challenges accept the correct code before the cap', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const correctHash = sha256('44445555');
    const wrongHash = sha256('00001111');
    await createEmailLoginChallenge({
      id: 'login-recoverable',
      email: 'recoverable@example.com',
      codeHash: correctHash,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    // A couple of typos don't cost the user the challenge.
    assert.equal(await consumeEmailLoginChallenge('login-recoverable', wrongHash, now), null);
    assert.equal(await consumeEmailLoginChallenge('login-recoverable', wrongHash, now), null);

    assert.deepEqual(await consumeEmailLoginChallenge('login-recoverable', correctHash, now), {
      email: 'recoverable@example.com',
    });
    // And it remains one-time after the successful consume.
    assert.equal(await consumeEmailLoginChallenge('login-recoverable', correctHash, now), null);
  });

  test('email login challenges can be deleted after delivery failure', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const codeHash = sha256('12345678');
    await createEmailLoginChallenge({
      id: 'login-undelivered',
      email: 'undelivered@example.com',
      codeHash,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    await deleteEmailLoginChallenge('login-undelivered');

    assert.equal(await consumeEmailLoginChallenge('login-undelivered', codeHash, now), null);
  });

  test('a newly delivered login code supersedes older live codes for the email', async () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const firstHash = sha256('11112222');
    const secondHash = sha256('33334444');
    for (const challenge of [
      { id: 'login-first', codeHash: firstHash },
      { id: 'login-second', codeHash: secondHash },
    ]) {
      await createEmailLoginChallenge({
        ...challenge,
        email: 'resend@example.com',
        expiresAt: new Date(now.getTime() + 60_000),
      });
    }

    await supersedeEmailLoginChallenges('RESEND@example.com', 'login-second', now);

    assert.equal(await consumeEmailLoginChallenge('login-first', firstHash, now), null);
    assert.deepEqual(await consumeEmailLoginChallenge('login-second', secondHash, now), {
      email: 'resend@example.com',
    });
  });

  test('durable auth buckets enforce limits, cooldowns, and window renewal', async () => {
    const start = new Date('2026-07-15T12:00:00.000Z');
    const input = {
      cooldownMs: 30_000,
      limit: 2,
      now: start,
      scope: 'email-start-email' as const,
      subjectHash: sha256('auth-rate:email:player@example.com'),
      windowMs: 600_000,
    };

    assert.equal(await consumeAuthRateLimitBucket(input), true);
    assert.equal(
      await consumeAuthRateLimitBucket({ ...input, now: new Date(start.getTime() + 29_999) }),
      false,
    );
    assert.equal(
      await consumeAuthRateLimitBucket({ ...input, now: new Date(start.getTime() + 30_000) }),
      true,
    );
    assert.equal(
      await consumeAuthRateLimitBucket({ ...input, now: new Date(start.getTime() + 60_000) }),
      false,
    );
    assert.equal(
      await consumeAuthRateLimitBucket({ ...input, now: new Date(start.getTime() + 600_001) }),
      true,
    );
  });

  test('users are findable by email case-insensitively', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const user = await createUser({
      id: 'user_alice',
      email: 'Alice@Example.com',
      emailVerifiedAt: null,
      handle: 'alice',
      displayName: 'Alice',
      now,
    });
    assert.equal(user.emailVerifiedAt, null);

    const found = await findUserByEmail('alice@example.com');
    assert.equal(found?.id, 'user_alice');

    const verified = await markUserEmailVerified('user_alice', new Date(now.getTime() + 1_000));
    assert.ok(verified.emailVerifiedAt);
  });

  test('user locale preference is nullable and session-readable', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const user = await createUser({
      id: 'user_locale',
      email: 'locale@example.com',
      emailVerifiedAt: now,
      handle: 'locale-player',
      displayName: 'Locale Player',
      now,
    });
    assert.equal(user.locale, null);

    const updated = await updateUserLocale(
      'user_locale',
      'zh-Hant',
      new Date(now.getTime() + 1_000),
    );
    assert.equal(updated?.locale, 'zh-Hant');

    const tokenHash = sha256('locale-session');
    await createAccountSession({
      id: 'locale-session-id',
      userId: 'user_locale',
      tokenHash,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    const sessionUser = await getUserByAccountSession('locale-session-id', tokenHash, now);
    assert.equal(sessionUser?.locale, 'zh-Hant');
  });

  test('user profile updates handle once immediately then applies cooldown', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    await createUser({
      id: 'user_profile_settings',
      email: 'settings@example.com',
      emailVerifiedAt: now,
      handle: 'settings-player',
      displayName: 'Settings Player',
      now,
    });

    const first = await updateUserProfile(
      'user_profile_settings',
      {
        handle: 'settings-renamed',
        displayName: 'Renamed Player',
      },
      new Date(now.getTime() + 1_000),
    );

    assert.equal(first.ok, true);
    assert.equal(first.ok ? first.user.handle : null, 'settings-renamed');
    assert.equal(first.ok ? first.user.displayName : null, 'Renamed Player');
    assert.ok(first.ok ? first.user.handleChangedAt : null);

    const blocked = await updateUserProfile(
      'user_profile_settings',
      {
        handle: 'settings-again',
        displayName: 'Renamed Again',
      },
      new Date(now.getTime() + 2_000),
    );

    assert.deepEqual(blocked.ok ? null : blocked.error, 'handle_change_cooldown');
  });

  test('user profile updates reserve old handles temporarily', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    await createUser({
      id: 'user_old_handle_owner',
      email: 'owner@example.com',
      emailVerifiedAt: now,
      handle: 'old-owner',
      displayName: 'Old Owner',
      now,
    });
    await createUser({
      id: 'user_handle_taker',
      email: 'taker@example.com',
      emailVerifiedAt: now,
      handle: 'handle-taker',
      displayName: 'Handle Taker',
      now,
    });

    const first = await updateUserProfile(
      'user_old_handle_owner',
      {
        handle: 'new-owner',
        displayName: 'Old Owner',
      },
      now,
    );
    assert.equal(first.ok, true);

    const conflict = await updateUserProfile(
      'user_handle_taker',
      {
        handle: 'old-owner',
        displayName: 'Handle Taker',
      },
      now,
    );
    assert.deepEqual(conflict.ok ? null : conflict.error, 'handle_taken');
  });

  test('account sessions resolve current users and can be revoked', async () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    await createUser({
      id: 'user_session',
      email: 'session@example.com',
      emailVerifiedAt: now,
      handle: 'session',
      displayName: 'Session',
      now,
    });
    const tokenHash = sha256('session-token');
    await createAccountSession({
      id: 'session-id',
      userId: 'user_session',
      tokenHash,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });

    const user = await getUserByAccountSession('session-id', tokenHash, now);
    assert.equal(user?.id, 'user_session');
    // Regression: the session-load RETURNING list once dropped elo_rating, so
    // session-resolved users came back with eloRating: undefined. It must be a
    // real number and match what a direct load returns.
    const direct = await findUserByEmail('session@example.com');
    assert.equal(typeof user?.eloRating, 'number');
    assert.equal(user?.eloRating, direct?.eloRating);

    await revokeAccountSession('session-id', tokenHash, now);
    assert.equal(await getUserByAccountSession('session-id', tokenHash, now), null);
  });
});
