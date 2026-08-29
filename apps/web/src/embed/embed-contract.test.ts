import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMBED_DEFAULT_HEIGHT, EMBED_DEFAULT_WIDTH } from '@mistboard/game';
import { describe, expect, it } from 'vitest';

// The default size is not a taste question, it is a claim about a layout that
// lives in a stylesheet, and the two drifted apart: the replay stacks its move
// list under the board at max-width 720px, and the default width was exactly
// 720. Every consumer taking the default got the narrow layout inside a box
// proportioned for the wide one, which is where the second scrollbar came from.
//
// So the test reads the breakpoint out of the CSS instead of restating it. Move
// the breakpoint and this fails until the default moves with it.
const cssPath = ['src/articles.css', 'apps/web/src/articles.css']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));
const css = readFileSync(cssPath as string, 'utf8');

function stackingBreakpoint(): number {
  // The narrow rule that drops the move column under the board.
  const marker = css.indexOf('.xq-replay-annotated .xq-replay-move-col');
  const media = css.lastIndexOf('@media (max-width:', marker);
  expect(media, 'no narrow media query governs the move column').toBeGreaterThan(-1);
  const px = /@media \(max-width:\s*(\d+)px\)/.exec(css.slice(media, media + 60));
  expect(px, 'could not read the breakpoint').not.toBeNull();
  return Number(px?.[1]);
}

describe('the embed default size', () => {
  it('clears the layout breakpoint it is measured against', () => {
    const breakpoint = stackingBreakpoint();
    expect(
      EMBED_DEFAULT_WIDTH,
      `default width ${EMBED_DEFAULT_WIDTH} is inside the narrow layout (<= ${breakpoint})`,
    ).toBeGreaterThan(breakpoint);
  });

  it('is proportioned like the widget it frames', () => {
    // Natural height ran ~0.88x width across 721-1000px, measured in a browser
    // against the deployed embed. A default far off that ratio is a frame the
    // content cannot sit in, whichever way the error goes.
    const ratio = EMBED_DEFAULT_HEIGHT / EMBED_DEFAULT_WIDTH;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.05);
  });
});
