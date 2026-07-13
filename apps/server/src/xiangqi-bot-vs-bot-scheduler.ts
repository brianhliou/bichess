// In-server scheduler that keeps a small backlog of automated xiangqi
// engine-vs-engine (EvE) games flowing. Each tick tops the queue up to a target
// number of in-flight tasks (queued or running) rather than blindly enqueueing,
// so the worker always has something to drain and the /watch Engines channel
// stays populated without unbounded growth. The worker (engine-worker service)
// runs the games and persists them as mode='eve'; this module only enqueues.
//
// Gated by botVsBotEnabled() (read at tick time so ops can flip it without a
// restart). Generation is deliberately independent of xiangqiEnabled(), which
// controls /watch visibility — see #196. Pairing is delegated to the two-lane
// policy (content vs calibration) in xiangqi-bot-vs-bot-pairing.ts; set both
// MISTBOARD_BOT_VS_BOT_RED_ENGINE and _BLACK_ENGINE to force a fixed pair
// (demos/tests) instead.

import {
  countActiveEngineGameTasks,
  createEngineGameTask,
  createExperimentJob,
} from './engine-experiments.js';
import { botVsBotEnabled } from './feature-flags.js';
import { getPool } from './persistence-db.js';
import {
  type BotVsBotLane,
  type BotVsBotPairing,
  pickPairing,
  xiangqiBotLadder,
} from './xiangqi-bot-vs-bot-pairing.js';

const TICK_MS = 30_000;
const DAY_MS = 86_400_000;

export const BOT_VS_BOT_MIN_TARGET = 1;
export const BOT_VS_BOT_MAX_TARGET = 20;
export const BOT_VS_BOT_DEFAULT_TARGET = 2;
export const BOT_VS_BOT_DEFAULT_MAX_PLIES = 300;
export const BOT_VS_BOT_DEFAULT_CALIBRATION_RATIO = 0.3;
// Games per rolling 24h. Deliberately low so we ladder up from a trickle rather
// than saturating the worker; raise MISTBOARD_BOT_VS_BOT_DAILY_MAX to scale.
export const BOT_VS_BOT_DEFAULT_DAILY_MAX = 2;
export const BOT_VS_BOT_MIN_DAILY_MAX = 1;
export const BOT_VS_BOT_MAX_DAILY_MAX = 5_000;

export type BotVsBotSchedulerConfig = {
  targetActive: number;
  maxPlies: number;
  calibrationRatio: number;
  // Max games to enqueue per rolling 24h. The scheduler spaces games ~24h/dailyMax
  // apart, so this is both the daily quota and the pacing knob.
  dailyMax: number;
  ladder: string[];
  // When set, every game uses this exact pair (labelled content) — overrides the
  // two-lane policy. Both engine env vars must be present to force it.
  forcedPairing: BotVsBotPairing | null;
};

export function clampBotVsBotTarget(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return BOT_VS_BOT_DEFAULT_TARGET;
  return Math.min(Math.max(Math.trunc(n), BOT_VS_BOT_MIN_TARGET), BOT_VS_BOT_MAX_TARGET);
}

export function clampBotVsBotDailyMax(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return BOT_VS_BOT_DEFAULT_DAILY_MAX;
  return Math.min(Math.max(Math.trunc(n), BOT_VS_BOT_MIN_DAILY_MAX), BOT_VS_BOT_MAX_DAILY_MAX);
}

export function clampCalibrationRatio(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return BOT_VS_BOT_DEFAULT_CALIBRATION_RATIO;
  return Math.min(1, Math.max(0, n));
}

export function botVsBotConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BotVsBotSchedulerConfig {
  const maxPlies = Number.parseInt(env.MISTBOARD_BOT_VS_BOT_MAX_PLIES ?? '', 10);
  const red = env.MISTBOARD_BOT_VS_BOT_RED_ENGINE;
  const black = env.MISTBOARD_BOT_VS_BOT_BLACK_ENGINE;
  return {
    targetActive: clampBotVsBotTarget(env.MISTBOARD_BOT_VS_BOT_TARGET),
    maxPlies: Number.isFinite(maxPlies) && maxPlies > 0 ? maxPlies : BOT_VS_BOT_DEFAULT_MAX_PLIES,
    calibrationRatio: clampCalibrationRatio(env.MISTBOARD_BOT_VS_BOT_CALIBRATION_RATIO),
    dailyMax: clampBotVsBotDailyMax(env.MISTBOARD_BOT_VS_BOT_DAILY_MAX),
    ladder: xiangqiBotLadder(),
    forcedPairing: red && black ? { redEngineId: red, blackEngineId: black } : null,
  };
}

