// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../live-sound.js', () => ({
  initLiveSound: vi.fn(),
  playSound: vi.fn(),
}));

vi.mock('../site-shell.js', () => ({
  buildNav: () => document.createElement('nav'),
}));

vi.mock('../xiangqi-board.js', () => ({
  createXiangqiInteractiveBoard: () => ({
    render: vi.fn(),
    setArrows: vi.fn(),
    setMarkers: vi.fn(),
  }),
}));

import { mountLearnXiangqi } from './learn-xiangqi-page.js';

const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
};

describe('Learn Xiangqi chrome', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.location.hash = '';
    document.body.replaceChildren();
  });

  it('renders clipped corner ribbons and focuses the run menu on one category', () => {
    const root = document.createElement('div');
    document.body.append(root);
    mountLearnXiangqi(root);

    const firstTile = root.querySelector('.learn-xq-tile--ongoing');
    expect(firstTile?.querySelector('.learn-xq-ribbon-wrap > .learn-xq-ribbon')).not.toBeNull();
    expect(root.querySelector('.learn-xq-tile--future .learn-xq-ribbon-wrap')).toBeNull();

    window.location.hash = '#/chariot';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    const categories = [...root.querySelectorAll<HTMLElement>('.learn-xq-side-category')];
    expect(categories).toHaveLength(4);
    expect(categories.map((category) => category.classList.contains('expanded'))).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(root.querySelector('.learn-xq-side-stage.active')?.getAttribute('aria-current')).toBe(
      'step',
    );

    const fundamentalsToggle = categories[1]?.querySelector<HTMLButtonElement>(
      '.learn-xq-side-category-toggle',
    );
    fundamentalsToggle?.click();
    expect(categories.map((category) => category.classList.contains('expanded'))).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(fundamentalsToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(
      categories[0]?.querySelector<HTMLElement>('.learn-xq-side-category-stages')?.hidden,
    ).toBe(true);
  });
});
