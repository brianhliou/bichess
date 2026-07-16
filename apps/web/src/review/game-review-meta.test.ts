import { describe, expect, it } from 'vitest';
import {
  buildReviewMeta,
  labelize,
  reviewMetaPlayers,
  reviewResultLabel,
  reviewTimeControlLabel,
} from './game-review-meta.js';

describe('reviewTimeControlLabel', () => {
  it('formats a clock+increment like the xiangqi reference', () => {
    expect(reviewTimeControlLabel({ initialMs: 300_000, incrementMs: 0 })).toBe('5:00+0');
    expect(reviewTimeControlLabel({ initialMs: 180_000, incrementMs: 2000 })).toBe('3:00+2');
  });

  it('reports untimed when both fields are absent', () => {
    expect(reviewTimeControlLabel({ initialMs: null, incrementMs: null })).toBe('Untimed');
    expect(reviewTimeControlLabel({})).toBe('Untimed');
  });

  it('falls back to a nested timeControl object when the flat fields are absent', () => {
    expect(reviewTimeControlLabel({ timeControl: { initialMs: 300_000, incrementMs: 3000 } })).toBe(
      '5:00+3',
    );
  });
});

describe('reviewResultLabel', () => {
  it('maps the fixed-color outcomes', () => {
    expect(reviewResultLabel('red-wins')).toBe('Red wins');
    expect(reviewResultLabel('black-wins')).toBe('Black wins');
    expect(reviewResultLabel('white-wins')).toBe('White wins');
    expect(reviewResultLabel('draw')).toBe('Draw');
  });

  it('labelizes an unknown token instead of guessing a color', () => {
    expect(reviewResultLabel('abandoned')).toBe('Abandoned');
  });
});

describe('reviewMetaPlayers', () => {
  it('normalizes participants and tags engines', () => {
    expect(
      reviewMetaPlayers([
        { color: 'red', name: 'Alice', rating: 2200, kind: 'account' },
        { color: 'black', name: 'Pikafish', rating: null, kind: 'engine' },
      ]),
    ).toEqual([
      { color: 'red', name: 'Alice', rating: 2200, isEngine: false },
      { color: 'black', name: 'Pikafish', rating: null, isEngine: true },
    ]);
  });

  it('can bind first/second seats to their flip-revealed inks', () => {
    expect(
      reviewMetaPlayers(
        [
          { color: 'red', name: 'First', kind: 'account' },
          { color: 'black', name: 'Second', kind: 'engine' },
        ],
        { red: 'black', black: 'red' },
      ),
    ).toEqual([
      { color: 'black', name: 'First', rating: null, isEngine: false },
      { color: 'red', name: 'Second', rating: null, isEngine: true },
    ]);
  });

  it('is empty when no participants were persisted', () => {
    expect(reviewMetaPlayers(undefined)).toEqual([]);
  });
});

describe('labelize', () => {
  it('title-cases kebab tokens', () => {
    expect(labelize('king-captured')).toBe('King Captured');
  });
});

describe('buildReviewMeta', () => {
  it('renders a meta card + spectator room from the envelope', () => {
    const { metaCard, details } = buildReviewMeta({
      markerId: 'xiangqi',
      variantName: 'Xiangqi',
      status: 'Red wins by Checkmate',
      game: {
        roomId: 'xq_test',
        rated: true,
        initialMs: 300_000,
        incrementMs: 0,
        endedAt: null,
        players: [
          { color: 'red', name: 'Alice', rating: 2200, kind: 'account' },
          { color: 'black', name: 'Bob', rating: 2100, kind: 'account' },
        ],
      },
    });
    expect(metaCard.classList.contains('game-meta-card')).toBe(true);
    expect(metaCard.textContent).toContain('5:00+0');
    expect(metaCard.textContent).toContain('Rated');
    expect(metaCard.textContent).toContain('Xiangqi');
    expect(metaCard.textContent).toContain('Alice');
    expect(metaCard.textContent).toContain('Red wins by Checkmate');
    expect(details.classList.contains('review-spectator-chat')).toBe(true);
  });
});
