import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The board badge and the move list annotate the SAME move, so a colour that
// disagrees between them reads as a verdict that disagrees. board-glyph-marker.css
// says so in a comment; this is the part that fails when it stops being true.
//
// Five stylesheets carry the palette because the surfaces cannot import one
// another's CSS. That is the duplication this test exists to police.
const FILES = [
  'board-glyph-marker.css',
  'review/move-list.css',
  'review/analysis-summary.css',
  'review/move-advice.css',
  'review/move-tree.css',
];

function read(rel: string): string {
  const path = [`src/${rel}`, `apps/web/src/${rel}`]
    .map((candidate) => resolve(process.cwd(), candidate))
    .find((candidate) => existsSync(candidate));
  return readFileSync(path as string, 'utf8');
}

// Judgment -> ink. Deliberately vivid: these are 13px discs on a busy board, and
// the muted set they replaced read as six shades of the same brown at that size.
const PALETTE: Record<string, string> = {
  brilliant: '#00a5a8',
  good: '#00ad40',
  speculative: '#7c3aed',
  inaccuracy: '#c29100',
  mistake: '#eb7500',
  blunder: '#e5222c',
};

describe('the move-judgment palette', () => {
  const sources = FILES.map((f) => ({ file: f, css: read(f) }));

  it('gives every judgment one colour across every surface that draws it', () => {
    const wrong: string[] = [];
    for (const { file, css } of sources) {
      for (const [judgment, ink] of Object.entries(PALETTE)) {
        // Only assert where the file actually styles that judgment.
        if (!css.includes(`--${judgment} `) && !css.includes(`--${judgment}.`)) continue;
        if (!css.includes(ink)) wrong.push(`${file}: ${judgment} is not ${ink}`);
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  it('has no survivor of the previous, muted palette', () => {
    const retired = ['#0f8b8d', '#2e7d32', '#7b5ea7', '#b7950b', '#d68910'];
    const left: string[] = [];
    for (const { file, css } of sources) {
      for (const old of retired) if (css.includes(old)) left.push(`${file} still uses ${old}`);
    }
    expect(left, left.join('\n')).toEqual([]);
  });

  it('keeps the six judgments visually distinct from each other', () => {
    expect(new Set(Object.values(PALETTE)).size).toBe(Object.keys(PALETTE).length);
  });
});
