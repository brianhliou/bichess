export type TournamentGameRow = {
  blackEngineId: string | null;
  gameId: string;
  gameIndex: number;
  jobId: string;
  plyCount: number | null;
  result: 'white-wins' | 'black-wins' | 'red-wins' | 'draw' | null;
  runtime?: {
    plies_per_second?: number | null;
    runner?: string | null;
    wall_ms?: number | null;
  } | null;
  status: string;
  termination: string | null;
  whiteEngineId: string | null;
};

export type TournamentStanding = {
  draws: number;
  engineId: string;
  games: number;
  losses: number;
  score: number;
  scoreRate: number;
  wins: number;
};

export type TournamentPairSummary = {
  draws: number;
  engines: [string, string];
  games: number;
  scores: Record<string, number>;
};

export type TournamentRuntimeSummary = {
  avgPliesPerSecond: number | null;
  avgWallMs: number | null;
  games: number;
  runner: string;
};

export type TournamentReport = {
  completedGames: number;
  games: TournamentGameRow[];
  incompleteGames: number;
  pairSummaries: TournamentPairSummary[];
  runtimeSummaries: TournamentRuntimeSummary[];
  standings: TournamentStanding[];
  totalGames: number;
};

type MutableStanding = Omit<TournamentStanding, 'scoreRate'>;

export function buildTournamentReport(rows: TournamentGameRow[]): TournamentReport {
  const standings = new Map<string, MutableStanding>();
  const pairSummaries = new Map<string, TournamentPairSummary>();
  const runtimes = new Map<
    string,
    {
      games: number;
      pliesPerSecondTotal: number;
      pliesPerSecondCount: number;
      wallMsTotal: number;
      wallMsCount: number;
    }
  >();
  let completedGames = 0;

  for (const row of rows) {
    const white = row.whiteEngineId;
    const black = row.blackEngineId;
    if (!white || !black) continue;
    ensureStanding(standings, white);
    ensureStanding(standings, black);

    if (row.status !== 'completed' || row.result === null) continue;
    completedGames += 1;

    const [whiteScore, blackScore] = scoresForResult(row.result);
    recordStanding(standings.get(white)!, whiteScore);
    recordStanding(standings.get(black)!, blackScore);
    recordPair(pairSummaries, white, black, whiteScore, blackScore);
    recordRuntime(runtimes, row.runtime);
  }

  return {
    completedGames,
    games: rows,
    incompleteGames: rows.length - completedGames,
    pairSummaries: [...pairSummaries.values()].sort((a, b) =>
      a.engines.join('|').localeCompare(b.engines.join('|')),
    ),
    runtimeSummaries: [...runtimes.entries()]
      .map(([runner, runtime]) => ({
        runner,
        games: runtime.games,
        avgPliesPerSecond:
          runtime.pliesPerSecondCount > 0
            ? runtime.pliesPerSecondTotal / runtime.pliesPerSecondCount
            : null,
        avgWallMs: runtime.wallMsCount > 0 ? runtime.wallMsTotal / runtime.wallMsCount : null,
      }))
      .sort((a, b) => b.games - a.games || a.runner.localeCompare(b.runner)),
    standings: [...standings.values()]
      .map((standing) => ({
        ...standing,
        scoreRate: standing.games > 0 ? standing.score / standing.games : 0,
      }))
      .sort(
        (a, b) =>
          b.score - a.score || b.scoreRate - a.scoreRate || a.engineId.localeCompare(b.engineId),
      ),
    totalGames: rows.length,
  };
}

export function renderTournamentReportMarkdown(report: TournamentReport): string {
  const lines = [
    `games: ${report.completedGames}/${report.totalGames} completed`,
    '',
    '| Engine | Games | W-L-D | Score | Score rate |',
    '|---|---:|---:|---:|---:|',
  ];
  for (const row of report.standings) {
    lines.push(
      `| \`${row.engineId}\` | ${row.games} | ${row.wins}-${row.losses}-${row.draws} | ${formatScore(row.score)} | ${row.scoreRate.toFixed(3)} |`,
    );
  }
  if (report.runtimeSummaries.length > 0) {
    lines.push('', '| Runner | Games | Avg wall ms | Avg plies/sec |', '|---|---:|---:|---:|');
    for (const runtime of report.runtimeSummaries) {
      lines.push(
        `| \`${runtime.runner}\` | ${runtime.games} | ${formatNullable(runtime.avgWallMs, 0)} | ${formatNullable(runtime.avgPliesPerSecond, 3)} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function ensureStanding(standings: Map<string, MutableStanding>, engineId: string): void {
  if (standings.has(engineId)) return;
  standings.set(engineId, {
    draws: 0,
    engineId,
    games: 0,
    losses: 0,
    score: 0,
    wins: 0,
  });
}

function recordStanding(standing: MutableStanding, score: number): void {
  standing.games += 1;
  standing.score += score;
  if (score === 1) standing.wins += 1;
  else if (score === 0) standing.losses += 1;
  else standing.draws += 1;
}

function recordPair(
  pairSummaries: Map<string, TournamentPairSummary>,
  white: string,
  black: string,
  whiteScore: number,
  blackScore: number,
): void {
  const engines = [white, black].sort() as [string, string];
  const key = engines.join('|');
  const pair = pairSummaries.get(key) ?? {
    draws: 0,
    engines,
    games: 0,
    scores: { [engines[0]]: 0, [engines[1]]: 0 },
  };
  pair.games += 1;
  pair.scores[white] = (pair.scores[white] ?? 0) + whiteScore;
  pair.scores[black] = (pair.scores[black] ?? 0) + blackScore;
  if (whiteScore === 0.5 && blackScore === 0.5) pair.draws += 1;
  pairSummaries.set(key, pair);
}

function recordRuntime(
  runtimes: Map<
    string,
    {
      games: number;
      pliesPerSecondTotal: number;
      pliesPerSecondCount: number;
      wallMsTotal: number;
      wallMsCount: number;
    }
  >,
  runtime: TournamentGameRow['runtime'],
): void {
  const runner = runtime?.runner ?? null;
  if (!runner) return;
  const summary = runtimes.get(runner) ?? {
    games: 0,
    pliesPerSecondTotal: 0,
    pliesPerSecondCount: 0,
    wallMsTotal: 0,
    wallMsCount: 0,
  };
  summary.games += 1;
  if (typeof runtime?.plies_per_second === 'number' && Number.isFinite(runtime.plies_per_second)) {
    summary.pliesPerSecondTotal += runtime.plies_per_second;
    summary.pliesPerSecondCount += 1;
  }
  if (typeof runtime?.wall_ms === 'number' && Number.isFinite(runtime.wall_ms)) {
    summary.wallMsTotal += runtime.wall_ms;
    summary.wallMsCount += 1;
  }
  runtimes.set(runner, summary);
}

function scoresForResult(result: NonNullable<TournamentGameRow['result']>): [number, number] {
  // The legacy Eve columns call the first-mover slot "white"; in Xiangqi that
  // same slot is Red and the game result correctly uses red-wins.
  if (result === 'white-wins' || result === 'red-wins') return [1, 0];
  if (result === 'black-wins') return [0, 1];
  return [0.5, 0.5];
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatNullable(value: number | null, fractionDigits: number): string {
  return value === null ? '-' : value.toFixed(fractionDigits);
}
