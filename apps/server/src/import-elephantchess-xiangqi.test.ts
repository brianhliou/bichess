import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseCsvRecords,
  parseElephantChessCsv,
  scanElephantChessInputs,
} from './import-elephantchess-xiangqi.js';

const HEADER =
  '"timestamp","move_index","move","game_id","red_player","black_player","red_elo_before","red_elo_after","black_elo_before","black_elo_after","time_control","time_control_category","rating_mode","game_status","outcome","game_join_source","analysis","cpl"\n';

function row(gameId: string, moveIndex: number, move: string, outcome = 'RED_WINS'): string {
  return (
    '"2026-06-01T10:00:00Z","' +
    moveIndex +
    '","' +
    move +
    '","' +
    gameId +
    '","red","black","1700","1701","1680","1679","600+5","RAPID","rated",' +
    '"CHECKMATED","' +
    outcome +
    '","lobby","",""\n'
  );
}

describe('ElephantChess xiangqi import', () => {
  it('parses escaped quotes, commas, and newlines in CSV fields', async () => {
    const records: string[][] = [];
    const input = Readable.from('"a","b"\n"one","{""depth"":12,\n""score"":5}"\n');
    for await (const record of parseCsvRecords(input)) records.push(record);
    assert.deepEqual(records, [
      ['a', 'b'],
      ['one', '{"depth":12,\n"score":5}'],
    ]);
  });

  it('normalizes representative dataset games and reports a malformed move', async () => {
    const fixture = fileURLToPath(
      new URL('../fixtures/elephantchess/pvp-sample.csv', import.meta.url),
    );
    const plans = [];
    for await (const plan of parseElephantChessCsv(createReadStream(fixture), 'pvp_2026-06.csv')) {
      plans.push(plan);
    }

    assert.equal(plans.length, 4);
    const accepted = plans.filter((plan) => plan.ok);
    const rejected = plans.filter((plan) => !plan.ok);
    assert.equal(accepted.length, 3);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0]!.reason, /invalid ElephantChess move/);

    const decisive = accepted[0]!.game;
    assert.equal(decisive.sourceGameId, 'sample-red');
    assert.equal(decisive.moveFormat, 'uci-0indexed');
    assert.equal(decisive.result, '1-0');
    assert.equal(decisive.moves[0]?.from, 'h3');
    assert.equal(decisive.moves[0]?.to, 'e3');
    assert.equal(decisive.tags.analysisPlies, 1);
    assert.equal(decisive.tags.redEloBefore, 1800);
    assert.equal(decisive.playedOn, '2026-06-01');

    assert.equal(accepted[1]!.game.result, '1/2-1/2');
    assert.equal(accepted[2]!.game.result, '0-1');
    assert.equal(accepted[2]!.game.tags.timeControlCategory, 'CORRESPONDENCE');
  });

  it('sorts plies by move index but rejects gaps', async () => {
    const reordered = Readable.from(
      HEADER + row('reordered', 1, 'h7e7') + row('reordered', 0, 'h2e2'),
    );
    const reorderedPlans = [];
    for await (const plan of parseElephantChessCsv(reordered, 'reordered.csv')) {
      reorderedPlans.push(plan);
    }
    assert.equal(reorderedPlans.length, 1);
    assert.equal(reorderedPlans[0]!.ok, true);

    const gap = Readable.from(HEADER + row('gap', 0, 'h2e2') + row('gap', 2, 'h0g2'));
    const gapPlans = [];
    for await (const plan of parseElephantChessCsv(gap, 'gap.csv')) gapPlans.push(plan);
    assert.equal(gapPlans.length, 1);
    assert.equal(gapPlans[0]!.ok, false);
    if (!gapPlans[0]!.ok) assert.match(gapPlans[0]!.reason, /not contiguous/);
  });

  it('summarizes results, ratings, categories, duplicates, and rejection reasons', async () => {
    const first =
      HEADER + row('first', 0, 'h2e2') + row('first', 1, 'h7e7') + row('bad', 0, 'z9z8');
    const duplicate = HEADER + row('first', 0, 'h2e2') + row('first', 1, 'h7e7');
    const stats = await scanElephantChessInputs([
      { name: 'sample-1.csv', open: () => Readable.from(first) },
      { name: 'sample-2.csv', open: () => Readable.from(duplicate) },
    ]);
    assert.equal(stats.files, 2);
    assert.equal(stats.games, 3);
    assert.equal(stats.legal, 2);
    assert.equal(stats.rejected, 1);
    assert.equal(stats.duplicates, 1);
    assert.equal(stats.ratedGames, 2);
    assert.equal(stats.resultCounts['1-0'], 2);
    assert.equal(stats.timeControlCategories.RAPID, 2);
    assert.equal(
      Object.values(stats.rejectionCategories).reduce((sum, count) => sum + count, 0),
      1,
    );
    assert.equal(stats.rejectionCategories.invalid_csv_row, 1);
    assert.equal(stats.rejectionSamples.invalid_csv_row?.length, 1);
  });
});
