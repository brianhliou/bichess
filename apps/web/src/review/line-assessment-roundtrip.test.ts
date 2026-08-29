import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { articles } from '../articles-data.js';

// An engine sideline's closing verdict (`+-`, `-+`, `+/-`, `+=`, `=`) is
// measured once by Pikafish and then travels through three files that cannot
// import one another: the article bakes it as `lineEval`, the study builder
// converts it to a standard PGN assessment NAG, and the review tree converts
// that NAG back to a symbol to render.
//
// Every hop is a hand-written map. A symbol missing from any of them fails
// silently: the article still shows its verdict and the study line just ends
// without one, which is exactly what happened before the study carried these at
// all. This asserts the round trip is the identity.
function read(...candidates: string[]): string {
  const path = candidates
    .map((candidate) => resolve(process.cwd(), candidate))
    .find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`none of these exist: ${candidates.join(', ')}`);
  return readFileSync(path, 'utf8');
}

/** Parse a `const NAME = { 'k': v, ... }` object literal out of a source file. */
function mapLiteral(source: string, name: string): Record<string, string> {
  const start = source.indexOf(`const ${name}`);
  expect(start, `${name} is gone`).toBeGreaterThan(-1);
  const open = source.indexOf('{', start);
  const body = source.slice(open + 1, source.indexOf('};', open));
  const out: Record<string, string> = {};
  // The two maps are inverses of each other, so one has quoted string keys with
  // numeric values and the other has numeric keys with quoted string values.
  // Both halves are matched either way rather than writing the parser twice.
  const cell = "'((?:[^'\\\\]|\\\\.)*)'|(\\d+)";
  const pattern = new RegExp(`(?:${cell})\\s*:\\s*(?:${cell})\\s*,`, 'g');
  const decode = (value: string) => value.replace(/\\u221e/g, '∞');
  for (const m of body.matchAll(pattern)) {
    out[decode(m[1] ?? m[2])] = decode(m[3] ?? m[4]);
  }
  return out;
}

const builder = read('../../scripts/world-title-study.mjs', 'scripts/world-title-study.mjs');
const treeReview = read('src/review/tree-review.ts', 'apps/web/src/review/tree-review.ts');

const symbolToNag = mapLiteral(builder, 'ASSESS_NAG');
const nagToSymbol = mapLiteral(treeReview, 'GLYPH_ASSESSMENT');

describe('a line assessment survives the round trip', () => {
  it('turns every symbol into a NAG and back into the same symbol', () => {
    expect(Object.keys(symbolToNag).length).toBeGreaterThan(4);
    const broken: string[] = [];
    for (const [symbol, nag] of Object.entries(symbolToNag)) {
      const back = nagToSymbol[nag];
      if (back !== symbol) broken.push(`${symbol} -> NAG ${nag} -> ${back ?? 'nothing'}`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('covers every symbol the articles actually use', () => {
    const used = new Set<string>();
    for (const article of articles) {
      for (const section of article.sections ?? []) {
        for (const block of section.blocks ?? []) {
          if (block?.kind !== 'xq-replay') continue;
          const spec = (
            block as unknown as {
              spec: { annotations?: { byPly: Record<string, { lineEval?: string }> } };
            }
          ).spec;
          for (const annotation of Object.values(spec.annotations?.byPly ?? {})) {
            if (annotation.lineEval) used.add(annotation.lineEval);
          }
        }
      }
    }
    // Guards the guard: with no article carrying a lineEval this passes empty.
    expect(used.size, 'no article states a line assessment').toBeGreaterThan(3);
    const unmapped = [...used].filter((symbol) => !(symbol in symbolToNag));
    expect(unmapped, `symbols the study cannot store: ${unmapped.join(' ')}`).toEqual([]);
  });

  it('uses the standard PGN assessment codes, not invented ones', () => {
    // 10 =, 13 unclear, 14/15 slight edge, 16/17 clear edge, 18/19 winning.
    // Inventing a code would round-trip fine here and be wrong in every other
    // tool that reads a PGN we export.
    for (const nag of Object.values(symbolToNag)) {
      expect([10, 13, 14, 15, 16, 17, 18, 19]).toContain(Number(nag));
    }
  });
});
