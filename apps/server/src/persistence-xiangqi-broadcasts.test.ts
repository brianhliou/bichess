import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { XiangqiBroadcastBoard } from '@mistboard/game';
import { readXiangqiBroadcastFixturePack } from './import-xiangqi-broadcast.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';
import {
  applyXiangqiBroadcastBoardUpdate,
  getXiangqiBroadcastBoard,
  getXiangqiBroadcastTour,
  importXiangqiBroadcastPack,
  listXiangqiBroadcastBoards,
  listXiangqiBroadcastRounds,
  listXiangqiBroadcastSyncLogs,
} from './persistence-xiangqi-broadcasts.js';
import {
  pollXiangqiBroadcastSourceOnce,
  type XiangqiBroadcastSourceFetch,
} from './xiangqi-broadcast-poller.js';
import {
  runXiangqiBroadcastTape,
  xiangqiBroadcastSourceResponse,
} from './xiangqi-broadcast-sim.js';

const FIXTURE_DIR = fileURLToPath(
  new URL('../../../packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample', import.meta.url),
);

async function fixturePack(includeGameFiles = false) {
  return await readXiangqiBroadcastFixturePack(FIXTURE_DIR, includeGameFiles);
}

function fixtureTape(): unknown {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}/tape.json`, 'utf-8')) as unknown;
}

function sourceFetch(body: unknown, status = 200): XiangqiBroadcastSourceFetch {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  });
}

function timeoutFetch(): XiangqiBroadcastSourceFetch {
  return async (_url, init) =>
    await new Promise((_, reject) => {
      const rejectAbort = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (init.signal?.aborted) {
        rejectAbort();
        return;
      }
      init.signal?.addEventListener('abort', rejectAbort, { once: true });
    });
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

  test('live board updates create, dedupe, extend, ignore stale, and reject incompatible moves', async () => {
    const pack = await fixturePack();
    const fullBoard = (pack.boards as XiangqiBroadcastBoard[])[0]!;
    await importXiangqiBroadcastPack({ tour: pack.tour, rounds: pack.rounds, boards: [] });

    const emptyBoard: XiangqiBroadcastBoard = {
      ...fullBoard,
      status: 'live',
      result: '*',
      moves: [],
    };
    const onePly = { ...emptyBoard, moves: fullBoard.moves.slice(0, 1) };
    const twoPly = { ...emptyBoard, moves: fullBoard.moves.slice(0, 2) };
    const incompatible = {
      ...emptyBoard,
      moves: [fullBoard.moves[0]!, fullBoard.moves[2]!],
    };

    assert.deepEqual(await applyXiangqiBroadcastBoardUpdate(emptyBoard), {
      ok: true,
      boardId: fullBoard.id,
      status: 'created',
      plyCount: 0,
    });
    const duplicate = await applyXiangqiBroadcastBoardUpdate(emptyBoard);
    assert.equal(duplicate.ok ? duplicate.status : duplicate.kind, 'unchanged');
    const extended = await applyXiangqiBroadcastBoardUpdate(twoPly);
    assert.equal(extended.ok ? extended.status : extended.kind, 'extended');
    const stale = await applyXiangqiBroadcastBoardUpdate(onePly);
    assert.equal(stale.ok ? stale.status : stale.kind, 'unchanged');

    const rejected = await applyXiangqiBroadcastBoardUpdate(incompatible);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.ok ? '' : rejected.kind, 'illegal_move');
    assert.equal((await getXiangqiBroadcastBoard(fullBoard.id))?.moves.length, 2);
  });

  test('explicit correction can replace a non-prefix legal board update', async () => {
    const pack = await fixturePack();
    const fullBoard = (pack.boards as XiangqiBroadcastBoard[])[0]!;
    await importXiangqiBroadcastPack({ tour: pack.tour, rounds: pack.rounds, boards: [] });

    const sideLine: XiangqiBroadcastBoard = {
      ...fullBoard,
      status: 'live',
      result: '*',
      moves: [
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
        { from: 'a1', to: 'a2' },
      ],
    };
    const correction: XiangqiBroadcastBoard = {
      ...fullBoard,
      status: 'live',
      result: '*',
      moves: [
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
        { from: 'b1', to: 'c3' },
      ],
    };

    const created = await applyXiangqiBroadcastBoardUpdate(sideLine);
    assert.equal(created.ok ? created.status : created.kind, 'created');
    const rejected = await applyXiangqiBroadcastBoardUpdate(correction);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.ok ? '' : rejected.kind, 'incompatible_update');

    const corrected = await applyXiangqiBroadcastBoardUpdate(correction, { allowCorrection: true });
    assert.equal(corrected.ok, true);
    assert.equal(corrected.ok ? corrected.status : '', 'corrected');
    assert.deepEqual((await getXiangqiBroadcastBoard(fullBoard.id))?.moves, correction.moves);

    const logs = await listXiangqiBroadcastSyncLogs({ boardId: fullBoard.id });
    assert.equal(
      logs.some((log) => log.kind === 'corrected'),
      true,
    );
  });

  test('fixture tape runner applies a full local live simulation', async () => {
    const pack = await fixturePack();
    const result = await runXiangqiBroadcastTape({ pack, tape: fixtureTape(), speed: 'instant' });

    assert.equal(result.framesApplied, 9);
    assert.deepEqual(
      result.updates.map((update) => (update.ok ? update.status : update.kind)),
      [
        'created',
        'created',
        'extended',
        'extended',
        'unchanged',
        'extended',
        'extended',
        'extended',
        'extended',
      ],
    );

    const board1 = await getXiangqiBroadcastBoard('2025-wxc-sample-men-r1-b01');
    const board2 = await getXiangqiBroadcastBoard('2025-wxc-sample-men-r1-b02');
    assert.equal(board1?.status, 'complete');
    assert.equal(board1?.result, '1-0');
    assert.equal(board1?.moves.length, 8);
    assert.equal(board2?.status, 'live');
    assert.equal(board2?.moves.length, 4);
  });

  test('source poller imports tour rounds and live board snapshots', async () => {
    const pack = await fixturePack();
    const source = xiangqiBroadcastSourceResponse(pack, fixtureTape(), 16000, 'clean');
    assert.equal(source.status, 200);
    assert.ok(!('malformed' in source.body));
    if ('malformed' in source.body) return;

    const updatedBody = {
      ...source.body,
      rounds: [{ ...(source.body.rounds[0] as Record<string, unknown>), name: 'Round 1 Live' }],
    };
    const result = await pollXiangqiBroadcastSourceOnce({
      sourceUrl: 'https://fixture.invalid/source.json',
      fetchImpl: sourceFetch(updatedBody),
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.roundsImported : 0, 1);
    assert.equal(result.ok ? result.boardsSeen : 0, 2);
    assert.deepEqual(
      result.ok ? result.updates.map((update) => (update.ok ? update.status : update.kind)) : [],
      ['created', 'created'],
    );

    const rounds = await listXiangqiBroadcastRounds('2025-wxc-sample');
    assert.equal(rounds[0]?.name, 'Round 1 Live');
    assert.equal((await getXiangqiBroadcastBoard('2025-wxc-sample-men-r1-b01'))?.moves.length, 8);
    assert.equal((await getXiangqiBroadcastBoard('2025-wxc-sample-men-r1-b02'))?.moves.length, 2);
  });

  test('source poller logs malformed HTTP and timeout failures', async () => {
    const httpError = await pollXiangqiBroadcastSourceOnce({
      sourceUrl: 'https://fixture.invalid/source.json',
      fetchImpl: sourceFetch({ error: 'fixture_source_error' }, 500),
    });
    assert.equal(httpError.ok, false);
    assert.equal(httpError.ok ? '' : httpError.kind, 'source_http_error');

    const malformed = await pollXiangqiBroadcastSourceOnce({
      sourceUrl: 'https://fixture.invalid/source.json',
      fetchImpl: sourceFetch({ malformed: true, boards: { bad: true } }),
    });
    assert.equal(malformed.ok, false);
    assert.equal(malformed.ok ? '' : malformed.kind, 'source_malformed');

    const timedOut = await pollXiangqiBroadcastSourceOnce({
      sourceUrl: 'https://fixture.invalid/source.json',
      timeoutMs: 1,
      fetchImpl: timeoutFetch(),
    });
    assert.equal(timedOut.ok, false);
    assert.equal(timedOut.ok ? '' : timedOut.kind, 'source_timeout');

    const logs = await listXiangqiBroadcastSyncLogs({});
    assert.deepEqual(logs.map((log) => log.kind).sort(), [
      'source_http_error',
      'source_malformed',
      'source_timeout',
    ]);
  });
});
