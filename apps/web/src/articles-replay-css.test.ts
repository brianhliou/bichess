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

describe('the move column', () => {
  it('is floored at the widest notation, not the narrowest', () => {
    // The widest cell is Chinese notation plus a judgment badge (车四平八??) at
    // 82px, against ~63 for coordinates. A column sized for coordinates spilled
    // mainline buttons past their cells as soon as a reader switched notation.
    const grid = rule('.xq-replay-annotated .xq-replay-grid {');
    const floor = grid.match(/minmax\((\d+)px,\s*1fr\)/);
    expect(floor, 'the move track should carry an explicit floor').not.toBeNull();
    expect(Number(floor?.[1])).toBeGreaterThanOrEqual(226);
  });
});

describe('the seat dots', () => {
  // A piece colour is not a theme colour. --site-heading is the heading TEXT
  // token, near-white on the dark theme, so binding the black seat to it drew a
  // white dot next to the black player's name while red beside it was a literal
  // #c0392b. The two dots exist to say which side is which, so they have to
  // survive the theme rather than follow it.
  it('paint both sides in literal ink, not a theme text token', () => {
    for (const seat of ['red', 'black']) {
      const body = rule(`.xq-replay-annotated .xq-replay-seat--${seat} .xq-replay-seat-dot {`);
      const background = /background:\s*([^;]+);/.exec(body)?.[1]?.trim();
      expect(background, `${seat} seat dot has no background`).toBeTruthy();
      expect(background, `${seat} seat dot must not follow a theme token`).toMatch(
        /^#[0-9a-f]{3,8}$/i,
      );
    }
  });

  it('keeps the two sides distinguishable from each other', () => {
    const ink = (seat: string) =>
      /background:\s*([^;]+);/
        .exec(rule(`.xq-replay-annotated .xq-replay-seat--${seat} .xq-replay-seat-dot {`))?.[1]
        ?.trim();
    expect(ink('red')).not.toBe(ink('black'));
  });
});
