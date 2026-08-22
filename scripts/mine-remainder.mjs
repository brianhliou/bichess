#!/usr/bin/env node
// Mine the remaining cleared ElephantChess corpus in one command.
//
//   node scripts/mine-remainder.mjs            # run / resume
//   node scripts/mine-remainder.mjs --status   # show state, change nothing
//   node scripts/mine-remainder.mjs --dry-run  # preflight + plan only
//   node scripts/mine-remainder.mjs --containers 16
//
// Every phase is idempotent and recorded in a state file, so a disconnect,
// Ctrl-C, or laptop sleep costs at most the work in flight. Re-running picks up
// where it stopped. It never publishes: mining fills the durable queue, and
// promoting puzzles into the served corpus stays a separate authorized step.
//
// Secrets are never read into this process. Database work is handed to
// `railway run`, which injects the connection string into a child process, and
// Modal workers read their own stored secret.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(homedir(), '.mistboard', 'mining');
const STATE_FILE = join(STATE_DIR, 'remainder-state.json');
const MODAL_SCRIPT = join(REPO_ROOT, 'scripts', 'modal', 'elephantchess_pilot.py');
const MODAL_BIN = existsSync(join(homedir(), '.local/bin/modal'))
  ? join(homedir(), '.local/bin/modal')
  : 'modal';
const SOURCE_SLUG = 'elephantchess-pvp';
const TASK_CAP = 1_000;
const SHARD_SIZE = 25;
const PILOT_YIELD = 0.356;
const CORE_HOURS_PER_1K_GAMES = 5;
const RAILWAY_LINK_HINT =
  'railway link -p edd519d3-638e-40da-81b4-a8a70eb7eb94 -e production -s web';

const { values } = parseArgs({
  options: {
    status: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    containers: { type: 'string' },
    seed: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const log = (message) => console.log(message);
const step = (message) => console.log(`\n\x1b[1m${message}\x1b[0m`);

function fail(message) {
  console.error(`\n\x1b[31m${message}\x1b[0m`);
  process.exit(1);
}

if (values.help) {
  log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 16)
      .join('\n'),
  );
  process.exit(0);
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { phase: 'preflight' };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function lastJsonLine(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Modal and npm interleave human-readable progress lines; keep scanning up.
    }
  }
  return null;
}

// Hands database work to `railway run`, which injects the service environment
// into the child process. The connection string is referenced by name inside
// the child shell and never enters this process or the terminal.
function railwayShell(innerCommand) {
  return capture('railway', ['run', '-s', 'Postgres', '--', 'sh', '-c', innerCommand]);
}

// The snippet goes to a FILE, never through `node -e` inside `sh -c`. Passing
// JavaScript as a shell argument hands the shell its backticks to command-
// substitute and mangles its newlines. The file also lives under node_modules
// so a bare `require('pg')` resolves against the repo's own dependencies.
function queryProduction(snippet) {
  const queryFile = join(REPO_ROOT, 'node_modules', '.mistboard-mining-query.cjs');
  writeFileSync(queryFile, snippet, 'utf8');
  let result;
  try {
    result = railwayShell(`DATABASE_URL="$DATABASE_PUBLIC_URL" node "${queryFile}"`);
  } finally {
    rmSync(queryFile, { force: true });
  }
  if (result.status !== 0) {
    fail(
      `Could not reach production Postgres through Railway.\n${result.stderr || result.stdout}\n\n` +
        `If that said "No linked project", run this once in this directory:\n  ${RAILWAY_LINK_HINT}`,
    );
  }
  const parsed = lastJsonLine(result.stdout);
  if (!parsed) fail(`Unexpected database output:\n${result.stdout}`);
  return parsed;
}

