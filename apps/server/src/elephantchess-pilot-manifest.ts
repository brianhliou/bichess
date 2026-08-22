import { createHash } from 'node:crypto';

export const ELEPHANTCHESS_PILOT_FORMAT = 'mistboard-elephantchess-pilot-v1';
export const ELEPHANTCHESS_PILOT_ELIGIBILITY_VERSION = 'elephantchess-pilot-eligible-v1';
export const ELEPHANTCHESS_DEFAULT_ELO = 1_000;

export type ElephantChessPilotGame = {
  historicalGameId: string;
  sourceGameId: string;
  importBatchId: string;
  plyCount: number;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  redEloBefore: number | null;
  blackEloBefore: number | null;
  timeControlCategory: string | null;
  ratingMode: string | null;
  redPlayerId: string | null;
  blackPlayerId: string | null;
};

export type ElephantChessPilotCohort = 'representative-live' | 'coverage-live' | 'correspondence';

export type ElephantChessPilotManifestItem = {
  selectionIndex: number;
  cohort: ElephantChessPilotCohort;
  historicalGameId: string;
  sourceGameId: string;
  averageElo: number | null;
  eloQuartile: string;
  timeControlCategory: string;
  ratingMode: string;
  result: ElephantChessPilotGame['result'];
  plyCount: number;
  lengthBand: string;
  representativeStratum: string;
  coverageBucket: string;
};

export type ElephantChessPilotDistributionRow = {
  bucket: string;
  eligible: number;
  selected: number;
  representativeLive: number;
  coverageLive: number;
  correspondence: number;
};

export type ElephantChessPilotManifest = {
  format: typeof ELEPHANTCHESS_PILOT_FORMAT;
  eligibilityVersion: typeof ELEPHANTCHESS_PILOT_ELIGIBILITY_VERSION;
  sourceSlug: 'elephantchess-pvp';
  importBatchId: string;
  seed: string;
  targets: {
    representativeLiveBase: number;
    coverageLive: number;
    correspondenceMax: number;
    total: number;
  };
  counts: {
    eligible: number;
    eligibleLive: number;
    eligibleCorrespondence: number;
    selected: number;
    representativeLive: number;
    coverageLive: number;
    correspondence: number;
  };
  eloStratification: {
    defaultRatingValue: typeof ELEPHANTCHESS_DEFAULT_ELO;
    quartilePopulation: 'at-least-one-non-default-rating';
    quartileCuts: [number, number, number] | null;
  };
  playerConcentration: {
    eligibleUniquePlayers: number;
    selectedUniquePlayers: number;
    eligibleMaxGamesPerPlayer: number;
    selectedMaxGamesPerPlayer: number;
  };
  distributions: {
    timeControlCategory: ElephantChessPilotDistributionRow[];
    eloQuartile: ElephantChessPilotDistributionRow[];
    result: ElephantChessPilotDistributionRow[];
    lengthBand: ElephantChessPilotDistributionRow[];
    ratingMode: ElephantChessPilotDistributionRow[];
    cohort: ElephantChessPilotDistributionRow[];
  };
  games: ElephantChessPilotManifestItem[];
  manifestSha256: string;
};

export type ElephantChessPilotTargets = {
  representativeLiveBase: number;
  coverageLive: number;
  correspondenceMax: number;
};

export const ELEPHANTCHESS_PILOT_DEFAULT_TARGETS: ElephantChessPilotTargets = {
  representativeLiveBase: 800,
  coverageLive: 100,
  correspondenceMax: 100,
};

// Targets that consume every eligible game instead of sampling 1,000 of them.
// Used when mining the remainder of an already-piloted corpus: there is no
// sampling decision left to make, so the cohorts only classify what is taken.
// The coverage cohort keeps its editorial role and is clamped to what the live
// population can spare.
export function maximalElephantChessPilotTargets(
  games: readonly ElephantChessPilotGame[],
  options: { coverageLive?: number } = {},
): ElephantChessPilotTargets {
  const correspondenceMax = games.filter((game) =>
    isCorrespondence(normalizedBucket(game.timeControlCategory)),
  ).length;
  const liveCount = games.length - correspondenceMax;
  const requestedCoverage =
    options.coverageLive ?? ELEPHANTCHESS_PILOT_DEFAULT_TARGETS.coverageLive;
  const coverageLive = Math.max(0, Math.min(requestedCoverage, liveCount));
  return {
    representativeLiveBase: liveCount - coverageLive,
    coverageLive,
    correspondenceMax,
  };
}

