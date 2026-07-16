import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearChunkReloadAttempt,
  isChunkLoadError,
  shouldReloadForChunkLoadError,
} from './chunk-load-recovery.js';

describe('chunk load recovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it.each([
    'Failed to fetch dynamically imported module: /assets/watch-old.js',
    'error loading dynamically imported module',
    'Importing a module script failed',
  ])('recognizes browser chunk failures: %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('ignores ordinary application errors', () => {
    expect(isChunkLoadError(new Error('malformed replay'))).toBe(false);
    expect(shouldReloadForChunkLoadError(new Error('malformed replay'))).toBe(false);
  });

  it('grants one reload attempt until a successful mount clears it', () => {
    const error = new TypeError('Failed to fetch dynamically imported module: /assets/old.js');
    expect(shouldReloadForChunkLoadError(error)).toBe(true);
    expect(shouldReloadForChunkLoadError(error)).toBe(false);
    clearChunkReloadAttempt();
    expect(shouldReloadForChunkLoadError(error)).toBe(true);
  });
});