const CORPUS_SNIPPET = `
const pg = require('pg');
(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const q = async (sql) => (await pool.query(sql)).rows;
  const batch = await q(\`
    SELECT b.id, count(g.id)::int AS games
      FROM historical_xiangqi_import_batches b
      JOIN historical_xiangqi_sources s ON s.id = b.source_id
      JOIN historical_xiangqi_games g ON g.import_batch_id = b.id
     WHERE s.slug = '${SOURCE_SLUG}' AND s.license_status = 'cleared' AND b.status = 'completed'
     GROUP BY b.id ORDER BY games DESC LIMIT 1\`);
  const eligible = await q(\`
    SELECT count(*)::int AS n FROM historical_xiangqi_games g
      JOIN historical_xiangqi_sources s ON s.id = g.source_id
      JOIN historical_xiangqi_import_batches b ON b.id = g.import_batch_id
     WHERE s.slug = '${SOURCE_SLUG}' AND s.license_status = 'cleared'
       AND b.status = 'completed' AND g.source_game_id IS NOT NULL
       AND cardinality(g.quality_flags) = 0\`);
  const mined = await q(\`
    SELECT count(DISTINCT mg.historical_game_id)::int AS n
      FROM xiangqi_puzzle_mining_games mg
      JOIN xiangqi_puzzle_mining_runs mr ON mr.id = mg.run_id
     WHERE mr.status NOT IN ('failed','canceled')\`);
  console.log(JSON.stringify({
    importBatchId: batch[0] ? batch[0].id : null,
    eligible: eligible[0].n,
    mined: mined[0].n,
    remaining: eligible[0].n - mined[0].n,
  }));
  await pool.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
`;

const progressSnippet = (runId) => `
const pg = require('pg');
(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const byStatus = (rows) => Object.fromEntries(rows.map((row) => [row.status, row.n]));
  const runRow = await q('SELECT status FROM xiangqi_puzzle_mining_runs WHERE id = $1', ['${runId}']);
  const shards = await q(
    'SELECT status, count(*)::int AS n FROM xiangqi_puzzle_mining_shards WHERE run_id = $1 GROUP BY status',
    ['${runId}']);
  const candidates = await q(
    'SELECT status, count(*)::int AS n FROM xiangqi_puzzle_mining_candidates WHERE run_id = $1 GROUP BY status',
    ['${runId}']);
  console.log(JSON.stringify({
    runStatus: runRow[0] ? runRow[0].status : null,
    shards: byStatus(shards),
    candidates: byStatus(candidates),
  }));
  await pool.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
`;

function preflight() {
  step('Preflight');
  const profile = capture(MODAL_BIN, ['profile', 'current']);
  if (profile.status !== 0) {
    fail('Modal is not authenticated. Run `modal setup`, then start this again.');
  }
  log(`  modal account        ${profile.stdout.trim()}`);

  const secrets = capture(MODAL_BIN, ['secret', 'list']);
  if (!secrets.stdout.includes('mistboard-mining-p')) {
    fail(
      'The Modal secret `mistboard-mining-production-db` is missing.\n' +
        'It must hold one key, DATABASE_URL, pointing at the PUBLIC Railway Postgres URL.',
    );
  }
  log('  modal db secret      present');

  const releaseDir =
    process.env.MISTBOARD_MODAL_PIKAFISH_DIR ??
    join(REPO_ROOT, '..', 'tools', 'pikafish-official-2026-01-02');
  for (const [label, path] of [
    ['pikafish linux build', join(releaseDir, 'Linux', 'pikafish-sse41-popcnt')],
    ['pikafish network', join(releaseDir, 'pikafish.nnue')],
  ]) {
    if (!existsSync(path)) fail(`Missing ${label}: ${path}`);
    log(`  ${label.padEnd(21)}present`);
  }
}

