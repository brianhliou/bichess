import { afterEach, describe, expect, it } from 'vitest';
import { buildHomeFooter, buildNav } from './site-shell.js';

describe('site shell nav', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('links to Puzzles from the primary nav and marks puzzle detail routes active', () => {
    window.history.replaceState(null, '', '/puzzles/drop-mini-xiangqi-red-chariot-drop-mate-1');

    const nav = buildNav();
    document.body.append(nav);

    const primaryLabels = [
      ...nav.querySelectorAll<HTMLElement>(
        '.site-nav-links > .site-nav-link:not([data-admin-only]), .site-nav-links > .site-nav-menu:not([data-admin-only]) > .site-nav-menu-toggle',
      ),
    ].map((link) => link.textContent);
    expect(primaryLabels).toEqual([
      'Play',
      'Puzzles',
      'Learn',
      'Watch',
      'Community',
      'Tools',
      'Support',
    ]);
    const donate = nav.querySelector<HTMLAnchorElement>('.site-nav-link-donate');
    expect(donate?.getAttribute('href')).toBe('/patron');
    expect(donate?.querySelector('.site-nav-donate-icon')?.getAttribute('aria-hidden')).toBe(
      'true',
    );

    // The consolidated Admin menu stays hidden until account-nav resolves an
    // admin (no admin hint in a fresh test DOM).
    const adminMenu = nav.querySelector<HTMLElement>('.site-nav-menu[data-admin-only]');
    expect(adminMenu?.querySelector('.site-nav-menu-toggle')?.textContent).toBe('Admin');
    expect(
      [...(adminMenu?.querySelectorAll<HTMLAnchorElement>('.site-nav-menu-panel a') ?? [])].map(
        (link) => link.textContent,
      ),
    ).toEqual(['Database', 'Engines', 'Accounts']);
    expect(adminMenu?.hidden).toBe(true);

    const puzzleLink = nav.querySelector<HTMLAnchorElement>('a[href="/puzzles"]');
    expect(puzzleLink?.textContent).toBe('Puzzles');
    expect(puzzleLink?.classList.contains('active')).toBe(true);
    expect(puzzleLink?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelector('.site-nav-menu-toggle')?.textContent).toBe('Learn');
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/forum"]')?.textContent).toBe('Forum');
    // Community dropdown: Players (the leaderboard), Friends, Forum, Blog. The
    // title also links to /player, so scope item lookups to the panel.
    const communityMenu = [...nav.querySelectorAll<HTMLElement>('.site-nav-menu')].find(
      (menu) => menu.querySelector('.site-nav-menu-toggle')?.textContent === 'Community',
    );
    const communityPanel = communityMenu?.querySelector<HTMLElement>('.site-nav-menu-panel');
    expect(communityPanel?.querySelector<HTMLAnchorElement>('a[href="/player"]')?.textContent).toBe(
      'Players',
    );
    expect(
      communityPanel?.querySelector<HTMLAnchorElement>('a[href="/following"]')?.textContent,
    ).toBe('Friends');
    expect(communityPanel?.querySelector<HTMLAnchorElement>('a[href="/blog"]')?.textContent).toBe(
      'Blog',
    );
    // The Community title is a link to the player page, not just a toggle.
    const communityToggle = [
      ...nav.querySelectorAll<HTMLElement>('.site-nav-menu > .site-nav-menu-toggle'),
    ].find((el) => el.textContent === 'Community');
    expect(communityToggle?.tagName).toBe('A');
    expect((communityToggle as HTMLAnchorElement).getAttribute('href')).toBe('/player');
    // /bots moved out of the top-nav dropdown into the community rail.
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/bots"]')).toBeNull();

    // Watch is a split menu: the title links to Mistboard TV (/watch) and the
    // panel lists Mistboard TV explicitly alongside Broadcasts.
    const watchMenu = [...nav.querySelectorAll<HTMLElement>('.site-nav-menu')].find(
      (menu) => menu.querySelector('.site-nav-menu-toggle')?.textContent === 'Watch',
    );
    const watchToggle = watchMenu?.querySelector<HTMLAnchorElement>('.site-nav-menu-toggle');
    expect(watchToggle?.tagName).toBe('A');
    expect(watchToggle?.getAttribute('href')).toBe('/watch');
    const watchPanel = watchMenu?.querySelector<HTMLElement>('.site-nav-menu-panel');
    expect(watchPanel?.querySelector<HTMLAnchorElement>('a[href="/watch"]')?.textContent).toBe(
      'Mistboard TV',
    );
    expect(
      watchPanel?.querySelector<HTMLAnchorElement>('a[href="/broadcast/xiangqi"]')?.textContent,
    ).toBe('Broadcasts');
    // The games database was reachable only by typing its URL until it landed
    // here; losing this entry makes the whole surface invisible again.
    expect(watchPanel?.querySelector<HTMLAnchorElement>('a[href="/games"]')?.textContent).toBe(
      'Games',
    );
    expect(
      [...(watchPanel?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map(
        (link) => link.textContent,
      ),
    ).toEqual(['Mistboard TV', 'Broadcasts', 'Games', 'Video library']);

    // Tools dropdown surfaces the analysis board.
    const toolsMenu = [...nav.querySelectorAll<HTMLElement>('.site-nav-menu')].find(
      (menu) => menu.querySelector('.site-nav-menu-toggle')?.textContent === 'Tools',
    );
    expect(
      toolsMenu
        ?.querySelector<HTMLElement>('.site-nav-menu-panel')
        ?.querySelector<HTMLAnchorElement>('a[href="/analysis/xiangqi"]')?.textContent,
    ).toBe('Analysis board');

    const learnMenu = [...nav.querySelectorAll<HTMLElement>('.site-nav-menu')].find(
      (menu) => menu.querySelector('.site-nav-menu-toggle')?.textContent === 'Learn',
    );
    expect(
      [...(learnMenu?.querySelectorAll<HTMLAnchorElement>('.site-nav-menu-panel a') ?? [])].map(
        (link) => link.textContent,
      ),
    ).toEqual(['Rules', 'Xiangqi Basics', 'Study', 'Coaches']);
    expect(
      learnMenu?.querySelector<HTMLAnchorElement>('.site-nav-menu-toggle')?.getAttribute('href'),
    ).toBe('/rules');
  });

  it('localizes launch nav labels and translated content links', () => {
    window.history.replaceState(null, '', '/zh-hant/rules/banqi');

    const nav = buildNav('zh-Hant');
    document.body.append(nav);

    const primaryLabels = [
      ...nav.querySelectorAll<HTMLElement>(
        '.site-nav-links > .site-nav-link:not([data-admin-only]), .site-nav-links > .site-nav-menu:not([data-admin-only]) > .site-nav-menu-toggle',
      ),
    ].map((link) => link.textContent);

    expect(primaryLabels).toEqual(['對弈', '題目', '學習', '觀看', '社群', '工具', '支持']);
    expect(nav.getAttribute('aria-label')).toBe('主導覽');
    expect(nav.querySelector('.site-nav-language')).toBeNull();
    // The Learn dropdown's Rules item is the localized content link (規則).
    expect(
      nav.querySelector<HTMLAnchorElement>('.site-nav-menu-panel a[href="/zh-hant/rules"]')
        ?.textContent,
    ).toBe('規則');
    expect(
      nav
        .querySelector<HTMLAnchorElement>('.site-nav-menu-panel a[href="/zh-hant/rules"]')
        ?.classList.contains('active'),
    ).toBe(true);
    // The Learn title links to Rules, which also leads the dropdown. The toggle
    // stays active on a /rules route via that child.
    const learnToggle = nav.querySelector<HTMLAnchorElement>(
      '.site-nav-menu-toggle[href="/zh-hant/rules"]',
    );
    expect(learnToggle?.textContent).toBe('學習');
    expect(learnToggle?.classList.contains('active')).toBe(true);
    // Articles now surface as "Blog" (網誌) in the Community dropdown.
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/zh-hant/blog"]')?.textContent).toBe(
      '網誌',
    );
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/account?tab=login"]')?.textContent).toBe(
      '登入',
    );
    expect(
      nav.querySelector<HTMLAnchorElement>('a[href="/account?tab=register"]')?.textContent,
    ).toBe('註冊');
  });

  it('localizes homepage footer labels and content links', () => {
    const footer = buildHomeFooter('zh-Hant');

    expect(footer.querySelector<HTMLAnchorElement>('a[href="/zh-hant/rules"]')).toBeNull();
    expect(footer.querySelector<HTMLAnchorElement>('a[href="/zh-hant/blog"]')).toBeNull();
    expect(footer.querySelector<HTMLAnchorElement>('a[href="/feed"]')).toBeNull();
    expect(footer.querySelector<HTMLAnchorElement>('a[href="/about"]')?.textContent).toBe('關於');
    expect(footer.querySelector<HTMLAnchorElement>('a[href="/contact"]')?.textContent).toBe('聯絡');
    expect(footer.querySelector<HTMLAnchorElement>('a[href="/privacy"]')?.textContent).toBe('隱私');
  });
});
