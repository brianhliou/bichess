import { describe, expect, it } from 'vitest';
import { CHAMPIONS } from './xiangqi-champion-timeline.js';
import { xiangqiChampionsArticle } from './content/xiangqi-champions.js';

// Superlatives in this article have been wrong three separate times: a caption
// called a 70-ply game the shortest when a 60-ply game was two sections below,
// a 183-ply game the longest when a 217-ply game sat at the foot of the page,
// and a game "faulted more than most" when the engine faulted it less. Prose
// and data drift apart silently, so the claims are asserted here against the
// specs the page actually renders.

type Spec = { iccs: string; annotations?: { byPly: Record<number, { glyph?: string }> } };

function specs(): Array<{ caption: string; plies: number; blunders: number; mistakes: number }> {
  const out: Array<{ caption: string; plies: number; blunders: number; mistakes: number }> = [];
  for (const section of xiangqiChampionsArticle.sections) {
    for (const block of section.blocks ?? []) {
      if (block.kind !== 'xq-replay') continue;
      const spec = block.spec as unknown as Spec;
      const glyphs = Object.values(spec.annotations?.byPly ?? {}).map((a) => a.glyph);
      out.push({
        caption: block.caption ?? '',
        plies: spec.iccs.trim().split(/\s+/).length,
        blunders: glyphs.filter((g) => g === '??').length,
        mistakes: glyphs.filter((g) => g === '?').length,
      });
    }
  }
  return out;
}

function prose(): string {
  const parts: string[] = [xiangqiChampionsArticle.summary ?? ''];
  for (const block of xiangqiChampionsArticle.intro ?? []) {
    if (block.kind === 'paragraph') parts.push(block.text);
  }
  for (const section of xiangqiChampionsArticle.sections) {
    parts.push(section.heading);
    for (const block of section.blocks ?? []) {
      if (block.kind === 'paragraph') parts.push(block.text);
      if ('caption' in block && block.caption) parts.push(block.caption);
    }
  }
  return parts.join('\n');
}

describe('claims the article makes about its own games', () => {
  it('gives the shortest and longest game to the games that are actually those', () => {
    const games = specs();
    const shortest = Math.min(...games.map((g) => g.plies));
    const longest = Math.max(...games.map((g) => g.plies));

    const claimsShortest = games.filter((g) => /shortest game/.test(g.caption));
    expect(claimsShortest).toHaveLength(1);
    expect(claimsShortest[0]?.plies).toBe(shortest);

    // "longest" is qualified (the longest *national championship* game), so any
    // unqualified claim must belong to the outright longest game.
    for (const game of games) {
      if (/longest game (on|here)/.test(game.caption)) expect(game.plies).toBe(longest);
    }
  });

  it('claims a blunder-and-mistake-free game only for one that is', () => {
    const games = specs();
    const clean = games.filter((g) => g.blunders === 0 && g.mistakes === 0);
    const claimed = games.filter((g) => /neither a blunder nor a mistake/.test(g.caption));
    expect(claimed).toHaveLength(1);
    expect(clean).toHaveLength(1);
    expect(claimed[0]?.caption).toBe(clean[0]?.caption);
  });

  it('never claims a game is faulted more than the others without it being true', () => {
    const games = specs();
    for (const game of games) {
      if (!/faults (both players )?more/.test(game.caption)) continue;
      const judged = game.blunders + game.mistakes;
      const median = games
        .map((g) => g.blunders + g.mistakes)
        .sort((a, b) => a - b)[Math.floor(games.length / 2)] as number;
      expect(judged).toBeGreaterThan(median);
    }
  });
});

describe('claims about who is clean', () => {
  it('matches the sanction data', () => {
    const since2005 = CHAMPIONS.filter((c) =>
      [...c.years, ...(c.shared ?? [])].some((y) => y >= 2005),
    );
    const clean = since2005.filter((c) => !c.sanction);
    const text = prose();

    // Assert the numbers, not the sentences: the prose gets rewritten and the
    // point of this test is that the counts stay true, not that the wording
    // stays frozen. The words are what a reader sees, so the words are checked.
    const asWord: Record<number, string> = {
      3: 'three',
      10: 'ten',
      13: 'thirteen',
    };
    expect(since2005).toHaveLength(13);
    expect(clean).toHaveLength(3);
    const lower = text.toLowerCase();
    for (const n of [since2005.length, since2005.length - clean.length, clean.length]) {
      const word = asWord[n];
      expect(word, `no word form for ${n}`).toBeTruthy();
      expect(lower, `the page never says "${word}" for ${n}`).toContain(word as string);
    }
    // Every unsanctioned champion is named, so the exceptions are not left vague.
    for (const champ of clean) expect(text).toContain(champ.name);
  });
});