function readCorpus() {
  step('Corpus coverage');
  const corpus = queryProduction(CORPUS_SNIPPET);
  if (!corpus.importBatchId) {
    fail('No completed, license-cleared ElephantChess import batch found.');
  }
  log(`  import batch         ${corpus.importBatchId}`);
  log(`  cleared + eligible   ${corpus.eligible.toLocaleString()} games`);
  log(`  already mined        ${corpus.mined.toLocaleString()} games`);
  log(`  remaining to mine    ${corpus.remaining.toLocaleString()} games`);
  if (corpus.remaining <= 0) {
    log('\nNothing left to mine. The cleared corpus is fully consumed.');
    process.exit(0);
  }
  const shards = Math.ceil(corpus.remaining / SHARD_SIZE);
  const coreHours = Math.round((corpus.remaining / 1000) * CORE_HOURS_PER_1K_GAMES);
  const expected = Math.round(corpus.remaining * PILOT_YIELD);
  log(`  plan                 ${shards} shards, ~${coreHours} core-hours`);
  log(`  expected yield       ~${expected.toLocaleString()} puzzles at the pilot's 35.6%`);
  return corpus;
}

function generateManifest(corpus, existingSeed) {
  step('Generating the remainder manifest');
  mkdirSync(STATE_DIR, { recursive: true });
  const seed =
    existingSeed ??
    values.seed ??
    `elephantchess-remainder-${new Date().toISOString().slice(0, 10)}`;
  const out = join(STATE_DIR, `${seed}.json`);
  const result = railwayShell(
    `DATABASE_URL="$DATABASE_PUBLIC_URL" npm run --silent pilot:elephantchess-manifest ` +
      `--workspace @mistboard/server -- --import-batch-id "${corpus.importBatchId}" ` +
      `--seed "${seed}" --exclude-mined --fill-remaining --out "${out}"`,
  );
  if (result.status !== 0) {
    fail(`Manifest generation failed:\n${result.stderr || result.stdout}`);
  }
  const summary = lastJsonLine(result.stdout);
  if (!summary?.coverage) fail(`Manifest generation produced no summary:\n${result.stdout}`);

  const fileSha256 = createHash('sha256').update(readFileSync(out, 'utf8')).digest('hex');
  log(`  manifest             ${out}`);
  log(`  games selected       ${summary.coverage.selected.toLocaleString()}`);
  log(`  excluded as mined    ${summary.coverage.excludedFromThisManifest.toLocaleString()}`);
  log(`  content sha256       ${summary.manifestSha256}`);
  return {
    seed,
    manifestPath: out,
    manifestFileSha256: fileSha256,
    manifestContentSha256: summary.manifestSha256,
    selected: summary.coverage.selected,
    profileVersion: `${seed}-modal-linux-sse41`,
  };
}

function pinManifest(manifest) {
  step('Pinning the manifest into the Modal launcher');
  let source = readFileSync(MODAL_SCRIPT, 'utf8');
  const pins = [
    ['MANIFEST_FILE_SHA256', manifest.manifestFileSha256],
    ['MANIFEST_CONTENT_SHA256', manifest.manifestContentSha256],
    ['PROFILE_VERSION', manifest.profileVersion],
  ];
  for (const [name, value] of pins) {
    const pattern = new RegExp(`^${name} = "[^"]*"$`, 'm');
    if (!pattern.test(source)) fail(`Could not find ${name} in ${MODAL_SCRIPT}`);
    source = source.replace(pattern, `${name} = "${value}"`);
    log(`  ${name.padEnd(25)}${value}`);
  }
  if (values.containers !== undefined) {
    const containers = Number(values.containers);
    if (!Number.isSafeInteger(containers) || containers < 1) {
      fail('--containers must be a positive integer');
    }
    source = source.replace(/max_containers=\d+/g, `max_containers=${containers}`);
    log(`  max_containers           ${containers}`);
  }
  writeFileSync(MODAL_SCRIPT, source, 'utf8');
  log('  review it with: git diff scripts/modal/elephantchess_pilot.py');
}

function modalRun(entrypoint, extra, manifestPath) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(MODAL_BIN, ['run', `${MODAL_SCRIPT}::${entrypoint}`, ...extra], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, MISTBOARD_MODAL_MANIFEST_PATH: manifestPath },
    });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      process.stdout.write(chunk);
    });
    child.on('error', rejectRun);
    child.on('close', (code) =>
      code === 0
        ? resolveRun(out)
        : rejectRun(new Error(`modal ${entrypoint} exited with ${code}`)),
    );
  });
}

