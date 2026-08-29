import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { xiangqiWorldChampionshipArticle as article } from './content/xiangqi-world-championship.js';

// Every board on this page is a build product: harvested moves, annotated by the
// engine, converted to a spec. That only stays true while the annotations exist.
// They lived in /tmp for a day, which meant the ten specs in the article could
// not be regenerated without a fresh harvest and about fifteen minutes of engine
// time, and a "re-runnable pipeline" that cannot be re-run is just a story about
// one afternoon.
//
// This does not re-run the pipeline. It checks that the inputs are still there
// and still describe the boards the article ships, which is the part that rots.
const DATA = ['scripts/data/world-title-annotations', '../../scripts/data/world-title-annotations']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

type Board = { spec: { iccs: string; red: string; black: string } };

const boards = (article.sections ?? [])
  .flatMap((section) => section.blocks ?? [])
  .flatMap((block) => (block?.kind === 'xq-replay' ? [block as unknown as Board] : []));

describe('the world-title boards can be regenerated', () => {
  it('keeps the annotations the specs were built from', () => {
    expect(DATA, 'the annotation directory is gone').toBeTruthy();
    const manifest = JSON.parse(readFileSync(resolve(DATA as string, 'manifest.json'), 'utf8')) as {
      games: Array<{ slug: string; event: string; names: Record<string, string> }>;
    };
    const missing = manifest.games.filter(
      (game) => !existsSync(resolve(DATA as string, `${game.slug}.json`)),
    );
    expect(missing.map((g) => g.slug), 'manifest entries with no annotation file').toEqual([]);
  });

  it('has an annotation behind every board except the one that has no game', () => {
    const manifest = JSON.parse(readFileSync(resolve(DATA as string, 'manifest.json'), 'utf8')) as {
      games: Array<{ slug: string }>;
    };
    // Nine harvested boards plus the 2025 final, which predates this pipeline and
    // came out of the study instead. Xu Tianhong has no board at all.
    expect(boards.length).toBe(manifest.games.length + 1);
  });

  it('states a mainline for every board, with both players named', () => {
    for (const [index, board] of boards.entries()) {
      const plies = board.spec.iccs.trim().split(/\s+/).length;
      expect(plies, `board ${index} has no moves`).toBeGreaterThan(20);
      expect(board.spec.red.trim(), `board ${index} has no red player`).not.toBe('');
      expect(board.spec.black.trim(), `board ${index} has no black player`).not.toBe('');
      // A single-word name is the signature of the shell splitting "Zhao Guorong"
      // at its space, which shipped eight boards as "Zhao vs Wu" once already.
      expect(
        `${board.spec.red}${board.spec.black}`.length,
        `board ${index} names look truncated: ${board.spec.red} vs ${board.spec.black}`,
      ).toBeGreaterThan(12);
    }
  });
});
