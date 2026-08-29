import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import test from 'node:test';
import { firstPartyBotEngineFor } from './first-party-bots.js';
import {
  buildJieqiAnalysisCommands,
  buildJieqiLiveCommands,
  JIEQI_DEFAULT_ENGINE_ID,
  JIEQI_PLAYABLE_ENGINES,
  jieqiAnalysisResourceOptions,
  jieqiEngineTierFor,
} from './jieqi-engine.js';

const FEN =
  'xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w R2A2C2P5N2B2r2a2c2p5n2b2 0 1';

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const prior = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    run();
  } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// The 2026-08-23 defect: every jieqi PvE game was served by the DEPTH-CAPPED middle
// rung, so the bot stopped at depth 10 (~840ms) while its own 1200ms budget went
// unspent and the uncapped tier existed but was unreachable from any surface. Guard
// the property that broke, not the id: the served tier must have no depth cap.
test('the served jieqi tier is uncapped', () => {
  const tier = jieqiEngineTierFor(JIEQI_DEFAULT_ENGINE_ID);
  assert.ok(tier, 'the default engine id resolves to a tier');
  assert.equal(tier.depth, undefined, 'the tier every PvE game is served by has no depth cap');
  assert.ok(tier.movetimeMs >= 4_000, 'and is given at least the xiangqi top rung’s think time');
});

// Three surfaces name the jieqi engine independently (the create-route default, the
// Pikafish bot profile, and the web landing registry, which is asserted against this
// one in variant-registry-sync.test.ts). They drifted apart once already.
test('the Pikafish bot plays the same jieqi tier the create route defaults to', () => {
  assert.equal(firstPartyBotEngineFor('pikafish', 'jieqi'), JIEQI_DEFAULT_ENGINE_ID);
});

test('the tier ladder stays ordered weakest-first', () => {
  const depths = JIEQI_PLAYABLE_ENGINES.map((t) => t.depth ?? Number.POSITIVE_INFINITY);
  assert.deepEqual(
    [...depths].sort((a, b) => a - b),
    depths,
  );
  assert.equal(
    JIEQI_PLAYABLE_ENGINES.at(-1)?.id,
    JIEQI_DEFAULT_ENGINE_ID,
    'and the strongest rung is the one served',
  );
});

test('live moves configure Hash and Threads before ucinewgame', () => {
  withEnv(
    { MISTBOARD_PIKAFISH_JIEQI_HASH_MB: undefined, MISTBOARD_PIKAFISH_JIEQI_THREADS: undefined },
    () => {
      const commands = buildJieqiLiveCommands(FEN, { movetimeMs: 4_000 });
      const hash = commands.indexOf('setoption name Hash value 256');
      const threads = commands.findIndex((c) => c.startsWith('setoption name Threads value '));
      const newGame = commands.indexOf('ucinewgame');
      assert.ok(hash >= 0, 'Hash is set (the 16MB UCI default thrashes at this engine’s nps)');
      assert.ok(threads >= 0, 'Threads is set');
      assert.ok(hash < newGame && threads < newGame, 'both land before ucinewgame');
      assert.equal(commands.at(-1), 'go movetime 4000', 'no depth cap on the served tier');
    },
  );
});

test('Threads never claims more than half the container’s cores', () => {
  withEnv({ MISTBOARD_PIKAFISH_JIEQI_THREADS: undefined }, () => {
    const line = buildJieqiLiveCommands(FEN).find((c) =>
      c.startsWith('setoption name Threads value '),
    );
    const threads = Number(line?.split(' ').at(-1));
    assert.ok(threads >= 1 && threads <= 4);
    assert.ok(threads <= Math.max(1, Math.floor(availableParallelism() / 2)));
  });
});

