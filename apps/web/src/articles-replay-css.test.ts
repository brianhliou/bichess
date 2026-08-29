import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// These assert CSS text rather than rendered styles because the stylesheet is
// not applied in this environment, and the invariants below are exactly the
// kind that a rendered-DOM test cannot see. Both encode bugs that shipped.
// import.meta.url is not a file: URL under the vite transform here, so resolve
// from the working directory, which is the workspace root or the repo root
// depending on how vitest was invoked.
const cssPath = ['src/articles.css', 'apps/web/src/articles.css']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));
const css = readFileSync(cssPath as string, 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `rule not found: ${selector}`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('the current-move highlight', () => {
  it('changes no property that would change the button size', () => {
    // A bolder weight is wider, and the sideline is a wrap flow, so every move
    // after the current one shifted on each step and the list twitched.
    const body = rule('.xq-replay-annotated .xq-replay-move-button.is-current {');
    for (const prop of ['font-weight', 'font-size', 'padding', 'letter-spacing', 'border-width']) {
      expect(body, `is-current must not set ${prop}`).not.toContain(`${prop}:`);
    }
  });

  it('does not paint a sideline move in its own background colour', () => {
    // The sideline override set accent text, which was correct while the current
    // move was an outline and wrong the moment it became an accent fill.
    const body = rule('.xq-replay-annotated .xq-replay-branch .xq-replay-move-button.is-current {');
    expect(body).toContain('var(--site-on-accent)');
    expect(body).not.toContain('color: var(--site-accent)');
  });
});

describe('the board judgment badge', () => {
  it('only emits marker classes the shared palette actually fills', () => {
    // '!' was emitted as xq-marker--great, which the palette does not define, so
    // eight badges in the champions article rendered as empty discs.
    const replay = readFileSync(
      ['src/xiangqi-replay.ts', 'apps/web/src/xiangqi-replay.ts']
        .map((candidate) => resolve(process.cwd(), candidate))
        .find((candidate) => existsSync(candidate)) as string,
      'utf8',
    );
    const palette = readFileSync(
      ['src/board-glyph-marker.css', 'apps/web/src/board-glyph-marker.css']
        .map((candidate) => resolve(process.cwd(), candidate))
        .find((candidate) => existsSync(candidate)) as string,
      'utf8',
    );
    const emitted = [...replay.matchAll(/'(xq-marker--[a-z]+)'/g)].map((m) => m[1] as string);
    expect(emitted.length).toBeGreaterThan(0);
    for (const cls of new Set(emitted)) {
      expect(palette, `${cls} has no fill in board-glyph-marker.css`).toContain(`.${cls} `);
    }
  });
});
