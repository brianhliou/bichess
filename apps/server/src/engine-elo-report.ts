import pg from 'pg';
import { normalizeEngineTimeControl, timeControlBucket } from './engine-time-policy.js';

const DEFAULT_ANCHOR_ENGINE_ID = 'python-random-legal';
const DEFAULT_MIN_ANCHOR_GAMES = 8;
const DEFAULT_EXCLUDED_TERMINATIONS = ['truncated'];

export type EngineEloGameRow = {
  anchorEngineId: string | null;
  blackEngineId: string | null;
  gameId: string;
  jobId: string;
  result: 'white-wins' | 'black-wins' | 'red-wins' | 'draw' | null;
  status: string;
  termination: string | null;
  timeControl: Record<string, unknown>;
  tournamentId: string | null;
  variant: string;
  whiteEngineId: string | null;
};

export type EngineEloRow = {
  ciSimple: number | null;
  ciWilson: number | null;
  draws: number;
  elo: number | null;
  engineId: string;
  games: number;
  isAnchor: boolean;
  losses: number;
  score: number;
  scoreRate: number;
  status: 'rated' | 'anchor' | 'below-floor' | 'no-anchor-games';
  wins: number;
};

export type EngineEloReport = {
  anchorEngineId: string;
  eligibleGames: number;
  excludedGames: number;
  minAnchorGames: number;
  rows: EngineEloRow[];
  timeControlBucket: string | null;
  totalRatedGames: number;
  variant: string | null;
};

export type EngineEloReportOptions = {
  anchorEngineId?: string;
  excludedTerminations?: string[];
  minAnchorGames?: number;
};

type MutableRecord = {
  draws: number;
  games: number;
  losses: number;
  score: number;
  wins: number;
};

export function buildEngineEloReport(
  rows: EngineEloGameRow[],
  options: EngineEloReportOptions = {},
): EngineEloReport {
  const anchorEngineId = options.anchorEngineId ?? DEFAULT_ANCHOR_ENGINE_ID;
  const minAnchorGames = options.minAnchorGames ?? DEFAULT_MIN_ANCHOR_GAMES;
  const excludedTerminations = new Set(
    options.excludedTerminations ?? DEFAULT_EXCLUDED_TERMINATIONS,
  );
  const variants = new Set(rows.map((row) => row.variant));
  const buckets = new Set(
    rows.map((row) => timeControlBucket(normalizeEngineTimeControl(row.timeControl))),
  );
  if (variants.size > 1)
    throw new Error(`rated Elo report cannot mix variants: ${[...variants].sort().join(', ')}`);
  if (buckets.size > 1)
    throw new Error(
      `rated Elo report cannot mix time-control buckets: ${[...buckets].sort().join(', ')}`,
    );

  const allEngines = new Set<string>();
  const anchor = emptyRecord();
  const h2h = new Map<string, MutableRecord>();
  let eligibleGames = 0;
  let excludedGames = 0;

  for (const row of rows) {
    if (row.whiteEngineId) allEngines.add(row.whiteEngineId);
    if (row.blackEngineId) allEngines.add(row.blackEngineId);
    if (!isEligibleResult(row, excludedTerminations)) {
      excludedGames += 1;
      continue;
    }
    eligibleGames += 1;
    const white = row.whiteEngineId;
    const black = row.blackEngineId;
    if (!white || !black || !row.result) continue;

    if (white === anchorEngineId || black === anchorEngineId) {
      const anchorScore = scoreForSlot(
        row.result,
        white === anchorEngineId ? 'white' : 'black',
        row.variant,
      );
      record(anchor, anchorScore);
      const otherEngine = white === anchorEngineId ? black : white;
      const otherScore = 1 - anchorScore;
      record(recordFor(h2h, otherEngine), otherScore);
    }
  }

  const reportRows: EngineEloRow[] = [];
  if (allEngines.has(anchorEngineId) || anchor.games > 0) {
    reportRows.push({
      ...rowFromRecord(anchorEngineId, anchor),
      ciSimple: null,
      ciWilson: null,
      elo: 0,
      isAnchor: true,
      status: 'anchor',
    });
  }

  for (const engineId of [...allEngines].sort()) {
    if (engineId === anchorEngineId) continue;
    const record = h2h.get(engineId) ?? emptyRecord();
    const base = rowFromRecord(engineId, record);
    if (record.games === 0) {
      reportRows.push({
        ...base,
        ciSimple: null,
        ciWilson: null,
        elo: null,
        isAnchor: false,
        status: 'no-anchor-games',
      });
      continue;
    }
    if (record.games < minAnchorGames) {
      reportRows.push({
        ...base,
        ciSimple: 400 / Math.sqrt(record.games),
        ciWilson: wilsonEloCi(record.score, record.games),
        elo: null,
        isAnchor: false,
        status: 'below-floor',
      });
      continue;
    }
    reportRows.push({
      ...base,
      ciSimple: 400 / Math.sqrt(record.games),
      ciWilson: wilsonEloCi(record.score, record.games),
      elo: scoreToElo(smoothedScore(record.score, record.games)),
      isAnchor: false,
      status: 'rated',
    });
  }

  reportRows.sort((a, b) => {
    if (a.isAnchor !== b.isAnchor) return a.isAnchor ? 1 : -1;
    if (a.elo !== null && b.elo !== null && a.elo !== b.elo) return b.elo - a.elo;
    if (a.score !== b.score) return b.score - a.score;
    if (a.games !== b.games) return b.games - a.games;
    return a.engineId.localeCompare(b.engineId);
  });

  return {
    anchorEngineId,
    eligibleGames,
    excludedGames,
    minAnchorGames,
    rows: reportRows,
    timeControlBucket: buckets.size === 1 ? [...buckets][0]! : null,
    totalRatedGames: rows.length,
    variant: variants.size === 1 ? [...variants][0]! : null,
  };
}

