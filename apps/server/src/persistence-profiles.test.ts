import {
  createAccountSession,
  createUser,
  getUserByAccountSession,
  updateUserLocale,
  updateUserProfile,
} from './persistence.js';
import { assert, definePersistenceTests, sha256, test } from './persistence-test-support.js';

definePersistenceTests('profiles', () => {
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
});
