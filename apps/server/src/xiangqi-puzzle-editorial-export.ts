import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { close, getPool, init } from './persistence-db.js';
import {
  getXiangqiPuzzleMiningRun,
  listXiangqiPuzzleEditorialCandidates,
  type XiangqiPuzzleMiningCandidateStatus,
} from './persistence-xiangqi-puzzle-mining.js';
import {
  buildXiangqiEditorialReviewPacket,
  type XiangqiEditorialCandidateSignals,
  type XiangqiEditorialRankingLens,
} from './xiangqi-puzzle-editorial-ranking.js';

const ALLOWED_STATUSES = new Set<XiangqiPuzzleMiningCandidateStatus>(['review', 'approved']);

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${flag} is required`);
  return normalized;
}

function positiveInteger(value: string | undefined, flag: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function statuses(value: string | undefined): XiangqiPuzzleMiningCandidateStatus[] {
  const parsed = (value ?? 'review')
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean) as XiangqiPuzzleMiningCandidateStatus[];
  if (parsed.length === 0 || parsed.some((status) => !ALLOWED_STATUSES.has(status))) {
    throw new Error('--statuses must be a comma-separated subset of review,approved');
  }
  return [...new Set(parsed)];
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

const { values } = parseArgs({
  options: {
    'run-id': { type: 'string' },
    statuses: { type: 'string', default: 'review' },
    'limit-per-lens': { type: 'string', default: '25' },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  process.stdout.write(
    'Usage: npm run pilot:elephantchess-review:export -- --run-id RUN_ID ' +
      '[--statuses review,approved] [--limit-per-lens 25] [--out packet.json]\n',
  );
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const runId = required(values['run-id'], '--run-id');
const selectedStatuses = statuses(values.statuses);
const limitPerLens = positiveInteger(values['limit-per-lens'], '--limit-per-lens', 25);

init(databaseUrl);
try {
  const pool = getPool();
  const [run, entries] = await Promise.all([
    getXiangqiPuzzleMiningRun(pool, runId),
    listXiangqiPuzzleEditorialCandidates(pool, {
      runId,
      statuses: selectedStatuses,
    }),
  ]);
  const packet = buildXiangqiEditorialReviewPacket(entries);
  const lenses = Object.keys(packet.rankings) as XiangqiEditorialRankingLens[];
  const selectedIds = new Set(
    lenses.flatMap((lens) =>
      limitPerLens === 0 ? packet.rankings[lens] : packet.rankings[lens].slice(0, limitPerLens),
    ),
  );
  const candidates = packet.candidates.filter(({ candidate }) => selectedIds.has(candidate.id));
  const signals = packet.candidates.map((candidate) => candidate.signals);
  const output = {
    kind: 'elephantchess-pilot-editorial-review-packet',
    run,
    statuses: selectedStatuses,
    rankingVersion: packet.rankingVersion,
    rankingDescriptions: {
      'material-concession':
        'Sacrifice proxy: material conceded in the verified line, then depth and source swing.',
      'forcing-depth': 'Number of solver decisions, then eval swing and audit margin.',
      'source-swing':
        'Magnitude of the source-game mistake; mate-scale values are explicitly flagged.',
      'audit-margin':
        'Worst numeric deeper-audit margin; gate reasons remain attached and this is not a correctness score.',
    },
    summary: {
      eligibleCandidates: entries.length,
      exportedCandidates: candidates.length,
      byCohort: countBy(entries, (entry) => entry.cohort),
      byGoal: countBy(signals, (signal) => signal.goal ?? 'unknown'),
      multiDecision: signals.filter((signal) => (signal.solverPlies ?? 0) > 1).length,
      materialConcession: signals.filter((signal) => (signal.material?.materialConcededCp ?? 0) > 0)
        .length,
      nonImmediateMaterialConcession: signals.filter(
        (signal) =>
          (signal.material?.materialConcededCp ?? 0) > 0 && !signal.material?.immediateRecapture,
      ).length,
      negativeNetMaterialConcession: signals.filter(
        (signal) =>
          (signal.material?.materialConcededCp ?? 0) > 0 &&
          (signal.material?.netMaterialCp ?? 0) < 0,
      ).length,
      quietFirstMove: signals.filter((signal) => signal.material?.quietFirstMove).length,
      mateScaleSwing: signals.filter((signal) => signal.mateScaleSwing).length,
      byAuditUniquenessReason: countBy(
        signals.flatMap((signal) => signal.auditUniquenessReasons),
        (reason) => reason,
      ),
      duplicatePositions: signals.filter((signal) => signal.positionDuplicateCount > 1).length,
      previouslyReviewed: signals.filter((signal) => signal.latestReviewVerdict !== null).length,
    },
    rankings: Object.fromEntries(
      lenses.map((lens) => [
        lens,
        limitPerLens === 0 ? packet.rankings[lens] : packet.rankings[lens].slice(0, limitPerLens),
      ]),
    ) as Record<XiangqiEditorialRankingLens, string[]>,
    candidates,
  } satisfies {
    kind: string;
    run: unknown;
    statuses: XiangqiPuzzleMiningCandidateStatus[];
    rankingVersion: string;
    rankingDescriptions: Record<XiangqiEditorialRankingLens, string>;
    summary: Record<string, unknown>;
    rankings: Record<XiangqiEditorialRankingLens, string[]>;
    candidates: Array<{ signals: XiangqiEditorialCandidateSignals }>;
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (values.out) {
    const outPath = resolve(values.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, serialized, 'utf8');
    process.stdout.write(
      `${JSON.stringify({
        kind: output.kind,
        runId,
        out: outPath,
        summary: output.summary,
      })}\n`,
    );
  } else {
    process.stdout.write(serialized);
  }
} finally {
  await close();
}
