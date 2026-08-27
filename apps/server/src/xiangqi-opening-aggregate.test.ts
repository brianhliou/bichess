/**
 * Opening-explorer aggregation. The statistics this produces are published as
 * fact, so the pins here are about not lying: transpositions must merge, a
 * corrupt game must contribute nothing at all rather than a truncated prefix,
 * results must land in the bucket they actually belong to, and the fold must
 * stop at the configured depth.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XiangqiMove } from '@mistboard/game';
import {
  accumulateGame,
  createAccumulator,
  DEFAULT_AGGREGATE_OPTIONS,
} from './xiangqi-opening-aggregate.js';
import { canonicalPositionMove } from './xiangqi-opening-mirror.js';

// Rows are stored mirror-canonically, so a test that names a move by its played
// spelling has to look it up the same way the storage wrote it.
function statsFor(
  acc: ReturnType<typeof createAccumulator>,
  positionKey: string,
  playedMove: string,
) {
  const [move] = moves(playedMove);
  const canonical = canonicalPositionMove(positionKey, move!);
  return acc.get(canonical.key)?.get(`${canonical.move.from}${canonical.move.to}`);
}

const START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r';

// Squares are 2 OR 3 characters (rank 10), so a move key cannot be split by a
// fixed offset from either end — "g8h10" is g8→h10, not "g8h"→"10".
const MOVE_KEY = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/;

function moves(...pairs: string[]): XiangqiMove[] {
  return pairs.map((pair) => {
    const match = pair.match(MOVE_KEY);
    if (!match) throw new Error(`bad move key in test: ${pair}`);
    return { from: match[1], to: match[2] };
  }) as XiangqiMove[];
}

test('folds a game into per-position move counts split by result', () => {
  const acc = createAccumulator();
  const ok = accumulateGame(acc, {
    id: 'g1',
    publiclyListed: true,
    result: '1-0',
    moves: moves('h3e3', 'h10g8'),
  });

  assert.equal(ok, true);
  const stats = statsFor(acc, START, 'h3e3');
  assert.deepEqual(stats, {
    games: 1,
    redWins: 1,
    blackWins: 0,
    draws: 0,
    unknowns: 0,
    sampleGames: [
      {
        id: 'g1',
        // A caller that names no source is the corpus, which is what every
        // caller was before broadcast games joined the build.
        kind: 'historical',
        rating: null,
        redRating: null,
        blackRating: null,
        redName: null,
        blackName: null,
        event: null,
        result: '1-0',
        playedOn: null,
      },
    ],
  });
});

// Ordering with two identity systems in one list. Named games lead, then rated
// ones by rating. Ranking by rating alone put anonymous ~1000-rated club games
// above named professional games — which is how the first version of this
// shipped, folding broadcast games into the statistics while keeping them out of
// every sample slot.
test('named games lead the sample list, then rated ones, then the anonymous tail', () => {
  const acc = createAccumulator();
  const line = moves('h3e3', 'h10g8');
  accumulateGame(acc, { id: 'anon', publiclyListed: true, result: '1-0', moves: line });
  accumulateGame(acc, {
    id: 'club',
    publiclyListed: true,
    result: '1-0',
    moves: line,
    rating: 1100,
  });
  accumulateGame(acc, {
    id: 'named',
    publiclyListed: true,
    kind: 'broadcast',
    result: '1-0',
    moves: line,
    redName: 'Meng Chen',
    blackName: 'Li Yanyang',
  });
  accumulateGame(acc, {
    id: 'strong',
    publiclyListed: true,
    result: '1-0',
    moves: line,
    rating: 2400,
  });

  assert.deepEqual(
    statsFor(acc, START, 'h3e3')?.sampleGames.map((sample) => sample.id),
    ['named', 'strong', 'club', 'anon'],
  );
});

// Two named games still order by rating between themselves, so a named corpus
// with ratings would not scramble into arrival order.
test('named games order by rating among themselves', () => {
  const acc = createAccumulator();
  const line = moves('h3e3', 'h10g8');
  accumulateGame(acc, {
    id: 'weaker',
    publiclyListed: true,
    result: '1-0',
    moves: line,
    rating: 2000,
    redName: 'A',
  });
  accumulateGame(acc, {
    id: 'stronger',
    publiclyListed: true,
    result: '1-0',
    moves: line,
    rating: 2600,
    redName: 'B',
  });

  assert.deepEqual(
    statsFor(acc, START, 'h3e3')?.sampleGames.map((sample) => sample.id),
    ['stronger', 'weaker'],
  );
});

test('an unknown result is counted, never guessed', () => {
  const acc = createAccumulator();
  accumulateGame(acc, { id: 'g1', publiclyListed: true, result: '*', moves: moves('h3e3') });

  const stats = statsFor(acc, START, 'h3e3');
  assert.equal(stats?.games, 1);
  assert.equal(stats?.unknowns, 1);
  assert.equal(stats?.redWins + stats?.blackWins + stats?.draws, 0);
});

test('different move orders reaching one position share its statistics', () => {
  // Central cannon and horse, played in either order, with black answering
  // symmetrically. The position after ply 4 is identical either way, so the
  // fifth move must be counted against ONE position key, not two.
  const acc = createAccumulator();
  accumulateGame(acc, {
    id: 'g1',
    publiclyListed: true,
    result: '1-0',
    moves: moves('h3e3', 'h10g8', 'b1c3', 'b10c8', 'h1g3'),
  });
  accumulateGame(acc, {
    id: 'g2',
    publiclyListed: true,
    result: '0-1',
    moves: moves('b1c3', 'b10c8', 'h3e3', 'h10g8', 'h1g3'),
  });

  const transposed = [...acc.entries()].filter(([, m]) => m.get('h1g3')?.games === 2);
  assert.equal(transposed.length, 1, 'the transposition should collapse to a single position');
  const stats = transposed[0]?.[1].get('h1g3');
  assert.equal(stats?.redWins, 1);
  assert.equal(stats?.blackWins, 1);
  assert.deepEqual(
    stats?.sampleGames.map((sample) => sample.id),
    ['g1', 'g2'],
  );
});

test('an illegal move list contributes nothing, not a valid prefix', () => {
  const acc = createAccumulator();
  // First move is legal, second is not (that horse cannot reach a1).
  const ok = accumulateGame(acc, {
    id: 'bad',
    publiclyListed: true,
    result: '1-0',
    moves: moves('h3e3', 'h10a1'),
  });

  assert.equal(ok, false);
  assert.equal(acc.size, 0, 'a rejected game must leave no partial statistics behind');
});

test('stops folding at the configured depth', () => {
  const acc = createAccumulator();
  accumulateGame(
    acc,
    { id: 'g1', result: '1-0', moves: moves('h3e3', 'h10g8', 'h1g3', 'b10c8') },
    { ...DEFAULT_AGGREGATE_OPTIONS, maxPly: 2 },
  );

  assert.equal(acc.size, 2, 'two plies folded means two positions');
});

test('caps retained sample game ids', () => {
  const acc = createAccumulator();
  for (let i = 0; i < 5; i += 1) {
    accumulateGame(
      acc,
      { id: `g${i}`, publiclyListed: true, result: '1-0', moves: moves('h3e3') },
      { ...DEFAULT_AGGREGATE_OPTIONS, sampleLimit: 2 },
    );
  }

  const stats = statsFor(acc, START, 'h3e3');
  assert.equal(stats?.games, 5, 'every game still counts');
  assert.deepEqual(
    stats?.sampleGames.map((sample) => sample.id),
    ['g0', 'g1'],
    'only the cap is retained',
  );
});

test('a game that revisits a position counts once, not once per visit', () => {
  // Horse out and back on both sides returns to the initial position with red to
  // move. The corpus really does contain games that do this; counting the second
  // visit again would make one game look like two.
  const acc = createAccumulator();
  const ok = accumulateGame(acc, {
    id: 'shuffle',
    publiclyListed: true,
    result: '1-0',
    moves: moves('h1g3', 'h10g8', 'g3h1', 'g8h10', 'h1g3'),
  });

  assert.equal(ok, true);
  const stats = statsFor(acc, START, 'h1g3');
  assert.equal(stats?.games, 1, 'one game is one game, however many times it passes through');
  assert.deepEqual(
    stats?.sampleGames.map((sample) => sample.id),
    ['shuffle'],
  );
});

test('mirror-image openings fold into one row', () => {
  // 炮二平五 and 炮八平五 are one opening played from either side. Splitting them
  // halves the apparent popularity of the most common opening in the game.
  const acc = createAccumulator();
  accumulateGame(acc, { id: 'right', publiclyListed: true, result: '1-0', moves: moves('h3e3') });
  accumulateGame(acc, { id: 'left', publiclyListed: true, result: '0-1', moves: moves('b3e3') });

  assert.equal(acc.size, 1, 'one position');
  const rows = [...acc.values()][0]!;
  assert.equal(rows.size, 1, 'and one move, not two mirrored halves');
  const stats = [...rows.values()][0]!;
  assert.equal(stats.games, 2);
  assert.equal(stats.redWins, 1);
  assert.equal(stats.blackWins, 1);
});

test('keeps the highest-rated example games first', () => {
  const acc = createAccumulator();
  for (const [id, rating] of [
    ['low', 1000],
    ['high', 2400],
    ['mid', 1800],
    ['none', null],
  ] as const) {
    accumulateGame(
      acc,
      { id, publiclyListed: true, result: '1-0', moves: moves('h3e3'), rating },
      { ...DEFAULT_AGGREGATE_OPTIONS, sampleLimit: 3 },
    );
  }

  const stats = [...[...acc.values()][0]!.values()][0]!;
  assert.equal(stats.games, 4, 'every game still counts');
  assert.deepEqual(
    stats.sampleGames.map((sample) => sample.id),
    ['high', 'mid', 'low'],
    'samples are the best three, unrated games last',
  );
});

test('an unlisted corpus game is counted but never offered as a clickable example', () => {
  // The rights line the explorer has to hold: an aggregate may report position
  // statistics drawn from a yellow source, but must not become a browsable front
  // door onto one game of it. Counting is fine; linking is the republication.
  const accumulator = createAccumulator();
  accumulateGame(
    accumulator,
    {
      id: 'hxq_unlisted',
      kind: 'historical',
      result: '1-0',
      moves: [{ from: 'h3', to: 'e3' }] as never,
      publiclyListed: false,
    },
    DEFAULT_AGGREGATE_OPTIONS,
  );
  const stats = [...accumulator.values()][0]!;
  const move = [...stats.values()][0]!;
  assert.equal(move.games, 1, 'the game still counts toward the statistics');
  assert.deepEqual(move.sampleGames, [], 'but it is not linkable');
});

test('broadcast boards and publicly-listed corpus games stay linkable', () => {
  for (const game of [
    { id: 'b1', kind: 'broadcast' as const, publiclyListed: undefined },
    { id: 'hxq_public', kind: 'historical' as const, publiclyListed: true },
  ]) {
    const accumulator = createAccumulator();
    accumulateGame(
      accumulator,
      { ...game, result: '1-0', moves: [{ from: 'h3', to: 'e3' }] as never },
      DEFAULT_AGGREGATE_OPTIONS,
    );
    const move = [...[...accumulator.values()][0]!.values()][0]!;
    assert.equal(move.sampleGames.length, 1, `${game.id} should be linkable`);
  }
});