type EnrichedGame = ElephantChessPilotGame & {
  averageElo: number | null;
  eloQuartile: string;
  timeControl: string;
  rating: string;
  lengthBand: string;
  representativeStratum: string;
  coverageBucket: string;
  correspondence: boolean;
};

type SelectedGame = { game: EnrichedGame; cohort: ElephantChessPilotCohort };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function elephantChessPilotManifestSha256(
  manifest: Omit<ElephantChessPilotManifest, 'manifestSha256'>,
): string {
  return sha256(JSON.stringify(manifest));
}

export function verifyElephantChessPilotManifest(value: unknown): ElephantChessPilotManifest {
  if (!value || typeof value !== 'object') throw new Error('pilot manifest must be an object');
  const manifest = value as ElephantChessPilotManifest;
  if (manifest.format !== ELEPHANTCHESS_PILOT_FORMAT) {
    throw new Error(`unsupported pilot manifest format: ${String(manifest.format)}`);
  }
  if (manifest.eligibilityVersion !== ELEPHANTCHESS_PILOT_ELIGIBILITY_VERSION) {
    throw new Error(
      `unsupported pilot eligibility version: ${String(manifest.eligibilityVersion)}`,
    );
  }
  if (manifest.sourceSlug !== 'elephantchess-pvp') {
    throw new Error(`unsupported pilot source: ${String(manifest.sourceSlug)}`);
  }
  if (!Array.isArray(manifest.games)) throw new Error('pilot manifest games must be an array');
  if (manifest.games.length !== manifest.counts?.selected) {
    throw new Error('pilot manifest selected count does not match its ordered games');
  }
  for (const [index, game] of manifest.games.entries()) {
    if (game.selectionIndex !== index) {
      throw new Error(`pilot manifest selection index ${game.selectionIndex} is out of order`);
    }
  }
  const { manifestSha256, ...withoutHash } = manifest;
  const actual = elephantChessPilotManifestSha256(withoutHash);
  if (manifestSha256 !== actual) {
    throw new Error(
      `pilot manifest content hash mismatch: expected ${manifestSha256}, got ${actual}`,
    );
  }
  return manifest;
}

function normalizedBucket(value: string | null): string {
  const normalized = value?.trim().toUpperCase();
  return normalized || 'UNKNOWN';
}

function averageElo(game: ElephantChessPilotGame): number | null {
  const values = [game.redEloBefore, game.blackEloBefore].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function hasExactDefaultRatings(game: ElephantChessPilotGame): boolean {
  return (
    game.redEloBefore === ELEPHANTCHESS_DEFAULT_ELO &&
    game.blackEloBefore === ELEPHANTCHESS_DEFAULT_ELO
  );
}

function quartileCuts(values: readonly number[]): [number, number, number] | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.floor((sorted.length - 1) * q)] as number;
  return [at(0.25), at(0.5), at(0.75)];
}

function eloQuartile(value: number | null, cuts: [number, number, number] | null): string {
  if (value === null || !cuts) return 'UNKNOWN';
  if (value <= cuts[0]) return 'Q1';
  if (value <= cuts[1]) return 'Q2';
  if (value <= cuts[2]) return 'Q3';
  return 'Q4';
}

function gameLengthBand(plyCount: number): string {
  if (plyCount < 40) return 'SHORT_LT40';
  if (plyCount < 80) return 'STANDARD_40_79';
  if (plyCount < 120) return 'LONG_80_119';
  return 'VERY_LONG_120_PLUS';
}

function isCorrespondence(category: string): boolean {
  return category.includes('CORRESPONDENCE');
}

