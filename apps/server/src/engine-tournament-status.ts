import pg from 'pg';
import {
  buildTournamentReport,
  renderTournamentReportMarkdown,
  type TournamentGameRow,
} from './engine-tournament-report.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to inspect engine tournament status');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const format = args.format ?? process.env.ENGINE_TOURNAMENT_STATUS_FORMAT ?? 'json';
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  const jobId = await resolveJobId(
    pool,
    args.jobId ?? process.env.ENGINE_QUEUE_JOB_ID ?? null,
    args.tournamentId ?? process.env.ENGINE_TOURNAMENT_ID ?? null,
  );
  const tournamentId = args.tournamentId ?? process.env.ENGINE_TOURNAMENT_ID ?? null;
  const rows = await loadTournamentRows(pool, { jobId, tournamentId });
  const report = buildTournamentReport(rows);
  if (format === 'markdown') {
    process.stdout.write(renderTournamentReportMarkdown(report));
  } else {
    console.log(
      JSON.stringify(
        {
          level: 'info',
          kind: 'engine_tournament_status',
          jobId,
          tournamentId,
          ...report,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await pool.end();
}

type StatusArgs = {
  format?: 'json' | 'markdown';
  jobId?: string;
  tournamentId?: string;
};

type LoadOptions = {
  jobId: string | null;
  tournamentId: string | null;
};

async function resolveJobId(
  db: pg.Pool,
  jobId: string | null,
  tournamentId: string | null,
): Promise<string | null> {
  if (jobId || tournamentId) return jobId;
  const { rows } = await db.query<{ id: string }>(
    `SELECT id
     FROM eve_jobs
     WHERE config ? 'tournament'
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}

async function loadTournamentRows(db: pg.Pool, options: LoadOptions): Promise<TournamentGameRow[]> {
  const { rows } = await db.query<{
    black_engine_id: string | null;
    game_id: string;
    game_index: number;
    job_id: string;
    ply_count: number | null;
    result: 'white-wins' | 'black-wins' | 'red-wins' | 'draw' | null;
    runtime_payload: Record<string, unknown> | null;
    status: string;
    termination: string | null;
    white_engine_id: string | null;
  }>(
    `SELECT
       eve_game.game_id,
       eve_game.job_id,
       eve_game.game_index,
       eve_game.white_engine_id,
       eve_game.black_engine_id,
       game.status,
       game.result,
       game.termination,
       game.ply_count,
       runtime.payload AS runtime_payload
     FROM eve_games eve_game
     JOIN games game ON game.room_id = eve_game.game_id
     JOIN eve_jobs job ON job.id = eve_game.job_id
     LEFT JOIN LATERAL (
       SELECT payload
       FROM game_debug_artifacts artifact
       WHERE artifact.game_id = eve_game.game_id
         AND artifact.artifact_type = 'engine-runtime-summary'
       ORDER BY artifact.created_at DESC
       LIMIT 1
     ) runtime ON true
     WHERE ($1::text IS NULL OR eve_game.job_id = $1)
       AND ($2::text IS NULL OR job.config->'tournament'->>'id' = $2)
       AND ($1::text IS NOT NULL OR $2::text IS NOT NULL OR job.config ? 'tournament')
     ORDER BY eve_game.job_id, eve_game.game_index`,
    [options.jobId, options.tournamentId],
  );
  return rows.map((row) => ({
    blackEngineId: row.black_engine_id,
    gameId: row.game_id,
    gameIndex: row.game_index,
    jobId: row.job_id,
    plyCount: row.ply_count,
    result: row.result,
    runtime: parseRuntime(row.runtime_payload),
    status: row.status,
    termination: row.termination,
    whiteEngineId: row.white_engine_id,
  }));
}

function parseRuntime(value: Record<string, unknown> | null): TournamentGameRow['runtime'] {
  if (!value) return null;
  return {
    plies_per_second: numeric(value.plies_per_second),
    runner: typeof value.runner === 'string' ? value.runner : null,
    wall_ms: numeric(value.wall_ms),
  };
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseArgs(values: string[]): StatusArgs {
  const parsed: StatusArgs = {};
  for (let index = 0; index < values.length; index++) {
    const arg = values[index]!;
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const value = inlineValue ?? values[++index];
    if (!value) throw new Error(`missing value for --${rawKey}`);
    switch (rawKey) {
      case 'format':
        if (value !== 'json' && value !== 'markdown')
          throw new Error('--format must be json or markdown');
        parsed.format = value;
        break;
      case 'job':
      case 'job-id':
        parsed.jobId = value;
        break;
      case 'tournament':
      case 'tournament-id':
        parsed.tournamentId = value;
        break;
      default:
        throw new Error(`unknown argument --${rawKey}`);
    }
  }
  return parsed;
}
