import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHistoricalXiangqiGameQuery, publicTags } from './historical-xiangqi-games.js';

function parse(query: string) {
  return parseHistoricalXiangqiGameQuery(new URLSearchParams(query));
}

test('historical xiangqi game query parser accepts search filters', () => {
  const parsed = parse(
    'source=classic&player=Hu%20Ronghua&event=river&result=1-0&from=1982-04-03&to=1982-04-03&plyMin=20&plyMax=100&offset=50&limit=25',
  );
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.filters, {
    sourceSlug: 'classic',
    player: 'Hu Ronghua',
    event: 'river',
    result: '1-0',
    playedFrom: '1982-04-03',
    playedTo: '1982-04-04',
    plyMin: 20,
    plyMax: 100,
    offset: 50,
    limit: 25,
  });
});

test('historical xiangqi game query parser rejects malformed filters', () => {
  assert.deepEqual(parse('result=red-wins'), { ok: false, error: 'invalid_result' });
  assert.deepEqual(parse('from=1982-4-3'), { ok: false, error: 'invalid_from' });
  assert.deepEqual(parse('to=1982-02-31'), { ok: false, error: 'invalid_to' });
  assert.deepEqual(parse('plyMin=-1'), { ok: false, error: 'invalid_ply_min' });
  assert.deepEqual(parse('limit=0'), { ok: false, error: 'invalid_limit' });
});

test('the detail response serves only the allowlisted tags', () => {
  // The stored row is the source's own, kept verbatim so the import stays
  // lossless. What we SERVE is a different decision: ElephantChess rows carry
  // pseudonymous player keys that join a player's games together, and their
  // internal CSV filename. Neither is ours to publish.
  const served = publicTags({
    timeControl: '600+5',
    timeControlCategory: 'RAPID',
    ratingMode: 'rated',
    redEloBefore: 999,
    redEloAfter: 991,
    blackEloBefore: 1009,
    blackEloAfter: 1017,
    redPlayerId: 'lfU8hpd9bBzo',
    blackPlayerId: 'Tx4n1aG5r9gE',
    sourceFile: 'pvp_game_moves_xiangqi_009.csv',
    rawOutcome: 'BLACK_WINS',
    gameStatus: 'CHECKMATED',
    cplPlies: 0,
  });
  assert.deepEqual(Object.keys(served).sort(), [
    'blackEloAfter',
    'blackEloBefore',
    'ratingMode',
    'redEloAfter',
    'redEloBefore',
    'timeControl',
    'timeControlCategory',
  ]);
  assert.equal(served.redPlayerId, undefined);
  assert.equal(served.sourceFile, undefined);
});

test('an unreviewed tag from a future source is withheld by default', () => {
  // Allowlist, not denylist: a new source's tags arrive unreviewed, so anything
  // unrecognised must stay out rather than ride along.
  assert.deepEqual(publicTags({ somethingNewNobodyVetted: 'x' }), {});
});
