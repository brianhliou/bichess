import { describe, expect, it } from 'vitest';
import { xiangqiImportTargetUrl } from './xiangqi-import-page.js';

const TAGGED_PGN = `[Event "Wuyang Cup"]
[Red "Hu Ronghua"]
[Black "Liu Dahua"]
[Result "1-0"]

1. C2.5 H8+7 2. H2+3 R9.8 1-0
`;

describe('import page target URL', () => {
  it('sends a pasted PGN to the analysis board with its moves', () => {
    const outcome = xiangqiImportTargetUrl(TAGGED_PGN);
    if ('error' in outcome) throw new Error(`expected a URL, got ${outcome.error}`);
    const url = new URL(outcome.url, 'https://mistboard.com');
    expect(url.pathname).toBe('/analysis/xiangqi');
    expect(url.searchParams.get('moves')).toBe('h3-e3 h10-g8 h1-g3 i10-h10');
    expect(url.searchParams.get('fen')).toBeNull();
  });

  it('reads bare movetext too, in any of the notations', () => {
    const wxf = xiangqiImportTargetUrl('C2.5 H8+7');
    const chinese = xiangqiImportTargetUrl('炮二平五 马8进7');
    if ('error' in wxf || 'error' in chinese) throw new Error('expected both to import');
    expect(new URL(chinese.url, 'https://x').searchParams.get('moves')).toBe(
      new URL(wxf.url, 'https://x').searchParams.get('moves'),
    );
  });

  it('carries a [FEN] start through, so the moves replay from the right position', () => {
    const fen = '3k5/9/9/9/9/9/9/9/9/4K1R2 w - - 0 1';
    const outcome = xiangqiImportTargetUrl(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. g1-f1 *`);
    if ('error' in outcome) throw new Error(`expected a URL, got ${outcome.error}`);
    expect(new URL(outcome.url, 'https://x').searchParams.get('fen')).toBe(fen);
  });

  it('reports empty and unreadable input instead of navigating', () => {
    expect(xiangqiImportTargetUrl('   ')).toEqual({ error: 'Paste a game first.' });
    const junk = xiangqiImportTargetUrl('the quick brown fox');
    expect('error' in junk && junk.error.length > 0).toBe(true);
  });
});
