import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type BotVsBotSchedulerConfig,
  type BotVsBotSchedulerDeps,
  botVsBotConfigFromEnv,
  clampBotVsBotTarget,
  clampCalibrationRatio,
  createBotVsBotScheduler,
  type EnqueueBotVsBotGameInput,
} from './xiangqi-bot-vs-bot-scheduler.js';

const FORCED: BotVsBotSchedulerConfig = {
  targetActive: 3,
  maxPlies: 300,
  calibrationRatio: 0,
  ladder: ['fsf-1', 'fsf-2', 'fsf-3'],
  forcedPairing: { redEngineId: 'fsf-7', blackEngineId: 'fsf-8' },
};

function harness(overrides: Partial<BotVsBotSchedulerDeps> & { active?: number } = {}) {
  const enqueued: EnqueueBotVsBotGameInput[] = [];
  let active = overrides.active ?? 0;
  const deps: BotVsBotSchedulerDeps = {
    enabled: overrides.enabled ?? (() => true),
    config: overrides.config ?? (() => FORCED),
    countActiveTasks: overrides.countActiveTasks ?? (async () => active),
    enqueueGame:
      overrides.enqueueGame ??
      (async (input) => {
        enqueued.push(input);
        active++; // simulate the task becoming queued/active
      }),
    random: overrides.random ?? (() => 0.5),
    now: overrides.now ?? (() => 1000),
  };
  return { deps, enqueued };
}

test('tops up the deficit to the target when enabled', async () => {
  const { deps, enqueued } = harness({ active: 1 });
  await createBotVsBotScheduler(deps).tick();
  assert.equal(enqueued.length, 2); // 3 target - 1 active
  assert.deepEqual(enqueued[0]?.pairing, FORCED.forcedPairing);
  assert.equal(enqueued[0]?.lane, 'content');
  assert.equal(enqueued[0]?.maxPlies, 300);
});

test('does nothing when already at or above target', async () => {
  const { deps, enqueued } = harness({ active: 3 });
  await createBotVsBotScheduler(deps).tick();
  assert.equal(enqueued.length, 0);
});

test('does nothing when disabled (does not even count)', async () => {
  let counted = false;
  const { deps, enqueued } = harness({
    enabled: () => false,
    countActiveTasks: async () => {
      counted = true;
      return 0;
    },
  });
  await createBotVsBotScheduler(deps).tick();
  assert.equal(enqueued.length, 0);
  assert.equal(counted, false);
});

test('gives each enqueued game a distinct seed', async () => {
  let n = 0;
  const { deps, enqueued } = harness({ active: 0, now: () => 5000 + n++ });
  await createBotVsBotScheduler(deps).tick();
  const seeds = new Set(enqueued.map((e) => e.seed));
  assert.equal(seeds.size, enqueued.length);
});

test('forced pairing overrides the two-lane policy', async () => {
  const { deps, enqueued } = harness({ active: 0 });
  await createBotVsBotScheduler(deps).tick();
  for (const game of enqueued) {
    assert.deepEqual(game.pairing, FORCED.forcedPairing);
    assert.equal(game.lane, 'content');
  }
});

test('without a forced pairing, calibration ratio selects the lane', async () => {
  const ladder = ['a', 'b', 'c', 'd', 'e'];
  // random() = 0 → below any positive ratio → calibration lane every game.
  const calib = harness({
    active: 0,
    config: () => ({
      targetActive: 2,
      maxPlies: 300,
      calibrationRatio: 1,
      ladder,
      forcedPairing: null,
    }),
    random: () => 0,
  });
  await createBotVsBotScheduler(calib.deps).tick();
  assert.equal(calib.enqueued.length, 2);
  for (const game of calib.enqueued) {
    assert.equal(game.lane, 'calibration');
    // calibration is never a mirror
    assert.notEqual(game.pairing.redEngineId, game.pairing.blackEngineId);
    assert.ok(ladder.includes(game.pairing.redEngineId));
    assert.ok(ladder.includes(game.pairing.blackEngineId));
  }
});

test('clampBotVsBotTarget bounds and defaults', () => {
  assert.equal(clampBotVsBotTarget(5), 5);
  assert.equal(clampBotVsBotTarget(0), 1);
  assert.equal(clampBotVsBotTarget(999), 20);
  assert.equal(clampBotVsBotTarget('nope'), 2);
});

test('clampCalibrationRatio bounds and defaults', () => {
  assert.equal(clampCalibrationRatio(0.4), 0.4);
  assert.equal(clampCalibrationRatio(-1), 0);
  assert.equal(clampCalibrationRatio(2), 1);
  assert.equal(clampCalibrationRatio('nope'), 0.3);
});

test('botVsBotConfigFromEnv forces a pair only when both engines are set', () => {
  const both = botVsBotConfigFromEnv({
    MISTBOARD_BOT_VS_BOT_RED_ENGINE: 'fairy-stockfish-xiangqi-level-3',
    MISTBOARD_BOT_VS_BOT_BLACK_ENGINE: 'fairy-stockfish-xiangqi-level-5',
  } as NodeJS.ProcessEnv);
  assert.deepEqual(both.forcedPairing, {
    redEngineId: 'fairy-stockfish-xiangqi-level-3',
    blackEngineId: 'fairy-stockfish-xiangqi-level-5',
  });
  const onlyOne = botVsBotConfigFromEnv({
    MISTBOARD_BOT_VS_BOT_RED_ENGINE: 'fairy-stockfish-xiangqi-level-3',
  } as NodeJS.ProcessEnv);
  assert.equal(onlyOne.forcedPairing, null);
  assert.ok(onlyOne.ladder.length >= 2);
});
