import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTournamentReport,
  renderTournamentReportMarkdown,
  type TournamentGameRow,
} from './engine-tournament-report.js';

test('builds tournament standings from completed EvE games', () => {
  const report = buildTournamentReport([
    row({ gameIndex: 0, whiteEngineId: 'a', blackEngineId: 'b', result: 'white-wins' }),
    row({ gameIndex: 1, whiteEngineId: 'b', blackEngineId: 'a', result: 'draw' }),
    row({ gameIndex: 2, whiteEngineId: 'a', blackEngineId: 'c', result: 'black-wins' }),
    row({ gameIndex: 3, whiteEngineId: 'c', blackEngineId: 'a', result: null, status: 'running' }),
  ]);

  assert.equal(report.completedGames, 3);
  assert.equal(report.incompleteGames, 1);
  assert.deepEqual(
    report.standings.map((standing) => ({
      engineId: standing.engineId,
      games: standing.games,
      score: standing.score,
      wins: standing.wins,
      losses: standing.losses,
      draws: standing.draws,
    })),
    [
      { engineId: 'a', games: 3, score: 1.5, wins: 1, losses: 1, draws: 1 },
      { engineId: 'c', games: 1, score: 1, wins: 1, losses: 0, draws: 0 },
      { engineId: 'b', games: 2, score: 0.5, wins: 0, losses: 1, draws: 1 },
    ],
  );
});

test('summarizes tournament runtime by runner', () => {
  const report = buildTournamentReport([
    row({
      gameIndex: 0,
      runtime: { runner: 'typescript-in-process', wall_ms: 1000, plies_per_second: 10 },
    }),
    row({
      gameIndex: 1,
      runtime: { runner: 'typescript-in-process', wall_ms: 3000, plies_per_second: 20 },
    }),
    row({
      gameIndex: 2,
      runtime: { runner: 'python-subprocess', wall_ms: 9000, plies_per_second: 2 },
    }),
  ]);

  assert.deepEqual(report.runtimeSummaries, [
    { runner: 'typescript-in-process', games: 2, avgWallMs: 2000, avgPliesPerSecond: 15 },
    { runner: 'python-subprocess', games: 1, avgWallMs: 9000, avgPliesPerSecond: 2 },
  ]);
});

test('scores a Xiangqi red win for the first-mover Eve slot', () => {
  const report = buildTournamentReport([
    row({
      gameIndex: 0,
      whiteEngineId: 'red-engine',
      blackEngineId: 'black-engine',
      result: 'red-wins',
    }),
  ]);
  assert.equal(report.standings.find((standing) => standing.engineId === 'red-engine')?.wins, 1);
  assert.equal(
    report.standings.find((standing) => standing.engineId === 'black-engine')?.losses,
    1,
  );
});

test('renders compact markdown status', () => {
  const report = buildTournamentReport([
    row({ gameIndex: 0, whiteEngineId: 'a', blackEngineId: 'b', result: 'white-wins' }),
  ]);
  const markdown = renderTournamentReportMarkdown(report);

  assert.match(markdown, /games: 1\/1 completed/);
  assert.match(markdown, /`a`/);
  assert.match(markdown, /1-0-0/);
});

function row(overrides: Partial<TournamentGameRow>): TournamentGameRow {
  return {
    blackEngineId: 'b',
    gameId: `game-${overrides.gameIndex ?? 0}`,
    gameIndex: 0,
    jobId: 'job',
    plyCount: 12,
    result: 'white-wins',
    runtime: null,
    status: 'completed',
    termination: 'king-captured',
    whiteEngineId: 'a',
    ...overrides,
  };
}
