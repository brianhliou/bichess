import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import {
  aggregateEnginePoolStats,
  boundedEnvInt,
  buildFairyStockfishCommands,
  configuredUciOptionNames,
  parseBestmoveLine,
  parseInfoMultiPv,
  parseUciOptionLine,
  runUciBestmove,
  UciEnginePool,
} from './uci-engine-harness.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ── parseInfoMultiPv ──────────────────────────────────────────────────────────

test('parseInfoMultiPv extracts rank, score, and the pv first move', () => {
  const row = parseInfoMultiPv(
    'info depth 10 seldepth 14 multipv 2 score cp -340 nodes 12345 pv c6c5 e3e4 g0e2',
  );
  assert.deepEqual(row, { index: 2, depth: 10, cp: -340, mate: null, move: 'c6c5' });
});

test('parseInfoMultiPv reads a mate score', () => {
  const row = parseInfoMultiPv('info depth 20 multipv 1 score mate 3 pv e7e8');
  assert.deepEqual(row, { index: 1, depth: 20, cp: null, mate: 3, move: 'e7e8' });
});

test('parseInfoMultiPv returns undefined without multipv, score, or pv', () => {
  assert.equal(parseInfoMultiPv('info depth 10 score cp 20 pv e2e4'), undefined); // no multipv
  assert.equal(parseInfoMultiPv('info depth 10 multipv 1 pv e2e4'), undefined); // no score
  assert.equal(parseInfoMultiPv('info string hashfull 0'), undefined);
  assert.equal(parseInfoMultiPv('bestmove e2e4'), undefined);
});

// ── boundedEnvInt ─────────────────────────────────────────────────────────────

test('boundedEnvInt returns the fallback when unset or non-numeric', () => {
  delete process.env.TEST_BOUNDED_ENV;
  assert.equal(boundedEnvInt('TEST_BOUNDED_ENV', 2, 1, 8), 2);
  process.env.TEST_BOUNDED_ENV = 'not-a-number';
  assert.equal(boundedEnvInt('TEST_BOUNDED_ENV', 2, 1, 8), 2);
  delete process.env.TEST_BOUNDED_ENV;
});

test('boundedEnvInt clamps to [min, max]', () => {
  process.env.TEST_BOUNDED_ENV = '100';
  assert.equal(boundedEnvInt('TEST_BOUNDED_ENV', 2, 1, 8), 8);
  process.env.TEST_BOUNDED_ENV = '5';
  assert.equal(boundedEnvInt('TEST_BOUNDED_ENV', 2, 1, 8), 5);
  process.env.TEST_BOUNDED_ENV = '0';
  assert.equal(boundedEnvInt('TEST_BOUNDED_ENV', 2, 1, 8), 1);
  delete process.env.TEST_BOUNDED_ENV;
});

// ── parseBestmoveLine ─────────────────────────────────────────────────────────

test('parseBestmoveLine returns undefined for non-bestmove lines', () => {
  assert.equal(parseBestmoveLine('info depth 12 score cp 34'), undefined);
  assert.equal(parseBestmoveLine('readyok'), undefined);
  assert.equal(parseBestmoveLine(''), undefined);
});

test('parseBestmoveLine extracts the move token', () => {
  assert.equal(parseBestmoveLine('bestmove d2d3'), 'd2d3');
  assert.equal(parseBestmoveLine('bestmove a7a8q ponder b8c6'), 'a7a8q');
  assert.equal(parseBestmoveLine('bestmove C@d4'), 'C@d4');
});

test('parseBestmoveLine maps no-move outputs to null', () => {
  assert.equal(parseBestmoveLine('bestmove (none)'), null);
  assert.equal(parseBestmoveLine('bestmove'), null);
});

test('UCI option parsing handles multi-word names and configured values', () => {
  assert.equal(
    parseUciOptionLine('option name Skill Level type spin default 20 min 0 max 20'),
    'Skill Level',
  );
  assert.equal(parseUciOptionLine('option name EvalFile type string default net.nnue'), 'EvalFile');
  assert.equal(parseUciOptionLine('uciok'), undefined);
  assert.deepEqual(
    configuredUciOptionNames([
      'uci',
      'setoption name EvalFile value /tmp/net.nnue',
      'setoption name Clear Hash',
    ]),
    ['EvalFile', 'Clear Hash'],
  );
});

// ── buildFairyStockfishCommands ───────────────────────────────────────────────

