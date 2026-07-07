import { fileURLToPath } from 'node:url';
import type { XiangqiBroadcastBoard } from '@mistboard/game';
import { readXiangqiBroadcastFixturePack } from './import-xiangqi-broadcast.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';
import {
  getXiangqiBroadcastBoard,
  getXiangqiBroadcastTour,
  importXiangqiBroadcastPack,
  listXiangqiBroadcastBoards,
  listXiangqiBroadcastRounds,
  listXiangqiBroadcastSyncLogs,
} from './persistence-xiangqi-broadcasts.js';

const FIXTURE_DIR = fileURLToPath(
  new URL('../../../packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample', import.meta.url),
);

async function fixturePack(includeGameFiles = false) {
  return await readXiangqiBroadcastFixturePack(FIXTURE_DIR, includeGameFiles);
}

definePersistenceTests('xiangqi broadcasts', () => {
  test('imports the M0 fixture pack into tour, round, and board rows', async () => {
    const result = await importXiangqiBroadcastPack(await fixturePack());

    assert.deepEqual(
      {
        tourSlug: result.tourSlug,
        roundsImported: result.roundsImported,
        boardsImported: result.boardsImported,
        boardsSkipped: result.boardsSkipped,
      },
      {
        tourSlug: '2025-wxc-sample',
        roundsImported: 1,
        boardsImported: 2,
        boardsSkipped: 0,
      },
    );

    const tour = await getXiangqiBroadcastTour('2025-wxc-sample');
    assert.equal(tour?.name, '2025 World Xiangqi Championship Sample');

    const rounds = await listXiangqiBroadcastRounds('2025-wxc-sample');
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0]?.id, 'men-r1');

    const boards = await listXiangqiBroadcastBoards('men-r1');
    assert.equal(boards.length, 2);
    assert.equal(boards[0]?.plyCount, 8);
    assert.equal(boards[1]?.status, 'live');
  });

  test('re-importing the same fixture pack is idempotent for public rows', async () => {
    await importXiangqiBroadcastPack(await fixturePack());
    await importXiangqiBroadcastPack(await fixturePack());

    assert.equal((await listXiangqiBroadcastRounds('2025-wxc-sample')).length, 1);
    assert.equal((await listXiangqiBroadcastBoards('men-r1')).length, 2);
    assert.equal((await listXiangqiBroadcastSyncLogs({ tourSlug: '2025-wxc-sample' })).length, 0);
  });

  test('invalid boards are logged and do not replace an existing valid board', async () => {
    const pack = await fixturePack();
    const validBoard = (pack.boards as XiangqiBroadcastBoard[])[0]!;
    await importXiangqiBroadcastPack({ ...pack, boards: [validBoard] });

    const invalidReplacement: XiangqiBroadcastBoard = {
      ...validBoard,
      status: 'live',
      result: '*',
      moves: [{ from: 'a7', to: 'a6' }],
    };
    const result = await importXiangqiBroadcastPack({ ...pack, boards: [invalidReplacement] });

    assert.equal(result.boardsImported, 0);
    assert.equal(result.boardsSkipped, 1);
    assert.equal(result.errors[0]?.kind, 'illegal_move');

    const stored = await getXiangqiBroadcastBoard(validBoard.id);
    assert.equal(stored?.result, '1-0');
    assert.equal(stored?.moves.length, validBoard.moves.length);

    const logs = await listXiangqiBroadcastSyncLogs({ boardId: validBoard.id });
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.kind, 'illegal_move');
  });

  test('including individual game files exercises invalid fixture rejection', async () => {
    const result = await importXiangqiBroadcastPack(await fixturePack(true));

    assert.equal(result.boardsImported, 2);
    assert.equal(result.boardsSkipped, 1);
    assert.equal(result.errors[0]?.boardId, '2025-wxc-sample-men-r1-b03-invalid');
    assert.equal((await listXiangqiBroadcastBoards('men-r1')).length, 2);
  });
});
