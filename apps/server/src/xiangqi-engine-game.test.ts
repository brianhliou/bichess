import assert from 'node:assert/strict';
import test from 'node:test';
import { xiangqiMoveToPikafishUci } from '@mistboard/game';
import { playXiangqiEngineGame } from './xiangqi-engine-game.js';

test('plays a kernel-validated standard-Xiangqi engine game to its ply cap', async () => {
  const seen: Array<{ engineId: string; historyLength: number }> = [];
  const result = await playXiangqiEngineGame({
    roomId: 'eve_xiangqi_test',
    redEngineId: 'pikafish-xiangqi-level-1',
    blackEngineId: 'pikafish-xiangqi-level-2',
    maxPlies: 4,
    startedAt: 1_000,
    moveProvider: async ({ engineId, history, legalMoves }) => {
      seen.push({ engineId, historyLength: history.length });
      return xiangqiMoveToPikafishUci(legalMoves[0]!);
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.result, 'draw');
  assert.equal(result.termination, 'truncated');
  assert.equal(result.plyCount, 4);
  assert.deepEqual(seen, [
    { engineId: 'pikafish-xiangqi-level-1', historyLength: 0 },
    { engineId: 'pikafish-xiangqi-level-2', historyLength: 1 },
    { engineId: 'pikafish-xiangqi-level-1', historyLength: 2 },
    { engineId: 'pikafish-xiangqi-level-2', historyLength: 3 },
  ]);
  assert.equal(result.events.filter((event) => event.type === 'move-played').length, 4);
});

test('fails closed when an engine returns a non-kernel-legal move', async () => {
  const result = await playXiangqiEngineGame({
    roomId: 'eve_xiangqi_bad_move',
    redEngineId: 'pikafish-xiangqi-level-1',
    blackEngineId: 'pikafish-xiangqi-level-2',
    maxPlies: 4,
    moveProvider: async () => 'a0a0',
  });

  assert.equal(result.status, 'aborted');
  assert.equal(result.result, null);
  assert.equal(result.termination, 'engine-failure');
  assert.equal(result.plyCount, 0);
});

test('accepts Fairy-Stockfish and mixed-family standard-Xiangqi profiles', async () => {
  const seen: string[] = [];
  const result = await playXiangqiEngineGame({
    roomId: 'eve_xiangqi_mixed_engines',
    redEngineId: 'fairy-stockfish-xiangqi-level-4',
    blackEngineId: 'pikafish-xiangqi-level-1',
    maxPlies: 2,
    moveProvider: async ({ engineId, legalMoves }) => {
      seen.push(engineId);
      return xiangqiMoveToPikafishUci(legalMoves[0]!);
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(seen, ['fairy-stockfish-xiangqi-level-4', 'pikafish-xiangqi-level-1']);
});

test('paired opening seeds produce the same prefix across swapped engines', async () => {
  const play = (redEngineId: string, blackEngineId: string) =>
    playXiangqiEngineGame({
      roomId: `eve_${redEngineId}`,
      redEngineId,
      blackEngineId,
      maxPlies: 6,
      openingPolicy: { kind: 'random_first_n_plies', n: 6, seed: '20260710' },
      moveProvider: async () => {
        throw new Error('the engine must not be called inside the forced opening');
      },
    });
  const [first, swapped] = await Promise.all([
    play('pikafish-xiangqi-level-1', 'pikafish-xiangqi-level-3'),
    play('pikafish-xiangqi-level-3', 'pikafish-xiangqi-level-1'),
  ]);
  const uci = (result: Awaited<ReturnType<typeof play>>) =>
    result.events
      .filter((event) => event.type === 'move-played')
      .map((event) => xiangqiMoveToPikafishUci(event.move));
  assert.deepEqual(uci(first), uci(swapped));
});
