import { randomUUID } from 'node:crypto';
import type pg from 'pg';

type Queryable = Pick<pg.Client | pg.Pool | pg.PoolClient, 'query'>;
type JsonObject = Record<string, unknown>;

export type EngineExperimentPurpose = 'mining' | 'bakeoff' | 'calibration' | 'smoke' | 'regression';
export type EngineWorkerStatus = 'running' | 'draining' | 'stopped' | 'failed';
export type EngineGameTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'canceled';

export type EngineExperimentJob = {
  id: string;
  status: string;
  purpose: EngineExperimentPurpose;
  targetGames: number;
  completedGames: number;
  failedGames: number;
  config: JsonObject;
  createdBy: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type EngineWorkerRun = {
  id: string;
  provider: string;
  providerRunId: string | null;
  status: EngineWorkerStatus;
  capabilities: JsonObject;
  resourceLimits: JsonObject;
  startedAt: Date;
  heartbeatAt: Date;
  stoppedAt: Date | null;
  failureReason: string | null;
};

export type EngineGameTask = {
  id: string;
  jobId: string;
  gameIndex: number;
  status: EngineGameTaskStatus;
  priority: number;
  gameId: string | null;
  workerRunId: string | null;
  workerId: string | null;
  provider: string | null;
  providerRunId: string | null;
  claimToken: string | null;
  claimExpiresAt: Date | null;
  heartbeatAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  whiteEngineId: string | null;
  blackEngineId: string | null;
  seed: string;
  timeControl: JsonObject;
  openingPolicy: JsonObject;
  artifactPolicy: JsonObject;
  resourcePolicy: JsonObject;
  config: JsonObject;
  scheduledAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
};

export type CreateExperimentJobInput = {
  id?: string;
  purpose: EngineExperimentPurpose;
  targetGames: number;
  config?: JsonObject;
  createdBy?: string | null;
};

export type CreateEngineGameTaskInput = {
  id?: string;
  jobId: string;
  gameIndex: number;
  priority?: number;
  maxAttempts?: number;
  whiteEngineId?: string | null;
  blackEngineId?: string | null;
  seed: bigint | number | string;
  timeControl: JsonObject;
  openingPolicy?: JsonObject;
  artifactPolicy?: JsonObject;
  resourcePolicy?: JsonObject;
  config?: JsonObject;
  scheduledAt?: Date;
};

export type RegisterWorkerRunInput = {
  id?: string;
  provider: string;
  providerRunId?: string | null;
  capabilities?: JsonObject;
  resourceLimits?: JsonObject;
};

export type ClaimNextTaskInput = {
  workerRunId: string;
  workerId: string;
  provider: string;
  providerRunId?: string | null;
  capabilities?: JsonObject;
  claimTtlMs?: number;
  claimToken?: string;
};

export type CleanupStaleTasksResult = {
  retried: number;
  failed: number;
  aborted: number;
  failedWorkerRuns: number;
  staleWorkerRuns: number;
};

export async function createExperimentJob(
  db: Queryable,
  input: CreateExperimentJobInput,
): Promise<EngineExperimentJob> {
  const id = input.id ?? `job_${randomUUID()}`;
  const { rows } = await db.query<EveJobRow>(
    `INSERT INTO eve_jobs
       (id, purpose, target_games, config, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, input.purpose, input.targetGames, input.config ?? {}, input.createdBy ?? null],
  );
  return mapJob(rows[0]!);
}

export async function createEngineGameTask(
  db: Queryable,
  input: CreateEngineGameTaskInput,
): Promise<EngineGameTask> {
  const id = input.id ?? `task_${randomUUID()}`;
  const { rows } = await db.query<EngineGameTaskRow>(
    `INSERT INTO engine_game_tasks
       (id, job_id, game_index, priority, max_attempts, white_engine_id, black_engine_id,
        seed, time_control, opening_policy, artifact_policy, resource_policy, config, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, now()))
     RETURNING *`,
    [
      id,
      input.jobId,
      input.gameIndex,
      input.priority ?? 0,
      input.maxAttempts ?? 1,
      input.whiteEngineId ?? null,
      input.blackEngineId ?? null,
      input.seed.toString(),
      input.timeControl,
      input.openingPolicy ?? {},
      input.artifactPolicy ?? {},
      input.resourcePolicy ?? {},
      input.config ?? {},
      input.scheduledAt ?? null,
    ],
  );
  return mapTask(rows[0]!);
}

// Count in-flight (queued or running) tasks, optionally scoped to one variant
// via config->>'variant'. Used by the bot-vs-bot scheduler to top up to a target
// backlog rather than blindly enqueueing every tick.
export async function countActiveEngineGameTasks(
  db: Queryable,
  opts: { variant?: string } = {},
): Promise<number> {
  const { rows } = await db.query<{ active: number }>(
    `SELECT count(*)::int AS active
       FROM engine_game_tasks
      WHERE status IN ('queued', 'running')
        AND ($1::text IS NULL OR config->>'variant' = $1)`,
    [opts.variant ?? null],
  );
  return rows[0]?.active ?? 0;
}

export async function registerWorkerRun(
  db: Queryable,
  input: RegisterWorkerRunInput,
): Promise<EngineWorkerRun> {
  const id = input.id ?? `worker_${randomUUID()}`;
  const { rows } = await db.query<EngineWorkerRunRow>(
    `INSERT INTO engine_worker_runs
       (id, provider, provider_run_id, capabilities, resource_limits)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      id,
      input.provider,
      input.providerRunId ?? null,
      input.capabilities ?? {},
      input.resourceLimits ?? {},
    ],
  );
  return mapWorkerRun(rows[0]!);
}