function deterministicOrder<T extends { historicalGameId: string }>(
  games: readonly T[],
  seed: string,
  salt: string,
): T[] {
  return [...games].sort((a, b) => {
    const aScore = sha256(`${seed}\0${salt}\0${a.historicalGameId}`);
    const bScore = sha256(`${seed}\0${salt}\0${b.historicalGameId}`);
    return aScore.localeCompare(bScore) || a.historicalGameId.localeCompare(b.historicalGameId);
  });
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function proportionalQuotas(
  groups: ReadonlyMap<string, readonly unknown[]>,
  target: number,
): Map<string, number> {
  const total = [...groups.values()].reduce((sum, group) => sum + group.length, 0);
  if (target > total)
    throw new Error(`representative target ${target} exceeds ${total} live games`);
  const rows = [...groups.entries()].map(([key, group]) => {
    const raw = (target * group.length) / total;
    return {
      key,
      capacity: group.length,
      quota: Math.floor(raw),
      remainder: raw - Math.floor(raw),
    };
  });
  let remaining = target - rows.reduce((sum, row) => sum + row.quota, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key));
  while (remaining > 0) {
    let progressed = false;
    for (const row of rows) {
      if (remaining === 0) break;
      if (row.quota >= row.capacity) continue;
      row.quota += 1;
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) throw new Error('could not allocate representative quotas');
  }
  return new Map(rows.map((row) => [row.key, row.quota]));
}

function selectRepresentative(
  games: readonly EnrichedGame[],
  target: number,
  seed: string,
): EnrichedGame[] {
  const groups = groupBy(games, (game) => game.representativeStratum);
  const quotas = proportionalQuotas(groups, target);
  return [...groups.entries()].flatMap(([key, group]) =>
    deterministicOrder(group, seed, `representative:${key}`).slice(0, quotas.get(key) ?? 0),
  );
}

function selectCoverage(
  games: readonly EnrichedGame[],
  target: number,
  seed: string,
): EnrichedGame[] {
  if (target > games.length)
    throw new Error(`coverage target ${target} exceeds ${games.length} remaining live games`);
  const buckets = [...groupBy(games, (game) => game.coverageBucket).entries()]
    .map(([key, group]) => ({
      key,
      games: deterministicOrder(group, seed, `coverage:${key}`),
      next: 0,
    }))
    .sort((a, b) => a.games.length - b.games.length || a.key.localeCompare(b.key));
  const selected: EnrichedGame[] = [];
  while (selected.length < target) {
    let progressed = false;
    for (const bucket of buckets) {
      if (selected.length === target) break;
      const game = bucket.games[bucket.next];
      if (!game) continue;
      selected.push(game);
      bucket.next += 1;
      progressed = true;
    }
    if (!progressed) throw new Error('could not fill coverage cohort');
  }
  return selected;
}

function distributionRows(
  eligible: readonly EnrichedGame[],
  selected: readonly SelectedGame[],
  bucketFor: (game: EnrichedGame, cohort?: ElephantChessPilotCohort) => string,
): ElephantChessPilotDistributionRow[] {
  const buckets = new Set<string>();
  for (const game of eligible) buckets.add(bucketFor(game));
  for (const item of selected) buckets.add(bucketFor(item.game, item.cohort));
  return [...buckets].sort().map((bucket) => ({
    bucket,
    eligible: eligible.filter((game) => bucketFor(game) === bucket).length,
    selected: selected.filter((item) => bucketFor(item.game, item.cohort) === bucket).length,
    representativeLive: selected.filter(
      (item) =>
        item.cohort === 'representative-live' && bucketFor(item.game, item.cohort) === bucket,
    ).length,
    coverageLive: selected.filter(
      (item) => item.cohort === 'coverage-live' && bucketFor(item.game, item.cohort) === bucket,
    ).length,
    correspondence: selected.filter(
      (item) => item.cohort === 'correspondence' && bucketFor(item.game, item.cohort) === bucket,
    ).length,
  }));
}

