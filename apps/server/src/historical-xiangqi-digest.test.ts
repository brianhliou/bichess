import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XiangqiMove } from '@mistboard/game';
import { historicalXiangqiDigest } from './historical-xiangqi-digest.js';
import { contentHashForHistoricalXiangqiGame } from './persistence-historical-xiangqi.js';

const MOVES: XiangqiMove[] = [
  { from: 'h3', to: 'e3' },
  { from: 'h8', to: 'e8' },
] as XiangqiMove[];

test('the same game under a fresh set of source labels digests identically', () => {
  // This is the whole point. ElephantChess re-anonymizes every monthly release,
  // so the same game arrives with a new id and new player pseudonyms. If those
  // reached the digest, a re-import would insert a duplicate of every game.
  const june = historicalXiangqiDigest({ playedOn: '2026-05-04', result: '1-0', moves: MOVES });
  const july = historicalXiangqiDigest({ playedOn: '2026-05-04', result: '1-0', moves: MOVES });
  assert.equal(june, july);
});

test('date, result and moves each change the digest', () => {
  const base = historicalXiangqiDigest({ playedOn: '2026-05-04', result: '1-0', moves: MOVES });
  assert.notEqual(
    base,
    historicalXiangqiDigest({ playedOn: '2026-05-05', result: '1-0', moves: MOVES }),
  );
  assert.notEqual(
    base,
    historicalXiangqiDigest({ playedOn: '2026-05-04', result: '0-1', moves: MOVES }),
  );
  assert.notEqual(
    base,
    historicalXiangqiDigest({
      playedOn: '2026-05-04',
      result: '1-0',
      moves: [MOVES[0]!] as XiangqiMove[],
    }),
  );
});

test('a missing date is a value, not a hole that collapses onto other games', () => {
  const dated = historicalXiangqiDigest({ playedOn: '2026-05-04', result: '1-0', moves: MOVES });
  const undated = historicalXiangqiDigest({ playedOn: null, result: '1-0', moves: MOVES });
  assert.notEqual(dated, undated);
});

test('move order is part of the identity, not just the move set', () => {
  const forward = historicalXiangqiDigest({ playedOn: null, result: '*', moves: MOVES });
  const reversed = historicalXiangqiDigest({
    playedOn: null,
    result: '*',
    moves: [...MOVES].reverse() as XiangqiMove[],
  });
  assert.notEqual(forward, reversed);
});

// The writer and the repair script are the two callers this module exists to
// keep in agreement. They disagreed for one afternoon in 2026-08 -- the repair
// script was migrated to this digest and `contentHashForHistoricalXiangqiGame`
// kept its own copy keyed on sourceId and the anonymized player names. The
// stored rows and the writer then meant different things by "the same game", so
// a re-import of an already-stored corpus deduplicated NOTHING and inserted the
// lot again. This asserts the two agree, and that the labels do not move the
// digest, which is the specific way they came apart.
test('the writer hashes exactly what the repair script hashes', () => {
  const game = { playedOn: '2026-05-04', result: '1-0' as const, moves: MOVES };
  const asWritten = {
    sourceId: 'hxqs_elephantchess',
    sourceGameId: 'JuneLabel1234',
    redNameRaw: 'ElephantChess:9j8OYZ7KxWuC',
    blackNameRaw: 'ElephantChess:SQbAUd3Re6J8',
    moveFormat: 'uci-0indexed' as const,
    visibility: 'unlisted' as const,
    ...game,
  };
  assert.equal(contentHashForHistoricalXiangqiGame(asWritten), historicalXiangqiDigest(game));
  assert.equal(
    contentHashForHistoricalXiangqiGame({
      ...asWritten,
      // Re-randomized by the next monthly release; the same game all the same.
      sourceGameId: 'JulyLabel5678',
      redNameRaw: 'ElephantChess:Zq2VbN8mKxTr',
      blackNameRaw: 'ElephantChess:Pw7LcY4dHnGs',
    }),
    historicalXiangqiDigest(game),
  );
});