test('buildFairyStockfishCommands: crossroads shape (ini, skill, movetime only)', () => {
  const commands = buildFairyStockfishCommands({
    moves: ['d2d3'],
    variant: 'dualchess',
    iniPath: '/tmp/crossroads-chess.ini',
    skill: 8,
    movetimeMs: 300,
  });
  assert.deepEqual(commands, [
    'uci',
    'setoption name VariantPath value /tmp/crossroads-chess.ini',
    'setoption name UCI_Variant value dualchess',
    'setoption name Skill Level value 8',
    'ucinewgame',
    'isready',
    'position startpos moves d2d3',
    'go movetime 300',
  ]);
});

test('buildFairyStockfishCommands: mini shape (built-in variant, no ini, node budget)', () => {
  const commands = buildFairyStockfishCommands({
    moves: [],
    variant: 'minixiangqi',
    skill: 1,
    nodes: 6_000,
    movetimeMs: 300,
  });
  assert.deepEqual(commands, [
    'uci',
    'setoption name UCI_Variant value minixiangqi',
    'setoption name Skill Level value 1',
    'ucinewgame',
    'isready',
    'position startpos',
    'go nodes 6000 movetime 300',
  ]);
});

test('buildFairyStockfishCommands: drop-mini shape (ini + node budget)', () => {
  const commands = buildFairyStockfishCommands({
    moves: ['b1b3', 'C@d4'],
    variant: 'dropminixiangqi',
    iniPath: '/tmp/drop-mini-xiangqi.ini',
    skill: 20,
    nodes: 800_000,
    movetimeMs: 2_000,
  });
  assert.deepEqual(commands, [
    'uci',
    'setoption name VariantPath value /tmp/drop-mini-xiangqi.ini',
    'setoption name UCI_Variant value dropminixiangqi',
    'setoption name Skill Level value 20',
    'ucinewgame',
    'isready',
    'position startpos moves b1b3 C@d4',
    'go nodes 800000 movetime 2000',
  ]);
});

test('buildFairyStockfishCommands: supports Lichess negative skill and a depth cap', () => {
  const noSkill = buildFairyStockfishCommands({ moves: [], variant: 'x', movetimeMs: 100 });
  assert.ok(!noSkill.some((c) => c.includes('Skill Level')));
  const overMax = buildFairyStockfishCommands({
    moves: [],
    variant: 'x',
    skill: 99,
    movetimeMs: 100,
  });
  assert.ok(overMax.includes('setoption name Skill Level value 20'));
  const underMin = buildFairyStockfishCommands({
    moves: [],
    variant: 'x',
    skill: -99,
    depth: 5,
    movetimeMs: 100,
  });
  assert.ok(underMin.includes('setoption name Skill Level value -20'));
  assert.ok(underMin.includes('go depth 5 movetime 100'));
});

// ── UciEnginePool ─────────────────────────────────────────────────────────────

test('UciEnginePool serializes acquisitions past the concurrency cap (FIFO)', async () => {
  process.env.TEST_POOL_MAX = '1';
  const pool = new UciEnginePool({
    maxProcessesEnvVar: 'TEST_POOL_MAX',
    queueTimeoutEnvVar: 'TEST_POOL_TIMEOUT_UNSET',
    queueTimeoutMessage: 'test queue timed out',
  });
  const order: string[] = [];
  const release1 = await pool.acquire();
  order.push('a1');

  let release2: (() => void) | undefined;
  const acquired2 = pool.acquire().then((rel) => {
    order.push('a2');
    release2 = rel;
  });

  // Second acquire must stay queued while the single slot is held.
  await delay(20);
  assert.deepEqual(order, ['a1']);

  release1();
  await acquired2;
  assert.deepEqual(order, ['a1', 'a2']);
  release2?.();

  delete process.env.TEST_POOL_MAX;
});

test('UciEnginePool rejects a queued waiter after the queue timeout', async () => {
  process.env.TEST_POOL_MAX = '1';
  process.env.TEST_POOL_TIMEOUT = '100';
  const pool = new UciEnginePool({
    maxProcessesEnvVar: 'TEST_POOL_MAX',
    queueTimeoutEnvVar: 'TEST_POOL_TIMEOUT',
    queueTimeoutMessage: 'slot wait timed out',
  });
  const release1 = await pool.acquire();
  // The queue-wait timer is .unref()ed (it must never keep prod alive), so it
  // is this test's ONLY wakeup: hold the event loop open until the rejection
  // lands, or node:test cancels the file when the loop drains (passed
  // locally, died in CI as 'cancelledByParent').
  const keepAlive = setInterval(() => {}, 20);
  try {
    await assert.rejects(pool.acquire(), /slot wait timed out/);
  } finally {
    clearInterval(keepAlive);
  }
  release1();
  delete process.env.TEST_POOL_MAX;
  delete process.env.TEST_POOL_TIMEOUT;
});

