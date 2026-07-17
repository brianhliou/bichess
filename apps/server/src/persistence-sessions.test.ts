import {
  createAccountSession,
  createUser,
  findUserByEmail,
  getUserByAccountSession,
  revokeAccountSession,
} from './persistence.js';
import { assert, definePersistenceTests, sha256, test } from './persistence-test-support.js';

definePersistenceTests('sessions', () => {
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
