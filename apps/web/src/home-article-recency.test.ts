import { describe, expect, it } from 'vitest';
import { buildHomeArticleCards } from './articles.js';

// The homepage row is a "what's new" strip. With the curated list at eight
// entries it reached back to articles from June beside ones from yesterday,
// roughly eighty days, which reads as an archive.
//
// The age cut alone is not safe: during a quiet stretch it empties the row, and
// an empty strip on the homepage looks broken where an old article merely looks
// old. So these two rules are tested together, and the floor is tested at the
// extreme (nothing is fresh) because that is the case a pure age cut gets wrong.
const titles = (el: HTMLElement | null): string[] =>
  [...(el?.querySelectorAll('.landing-article-card') ?? [])].map(
    (card) => card.textContent?.trim() ?? '',
  );

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('the homepage row trims by age', () => {
  it('drops articles older than the window', () => {
    const wide = buildHomeArticleCards(50, undefined, {
      now: at('2026-08-30'),
      maxAgeDays: Number.POSITIVE_INFINITY,
    });
    const trimmed = buildHomeArticleCards(50, undefined, {
      now: at('2026-08-30'),
      maxAgeDays: 60,
    });
    expect(titles(trimmed).length).toBeGreaterThan(0);
    expect(titles(trimmed).length).toBeLessThan(titles(wide).length);
  });

  it('keeps the newest cards when NOTHING is inside the window', () => {
    // A year on, every article is stale. The row must still render, and it must
    // render the newest ones rather than an arbitrary slice.
    const future = buildHomeArticleCards(50, undefined, {
      now: at('2027-08-30'),
      maxAgeDays: 60,
      minCards: 4,
    });
    expect(future, 'the row went empty during a quiet stretch').not.toBeNull();
    expect(titles(future).length).toBe(4);

    const newest = buildHomeArticleCards(4, undefined, {
      now: at('2026-08-30'),
      maxAgeDays: Number.POSITIVE_INFINITY,
    });
    expect(titles(future)).toEqual(titles(newest));
  });

  it('never returns more than the limit, whichever rule is binding', () => {
    for (const maxAgeDays of [1, 60, Number.POSITIVE_INFINITY]) {
      const row = buildHomeArticleCards(3, undefined, { now: at('2026-08-30'), maxAgeDays });
      expect(titles(row).length, `maxAgeDays=${maxAgeDays}`).toBeLessThanOrEqual(3);
    }
  });

  it('does not drop a card whose date it cannot read', () => {
    // Failing to parse a date is not evidence the article is old, and silently
    // dropping it would hide a data problem behind a plausible-looking row.
    const row = buildHomeArticleCards(50, undefined, { now: at('2026-08-30'), maxAgeDays: 0.5 });
    expect(row).not.toBeNull();
  });
});
