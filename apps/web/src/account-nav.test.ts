import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TestUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  handleChangedAt: string | null;
  displayName: string;
  displayNameChangedAt: string | null;
  profileVisibility: 'private' | 'unlisted' | 'public';
  accountRole: 'player' | 'admin';
  locale: 'en' | 'zh-Hans' | 'zh-Hant' | null;
};

describe('account nav', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('mounts the account menu when auth resolves before the nav is inserted', async () => {
    const user = testUser('misty');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ user })),
    );

    const { initializeAccountNav } = await import('./account-nav.js');
    const { buildNav } = await import('./site-shell.js');

    initializeAccountNav();
    await flushDom();

    document.body.append(buildNav());
    await flushDom();

    expect(document.querySelector('.account-nav-trigger')?.textContent).toBe('misty');
    expect(
      document.querySelector('.account-nav-trigger .account-nav-profile-icon svg'),
    ).not.toBeNull();
    expect(document.querySelector('.site-nav-link-signin')).toBeNull();
    expect(document.querySelector('.site-nav-language')).toBeNull();
    // Language is the first row of the unified appearance menu inside the panel.
    expect(
      document.querySelector('.account-nav-panel [data-appearance-target="language"]'),
    ).not.toBeNull();
  });

  it('can replace a mounted account menu with signed-out links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ user: null })),
    );

    const { buildNav } = await import('./site-shell.js');
    const { setAccountNavUser } = await import('./account-nav.js');
    document.body.append(buildNav());

    setAccountNavUser(testUser('misty'));
    expect(document.querySelector('.account-nav-trigger')?.textContent).toBe('misty');

    setAccountNavUser(null);
    expect(document.querySelector('.account-nav-trigger')).toBeNull();
    expect(document.querySelector('.account-nav-profile-icon')).toBeNull();
    expect(document.querySelector('.site-nav-language')).toBeNull();
    expect(
      document.querySelector<HTMLElement>(
        '[data-theme-control] [data-appearance-target="language"]',
      )?.textContent,
    ).toBe('Language');
    expect(document.querySelector('.site-nav-link-signin')?.textContent).toBe('Sign in');
    expect(document.querySelector('.site-nav-link-register')?.textContent).toBe('Register');
  });

  it('restores the signed-out gear when a stale auth hint resolves signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ user: null })),
    );

    const { writeSignedInHint } = await import('./signed-in-state.js');
    const { buildNav } = await import('./site-shell.js');
    const { initializeThemeSettings } = await import('./theme.js');
    const { initializeAccountNav } = await import('./account-nav.js');

    writeSignedInHint(true);
    document.body.append(buildNav());
    initializeThemeSettings();
    expect(document.querySelector('[data-theme-control]')).toBeNull();

    initializeAccountNav();
    await flushDom();

    expect(
      document.querySelector<HTMLElement>(
        '[data-theme-control] [data-appearance-target="language"]',
      )?.textContent,
    ).toBe('Language');
  });

  it('localizes the signed-in account menu labels', async () => {
    window.history.replaceState(null, '', '/zh-hant');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ user: null })),
    );

    const { buildNav } = await import('./site-shell.js');
    const { setAccountNavUser } = await import('./account-nav.js');
    document.body.append(buildNav());

    setAccountNavUser(testUser('misty'));

    expect(document.querySelector('.account-nav-trigger')?.getAttribute('aria-label')).toBe(
      'misty 的帳號選單',
    );
    expect(document.querySelector('.account-nav-panel')?.getAttribute('aria-label')).toBe('帳號');
    expect(
      Array.from(document.querySelectorAll('.account-nav-item-label')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['個人資料', '收件匣', '偏好設定', '登出']);
    expect(
      document.querySelector<HTMLButtonElement>(
        '.account-nav-panel [data-appearance-target="language"]',
      )?.textContent,
    ).toBe('語言');
    expect(
      Array.from(
        document.querySelectorAll<HTMLElement>('.account-nav-panel .appearance-language-option'),
      ).map((item) => item.textContent),
    ).toEqual(['English', '简体中文', '繁體中文']);
    expect(
      document
        .querySelector<HTMLElement>('.account-nav-panel .appearance-language-option.selected')
        ?.getAttribute('data-locale'),
    ).toBe('zh-Hant');
  });

  it('shows the consolidated admin nav menu only for admins', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ user: null })),
    );

    const { buildNav } = await import('./site-shell.js');
    const { setAccountNavUser } = await import('./account-nav.js');
    document.body.append(buildNav());

    const adminMenu = () => document.querySelector<HTMLElement>('[data-admin-only]');
    const adminLinks = () =>
      Array.from(adminMenu()?.querySelectorAll<HTMLAnchorElement>('.site-nav-menu-panel a') ?? []);

    // The bar always carries the menu; visibility reconciles off the account
    // role. The old dropdown admin group is gone for everyone.
    expect(adminMenu()).not.toBeNull();
    expect(adminLinks()).toHaveLength(2);

    setAccountNavUser(testUser('misty'));
    expect(adminMenu()?.hidden).toBe(true);
    expect(document.querySelector('.account-nav-admin')).toBeNull();

    setAccountNavUser({ ...testUser('boss'), accountRole: 'admin' });
    expect(adminMenu()?.hidden).toBe(false);
    expect(adminLinks().map((link) => link.getAttribute('href'))).toEqual([
      '/database',
      '/engines',
    ]);
    expect(document.querySelector('.account-nav-admin')).toBeNull();

    // Signing out hides them again.
    setAccountNavUser(null);
    expect(adminMenu()?.hidden).toBe(true);
  });

  it('switches the signed-in dropdown into a full-panel appearance submenu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ user: null })),
    );

    const { buildNav } = await import('./site-shell.js');
    const { setAccountNavUser } = await import('./account-nav.js');
    document.body.append(buildNav());

    setAccountNavUser(testUser('misty'));

    const trigger = document.querySelector<HTMLButtonElement>('.account-nav-trigger');
    trigger?.click();

    const control = document.querySelector<HTMLElement>('.account-nav');
    const language = document.querySelector<HTMLButtonElement>(
      '.account-nav-panel [data-appearance-target="language"]',
    );
    language?.click();

    expect(control?.dataset.accountNavView).toBe('submenu');
    expect(document.querySelector<HTMLElement>('.appearance-menu-root')?.hidden).toBe(true);
    expect(
      document.querySelector<HTMLElement>('.appearance-submenu[data-key="language"]')?.hidden,
    ).toBe(false);

    document.querySelector<HTMLButtonElement>('.appearance-submenu-back')?.click();

    expect(control?.dataset.accountNavView).toBe('root');
    expect(document.querySelector<HTMLElement>('.appearance-menu-root')?.hidden).toBe(false);
  });
});

function testUser(handle: string): TestUser {
  return {
    id: `user-${handle}`,
    email: `${handle}@example.com`,
    emailVerified: true,
    handle,
    handleChangedAt: null,
    displayName: handle,
    displayNameChangedAt: null,
    profileVisibility: 'public',
    accountRole: 'player',
    locale: null,
  };
}

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

async function flushDom(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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
