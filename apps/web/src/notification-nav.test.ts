import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeAccountPreference } from './account-preferences.js';
import {
  clearNotificationBells,
  correspondenceNotificationSource,
  inboxNotificationSource,
  mountNotificationBell,
  registerNotificationSource,
} from './notification-nav.js';

describe('notification nav', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    clearNotificationBells();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('uses the standard SVG bell instead of the dobutsu notification art', () => {
    registerNotificationSource(async () => ({ count: 0, entries: [] }));
    const nav = document.createElement('nav');
    nav.innerHTML = '<div class="site-nav-utilities"><div data-account-nav></div></div>';
    document.body.append(nav);

    mountNotificationBell(nav);

    const trigger = nav.querySelector('.notif-nav-trigger');
    expect(trigger?.querySelector('svg')).not.toBeNull();
    expect(trigger?.querySelector('img.dobutsu-ui-icon-notification')).toBeNull();
  });

  it('does not fetch or surface inbox entries when the DM bell is disabled', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    writeAccountPreference('inboxBell', false);

    await expect(inboxNotificationSource()).resolves.toEqual({ count: 0, entries: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch or surface correspondence entries when its bell is disabled', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    writeAccountPreference('correspondenceBell', false);

    await expect(correspondenceNotificationSource()).resolves.toEqual({ count: 0, entries: [] });
    expect(fetch).not.toHaveBeenCalled();
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
