import { afterEach, describe, expect, it } from 'vitest';
import { practiceBrief } from './study-practice.js';

// The brief is the one line of prose a learner reads above the board, and it is
// a tree COMMENT -- so its translation rides on the comment, not on the chapter.
// Reading `.text` instead of resolving the overlay is how 32 exercises whose
// Chinese was already written and stored still rendered English.

const store = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
});

function chapter(comment: { text?: string; i18n?: Record<string, string> }) {
  return {
    root: { root: { annotations: { comments: [comment] } } },
    orientation: 'red',
  };
}

afterEach(() => store.clear());

describe('practiceBrief', () => {
  it('resolves the comment overlay for the reader locale', () => {
    store.set('mistboard.locale', 'zh-Hans');
    expect(
      practiceBrief(
        chapter({
          text: 'A bare horse vs A bare advisor',
          i18n: { 'zh-Hans': '单马 对 单士', 'zh-Hant': '單馬 對 單士' },
        }),
      ),
    ).toBe('单马 对 单士');
  });

  it('falls back to the base text when the locale has no overlay', () => {
    store.set('mistboard.locale', 'zh-Hant');
    expect(practiceBrief(chapter({ text: 'A bare horse vs A bare advisor' }))).toBe(
      'A bare horse vs A bare advisor',
    );
  });

  it('is undefined for a chapter with no comment at all', () => {
    expect(practiceBrief(chapter({}))).toBeUndefined();
    expect(practiceBrief(chapter({ text: '   ' }))).toBeUndefined();
  });
});
