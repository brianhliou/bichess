// In-server scheduler that keeps a small backlog of automated xiangqi
// engine-vs-engine (EvE) games flowing. Each tick tops the queue up to a target
// number of in-flight tasks (queued or running) rather than blindly enqueueing,
// so the worker always has something to drain and the /watch Engines channel
// stays populated without unbounded growth. The worker (engine-worker service)
// runs the games and persists them as mode='eve'; this module only enqueues.
//
// Gated by botVsBotEnabled() (read at tick time so ops can flip it without a
// restart). Generation is deliberately independent of xiangqiEnabled(), which
// controls /watch visibility — see #196. Pairing is a single fixed pair for now
// (Phase 1); the content/calibration two-lane policy lands in Phase 2.

import {
  countActiveEngineGameTasks,
  createEngineGameTask,
  createExperimentJob,
} from './engine-experiments.js';
import { botVsBotEnabled } from './feature-flags.js';
import { getPool } from './persistence-db.js';

const TICK_MS = 30_000;

export const BOT_VS_BOT_MIN_TARGET = 1;
export const BOT_VS_BOT_MAX_TARGET = 20;
export const BOT_VS_BOT_DEFAULT_TARGET = 2;
export const BOT_VS_BOT_DEFAULT_MAX_PLIES = 300;
export const BOT_VS_BOT_DEFAULT_RED_ENGINE = 'fairy-stockfish-xiangqi-level-7';
export const BOT_VS_BOT_DEFAULT_BLACK_ENGINE = 'fairy-stockfish-xiangqi-level-8';

export type BotVsBotPairing = { redEngineId: string; blackEngineId: string };

export type BotVsBotSchedulerConfig = {
  targetActive: number;
  maxPlies: number;
  pairing: BotVsBotPairing;
};

export function clampBotVsBotTarget(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return BOT_VS_BOT_DEFAULT_TARGET;
  return Math.min(Math.max(Math.trunc(n), BOT_VS_BOT_MIN_TARGET), BOT_VS_BOT_MAX_TARGET);
}

export function botVsBotConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BotVsBotSchedulerConfig {
  const maxPlies = Number.parseInt(env.MISTBOARD_BOT_VS_BOT_MAX_PLIES ?? '', 10);
  return {
    targetActive: clampBotVsBotTarget(env.MISTBOARD_BOT_VS_BOT_TARGET),
    maxPlies: Number.isFinite(maxPlies) && maxPlies > 0 ? maxPlies : BOT_VS_BOT_DEFAULT_MAX_PLIES,
    pairing: {
      redEngineId: env.MISTBOARD_BOT_VS_BOT_RED_ENGINE ?? BOT_VS_BOT_DEFAULT_RED_ENGINE,
      blackEngineId: env.MISTBOARD_BOT_VS_BOT_BLACK_ENGINE ?? BOT_VS_BOT_DEFAULT_BLACK_ENGINE,
    },
  };
}

export type EnqueueBotVsBotGameInput = {
  pairing: BotVsBotPairing;
  maxPlies: number;
  seed: string;
};

export type BotVsBotSchedulerDeps = {
  enabled(): boolean;
  config(): BotVsBotSchedulerConfig;
  countActiveTasks(): Promise<number>;
  enqueueGame(input: EnqueueBotVsBotGameInput): Promise<void>;
  now(): number;
};

// Live enqueue: one job + one task per game, shaped exactly like the enqueue CLI
// so the worker's xiangqi runner picks it up unchanged.
async function enqueueLiveGame(input: EnqueueBotVsBotGameInput): Promise<void> {
  const pool = getPool();
  const job = await createExperimentJob(pool, {
    purpose: 'calibration',
    targetGames: 1,
    config: {
      variant: 'xiangqi',
      source: 'bot-vs-bot-scheduler',
      pairing: {
        kind:
          input.pairing.redEngineId === input.pairing.blackEngineId
            ? 'self-play'
            : 'engine-vs-engine',
        white_engine_id: input.pairing.redEngineId,
        black_engine_id: input.pairing.blackEngineId,
      },
    },
    createdBy: 'bot-vs-bot-scheduler',
  });
  await createEngineGameTask(pool, {
    jobId: job.id,
    gameIndex: 0,
    priority: 0,
    whiteEngineId: input.pairing.redEngineId,
    blackEngineId: input.pairing.blackEngineId,
    seed: input.seed,
    timeControl: { kind: 'none' },
    openingPolicy: { kind: 'standard' },
    artifactPolicy: {},
    resourcePolicy: { providers: ['local', 'railway'], concurrency: 1 },
    config: {
      variant: 'xiangqi',
      max_plies: input.maxPlies,
      white_engine_id: input.pairing.redEngineId,
      black_engine_id: input.pairing.blackEngineId,
    },
  });
}

const liveDeps: BotVsBotSchedulerDeps = {
  enabled: () => botVsBotEnabled(),
  config: () => botVsBotConfigFromEnv(),
  countActiveTasks: () => countActiveEngineGameTasks(getPool(), { variant: 'xiangqi' }),
  enqueueGame: (input) => enqueueLiveGame(input),
  now: () => Date.now(),
};

export type BotVsBotScheduler = {
  tick(): Promise<void>;
  start(): void;
  stop(): void;
};

export function createBotVsBotScheduler(deps: BotVsBotSchedulerDeps = liveDeps): BotVsBotScheduler {
  let ticking = false;
  let interval: NodeJS.Timeout | null = null;

  async function tick(): Promise<void> {
    if (ticking) return;
    if (!deps.enabled()) return;
    ticking = true;
    try {
      const config = deps.config();
      const active = await deps.countActiveTasks();
      const deficit = config.targetActive - active;
      if (deficit <= 0) return;

      let enqueued = 0;
      for (let index = 0; index < deficit; index++) {
        await deps.enqueueGame({
          pairing: config.pairing,
          maxPlies: config.maxPlies,
          // Distinct per game so stochastic engines diverge; not security-sensitive.
          seed: `${deps.now()}${index}`,
        });
        enqueued++;
      }
      console.log(
        JSON.stringify({
          level: 'info',
          kind: 'bot_vs_bot_enqueued',
          enqueued,
          activeBefore: active,
          targetActive: config.targetActive,
          pairing: config.pairing,
          at: deps.now(),
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'bot_vs_bot_scheduler_tick_failed',
          error: error instanceof Error ? error.message : String(error),
          at: deps.now(),
        }),
      );
    } finally {
      ticking = false;
    }
  }

  return {
    tick,
    start() {
      if (interval) return;
      interval = setInterval(() => {
        void tick();
      }, TICK_MS);
      interval.unref?.();
    },
    stop() {
      if (interval) clearInterval(interval);
      interval = null;
    },
  };
}

export function startBotVsBotScheduler(deps: BotVsBotSchedulerDeps = liveDeps): BotVsBotScheduler {
  const scheduler = createBotVsBotScheduler(deps);
  scheduler.start();
  return scheduler;
}
