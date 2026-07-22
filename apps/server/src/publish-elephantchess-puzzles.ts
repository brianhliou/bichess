import { parseArgs } from 'node:util';
import { close, getPool, init } from './persistence-db.js';
import {
  planXiangqiPuzzlePublication,
  publishXiangqiPuzzlePublication,
} from './xiangqi-puzzle-publication.js';

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${flag} is required`);
  return normalized;
}

function positiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(required(value, flag), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

const { values } = parseArgs({
  options: {
    'run-id': { type: 'string' },
    'expect-total': { type: 'string' },
    'expect-sha256': { type: 'string' },
    'confirm-run-id': { type: 'string' },
    'operator-note': { type: 'string' },
    apply: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  process.stdout.write(
    'Dry run: npm run pilot:elephantchess-publish -- --run-id RUN --expect-total N\n' +
      'Apply: add --apply --confirm-run-id RUN --expect-sha256 SHA --operator-note NOTE\n',
  );
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const runId = required(values['run-id'], '--run-id');
const expectedTotal = positiveInteger(values['expect-total'], '--expect-total');

init(databaseUrl);
try {
  const plan = await planXiangqiPuzzlePublication(getPool(), runId);
  if (plan.totalCandidates !== expectedTotal) {
    throw new Error(
      `publication total changed: expected ${expectedTotal}, got ${plan.totalCandidates}`,
    );
  }
  if (!values.apply) {
    process.stdout.write(
      `${JSON.stringify({
        apply: false,
        runId: plan.runId,
        runStatus: plan.runStatus,
        sourceLicenseStatus: plan.sourceLicenseStatus,
        totalCandidates: plan.totalCandidates,
        eligibleCandidates: plan.eligibleCandidates,
        alreadyPublished: plan.alreadyPublished,
        currentPuzzleCount: plan.currentPuzzleCount,
        nextSequence: plan.nextSequence,
        publicationSha256: plan.publicationSha256,
      })}\n`,
    );
  } else {
    if (required(values['confirm-run-id'], '--confirm-run-id') !== runId) {
      throw new Error('--confirm-run-id must exactly match --run-id');
    }
    const result = await publishXiangqiPuzzlePublication({
      runId,
      expectedTotal,
      expectedPublicationSha256: required(values['expect-sha256'], '--expect-sha256'),
      operatorNote: required(values['operator-note'], '--operator-note'),
    });
    process.stdout.write(`${JSON.stringify({ apply: true, ...result })}\n`);
  }
} finally {
  await close();
}