test('both resource knobs are env-tunable and bounded', () => {
  withEnv(
    { MISTBOARD_PIKAFISH_JIEQI_HASH_MB: '512', MISTBOARD_PIKAFISH_JIEQI_THREADS: '3' },
    () => {
      const commands = buildJieqiLiveCommands(FEN);
      assert.ok(commands.includes('setoption name Hash value 512'));
      assert.ok(commands.includes('setoption name Threads value 3'));
    },
  );
  withEnv(
    { MISTBOARD_PIKAFISH_JIEQI_HASH_MB: '999999', MISTBOARD_PIKAFISH_JIEQI_THREADS: '0' },
    () => {
      const commands = buildJieqiLiveCommands(FEN);
      assert.ok(commands.includes('setoption name Hash value 4096'), 'hash clamps to the max');
      assert.ok(commands.includes('setoption name Threads value 1'), 'threads clamps to the min');
    },
  );
});

// Analysis sets its OWN resource options rather than borrowing the live ones:
// `jieqi-analysis.ts` caches sweeps by (room, engine, depth) on the promise that a fixed
// depth is the same tree on any box. A second thread breaks that promise (parallel search
// is order-dependent); a FIXED Hash does not, and 256MB is what keeps the table off the
// thrashing ceiling that corrupts the eval. So: Hash pinned, Threads pinned to 1, and
// neither may track the live config, which is env-tunable per box.
test('analysis evals stay single-threaded on a fixed table', () => {
  const commands = buildJieqiAnalysisCommands(FEN, { depth: 20, movetimeMs: 6_000 });
  assert.ok(commands.includes('setoption name Threads value 1'));
  assert.ok(commands.includes('setoption name Hash value 256'));
  assert.equal(commands.at(-1), 'go depth 20 movetime 6000');
});

// The Layer-1 sweep budgets NODES, not depth, because a fixed depth is not a fixed amount of
// search: extensions make a checking position cost multiples of a quiet one, so two adjacent
// plies come back incomparable and the eval graph shows a cliff nobody played. Anything that
// silently turns this back into a `go depth` command reintroduces that, so pin the shape.
test('a node budget emits go nodes, never go depth', () => {
  const commands = buildJieqiAnalysisCommands(FEN, { nodes: 500_000, movetimeMs: 6_000 });
  assert.equal(commands.at(-1), 'go nodes 500000 movetime 6000');
  assert.ok(!commands.some((c) => c.startsWith('go depth')));
});

// The movetime on the nodes arm is a backstop against a pathologically slow box, not a second
// dial: if it ever binds, that ply's result stops being reproducible and the cache promise
// breaks. It must survive as a cap, so assert it is still carried.
test('the node budget keeps its movetime backstop', () => {
  const commands = buildJieqiAnalysisCommands(FEN, { nodes: 1, movetimeMs: 6_000 });
  assert.match(commands.at(-1) ?? '', / movetime 6000$/);
});

// The analysis options must be literals, not a read of the live env knobs: if
// MISTBOARD_PIKAFISH_JIEQI_HASH_MB/_THREADS leaked in here, two boxes would cache
// different evals under the same (room, engine, depth) key.
test('analysis resource options ignore the live env knobs', () => {
  const prevHash = process.env.MISTBOARD_PIKAFISH_JIEQI_HASH_MB;
  const prevThreads = process.env.MISTBOARD_PIKAFISH_JIEQI_THREADS;
  process.env.MISTBOARD_PIKAFISH_JIEQI_HASH_MB = '1024';
  process.env.MISTBOARD_PIKAFISH_JIEQI_THREADS = '8';
  try {
    assert.deepEqual(jieqiAnalysisResourceOptions(), [
      'setoption name Hash value 256',
      'setoption name Threads value 1',
    ]);
  } finally {
    if (prevHash === undefined) delete process.env.MISTBOARD_PIKAFISH_JIEQI_HASH_MB;
    else process.env.MISTBOARD_PIKAFISH_JIEQI_HASH_MB = prevHash;
    if (prevThreads === undefined) delete process.env.MISTBOARD_PIKAFISH_JIEQI_THREADS;
    else process.env.MISTBOARD_PIKAFISH_JIEQI_THREADS = prevThreads;
  }
});