function playerConcentration(games: readonly ElephantChessPilotGame[]): {
  uniquePlayers: number;
  maxGamesPerPlayer: number;
} {
  const counts = new Map<string, number>();
  for (const game of games) {
    const players = new Set(
      [game.redPlayerId, game.blackPlayerId].filter((id): id is string => Boolean(id)),
    );
    for (const player of players) counts.set(player, (counts.get(player) ?? 0) + 1);
  }
  return {
    uniquePlayers: counts.size,
    maxGamesPerPlayer: Math.max(0, ...counts.values()),
  };
}

function enrichGames(games: readonly ElephantChessPilotGame[]): {
  games: EnrichedGame[];
  cuts: [number, number, number] | null;
} {
  const averages = games.map(averageElo);
  const exactDefaultRatings = games.map(hasExactDefaultRatings);
  const cuts = quartileCuts(
    averages.filter(
      (value, index): value is number => value !== null && !exactDefaultRatings[index],
    ),
  );
  return {
    cuts,
    games: games.map((game, index) => {
      const avg = averages[index] ?? null;
      const timeControl = normalizedBucket(game.timeControlCategory);
      const rating = normalizedBucket(game.ratingMode);
      // ElephantChess initializes both players at 1000. Keeping those games in
      // the empirical quartile population collapses all three production cuts
      // to 1000, which creates misleading Q1/Q4-only strata. Preserve exact
      // 1000-vs-1000 starts as their own cohort and compute skill quartiles from
      // games where at least one player has moved off the default rating.
      const quartile = exactDefaultRatings[index] ? 'DEFAULT_1000' : eloQuartile(avg, cuts);
      const lengthBand = gameLengthBand(game.plyCount);
      const representativeStratum = `${timeControl}|${quartile}`;
      const coverageBucket = `${timeControl}|${quartile}|${lengthBand}|${game.result}|${rating}`;
      return {
        ...game,
        averageElo: avg,
        eloQuartile: quartile,
        timeControl,
        rating,
        lengthBand,
        representativeStratum,
        coverageBucket,
        correspondence: isCorrespondence(timeControl),
      };
    }),
  };
}

function assertEligibleGames(
  games: readonly ElephantChessPilotGame[],
  importBatchId: string,
): void {
  if (!importBatchId.trim()) throw new Error('importBatchId is required');
  const ids = new Set<string>();
  const sourceIds = new Set<string>();
  for (const game of games) {
    if (game.importBatchId !== importBatchId) {
      throw new Error(
        `game ${game.historicalGameId} belongs to unexpected import batch ${game.importBatchId}`,
      );
    }
    if (ids.has(game.historicalGameId))
      throw new Error(`duplicate historical game id ${game.historicalGameId}`);
    if (sourceIds.has(game.sourceGameId))
      throw new Error(`duplicate source game id ${game.sourceGameId}`);
    ids.add(game.historicalGameId);
    sourceIds.add(game.sourceGameId);
  }
}