export type EnqueueBotVsBotGameInput = {
  lane: BotVsBotLane;
  pairing: BotVsBotPairing;
  maxPlies: number;
  seed: string;
};

export type BotVsBotSchedulerDeps = {
  enabled(): boolean;
  config(): BotVsBotSchedulerConfig;
  countActiveTasks(): Promise<number>;
  // Epoch-ms of the most recent scheduler enqueue, or null if none yet. Drives
  // the rolling-24h rate limit; read from the DB so it survives restarts/deploys.
  lastEnqueueAt(): Promise<number | null>;
  enqueueGame(input: EnqueueBotVsBotGameInput): Promise<void>;
  random(): number;
  now(): number;
};

// Epoch-ms of the newest scheduler-sourced job, or null. DB-backed so a restart
// doesn't reset the pacing and re-burst.
async function lastBotVsBotEnqueueAtMs(): Promise<number | null> {
  const { rows } = await getPool().query<{ at: number | null }>(
    `SELECT EXTRACT(EPOCH FROM MAX(created_at)) * 1000 AS at
       FROM eve_jobs
      WHERE config->>'source' = 'bot-vs-bot-scheduler'`,
  );
  const at = rows[0]?.at;
  return at === null || at === undefined ? null : Number(at);
}

// Live enqueue: one job + one task per game, shaped exactly like the enqueue CLI
// so the worker's xiangqi runner picks it up unchanged. The lane is recorded on
// the job so Phase 3 calibration can query only calibration-lane games.
async function enqueueLiveGame(input: EnqueueBotVsBotGameInput): Promise<void> {
  const pool = getPool();
  const job = await createExperimentJob(pool, {
    purpose: 'calibration',
    targetGames: 1,
    config: {
      variant: 'xiangqi',
      source: 'bot-vs-bot-scheduler',
      lane: input.lane,
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
  lastEnqueueAt: () => lastBotVsBotEnqueueAtMs(),
  enqueueGame: (input) => enqueueLiveGame(input),
  random: () => Math.random(),
  now: () => Date.now(),
};

export type BotVsBotScheduler = {
  tick(): Promise<void>;
  start(): void;
  stop(): void;
};

// Pick lane + pairing for one game: a forced pair (labelled content) short-
// circuits the policy, otherwise delegate to the two-lane picker.
function chooseGame(
  config: BotVsBotSchedulerConfig,
  random: () => number,
): { lane: BotVsBotLane; pairing: BotVsBotPairing } {
  if (config.forcedPairing) return { lane: 'content', pairing: config.forcedPairing };
  return pickPairing(random, config.ladder, config.calibrationRatio);
}

export function createBotVsBotScheduler(deps: BotVsBotSchedulerDeps = liveDeps): BotVsBotScheduler {
  let ticking = false;
  let interval: NodeJS.Timeout | null = null;

  async function tick(): Promise<void> {
    if (ticking) return;
    if (!deps.enabled()) return;
    ticking = true;
    try {
      const config = deps.config();
      // Concurrency ceiling: never exceed targetActive games in flight.
      const active = await deps.countActiveTasks();
      if (active >= config.targetActive) return;

      // Rolling-24h rate limit: space games ~24h/dailyMax apart. One game per
      // eligible tick — at low dailyMax this trickles a handful a day; at high
      // dailyMax the interval shrinks below the tick and it simply keeps the
      // queue topped to targetActive.
      const minIntervalMs = DAY_MS / config.dailyMax;
      const lastAt = await deps.lastEnqueueAt();
      const now = deps.now();
      if (lastAt !== null && now - lastAt < minIntervalMs) return;

      const { lane, pairing } = chooseGame(config, deps.random);
      await deps.enqueueGame({ lane, pairing, maxPlies: config.maxPlies, seed: `${now}` });
      console.log(
        JSON.stringify({
          level: 'info',
          kind: 'bot_vs_bot_enqueued',
          lane,
          activeBefore: active,
          targetActive: config.targetActive,
          dailyMax: config.dailyMax,
          minIntervalMs,
          at: now,
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
