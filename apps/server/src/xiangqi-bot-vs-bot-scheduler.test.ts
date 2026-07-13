import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type BotVsBotSchedulerConfig,
  type BotVsBotSchedulerDeps,
  botVsBotConfigFromEnv,
  clampBotVsBotTarget,
  createBotVsBotScheduler,
  type EnqueueBotVsBotGameInput,
} from './xiangqi-bot-vs-bot-scheduler.js';

const CONFIG: BotVsBotSchedulerConfig = {
  targetActive: 3,
  maxPlies: 300,
  pairing: {
    redEngineId: 'fairy-stockfish-xiangqi-level-7',
    blackEngineId: 'fairy-stockfish-xiangqi-level-8',
  },
};

function harness(overrides: Partial<BotVsBotSchedulerDeps> & { active?: number } = {}) {
  const enqueued: EnqueueBotVsBotGameInput[] = [];
  let active = overrides.active ?? 0;
  const deps: BotVsBotSchedulerDeps = {
    enabled: overrides.enabled ?? (() => true),
    config: overrides.config ?? (() => CONFIG),
    countActiveTasks: overrides.countActiveTasks ?? (async () => active),
    enqueueGame:
      overrides.enqueueGame ??
      (async (input) => {
        enqueued.push(input);
        active++; // simulate the task becoming queued/active
      }),
    now: overrides.now ?? (() => 1000),
  };
  return { deps, enqueued };
}

test('tops up the deficit to the target when enabled', async () => {
  const { deps, enqueued } = harness({ active: 1 });
  const scheduler = createBotVsBotScheduler(deps);
  await scheduler.tick();
  assert.equal(enqueued.length, 2); // 3 target - 1 active
  assert.deepEqual(enqueued[0]?.pairing, CONFIG.pairing);
  assert.equal(enqueued[0]?.maxPlies, 300);
});

test('does nothing when already at or above target', async () => {
  const { deps, enqueued } = harness({ active: 3 });
  const scheduler = createBotVsBotScheduler(deps);
  await scheduler.tick();
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
  const scheduler = createBotVsBotScheduler(deps);
  await scheduler.tick();
  assert.equal(enqueued.length, 0);
  assert.equal(counted, false);
});

test('gives each enqueued game a distinct seed', async () => {
  let n = 0;
  const { deps, enqueued } = harness({ active: 0, now: () => 5000 + n++ });
  const scheduler = createBotVsBotScheduler(deps);
  await scheduler.tick();
  const seeds = new Set(enqueued.map((e) => e.seed));
  assert.equal(seeds.size, enqueued.length);
});

test('clampBotVsBotTarget bounds and defaults', () => {
  assert.equal(clampBotVsBotTarget(5), 5);
  assert.equal(clampBotVsBotTarget(0), 1);
  assert.equal(clampBotVsBotTarget(999), 20);
  assert.equal(clampBotVsBotTarget('nope'), 2);
  assert.equal(clampBotVsBotTarget(undefined), 2);
});

test('botVsBotConfigFromEnv reads overrides', () => {
  const config = botVsBotConfigFromEnv({
    MISTBOARD_BOT_VS_BOT_TARGET: '4',
    MISTBOARD_BOT_VS_BOT_MAX_PLIES: '120',
    MISTBOARD_BOT_VS_BOT_RED_ENGINE: 'fairy-stockfish-xiangqi-level-3',
  } as NodeJS.ProcessEnv);
  assert.equal(config.targetActive, 4);
  assert.equal(config.maxPlies, 120);
  assert.equal(config.pairing.redEngineId, 'fairy-stockfish-xiangqi-level-3');
  assert.equal(config.pairing.blackEngineId, 'fairy-stockfish-xiangqi-level-8');
});
