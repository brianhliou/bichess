import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

const appBaseCss = stylesheet('app-base.css');
const puzzlesCss = stylesheet('puzzles.css');
const siteShellCss = stylesheet('site-shell.css');

describe('site theme boundaries', () => {
  it('keeps route accents out of shared navigation', () => {
    const window = new Window();
    const { document } = window;
    document.documentElement.dataset.effectiveTheme = 'light';
    document.head.innerHTML = `<style>${appBaseCss}\n${siteShellCss}\n${puzzlesCss}</style>`;
    document.body.innerHTML = '<nav class="site-nav"></nav><main class="puzzles-shell"></main>';

    const nav = document.querySelector('.site-nav');
    const puzzles = document.querySelector('.puzzles-shell');
    expect(nav).not.toBeNull();
    expect(puzzles).not.toBeNull();

    expect(siteAccent(window, document.body)).toBe('');
    expect(siteAccent(window, nav!)).toBe('hsl(165, 56%, 28%)');
    expect(siteAccent(window, puzzles!)).toBe('hsl(209, 77%, 48%)');
  });
});

function siteAccent(window: Window, element: Parameters<Window['getComputedStyle']>[0]): string {
  return window.getComputedStyle(element).getPropertyValue('--site-accent').trim();
}

function stylesheet(filename: string): string {
  return readFileSync(new URL(filename, import.meta.url), 'utf8');
}
