import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { UciEngineSession } from './uci-engine-harness.js';

// Persistent-session tests against a fake UCI binary (same fixture pattern as
// uci-engine-harness.test.ts): no real engine needed. The fake advertises an
// EvalFile option, answers the init handshake, and serves each `go` with an
// incrementing score — so a test can PROVE two evals hit the same process (the
// counter survives between requests, which a spawn-per-request path would reset).

const fixtureDir = mkdtempSync(join(tmpdir(), 'uci-session-'));
after(() => rmSync(fixtureDir, { recursive: true, force: true }));

function writeFakeEngine(name: string, body: string): string {
  const path = join(fixtureDir, name);
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

const sessionResponderBin = writeFakeEngine(
  'session-responder.mjs',
  `let buf = '';
let evals = 0;
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line === 'uci') {
      process.stdout.write('option name EvalFile type string default net.nnue\\nuciok\\n');
    }
    if (line === 'isready') process.stdout.write('readyok\\n');
    if (line.startsWith('go')) {
      evals += 1;
      process.stdout.write('info depth 3 score cp ' + evals * 10 + '\\nbestmove a0a1\\n');
    }
  }
});`,
);

// Advertises EvalFile and answers the handshake, but never answers `go` — for
// the per-request timeout path.
const silentAfterInitBin = writeFakeEngine(
  'silent-after-init.mjs',
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
    if (line === 'isready') process.stdout.write('readyok\\n');
  }
});`,
);

// Answers the handshake but advertises NO options — for the configured-option guard.
const noOptionBin = writeFakeEngine(
  'no-option.mjs',
  `let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line === 'uci') process.stdout.write('uciok\\n');
    if (line === 'isready') process.stdout.write('readyok\\n');
  }
});`,
);

// Rejects the configured option like a real engine would.
const optionRejecterBin = writeFakeEngine(
  'option-rejecter.mjs',
  `let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line === 'uci') process.stdout.write('uciok\\n');
    if (line.startsWith('setoption')) process.stdout.write('No such option: EvalFile\\n');
    if (line === 'isready') process.stdout.write('readyok\\n');
  }
});`,
);

const INIT = ['uci', 'setoption name EvalFile value /tmp/net.nnue', 'ucinewgame', 'isready'];

test('UciEngineSession serves multiple evals from ONE process (state survives requests)', async () => {
  const session = new UciEngineSession({ bin: sessionResponderBin, initCommands: INIT });
  try {
    await session.ready();
    const first = await session.evalPosition({
      positionCommand: 'position startpos',
      goCommand: 'go nodes 100',
      timeoutMs: 4_000,
      timeoutMessage: 'eval timed out',
    });
    const second = await session.evalPosition({
      positionCommand: 'position startpos moves a0a1',
      goCommand: 'go nodes 100',
      timeoutMs: 4_000,
      timeoutMessage: 'eval timed out',
    });
    assert.equal(first.cp, 10);
    assert.equal(first.best, 'a0a1');
    assert.equal(first.depth, 3);
    // The fake's counter incremented across requests: same process, no respawn.
    assert.equal(second.cp, 20);
  } finally {
    session.close();
  }
});

test('UciEngineSession serializes concurrent evalPosition calls (no interleaved go)', async () => {
  const session = new UciEngineSession({ bin: sessionResponderBin, initCommands: INIT });
  try {
    const [a, b, c] = await Promise.all([
      session.evalPosition({
        positionCommand: 'position startpos',
        goCommand: 'go nodes 100',
        timeoutMs: 4_000,
        timeoutMessage: 'eval timed out',
      }),
      session.evalPosition({
        positionCommand: 'position startpos moves a0a1',
        goCommand: 'go nodes 100',
        timeoutMs: 4_000,
        timeoutMessage: 'eval timed out',
      }),
      session.evalPosition({
        positionCommand: 'position startpos moves a0a1 b0b1',
        goCommand: 'go nodes 100',
        timeoutMs: 4_000,
        timeoutMessage: 'eval timed out',
      }),
    ]);
    // FIFO order: each caller got its own bestmove reply, in submission order.
    assert.deepEqual([a.cp, b.cp, c.cp], [10, 20, 30]);
  } finally {
    session.close();
  }
});

test('UciEngineSession eval timeout fails the whole session closed', async () => {
  const session = new UciEngineSession({ bin: silentAfterInitBin, initCommands: INIT });
  try {
    await session.ready();
    await assert.rejects(
      session.evalPosition({
        positionCommand: 'position startpos',
        goCommand: 'go nodes 100',
        timeoutMs: 100,
        timeoutMessage: 'analysis eval timed out',
      }),
      /analysis eval timed out/,
    );
    // Mid-search state is unknowable, so the session is dead — later evals reject.
    await assert.rejects(
      session.evalPosition({
        positionCommand: 'position startpos',
        goCommand: 'go nodes 100',
        timeoutMs: 100,
        timeoutMessage: 'analysis eval timed out',
      }),
    );
  } finally {
    session.close();
  }
});

test('UciEngineSession rejects init when the engine rejects a configured option', async () => {
  const session = new UciEngineSession({ bin: optionRejecterBin, initCommands: INIT });
  try {
    await assert.rejects(session.ready(), /No such option/);
  } finally {
    session.close();
  }
});

test('UciEngineSession rejects init when a configured option is not advertised', async () => {
  // noOptionBin answers the handshake but never advertises EvalFile.
  const session = new UciEngineSession({ bin: noOptionBin, initCommands: INIT });
  try {
    await assert.rejects(session.ready(), /does not advertise configured option/);
  } finally {
    session.close();
  }
});

test('UciEngineSession rejects when the binary cannot be spawned', async () => {
  const session = new UciEngineSession({
    bin: join(fixtureDir, 'does-not-exist'),
    initCommands: INIT,
  });
  try {
    await assert.rejects(session.ready());
  } finally {
    session.close();
  }
});

test('UciEngineSession close() is idempotent and kills the engine', async () => {
  const session = new UciEngineSession({ bin: sessionResponderBin, initCommands: INIT });
  await session.ready();
  session.close();
  session.close();
  await assert.rejects(
    session.evalPosition({
      positionCommand: 'position startpos',
      goCommand: 'go nodes 100',
      timeoutMs: 1_000,
      timeoutMessage: 'eval timed out',
    }),
  );
});

// A real search that exhausts its node budget mid-iteration ends on a
// fail-high/fail-low line: `score cp N lowerbound` with a one-move pv. Taking
// that as the result truncated 38% of PVs across a 156-ply game, moved evals by
// up to 163cp, and hid the only blunder in it. The last COMPLETE iteration is
// the answer; the bounded line is a last resort.
const boundedTailBin = writeFakeEngine(
  'bounded-tail.mjs',
  `let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line === 'uci') { process.stdout.write('option name EvalFile type string default x\\nuciok\\n'); }
    else if (line === 'isready') process.stdout.write('readyok\\n');
    else if (line.startsWith('go')) {
      process.stdout.write('info depth 20 score cp -35 nodes 704074 pv g3f1 b4b5 e2g4 b3i3\\n');
      process.stdout.write('info depth 21 score cp -34 lowerbound nodes 1000174 pv g3f1\\n');
      process.stdout.write('bestmove g3f1\\n');
    }
  }
});`,
);

test('evalPosition takes the last complete iteration, not the bounded tail', async () => {
  const session = new UciEngineSession({
    bin: boundedTailBin,
    name: 'bounded-tail',
    initCommands: ['uci', 'setoption name EvalFile value x', 'isready'],
  });
  try {
    await session.ready();
    const result = await session.evalPosition({
      positionCommand: 'position startpos',
      goCommand: 'go nodes 1000000',
      timeoutMs: 5000,
      timeoutMessage: 'bounded-tail eval timed out',
    });
    assert.equal(result.depth, 20, 'should report the completed depth, not the aborted one');
    assert.equal(result.cp, -35, 'should use the exact score, not the bound');
    assert.deepEqual(result.pv, ['g3f1', 'b4b5', 'e2g4', 'b3i3'], 'should keep the full line');
  } finally {
    session.close();
  }
});

// Guard the fallback: if a search NEVER completes an iteration, a bounded score
// still beats no score at all.
const onlyBoundedBin = writeFakeEngine(
  'only-bounded.mjs',
  `let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line === 'uci') { process.stdout.write('option name EvalFile type string default x\\nuciok\\n'); }
    else if (line === 'isready') process.stdout.write('readyok\\n');
    else if (line.startsWith('go')) {
      process.stdout.write('info depth 1 score cp 8 upperbound nodes 12 pv a0a1\\n');
      process.stdout.write('bestmove a0a1\\n');
    }
  }
});`,
);

test('evalPosition falls back to a bounded score when no iteration completed', async () => {
  const session = new UciEngineSession({
    bin: onlyBoundedBin,
    name: 'only-bounded',
    initCommands: ['uci', 'setoption name EvalFile value x', 'isready'],
  });
  try {
    await session.ready();
    const result = await session.evalPosition({
      positionCommand: 'position startpos',
      goCommand: 'go nodes 10',
      timeoutMs: 5000,
      timeoutMessage: 'only-bounded eval timed out',
    });
    assert.equal(result.cp, 8, 'a bounded score still beats no score');
  } finally {
    session.close();
  }
});