async function main() {
  const state = loadState();

  if (values.status) {
    step('Saved state');
    log(JSON.stringify(state, null, 2));
    if (state.runId) {
      step('Live run progress');
      log(JSON.stringify(queryProduction(progressSnippet(state.runId)), null, 2));
    }
    return;
  }

  preflight();
  const corpus = readCorpus();

  if (values['dry-run']) {
    log('\nDry run: nothing was generated, pinned, or launched.');
    return;
  }

  if (!state.manifestPath || !existsSync(state.manifestPath)) {
    Object.assign(state, generateManifest(corpus, state.seed));
    state.phase = 'pinned';
    saveState(state);
    pinManifest(state);
  } else {
    step('Reusing the manifest from the previous attempt');
    log(`  ${state.manifestPath}`);
  }

  if (!state.runId) {
    step('Verifying pinned artifacts on Modal (no database writes)');
    await modalRun('verify', [], state.manifestPath);

    step('Creating the durable mining run');
    const created = lastJsonLine(await modalRun('initialize', [], state.manifestPath));
    if (!created?.runId) fail('Modal initialize did not report a runId.');
    state.runId = created.runId;
    state.shards = created.shards;
    state.startedAt = new Date().toISOString();
    state.phase = 'scanning';
    saveState(state);
    log(`\n  run id               ${state.runId}`);
    log(`  shards               ${state.shards}`);
  } else {
    step(`Resuming run ${state.runId}`);
  }

  let progress = queryProduction(progressSnippet(state.runId));
  const pendingShards = (progress.shards.pending ?? 0) + (progress.shards.claimed ?? 0);
  if (pendingShards > 0) {
    step(`Scanning ${pendingShards} shard(s)`);
    log('  The long phase. Safe to interrupt: leases expire and re-running resumes.\n');
    await modalRun(
      'scan',
      ['--run-id', state.runId, '--tasks', String(Math.min(pendingShards, TASK_CAP))],
      state.manifestPath,
    );
    progress = queryProduction(progressSnippet(state.runId));
  }
  log(`\n  shards               ${JSON.stringify(progress.shards)}`);
  log(`  candidates           ${JSON.stringify(progress.candidates)}`);

  state.phase = 'auditing';
  saveState(state);

  // The Modal map caps at 1,000 inputs, and a large batch produces more
  // verified candidates than that, so drain the queue in passes.
  for (;;) {
    progress = queryProduction(progressSnippet(state.runId));
    const verified = progress.candidates.verified ?? 0;
    if (verified === 0) break;
    step(`Auditing ${verified} verified candidate(s)`);
    await modalRun(
      'audit',
      ['--run-id', state.runId, '--tasks', String(Math.min(verified, TASK_CAP))],
      state.manifestPath,
    );
  }

  progress = queryProduction(progressSnippet(state.runId));
  state.phase = 'review';
  state.finishedAt = new Date().toISOString();
  state.finalProgress = progress;
  saveState(state);

  const elapsedHours =
    (new Date(state.finishedAt) - new Date(state.startedAt ?? state.finishedAt)) / 3_600_000;
  const survivors = (progress.candidates.approved ?? 0) + (progress.candidates.review ?? 0);

  step('Mining complete');
  log(`  run id               ${state.runId}`);
  log(`  run status           ${progress.runStatus}`);
  log(`  games mined          ${state.selected?.toLocaleString() ?? 'n/a'}`);
  log(`  candidates           ${JSON.stringify(progress.candidates)}`);
  log(`  awaiting publication ${survivors.toLocaleString()}`);
  log(`  wall clock           ${elapsedHours.toFixed(2)} h`);
  log('\nNothing has been published. To review, then publish:');
  log(
    `  npm run pilot:elephantchess-review:export -- --run-id ${state.runId} --out packet.json --motif-html-out packet.html`,
  );
  log(`  npm run pilot:elephantchess-publish -- --run-id ${state.runId}`);
  log('\nRecord the wall clock above in docs-private/mining-track.md. The pilot never was.');
}

main().catch((error) => fail(error.stack ?? String(error)));