test('UciEnginePool stats track active, queue depth, waits, and timeouts (#203)', async () => {
  process.env.TEST_POOL_MAX = '1';
  process.env.TEST_POOL_TIMEOUT = '80';
  const pool = new UciEnginePool({
    name: 'test-instrumented',
    maxProcessesEnvVar: 'TEST_POOL_MAX',
    queueTimeoutEnvVar: 'TEST_POOL_TIMEOUT',
    queueTimeoutMessage: 'instrumented queue timed out',
  });

  const release1 = await pool.acquire();
  let stats = pool.stats();
  assert.equal(stats.name, 'test-instrumented');
  assert.equal(stats.active, 1);
  assert.equal(stats.acquired, 1);
  assert.equal(stats.queueDepth, 0);

  // A second acquire queues (over the cap): queue depth + wait counter rise.
  const keepAlive = setInterval(() => {}, 20);
  try {
    const queued = assert.rejects(pool.acquire(), /instrumented queue timed out/);
    await delay(10);
    stats = pool.stats();
    assert.equal(stats.queueDepth, 1);
    assert.equal(stats.waited, 1);
    assert.equal(stats.peakQueueDepth, 1);
    assert.equal(stats.timedOut, 0);
    await queued; // let the queued waiter hit the timeout
  } finally {
    clearInterval(keepAlive);
  }
  stats = pool.stats();
  assert.equal(stats.queueDepth, 0);
  assert.equal(stats.timedOut, 1);

  // The pool is registered, so the aggregate reflects it (per-pool + totals).
  const agg = aggregateEnginePoolStats();
  const mine = agg.pools.find((p) => p.name === 'test-instrumented');
  assert.ok(mine, 'registered pool appears in aggregate');
  assert.equal(mine?.timedOut, 1);
  assert.ok(agg.totals.timedOut >= 1);

  release1();
  delete process.env.TEST_POOL_MAX;
  delete process.env.TEST_POOL_TIMEOUT;
});

// ── runUciBestmove (fake UCI binary; no real engine needed) ──────────────────

const fixtureDir = mkdtempSync(join(tmpdir(), 'uci-harness-'));
after(() => rmSync(fixtureDir, { recursive: true, force: true }));

function writeFakeEngine(name: string, body: string): string {
  const path = join(fixtureDir, name);
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

// Echoes a bestmove as soon as it sees a `go` command; otherwise stays silent.
const responderBin = writeFakeEngine(
  'responder.mjs',
  `let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line.startsWith('go')) process.stdout.write('info depth 1\\nbestmove d2d3\\n');
  }
});`,
);

const optionResponderBin = writeFakeEngine(
  'option-responder.mjs',
  `let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line === 'uci') {
      process.stdout.write('option name EvalFile type string default net.nnue\\nuciok\\n');
    }
    if (line.startsWith('go')) process.stdout.write('bestmove d2d3\\n');
  }
});`,
);

test('runUciBestmove spawns, sends commands, and resolves the bestmove', async () => {
  const move = await runUciBestmove({
    bin: responderBin,
    commands: ['uci', 'isready', 'go movetime 50'],
    timeoutMs: 4_000,
    timeoutMessage: 'should not time out',
  });
  assert.equal(move, 'd2d3');
});

test('runUciBestmove accepts advertised setoptions and rejects unsupported ones', async () => {
  const move = await runUciBestmove({
    bin: optionResponderBin,
    commands: ['uci', 'setoption name EvalFile value /tmp/net.nnue', 'go movetime 50'],
    timeoutMs: 4_000,
    timeoutMessage: 'should not time out',
  });
  assert.equal(move, 'd2d3');

  await assert.rejects(
    runUciBestmove({
      bin: optionResponderBin,
      commands: ['uci', 'setoption name Skill Level value 6', 'go movetime 50'],
      timeoutMs: 4_000,
      timeoutMessage: 'should not time out',
    }),
    /does not advertise configured option.*Skill Level/,
  );
});

test('runUciBestmove rejects with the timeout message when no bestmove arrives', async () => {
  await assert.rejects(
    runUciBestmove({
      bin: responderBin,
      // No `go` line → the fake engine never answers → the hard timeout fires.
      commands: ['uci', 'isready'],
      timeoutMs: 150,
      timeoutMessage: 'engine move timed out',
    }),
    /engine move timed out/,
  );
});

test('runUciBestmove rejects when the binary cannot be spawned', async () => {
  await assert.rejects(
    runUciBestmove({
      bin: join(fixtureDir, 'does-not-exist'),
      commands: ['go'],
      timeoutMs: 1_000,
      timeoutMessage: 'unused',
    }),
  );
});
