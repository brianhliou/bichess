import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEngineEloReport,
  deriveAnchorEngineId,
  type EngineEloGameRow,
  renderEngineEloReportMarkdown,
} from './engine-elo-report.js';

test('scores Xiangqi red-wins as a win for the first-mover Eve slot', () => {
  const report = buildEngineEloReport(
    [
      {
        anchorEngineId: 'pikafish-xiangqi-level-1',
        blackEngineId: 'pikafish-xiangqi-level-3',
        gameId: 'xq-eve-1',
        jobId: 'job-xq',
        result: 'red-wins',
        status: 'completed',
        termination: 'checkmate',
        timeControl: { kind: 'standard', initial_seconds: 180, increment_seconds: 2 },
        tournamentId: 'xq-calibration',
        variant: 'xiangqi',
        whiteEngineId: 'pikafish-xiangqi-level-1',
      },
    ],
    { anchorEngineId: 'pikafish-xiangqi-level-1', minAnchorGames: 1 },
  );

  assert.equal(report.rows.find((row) => row.isAnchor)?.wins, 1);
  assert.equal(report.rows.find((row) => row.engineId.endsWith('level-3'))?.losses, 1);
});

test('builds anchor-relative Elo only from eligible rated games', () => {
  const report = buildEngineEloReport(
    [
      game({
        whiteEngineId: 'candidate',
        blackEngineId: 'python-random-legal',
        result: 'white-wins',
      }),
      game({
        whiteEngineId: 'python-random-legal',
        blackEngineId: 'candidate',
        result: 'black-wins',
      }),
      game({ whiteEngineId: 'candidate', blackEngineId: 'python-random-legal', result: 'draw' }),
      game({ whiteEngineId: 'candidate', blackEngineId: 'other', result: 'white-wins' }),
      game({
        whiteEngineId: 'candidate',
        blackEngineId: 'python-random-legal',
        result: 'draw',
        termination: 'truncated',
      }),
    ],
    { minAnchorGames: 3 },
  );

  assert.equal(report.totalRatedGames, 5);
  assert.equal(report.eligibleGames, 4);
  assert.equal(report.excludedGames, 1);
  assert.equal(report.timeControlBucket, 'tc-180+2');
  assert.equal(report.variant, 'dark-chess');

  const candidate = report.rows.find((row) => row.engineId === 'candidate');
  assert.equal(candidate?.status, 'rated');
  assert.equal(candidate?.games, 3);
  assert.equal(candidate?.score, 2.5);
  assert.equal(candidate?.wins, 2);
  assert.equal(candidate?.draws, 1);
  assert.equal(typeof candidate?.elo, 'number');

  const other = report.rows.find((row) => row.engineId === 'other');
  assert.equal(other?.status, 'no-anchor-games');
  assert.equal(other?.elo, null);
});

test('suppresses Elo below the anchor-game floor', () => {
  const report = buildEngineEloReport(
    [
      game({
        whiteEngineId: 'candidate',
        blackEngineId: 'python-random-legal',
        result: 'white-wins',
      }),
      game({
        whiteEngineId: 'python-random-legal',
        blackEngineId: 'candidate',
        result: 'black-wins',
      }),
    ],
    { minAnchorGames: 8 },
  );

  const candidate = report.rows.find((row) => row.engineId === 'candidate');
  assert.equal(candidate?.status, 'below-floor');
  assert.equal(candidate?.elo, null);
  assert.equal(candidate?.games, 2);

  const markdown = renderEngineEloReportMarkdown(report);
  assert.match(markdown, /floor: 8 anchor games/);
  assert.match(markdown, /below-floor/);
});

test('rejects mixed time-control buckets', () => {
  assert.throws(
    () =>
      buildEngineEloReport([
        game({ timeControl: { kind: 'standard', initial_seconds: 180, increment_seconds: 2 } }),
        game({ timeControl: { kind: 'standard', initial_seconds: 60, increment_seconds: 1 } }),
      ]),
    /cannot mix time-control buckets/,
  );
});

test('deriveAnchorEngineId returns the agreed anchor, null when absent or mixed', () => {
  assert.equal(
    deriveAnchorEngineId([
      game({ anchorEngineId: 'random-legal-xiangqi' }),
      game({ anchorEngineId: 'random-legal-xiangqi' }),
    ]),
    'random-legal-xiangqi',
  );
  assert.equal(deriveAnchorEngineId([game({ anchorEngineId: null })]), null);
  assert.equal(
    deriveAnchorEngineId([game({ anchorEngineId: 'a' }), game({ anchorEngineId: 'b' })]),
    null,
  );
});

function game(overrides: Partial<EngineEloGameRow> = {}): EngineEloGameRow {
  return {
    anchorEngineId: 'python-random-legal',
    blackEngineId: 'python-random-legal',
    gameId: `game-${Math.random()}`,
    jobId: 'job',
    result: 'white-wins',
    status: 'completed',
    termination: 'king-captured',
    timeControl: { kind: 'standard', initial_seconds: 180, increment_seconds: 2 },
    tournamentId: 'cup',
    variant: 'dark-chess',
    whiteEngineId: 'candidate',
    ...overrides,
  };
}
