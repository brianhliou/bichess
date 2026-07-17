import {
  consumeAuthRateLimitBucket,
  consumeEmailLoginChallenge,
  createEmailLoginChallenge,
  deleteEmailLoginChallenge,
  supersedeEmailLoginChallenges,
} from './persistence.js';
import { assert, definePersistenceTests, sha256, test } from './persistence-test-support.js';

definePersistenceTests('auth', () => {
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
});
