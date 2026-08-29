import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playedGamesOrderBy } from './persistence-games.js';
import { historicalOrderBy, XIANGQI_GAME_SORTS } from './persistence-historical-xiangqi.js';
import { broadcastOrderBy } from './persistence-xiangqi-broadcasts.js';
import { compareSearchItems } from './routes/historical-xiangqi-games.js';

// /games fetches one page PER LANE, each ordered in SQL, then merges and slices.
// So the merge comparator and every lane's ORDER BY have to agree. If they do
// not, the page is drawn from the wrong candidate set — "the longest games among
// the most recent N" — which is not an error, just quietly the wrong answer.

const LANES = [
  { name: 'historical', orderBy: historicalOrderBy },
  { name: 'broadcast', orderBy: broadcastOrderBy },
  { name: 'played', orderBy: playedGamesOrderBy },
] as const;

/** What the primary key of each sort should be, per lane. */
const EXPECTED = {
  recent: { column: /played_on|starts_at|ended_at/, direction: 'DESC' },
  oldest: { column: /played_on|starts_at|ended_at/, direction: 'ASC' },
  longest: { column: /ply_count/, direction: 'DESC' },
  shortest: { column: /ply_count/, direction: 'ASC' },
} as const;

const item = (id: string, sortAt: string | null, plyCount: number) =>
  ({ id, sortAt, plyCount }) as Parameters<typeof compareSearchItems>[0];

test('every lane pushes down the same key and direction for each sort', () => {
  for (const sort of XIANGQI_GAME_SORTS) {
    const expected = EXPECTED[sort];
    for (const lane of LANES) {
      const clause = lane.orderBy(sort);
      const primary = clause.split(',')[0] ?? '';
      assert.match(primary, expected.column, `${lane.name} / ${sort}: wrong column`);
      const direction = primary.includes(' ASC') ? 'ASC' : 'DESC';
      assert.equal(direction, expected.direction, `${lane.name} / ${sort}: wrong direction`);
    }
  }
});

test('the merge comparator orders the same way the lanes were asked to', () => {
  const older = item('a', '1990-01-01', 40);
  const newer = item('b', '2020-01-01', 120);

  // recent: newer first. oldest: older first.
  assert.ok(compareSearchItems(newer, older, 'recent') < 0);
  assert.ok(compareSearchItems(newer, older, undefined) < 0, 'default is recent');
  assert.ok(compareSearchItems(older, newer, 'oldest') < 0);

  // longest: more plies first. shortest: fewer first.
  assert.ok(compareSearchItems(newer, older, 'longest') < 0);
  assert.ok(compareSearchItems(older, newer, 'shortest') < 0);
});

test('the ply sorts ignore date, and the date sorts ignore plies', () => {
  // A long OLD game must outrank a short NEW one under 'longest', or the sort
  // is really still date-ordered and only looks like it works.
  const longOld = item('a', '1990-01-01', 200);
  const shortNew = item('b', '2020-01-01', 10);
  assert.ok(compareSearchItems(longOld, shortNew, 'longest') < 0);
  assert.ok(compareSearchItems(shortNew, longOld, 'recent') < 0);
});

test('ties break on id so a page boundary cannot duplicate or drop a row', () => {
  const a = item('a', '2020-01-01', 50);
  const b = item('b', '2020-01-01', 50);
  for (const sort of XIANGQI_GAME_SORTS) {
    assert.notEqual(compareSearchItems(a, b, sort), 0, `${sort} left a tie unbroken`);
  }
});
