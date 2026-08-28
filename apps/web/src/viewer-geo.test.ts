import { afterEach, describe, expect, it } from 'vitest';
import { isBlockedForViewer, viewerCountry } from './viewer-geo.js';

function clearCountryCookie(): void {
  document.cookie = 'mb_cc=; Max-Age=0; Path=/';
}

describe('viewer geo', () => {
  afterEach(clearCountryCookie);

  it('reads the country cookie and ignores malformed values', () => {
    expect(viewerCountry()).toBeNull();
    document.cookie = 'mb_cc=CN; Path=/';
    expect(viewerCountry()).toBe('CN');
    clearCountryCookie();
    document.cookie = 'mb_cc=china; Path=/';
    expect(viewerCountry()).toBeNull();
  });

  it('blocks only a known country on the list; unknown viewers see everything', () => {
    expect(isBlockedForViewer(['CN'])).toBe(false);
    document.cookie = 'mb_cc=US; Path=/';
    expect(isBlockedForViewer(['CN'])).toBe(false);
    expect(isBlockedForViewer(undefined)).toBe(false);
    clearCountryCookie();
    document.cookie = 'mb_cc=CN; Path=/';
    expect(isBlockedForViewer(['CN'])).toBe(true);
    expect(isBlockedForViewer([])).toBe(false);
  });
});