export function renderEngineEloReportMarkdown(report: EngineEloReport): string {
  const lines = [
    `rated games: ${report.eligibleGames}/${report.totalRatedGames} eligible (${report.excludedGames} excluded)`,
    `pool: ${report.variant ?? '-'} / ${report.timeControlBucket ?? '-'}`,
    `anchor: \`${report.anchorEngineId}\` = 0 Elo; floor: ${report.minAnchorGames} anchor games`,
    '',
    '| Engine | Anchor games | W-L-D | Score | Elo | Wilson CI | Simple CI | Status |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const row of report.rows) {
    lines.push(
      `| \`${row.engineId}\` | ${row.games} | ${row.wins}-${row.losses}-${row.draws} | ` +
        `${row.scoreRate.toFixed(3)} | ${formatElo(row)} | ${formatCi(row.ciWilson)} | ` +
        `${formatCi(row.ciSimple)} | ${row.status} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function loadRatedEngineEloRows(
  db: pg.Pool,
  filters: {
    jobId?: string | null;
    tournamentId?: string | null;
    timeControlBucket?: string | null;
  },
): Promise<EngineEloGameRow[]> {
  const { rows } = await db.query<{
    black_engine_id: string | null;
    game_id: string;
    job_id: string;
    result: 'white-wins' | 'black-wins' | 'red-wins' | 'draw' | null;
    status: string;
    termination: string | null;
    time_control: Record<string, unknown>;
    tournament_id: string | null;
    anchor_engine_id: string | null;
    variant: string;
    white_engine_id: string | null;
  }>(
    `SELECT
       eve_game.game_id,
       eve_game.job_id,
       eve_game.white_engine_id,
       eve_game.black_engine_id,
       eve_game.time_control,
       job.config->'tournament'->>'id' AS tournament_id,
       job.config->'rating_policy'->>'anchor_engine_id' AS anchor_engine_id,
       game.variant,
       game.status,
       game.result,
       game.termination
     FROM eve_games eve_game
     JOIN eve_jobs job ON job.id = eve_game.job_id
     JOIN games game ON game.room_id = eve_game.game_id
     WHERE job.config->'rating_policy'->>'rated' = 'true'
       AND ($1::text IS NULL OR eve_game.job_id = $1)
       AND ($2::text IS NULL OR job.config->'tournament'->>'id' = $2)
     ORDER BY eve_game.job_id, eve_game.game_index`,
    [filters.jobId ?? null, filters.tournamentId ?? null],
  );
  return rows
    .map((row) => ({
      anchorEngineId: row.anchor_engine_id,
      blackEngineId: row.black_engine_id,
      gameId: row.game_id,
      jobId: row.job_id,
      result: row.result,
      status: row.status,
      termination: row.termination,
      timeControl: row.time_control,
      tournamentId: row.tournament_id,
      variant: row.variant,
      whiteEngineId: row.white_engine_id,
    }))
    .filter((row) => {
      if (!filters.timeControlBucket) return true;
      return (
        timeControlBucket(normalizeEngineTimeControl(row.timeControl)) === filters.timeControlBucket
      );
    });
}

type CliArgs = {
  anchorEngineId?: string;
  format?: 'json' | 'markdown';
  jobId?: string;
  minAnchorGames?: number;
  timeControlBucket?: string;
  tournamentId?: string;
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to inspect engine Elo');
  const args = parseArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const rows = await loadRatedEngineEloRows(pool, {
      jobId: args.jobId ?? process.env.ENGINE_QUEUE_JOB_ID ?? null,
      tournamentId: args.tournamentId ?? process.env.ENGINE_TOURNAMENT_ID ?? null,
      timeControlBucket:
        args.timeControlBucket ?? process.env.ENGINE_RATING_TIME_CONTROL_BUCKET ?? null,
    });
    const report = buildEngineEloReport(rows, {
      // Precedence: explicit CLI/env override > the anchor the rated jobs
      // recorded in their rating_policy > the global default. Reading it back
      // from the jobs means variant pools (xiangqi anchors on FSF-1 / the random
      // floor bot) rate correctly without passing --anchor by hand.
      anchorEngineId:
        args.anchorEngineId ??
        process.env.ENGINE_RATING_ANCHOR ??
        deriveAnchorEngineId(rows) ??
        DEFAULT_ANCHOR_ENGINE_ID,
      minAnchorGames:
        args.minAnchorGames ??
        positiveInteger(process.env.ENGINE_RATING_MIN_ANCHOR_GAMES, DEFAULT_MIN_ANCHOR_GAMES),
    });
    if ((args.format ?? 'json') === 'markdown') {
      process.stdout.write(renderEngineEloReportMarkdown(report));
    } else {
      console.log(JSON.stringify({ level: 'info', kind: 'engine_elo_report', ...report }, null, 2));
    }
  } finally {
    await pool.end();
  }
}

// The anchor the rated jobs agreed on, if there is exactly one. Returns null when
// no job recorded an anchor or the pool mixes anchors (then the caller falls back
// to an explicit override or the global default rather than guessing).
export function deriveAnchorEngineId(rows: EngineEloGameRow[]): string | null {
  const anchors = new Set(
    rows.map((row) => row.anchorEngineId).filter((id): id is string => id !== null),
  );
  return anchors.size === 1 ? [...anchors][0]! : null;
}

function isEligibleResult(row: EngineEloGameRow, excludedTerminations: Set<string>): boolean {
  return (
    row.status === 'completed' &&
    row.result !== null &&
    row.termination !== null &&
    !excludedTerminations.has(row.termination)
  );
}

function scoreForSlot(
  result: NonNullable<EngineEloGameRow['result']>,
  slot: 'white' | 'black',
  variant: string,
): number {
  if (result === 'draw') return 0.5;
  // eve_games predates red/black families and names its first-mover slot
  // white_engine_id. For Xiangqi-family results, that slot is Red.
  const winningSlot =
    result === 'red-wins' && variant === 'xiangqi' ? 'white' : result.split('-')[0];
  return winningSlot === slot ? 1 : 0;
}

function emptyRecord(): MutableRecord {
  return { draws: 0, games: 0, losses: 0, score: 0, wins: 0 };
}

function recordFor(records: Map<string, MutableRecord>, engineId: string): MutableRecord {
  const existing = records.get(engineId);
  if (existing) return existing;
  const created = emptyRecord();
  records.set(engineId, created);
  return created;
}

function record(target: MutableRecord, score: number): void {
  target.games += 1;
  target.score += score;
  if (score === 1) target.wins += 1;
  else if (score === 0) target.losses += 1;
  else target.draws += 1;
}

function rowFromRecord(
  engineId: string,
  record: MutableRecord,
): Omit<EngineEloRow, 'ciSimple' | 'ciWilson' | 'elo' | 'isAnchor' | 'status'> {
  return {
    draws: record.draws,
    engineId,
    games: record.games,
    losses: record.losses,
    score: record.score,
    scoreRate: record.games > 0 ? record.score / record.games : 0,
    wins: record.wins,
  };
}

function smoothedScore(score: number, games: number): number {
  return (score + 0.5) / (games + 1);
}

function scoreToElo(score: number): number {
  const clamped = Math.max(1e-6, Math.min(1 - 1e-6, score));
  return -400 * Math.log10(1 / clamped - 1);
}

function wilsonEloCi(score: number, games: number): number {
  if (games <= 0) return Number.POSITIVE_INFINITY;
  const p = score / games;
  const z = 1.96;
  const denominator = 1 + z ** 2 / games;
  const center = (p + z ** 2 / (2 * games)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * games)) / games)) / denominator;
  const lower = Math.max(1e-6, center - half);
  const upper = Math.min(1 - 1e-6, center + half);
  return (scoreToElo(upper) - scoreToElo(lower)) / 2;
}

function formatElo(row: EngineEloRow): string {
  if (row.isAnchor) return '0';
  if (row.elo === null) return '-';
  return `${row.elo >= 0 ? '+' : ''}${row.elo.toFixed(0)}`;
}

function formatCi(value: number | null): string {
  if (value === null) return '-';
  if (!Number.isFinite(value)) return 'inf';
  return `±${value.toFixed(0)}`;
}

function parseArgs(values: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < values.length; index++) {
    const arg = values[index]!;
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const value = inlineValue ?? values[++index];
    if (!value) throw new Error(`missing value for --${rawKey}`);
    switch (rawKey) {
      case 'anchor':
      case 'anchor-engine':
        parsed.anchorEngineId = value;
        break;
      case 'format':
        if (value !== 'json' && value !== 'markdown')
          throw new Error('--format must be json or markdown');
        parsed.format = value;
        break;
      case 'job':
      case 'job-id':
        parsed.jobId = value;
        break;
      case 'min-anchor-games':
        parsed.minAnchorGames = positiveInteger(value, DEFAULT_MIN_ANCHOR_GAMES);
        break;
      case 'time-control-bucket':
        parsed.timeControlBucket = value;
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

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
