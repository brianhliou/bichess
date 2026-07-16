import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRoundRobinPairings,
  nextTournamentSeed,
  pairingOpeningPolicy,
  parseTournamentArgs,
  tournamentJobConfig,
} from './engine-tournament.js';

test('creates color-balanced round-robin pairings', () => {
  const pairings = createRoundRobinPairings({
    engines: ['a', 'b', 'c'],
    gamesPerPair: 2,
  });

  assert.equal(pairings.length, 6);
  assert.deepEqual(
    pairings.map((pairing) => [pairing.whiteEngineId, pairing.blackEngineId]),
    [
      ['a', 'b'],
      ['b', 'a'],
      ['a', 'c'],
      ['c', 'a'],
      ['b', 'c'],
      ['c', 'b'],
    ],
  );
  assert.deepEqual(
    pairings.map((pairing) => pairing.openingIndex),
    [0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    pairings.map((pairing) => pairing.gameIndex),
    [0, 1, 2, 3, 4, 5],
  );
});

test('parses tournament CLI config', () => {
  const config = parseTournamentArgs(
    [
      '--engines',
      'builtin-random-legal,builtin-capture-seeker',
      '--games-per-pair',
      '4',
      '--time-control',
      '10+2',
      '--opening',
      'random-first-4',
      '--providers',
      'local',
      '--rated',
      '--rating-anchor',
      'python-random-legal',
      '--tournament-id',
      'dev-cup',
    ],
    {},
  );

  assert.equal(config.gamesPerPair, 4);
  assert.deepEqual(config.providers, ['local']);
  assert.deepEqual(config.timeControl, {
    kind: 'standard',
    initial_seconds: 10,
    increment_seconds: 2,
  });
  assert.deepEqual(config.openingPolicy, { kind: 'random_first_n_plies', n: 4 });
  assert.equal(config.rated, true);
  assert.equal(config.ratingAnchorEngineId, 'python-random-legal');
  assert.equal(config.ratingMinAnchorGames, 8);
  assert.equal(config.ratingAnchorEngineId, 'python-random-legal');
  assert.equal(config.variant, 'dark-chess');
});

test('defaults tournament CLI time control to standard 3+2', () => {
  const config = parseTournamentArgs(
    ['--engine', 'builtin-random-legal', '--engine', 'builtin-capture-seeker'],
    {},
  );

  assert.deepEqual(config.timeControl, {
    kind: 'standard',
    initial_seconds: 180,
    increment_seconds: 2,
  });
  assert.equal(config.variant, 'dark-chess');
});

test('builds reproducible tournament job metadata', () => {
  const config = parseTournamentArgs(
    ['--engine', 'a', '--engine', 'b', '--seed', '100', '--tournament-id', 'server-cup'],
    {},
  );
  const jobConfig = tournamentJobConfig(config, 2);

  assert.equal(nextTournamentSeed(config.seed, 3), '103');
  assert.deepEqual(jobConfig.tournament, {
    id: 'server-cup',
    format: 'round-robin',
    engines: ['a', 'b'],
    games_per_pair: 2,
    color_policy: 'alternate-by-repeat',
  });
  assert.deepEqual(jobConfig.rating_policy, {
    rated: false,
    method: 'anchor-relative-smoothed-logit-v1',
    anchor_engine_id: 'python-random-legal',
    min_anchor_games: 8,
    excluded_terminations: ['truncated'],
    pool: {
      variant: 'dark-chess',
      time_control_bucket: 'tc-180+2',
    },
  });
});

test('uses the tournament variant in the rating pool', () => {
  const config = parseTournamentArgs(
    ['--engine', 'a', '--engine', 'b', '--variant', 'xiangqi'],
    {},
  );
  const jobConfig = tournamentJobConfig(config, 2);
  assert.equal((jobConfig.rating_policy as { pool: { variant: string } }).pool.variant, 'xiangqi');
  assert.deepEqual(config.timeControl, { kind: 'none' });
  assert.equal(config.ratingAnchorEngineId, 'a');
});

test('assigns identical opening seeds to color-swapped games', () => {
  const pairings = createRoundRobinPairings({ engines: ['a', 'b'], gamesPerPair: 4 });
  assert.deepEqual(
    pairings.map((pairing) =>
      pairingOpeningPolicy({ kind: 'random_first_n_plies', n: 6 }, '50', pairing),
    ),
    [
      { kind: 'random_first_n_plies', n: 6, seed: '50' },
      { kind: 'random_first_n_plies', n: 6, seed: '50' },
      { kind: 'random_first_n_plies', n: 6, seed: '51' },
      { kind: 'random_first_n_plies', n: 6, seed: '51' },
    ],
  );
});

test('rejects an unpaired random-opening game count', () => {
  assert.throws(
    () =>
      parseTournamentArgs(
        ['--engine', 'a', '--engine', 'b', '--games-per-pair', '3', '--opening', 'random-first-4'],
        {},
      ),
    /even --games-per-pair/,
  );
});