export async function heartbeatWorkerRun(
  db: Queryable,
  workerRunId: string,
): Promise<EngineWorkerRun> {
  const { rows } = await db.query<EngineWorkerRunRow>(
    `UPDATE engine_worker_runs
     SET heartbeat_at = now()
     WHERE id = $1
       AND status IN ('running', 'draining')
     RETURNING *`,
    [workerRunId],
  );
  if (rows.length === 0) throw new Error(`worker run ${workerRunId} is not active`);
  return mapWorkerRun(rows[0]!);
}

export async function stopWorkerRun(
  db: Queryable,
  workerRunId: string,
  status: Extract<EngineWorkerStatus, 'stopped' | 'failed'> = 'stopped',
  failureReason: string | null = null,
): Promise<EngineWorkerRun> {
  const { rows } = await db.query<EngineWorkerRunRow>(
    `UPDATE engine_worker_runs
     SET status = $2,
         stopped_at = now(),
         failure_reason = $3
     WHERE id = $1
     RETURNING *`,
    [workerRunId, status, failureReason],
  );
  if (rows.length === 0) throw new Error(`worker run ${workerRunId} not found`);
  return mapWorkerRun(rows[0]!);
}

export async function claimNextEngineGameTask(
  pool: pg.Pool,
  input: ClaimNextTaskInput,
): Promise<EngineGameTask | null> {
  const claimToken = input.claimToken ?? randomUUID();
  const claimTtlMs = input.claimTtlMs ?? 5 * 60_000;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<EngineGameTaskRow>(
      `WITH next_task AS (
         SELECT queued_task.id
         FROM engine_game_tasks queued_task
         WHERE queued_task.status = 'queued'
           AND queued_task.scheduled_at <= now()
           AND queued_task.attempt_count < queued_task.max_attempts
           AND (
             NOT (queued_task.resource_policy ? 'providers')
             OR jsonb_typeof(queued_task.resource_policy->'providers') <> 'array'
             OR jsonb_array_length(queued_task.resource_policy->'providers') = 0
             OR queued_task.resource_policy->'providers' ? $3
           )
           AND (
             NOT (queued_task.resource_policy ? 'required_capabilities')
             OR jsonb_typeof(queued_task.resource_policy->'required_capabilities') <> 'array'
             OR NOT EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(queued_task.resource_policy->'required_capabilities') required(capability)
               WHERE COALESCE(($7::jsonb ->> required.capability)::boolean, false) IS DISTINCT FROM true
             )
           )
         ORDER BY queued_task.priority DESC, queued_task.scheduled_at, queued_task.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE engine_game_tasks task
       SET status = 'running',
           worker_run_id = $1,
           worker_id = $2,
           provider = $3,
           provider_run_id = $4,
           claim_token = $5,
           claim_expires_at = now() + ($6::double precision * interval '1 millisecond'),
           heartbeat_at = now(),
           attempt_count = task.attempt_count + 1,
           started_at = now(),
           finished_at = NULL,
           failure_reason = NULL
       FROM next_task
       WHERE task.id = next_task.id
       RETURNING task.*`,
      [
        input.workerRunId,
        input.workerId,
        input.provider,
        input.providerRunId ?? null,
        claimToken,
        claimTtlMs,
        input.capabilities ?? {},
      ],
    );
    await client.query('COMMIT');
    return rows[0] ? mapTask(rows[0]) : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cleanupStaleEngineGameTasks(
  pool: pg.Pool,
  staleBefore = new Date(),
  staleWorkerBefore = new Date(Date.now() - 2 * 60_000),
): Promise<CleanupStaleTasksResult> {
  const client = await pool.connect();
  const result: CleanupStaleTasksResult = {
    retried: 0,
    failed: 0,
    aborted: 0,
    failedWorkerRuns: 0,
    staleWorkerRuns: 0,
  };

  try {
    await client.query('BEGIN');
    const { rows: staleTasks } = await client.query<
      Pick<
        EngineGameTaskRow,
        'id' | 'job_id' | 'game_id' | 'worker_run_id' | 'attempt_count' | 'max_attempts'
      >
    >(
      `SELECT id, job_id, game_id, worker_run_id, attempt_count, max_attempts
       FROM engine_game_tasks
       WHERE status = 'running'
         AND COALESCE(claim_expires_at, heartbeat_at, started_at) < $1
       FOR UPDATE SKIP LOCKED`,
      [staleBefore],
    );

    for (const task of staleTasks) {
      if (task.worker_run_id) {
        const failedWorker = await client.query(
          `UPDATE engine_worker_runs
           SET status = 'failed',
               stopped_at = now(),
               failure_reason = 'stale engine task claim'
           WHERE id = $1
             AND status IN ('running', 'draining')`,
          [task.worker_run_id],
        );
        result.failedWorkerRuns += failedWorker.rowCount ?? 0;
      }

      if (task.game_id) {
        await client.query(
          `UPDATE games
           SET status = 'aborted',
               result = NULL,
               termination = 'worker-aborted',
               ended_at = now(),
               aborted_reason = 'stale engine task claim'
           WHERE room_id = $1
             AND status = 'running'`,
          [task.game_id],
        );
        await client.query(
          `UPDATE engine_game_tasks
           SET status = 'aborted',
               claim_token = NULL,
               claim_expires_at = NULL,
               heartbeat_at = NULL,
               finished_at = now(),
               failure_reason = 'stale engine task claim'
           WHERE id = $1
             AND status = 'running'`,
          [task.id],
        );
        result.aborted += 1;
      } else if (task.attempt_count < task.max_attempts) {
        await client.query(
          `UPDATE engine_game_tasks
           SET status = 'queued',
               worker_run_id = NULL,
               worker_id = NULL,
               provider = NULL,
               provider_run_id = NULL,
               claim_token = NULL,
               claim_expires_at = NULL,
               heartbeat_at = NULL,
               started_at = NULL,
               failure_reason = 'stale engine task claim released for retry'
           WHERE id = $1
             AND status = 'running'`,
          [task.id],
        );
        result.retried += 1;
      } else {
        await client.query(
          `UPDATE engine_game_tasks
           SET status = 'failed',
               claim_token = NULL,
               claim_expires_at = NULL,
               heartbeat_at = NULL,
               finished_at = now(),
               failure_reason = 'stale engine task claim exhausted retry budget'
           WHERE id = $1
             AND status = 'running'`,
          [task.id],
        );
        result.failed += 1;
      }
      await reconcileExperimentJob(client, task.job_id);
    }

    const staleWorkers = await client.query(
      `UPDATE engine_worker_runs
       SET status = 'failed',
           stopped_at = now(),
           failure_reason = 'stale worker heartbeat'
       WHERE status IN ('running', 'draining')
         AND heartbeat_at < $1`,
      [staleWorkerBefore],
    );
    result.staleWorkerRuns = staleWorkers.rowCount ?? 0;

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function heartbeatEngineGameTask(
  db: Queryable,
  taskId: string,
  claimToken: string,
): Promise<EngineGameTask> {
  const { rows } = await db.query<EngineGameTaskRow>(
    `UPDATE engine_game_tasks
     SET heartbeat_at = now(),
         claim_expires_at = now() + (claim_expires_at - heartbeat_at)
     WHERE id = $1
       AND claim_token = $2
       AND status = 'running'
     RETURNING *`,
    [taskId, claimToken],
  );
  if (rows.length === 0) throw new Error(`task ${taskId} is not claimed by this worker`);
  return mapTask(rows[0]!);
}

export async function releaseEngineGameTaskClaim(
  db: Queryable,
  taskId: string,
  claimToken: string,
  options: { decrementAttempt?: boolean } = {},
): Promise<EngineGameTask> {
  const { rows } = await db.query<EngineGameTaskRow>(
    `UPDATE engine_game_tasks
     SET status = 'queued',
         worker_run_id = NULL,
         worker_id = NULL,
         provider = NULL,
         provider_run_id = NULL,
         claim_token = NULL,
         claim_expires_at = NULL,
         heartbeat_at = NULL,
         started_at = NULL,
         failure_reason = NULL,
         attempt_count = CASE
           WHEN $3 THEN GREATEST(attempt_count - 1, 0)
           ELSE attempt_count
         END
     WHERE id = $1
       AND claim_token = $2
       AND status = 'running'
       AND game_id IS NULL
     RETURNING *`,
    [taskId, claimToken, options.decrementAttempt ?? false],
  );
  if (rows.length === 0) throw new Error(`task ${taskId} cannot be released`);
  return mapTask(rows[0]!);
}

export async function finishEngineGameTask(
  db: Queryable,
  taskId: string,
  claimToken: string,
  status: Extract<EngineGameTaskStatus, 'completed' | 'failed' | 'aborted'>,
  failureReason: string | null = null,
): Promise<EngineGameTask> {
  const { rows } = await db.query<EngineGameTaskRow>(
    `UPDATE engine_game_tasks
     SET status = $3,
         finished_at = now(),
         failure_reason = $4,
         claim_expires_at = NULL
     WHERE id = $1
       AND claim_token = $2
       AND status = 'running'
     RETURNING *`,
    [taskId, claimToken, status, failureReason],
  );
  if (rows.length === 0) throw new Error(`task ${taskId} is not claimed by this worker`);
  const task = mapTask(rows[0]!);
  if (status === 'failed' && task.gameId) {
    await db.query(
      `UPDATE games
       SET status = 'aborted',
           result = NULL,
           termination = 'engine-failure',
           ended_at = now(),
           aborted_reason = $2
       WHERE room_id = $1
         AND status = 'running'`,
      [task.gameId, failureReason ?? 'engine task failed'],
    );
  }
  return task;
}

export async function reconcileExperimentJob(db: Queryable, jobId: string): Promise<void> {
  await db.query(
    `WITH counts AS (
       SELECT
         count(*) FILTER (WHERE status = 'queued') AS queued,
         count(*) FILTER (WHERE status = 'running') AS running,
         count(*) FILTER (WHERE status = 'completed') AS completed,
         count(*) FILTER (WHERE status IN ('failed', 'aborted')) AS failed
       FROM engine_game_tasks
       WHERE job_id = $1
     )
     UPDATE eve_jobs job
     SET completed_games = counts.completed,
         failed_games = counts.failed,
         status = CASE
           WHEN counts.completed + counts.failed >= job.target_games THEN 'completed'
           WHEN counts.running > 0 OR counts.completed + counts.failed > 0 THEN 'running'
           ELSE 'queued'
         END,
         started_at = CASE
           WHEN counts.running > 0 OR counts.completed + counts.failed > 0 THEN COALESCE(job.started_at, now())
           ELSE job.started_at
         END,
         finished_at = CASE
           WHEN counts.completed + counts.failed >= job.target_games THEN COALESCE(job.finished_at, now())
           ELSE NULL
         END
     FROM counts
     WHERE job.id = $1
       AND job.status NOT IN ('aborted', 'failed')`,
    [jobId],
  );
}

type EveJobRow = {
  id: string;
  status: string;
  purpose: EngineExperimentPurpose;
  target_games: number;
  completed_games: number;
  failed_games: number;
  config: JsonObject;
  created_by: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

type EngineWorkerRunRow = {
  id: string;
  provider: string;
  provider_run_id: string | null;
  status: EngineWorkerStatus;
  capabilities: JsonObject;
  resource_limits: JsonObject;
  started_at: Date;
  heartbeat_at: Date;
  stopped_at: Date | null;
  failure_reason: string | null;
};

type EngineGameTaskRow = {
  id: string;
  job_id: string;
  game_index: number;
  status: EngineGameTaskStatus;
  priority: number;
  game_id: string | null;
  worker_run_id: string | null;
  worker_id: string | null;
  provider: string | null;
  provider_run_id: string | null;
  claim_token: string | null;
  claim_expires_at: Date | null;
  heartbeat_at: Date | null;
  attempt_count: number;
  max_attempts: number;
  white_engine_id: string | null;
  black_engine_id: string | null;
  seed: string;
  time_control: JsonObject;
  opening_policy: JsonObject;
  artifact_policy: JsonObject;
  resource_policy: JsonObject;
  config: JsonObject;
  scheduled_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  failure_reason: string | null;
  created_at: Date;
};

function mapJob(row: EveJobRow): EngineExperimentJob {
  return {
    id: row.id,
    status: row.status,
    purpose: row.purpose,
    targetGames: row.target_games,
    completedGames: row.completed_games,
    failedGames: row.failed_games,
    config: row.config,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapWorkerRun(row: EngineWorkerRunRow): EngineWorkerRun {
  return {
    id: row.id,
    provider: row.provider,
    providerRunId: row.provider_run_id,
    status: row.status,
    capabilities: row.capabilities,
    resourceLimits: row.resource_limits,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    stoppedAt: row.stopped_at,
    failureReason: row.failure_reason,
  };
}

function mapTask(row: EngineGameTaskRow): EngineGameTask {
  return {
    id: row.id,
    jobId: row.job_id,
    gameIndex: row.game_index,
    status: row.status,
    priority: row.priority,
    gameId: row.game_id,
    workerRunId: row.worker_run_id,
    workerId: row.worker_id,
    provider: row.provider,
    providerRunId: row.provider_run_id,
    claimToken: row.claim_token,
    claimExpiresAt: row.claim_expires_at,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    whiteEngineId: row.white_engine_id,
    blackEngineId: row.black_engine_id,
    seed: row.seed,
    timeControl: row.time_control,
    openingPolicy: row.opening_policy,
    artifactPolicy: row.artifact_policy,
    resourcePolicy: row.resource_policy,
    config: row.config,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}
