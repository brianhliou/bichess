import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { replayXiangqiBroadcastBoard } from '@mistboard/game';
import { convertWxfDhtmlXqPageToSnapshot } from './xiangqi-broadcast-wxf-dhtmlxq.js';

const FIXTURE_PATH = fileURLToPath(
  new URL('../fixtures/wxf-dhtmlxq/2019-wxc-men-r1a-mini.html', import.meta.url),
);

function fixtureHtml(): string {
  return readFileSync(FIXTURE_PATH, 'utf-8');
}

test('WXF DhtmlXQ page fixture converts to a broadcast source snapshot', () => {
  const result = convertWxfDhtmlXqPageToSnapshot(fixtureHtml(), {
    tourSlug: '2019-wxc-men',
    tourName: '2019 World Xiangqi Championship Men',
    roundId: '2019-wxc-men-r01a',
    roundName: 'Men Round 1 Page 1a',
    sourceUrl:
      'https://www.wxf-xiangqi.org/index.php?option=com_content&view=article&id=261:2019-wxc-men-round-01a&catid=158&Itemid=378&lang=cn',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.issues, []);
  assert.equal(result.snapshot.tour.slug, '2019-wxc-men');
  assert.equal(result.snapshot.rounds[0]?.id, '2019-wxc-men-r01a');
  assert.equal(result.snapshot.boards.length, 2);

  const board1 = result.snapshot.boards[0]!;
  assert.equal(board1.sourceBoardId, 'mr1t02');
  assert.equal(board1.boardNumber, 2);
  assert.equal(board1.red.name, '黎英豪');
  assert.equal(board1.black.name, '福贵多');
  assert.equal(board1.result, '1-0');
  assert.deepEqual(board1.moves.slice(0, 4), [
    { from: 'c4', to: 'c5' },
    { from: 'c10', to: 'e8' },
    { from: 'b1', to: 'c3' },
    { from: 'b10', to: 'c8' },
  ]);

  for (const board of result.snapshot.boards) {
    assert.equal(replayXiangqiBroadcastBoard(board).ok, true, `${board.id} should replay`);
  }
});

test('WXF DhtmlXQ parser returns typed sanitized issues for bad frames', () => {
  const html = `
    <iframe name='NoFile_
      [DhtmlXQiFrame]
      [DhtmlXQ_title]mr1t99 Broken Board[/DhtmlXQ_title]
      [DhtmlXQ_red]Red[/DhtmlXQ_red]
      [DhtmlXQ_black]Black[/DhtmlXQ_black]
      [DhtmlXQ_binit]0919293949596979891777062646668600102030405060708012720323436383[/DhtmlXQ_binit]
      [DhtmlXQ_movelist]262[/DhtmlXQ_movelist]
      [/DhtmlXQiFrame]'>
    </iframe>`;

  const result = convertWxfDhtmlXqPageToSnapshot(html, {
    tourSlug: 'broken',
    roundId: 'broken-r1',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [
    {
      kind: 'malformed_movelist',
      message: 'DhtmlXQ movelist must be non-empty digits grouped as four digits per ply',
      sourceBoardId: 'mr1t99',
    },
  ]);
});

// A table number parsed out of the source id is the source's own claim about
// which board this is, so it outranks a number supplied by the caller. This
// fixture carries two boards on one page (mr1t02, mr1t06), which is the shape
// an explicit boardNumber must not disturb.
test('a table number in the source id outranks an explicit boardNumber', () => {
  const result = convertWxfDhtmlXqPageToSnapshot(fixtureHtml(), {
    tourSlug: '2019-wxc-men',
    roundId: '2019-wxc-men-r01a',
    boardNumber: 99,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.snapshot.boards.map((board) => board.boardNumber),
    [2, 6],
  );
});
