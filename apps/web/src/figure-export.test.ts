import { afterEach, describe, expect, it } from 'vitest';
import { fileStem, resolveExportBackground } from './figure-export.js';

describe('fileStem', () => {
  it('turns a caption into a safe filename stem', () => {
    expect(fileStem('Every national champion, 1956 to 2025')).toBe(
      'every-national-champion-1956-to-2025',
    );
  });

  it('never returns an empty stem', () => {
    expect(fileStem('—— ??')).toBe('mistboard-figure');
    expect(fileStem('')).toBe('mistboard-figure');
  });

  it('caps the length so a long caption cannot become the filename', () => {
    expect(fileStem('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('resolveExportBackground', () => {
  const root = document.documentElement;

  afterEach(() => {
    root.style.removeProperty('--site-bg');
    root.style.removeProperty('background-color');
    document.body.style.removeProperty('background-color');
  });

  it('prefers the theme token', () => {
    root.style.setProperty('--site-bg', 'hsl(40, 10%, 8%)');
    expect(resolveExportBackground()).toBe('hsl(40, 10%, 8%)');
  });

  it('never returns a fully transparent colour', () => {
    // The bug this guards: document.body is transparent on this site, so
    // reading its background-color gave rgba(0,0,0,0), the canvas fill did
    // nothing, and the PNG exported with no background at all.
    root.style.setProperty('--site-bg', '');
    document.body.style.setProperty('background-color', 'rgba(0, 0, 0, 0)');
    const value = resolveExportBackground();
    expect(value).not.toMatch(/,\s*0\s*\)$/);
    expect(value.length).toBeGreaterThan(0);
  });
});