export function buildElephantChessPilotManifest(
  inputGames: readonly ElephantChessPilotGame[],
  options: {
    importBatchId: string;
    seed: string;
    targets?: ElephantChessPilotTargets;
  },
): ElephantChessPilotManifest {
  const seed = options.seed.trim();
  if (!seed) throw new Error('seed is required');
  assertEligibleGames(inputGames, options.importBatchId);
  const targets = options.targets ?? ELEPHANTCHESS_PILOT_DEFAULT_TARGETS;
  const totalTarget =
    targets.representativeLiveBase + targets.coverageLive + targets.correspondenceMax;
  if (inputGames.length < totalTarget) {
    throw new Error(`pilot needs ${totalTarget} eligible games, found ${inputGames.length}`);
  }

  const { games, cuts } = enrichGames(
    [...inputGames].sort((a, b) => a.historicalGameId.localeCompare(b.historicalGameId)),
  );
  const correspondence = games.filter((game) => game.correspondence);
  const live = games.filter((game) => !game.correspondence);
  const correspondenceTarget = Math.min(targets.correspondenceMax, correspondence.length);
  const representativeTarget =
    targets.representativeLiveBase + (targets.correspondenceMax - correspondenceTarget);
  if (live.length < representativeTarget + targets.coverageLive) {
    throw new Error(
      `pilot needs ${representativeTarget + targets.coverageLive} live games after correspondence allocation, found ${live.length}`,
    );
  }

  const representative = selectRepresentative(live, representativeTarget, seed);
  const representativeIds = new Set(representative.map((game) => game.historicalGameId));
  const coverage = selectCoverage(
    live.filter((game) => !representativeIds.has(game.historicalGameId)),
    targets.coverageLive,
    seed,
  );
  const selectedCorrespondence = deterministicOrder(correspondence, seed, 'correspondence').slice(
    0,
    correspondenceTarget,
  );

  const selected: SelectedGame[] = [
    ...deterministicOrder(representative, seed, 'manifest:representative').map((game) => ({
      game,
      cohort: 'representative-live' as const,
    })),
    ...deterministicOrder(coverage, seed, 'manifest:coverage').map((game) => ({
      game,
      cohort: 'coverage-live' as const,
    })),
    ...deterministicOrder(selectedCorrespondence, seed, 'manifest:correspondence').map((game) => ({
      game,
      cohort: 'correspondence' as const,
    })),
  ];
  if (selected.length !== totalTarget) {
    throw new Error(`pilot selected ${selected.length} games, expected ${totalTarget}`);
  }

  const selectedGames = selected.map((item) => item.game);
  const eligibleConcentration = playerConcentration(games);
  const selectedConcentration = playerConcentration(selectedGames);
  const manifestWithoutHash: Omit<ElephantChessPilotManifest, 'manifestSha256'> = {
    format: ELEPHANTCHESS_PILOT_FORMAT,
    eligibilityVersion: ELEPHANTCHESS_PILOT_ELIGIBILITY_VERSION,
    sourceSlug: 'elephantchess-pvp' as const,
    importBatchId: options.importBatchId,
    seed,
    targets: { ...targets, total: totalTarget },
    counts: {
      eligible: games.length,
      eligibleLive: live.length,
      eligibleCorrespondence: correspondence.length,
      selected: selected.length,
      representativeLive: representative.length,
      coverageLive: coverage.length,
      correspondence: selectedCorrespondence.length,
    },
    eloStratification: {
      defaultRatingValue: ELEPHANTCHESS_DEFAULT_ELO,
      quartilePopulation: 'at-least-one-non-default-rating',
      quartileCuts: cuts,
    },
    playerConcentration: {
      eligibleUniquePlayers: eligibleConcentration.uniquePlayers,
      selectedUniquePlayers: selectedConcentration.uniquePlayers,
      eligibleMaxGamesPerPlayer: eligibleConcentration.maxGamesPerPlayer,
      selectedMaxGamesPerPlayer: selectedConcentration.maxGamesPerPlayer,
    },
    distributions: {
      timeControlCategory: distributionRows(games, selected, (game) => game.timeControl),
      eloQuartile: distributionRows(games, selected, (game) => game.eloQuartile),
      result: distributionRows(games, selected, (game) => game.result),
      lengthBand: distributionRows(games, selected, (game) => game.lengthBand),
      ratingMode: distributionRows(games, selected, (game) => game.rating),
      cohort: distributionRows(games, selected, (_game, cohort) => cohort ?? 'ELIGIBLE'),
    },
    games: selected.map(
      ({ game, cohort }, index): ElephantChessPilotManifestItem => ({
        selectionIndex: index,
        cohort,
        historicalGameId: game.historicalGameId,
        sourceGameId: game.sourceGameId,
        averageElo: game.averageElo,
        eloQuartile: game.eloQuartile,
        timeControlCategory: game.timeControl,
        ratingMode: game.rating,
        result: game.result,
        plyCount: game.plyCount,
        lengthBand: game.lengthBand,
        representativeStratum: game.representativeStratum,
        coverageBucket: game.coverageBucket,
      }),
    ),
  };
  const manifestSha256 = elephantChessPilotManifestSha256(manifestWithoutHash);
  return { ...manifestWithoutHash, manifestSha256 };
}

export function renderElephantChessPilotManifest(manifest: ElephantChessPilotManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
