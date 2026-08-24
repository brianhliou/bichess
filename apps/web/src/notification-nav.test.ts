import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeAccountPreference } from './account-preferences.js';
import {
  challengesNotificationSource,
  clearNotificationBells,
  correspondenceNotificationSource,
  followersNotificationSource,
  forumNotificationSource,
  inboxNotificationSource,
  mountNotificationBell,
  type NotificationCounts,
  refreshNotifications,
  registerNotificationSource,
  resetNotificationSourcesForTest,
} from './notification-nav.js';

const NO_COUNTS: NotificationCounts = {
  inboxUnread: 0,
  correspondenceYourMove: 0,
  newFollowers: 0,
  forumReplies: 0,
  incomingChallenges: 0,
};

function counts(overrides: Partial<NotificationCounts> = {}): NotificationCounts {
  return { ...NO_COUNTS, ...overrides };
}

describe('notification nav', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    clearNotificationBells();
    resetNotificationSourcesForTest();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('uses the standard SVG bell instead of the dobutsu notification art', () => {
    registerNotificationSource({ read: () => ({ count: 0, entries: [] }) });
    const nav = document.createElement('nav');
    nav.innerHTML = '<div class="site-nav-utilities"><div data-account-nav></div></div>';
    document.body.append(nav);

    mountNotificationBell(nav);

    const trigger = nav.querySelector('.notif-nav-trigger');
    expect(trigger?.querySelector('svg')).not.toBeNull();
  });

  // The reason the aggregate endpoint exists: source count and request count
  // are now decoupled. Registering more sources must not add traffic.
  it('reads every source from a single /api/notifications request', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(NO_COUNTS), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    registerNotificationSource({ read: () => ({ count: 1, entries: [] }) });
    registerNotificationSource({ read: () => ({ count: 2, entries: [] }) });
    registerNotificationSource({ read: () => ({ count: 3, entries: [] }) });

    await refreshNotifications();

    const calls = fetch.mock.calls.filter(
      (call: unknown[]) => String(call[0]) === '/api/notifications',
    );
    expect(calls).toHaveLength(1);
  });

  it('treats a failed counts fetch as nothing pending rather than keeping stale counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    registerNotificationSource({ read: (c) => ({ count: c.inboxUnread, entries: [] }) });
    const nav = document.createElement('nav');
    nav.innerHTML = '<div class="site-nav-utilities"><div data-account-nav></div></div>';
    document.body.append(nav);
    mountNotificationBell(nav);

    await refreshNotifications();

    expect(nav.querySelector<HTMLElement>('.notif-nav-badge')?.hidden).toBe(true);
  });

  it('surfaces nothing from the inbox source when the DM bell is disabled', () => {
    writeAccountPreference('inboxBell', false);
    expect(inboxNotificationSource.read(counts({ inboxUnread: 4 }))).toEqual({
      count: 0,
      entries: [],
    });
  });

  it('surfaces nothing from the correspondence source when its bell is disabled', () => {
    writeAccountPreference('correspondenceBell', false);
    expect(correspondenceNotificationSource.read(counts({ correspondenceYourMove: 2 }))).toEqual({
      count: 0,
      entries: [],
    });
  });

  it('counts new followers without naming them', () => {
    const snapshot = followersNotificationSource.read(counts({ newFollowers: 3 }));
    expect(snapshot.count).toBe(3);
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.label).toBe('3 new followers');
    // 069_user_relations keeps the follow edge private to the actor: there is
    // no followers surface, so the row must not pretend to link to one.
    expect(snapshot.entries[0]?.href).toBe('/following');
  });

  it('singularizes the follower, reply and challenge rows', () => {
    expect(followersNotificationSource.read(counts({ newFollowers: 1 })).entries[0]?.label).toBe(
      '1 new follower',
    );
    expect(forumNotificationSource.read(counts({ forumReplies: 1 })).entries[0]?.label).toBe(
      '1 new reply on your topics',
    );
    expect(
      challengesNotificationSource.read(counts({ incomingChallenges: 1 })).entries[0]?.label,
    ).toBe('1 challenge waiting for you');
  });

  it('keeps quiet rather than showing a zero row for the new sources', () => {
    expect(followersNotificationSource.read(NO_COUNTS).entries).toEqual([]);
    expect(forumNotificationSource.read(NO_COUNTS).entries).toEqual([]);
    expect(challengesNotificationSource.read(NO_COUNTS).entries).toEqual([]);
  });

  // Watermarked feeds clear on open; live state must not, or the badge would
  // stop reporting work that is still outstanding.
  it('marks only the watermarked sources as seen', () => {
    expect(followersNotificationSource.markSeen).toBeTypeOf('function');
    expect(forumNotificationSource.markSeen).toBeTypeOf('function');
    expect(challengesNotificationSource.markSeen).toBeUndefined();
    expect(inboxNotificationSource.markSeen).toBeUndefined();
    expect(correspondenceNotificationSource.markSeen).toBeUndefined();
  });
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
