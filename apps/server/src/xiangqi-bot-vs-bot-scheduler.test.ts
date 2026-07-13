import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type BotVsBotSchedulerConfig,
  type BotVsBotSchedulerDeps,
  botVsBotConfigFromEnv,
  clampBotVsBotDailyMax,
  clampBotVsBotTarget,
  clampCalibrationRatio,
  createBotVsBotScheduler,
  type EnqueueBotVsBotGameInput,
} from './xiangqi-bot-vs-bot-scheduler.js';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

// dailyMax 24 → one game every hour; forced pair keeps pairing deterministic.
const FORCED: BotVsBotSchedulerConfig = {
  targetActive: 3,
  maxPlies: 300,
  calibrationRatio: 0,
  dailyMax: 24,
  ladder: ['fsf-1', 'fsf-2', 'fsf-3'],
  forcedPairing: { redEngineId: 'fsf-7', blackEngineId: 'fsf-8' },
};

function harness(
  overrides: Partial<BotVsBotSchedulerDeps> & { active?: number; lastAt?: number | null } = {},
) {
  const enqueued: EnqueueBotVsBotGameInput[] = [];
  let active = overrides.active ?? 0;
  const deps: BotVsBotSchedulerDeps = {
    enabled: overrides.enabled ?? (() => true),
    config: overrides.config ?? (() => FORCED),
    countActiveTasks: overrides.countActiveTasks ?? (async () => active),
    lastEnqueueAt: overrides.lastEnqueueAt ?? (async () => overrides.lastAt ?? null),
    enqueueGame:
      overrides.enqueueGame ??
      (async (input) => {
        enqueued.push(input);
        active++;
      }),
    random: overrides.random ?? (() => 0.5),
    now: overrides.now ?? (() => NOW),
  };
  return { deps, enqueued };
}

test('enqueues one game per eligible tick', async () => {
  const { deps, enqueued } = harness({ active: 0 });
  await createBotVsBotScheduler(deps).tick();
  assert.equal(enqueued.length, 1);
  assert.deepEqual(enqueued[0]?.pairing, FORCED.forcedPairing);
  assert.equal(enqueued[0]?.lane, 'content');
  assert.equal(enqueued[0]?.maxPlies, 300);
});

test('does nothing when already at or above the concurrency target', async () => {
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

test('rate limit: skips when the last enqueue is within the min interval', async () => {
  // dailyMax 2 → 12h spacing; last game 1h ago → too soon.
  const { deps, enqueued } = harness({
    active: 0,
    lastAt: NOW - HOUR,
    config: () => ({ ...FORCED, dailyMax: 2 }),
  });
  await createBotVsBotScheduler(deps).tick();
  assert.equal(enqueued.length, 0);
});

test('rate limit: enqueues once the interval has elapsed', async () => {
  const { deps, enqueued } = harness({
    active: 0,
    lastAt: NOW - 13 * HOUR, // > 12h
    config: () => ({ ...FORCED, dailyMax: 2 }),
  });
  await createBotVsBotScheduler(deps).tick();
  assert.equal(enqueued.length, 1);
});

test('rate limit: the very first game enqueues immediately (no prior game)', async () => {
  const { deps, enqueued } = harness({
    active: 0,
    lastAt: null,
    config: () => ({ ...FORCED, dailyMax: 1 }),
  });
  await createBotVsBotScheduler(deps).tick();
  assert.equal(enqueued.length, 1);
});

test('without a forced pairing, calibration ratio selects the lane', async () => {
  const ladder = ['a', 'b', 'c', 'd', 'e'];
  const { deps, enqueued } = harness({
    active: 0,
    config: () => ({
      targetActive: 2,
      maxPlies: 300,
      calibrationRatio: 1,
      dailyMax: 100,
      ladder,
      forcedPairing: null,
    }),
    random: () => 0,
  });
  await createBotVsBotScheduler(deps).tick();
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0]?.lane, 'calibration');
  assert.notEqual(enqueued[0]?.pairing.redEngineId, enqueued[0]?.pairing.blackEngineId);
});

test('clampBotVsBotTarget bounds and defaults', () => {
  assert.equal(clampBotVsBotTarget(5), 5);
  assert.equal(clampBotVsBotTarget(0), 1);
  assert.equal(clampBotVsBotTarget(999), 20);
  assert.equal(clampBotVsBotTarget('nope'), 2);
});

test('clampBotVsBotDailyMax bounds and defaults', () => {
  assert.equal(clampBotVsBotDailyMax(3), 3);
  assert.equal(clampBotVsBotDailyMax(0), 1);
  assert.equal(clampBotVsBotDailyMax(10_000), 5_000);
  assert.equal(clampBotVsBotDailyMax('nope'), 2);
});

test('clampCalibrationRatio bounds and defaults', () => {
  assert.equal(clampCalibrationRatio(0.4), 0.4);
  assert.equal(clampCalibrationRatio(-1), 0);
  assert.equal(clampCalibrationRatio(2), 1);
  assert.equal(clampCalibrationRatio('nope'), 0.3);
});

test('botVsBotConfigFromEnv reads dailyMax and forces a pair only when both engines set', () => {
  const config = botVsBotConfigFromEnv({
    MISTBOARD_BOT_VS_BOT_DAILY_MAX: '3',
    MISTBOARD_BOT_VS_BOT_RED_ENGINE: 'fairy-stockfish-xiangqi-level-3',
    MISTBOARD_BOT_VS_BOT_BLACK_ENGINE: 'fairy-stockfish-xiangqi-level-5',
  } as NodeJS.ProcessEnv);
  assert.equal(config.dailyMax, 3);
  assert.deepEqual(config.forcedPairing, {
    redEngineId: 'fairy-stockfish-xiangqi-level-3',
    blackEngineId: 'fairy-stockfish-xiangqi-level-5',
  });
  assert.equal(botVsBotConfigFromEnv({} as NodeJS.ProcessEnv).forcedPairing, null);
  assert.equal(botVsBotConfigFromEnv({} as NodeJS.ProcessEnv).dailyMax, 2);
});
