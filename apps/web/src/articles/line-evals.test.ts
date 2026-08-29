import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { articles } from '../articles-data.js';

// Every engine sideline gets an assessment symbol at its end, measured by
// scripts/article-line-evals.mjs and baked into the article source.
//
// Two failure modes, both silent, both seen while building this:
//
//   1. A new annotated article ships with no assessments at all, because the
//      script is a manual step and nobody remembers a step. The first test makes
//      that a build failure instead of a thing you notice in a screenshot.
//   2. Assessments land against the WRONG game. The specs are top-level consts
//      whose file order is not the order sections reference them in, so a bake
//      that counts occurrences puts symbols on the wrong boards. Nothing looks
//      broken. The second test compares what is baked against what was measured.
const measuredPath = ['scripts/data/article-line-evals.json', '../../scripts/data/article-line-evals.json']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

type Annotation = { line?: string; lineEval?: string };
type Board = { spec: { iccs: string; annotations?: { byPly: Record<string, Annotation> } } };

const annotated = articles
  .map((article) => ({
    slug: article.slug,
    boards: (article.sections ?? [])
      .flatMap((section) => section.blocks ?? [])
      .flatMap((block) => (block?.kind === 'xq-replay' ? [block as unknown as Board] : [])),
  }))
  .filter(({ boards }) =>
    boards.some((b) => Object.values(b.spec.annotations?.byPly ?? {}).some((a) => a.line)),
  );

describe('sideline assessments', () => {
  it('exist for every article that has engine lines', () => {
    expect(annotated.length, 'no annotated article found at all').toBeGreaterThan(0);
    const missing: string[] = [];
    for (const { slug, boards } of annotated) {
      boards.forEach((board, index) => {
        for (const [ply, a] of Object.entries(board.spec.annotations?.byPly ?? {})) {
          if (a.line && !a.lineEval) missing.push(`${slug} board ${index} ply ${ply}`);
        }
      });
    }
    expect(
      missing,
      `lines with no assessment (run: node scripts/article-line-evals.mjs --write):\n${missing.slice(0, 12).join('\n')}`,
    ).toEqual([]);
  });

  it('match the measurement they were baked from', () => {
    expect(measuredPath, 'the measurement file is gone').toBeTruthy();
    const measured = JSON.parse(readFileSync(measuredPath as string, 'utf8')) as Record<
      string,
      { symbol: string | null }
    >;
    const wrong: string[] = [];
    let compared = 0;
    for (const { slug, boards } of annotated) {
      boards.forEach((board, index) => {
        for (const [ply, a] of Object.entries(board.spec.annotations?.byPly ?? {})) {
          if (!a.lineEval) continue;
          compared += 1;
          const key = `${slug}:${index}:${ply}`;
          if (measured[key]?.symbol !== a.lineEval) {
            wrong.push(`${key}: baked ${a.lineEval}, measured ${measured[key]?.symbol ?? 'nothing'}`);
          }
        }
      });
    }
    expect(wrong, `assessments on the wrong line:\n${wrong.slice(0, 10).join('\n')}`).toEqual([]);
    expect(compared, 'nothing was compared').toBeGreaterThan(100);
  });

  it('only use symbols a reader of chess literature knows', () => {
    const allowed = new Set(['+-', '+/-', '+=', '=', '=+', '-/+', '-+']);
    const odd = new Set<string>();
    for (const { boards } of annotated) {
      for (const board of boards) {
        for (const a of Object.values(board.spec.annotations?.byPly ?? {})) {
          if (a.lineEval && !allowed.has(a.lineEval)) odd.add(a.lineEval);
        }
      }
    }
    expect([...odd]).toEqual([]);
  });
});
