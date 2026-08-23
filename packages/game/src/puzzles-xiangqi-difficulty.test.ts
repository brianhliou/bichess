import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIFFICULTY_MAX,
  DIFFICULTY_MIN,
  deriveXiangqiPuzzleDifficulty,
  XIANGQI_SPEC_ID,
  type XiangqiPuzzle,
} from './index.js';
import { loadSeedPuzzleRegistry } from './puzzle-seed.js';

// Seeded from the real corpus rather than hand-authored positions: a fixture
// written from this module's own assumptions about the ply convention would
// agree with a wrong convention. These are the same records the store serves.
const corpus = loadSeedPuzzleRegistry('xiangqi').filter(
  (puzzle): puzzle is XiangqiPuzzle => puzzle.variant === XIANGQI_SPEC_ID,
);

test('the whole shipped xiangqi corpus replays cleanly through the move generator', () => {
  assert.ok(corpus.length > 0, 'corpus fixture is empty');
  const broken = corpus.filter((puzzle) => !deriveXiangqiPuzzleDifficulty(puzzle).complete);
  // A wrong solver/defender ply split, or an off-by-one in the walk, desyncs
  // the replay and shows up here as illegal moves — not as a plausible score.
  assert.deepEqual(
    broken.map((puzzle) => puzzle.id),
    [],
  );
});

test('scores stay on the rating scale and rise with mate depth', () => {
  const byDepth = new Map<number, number[]>();
  for (const puzzle of corpus) {
    const derived = deriveXiangqiPuzzleDifficulty(puzzle);
    assert.ok(
      derived.score >= DIFFICULTY_MIN && derived.score <= DIFFICULTY_MAX,
      `${puzzle.id} scored ${derived.score} outside the clamp`,
    );
    const group = byDepth.get(derived.solverPlies) ?? [];
    group.push(derived.score);
    byDepth.set(derived.solverPlies, group);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const means = depths.map((depth) => {
    const scores = byDepth.get(depth) ?? [];
    return scores.reduce((total, score) => total + score, 0) / scores.length;
  });
  for (let index = 1; index < means.length; index += 1) {
    assert.ok(
      (means[index] ?? 0) > (means[index - 1] ?? 0),
      `depth ${depths[index]} mean ${means[index]} did not exceed depth ${depths[index - 1]}`,
    );
  }
});

test('the prior separates puzzles the depth-only seed rates identically', () => {
  // The whole point: the served seed rating is a function of mate depth alone,
  // so the largest depth bucket is one big tie. If this assertion fails the
  // prior has stopped adding information and selection is back to jitter.
  const buckets = new Map<number, Set<number>>();
  for (const puzzle of corpus) {
    const derived = deriveXiangqiPuzzleDifficulty(puzzle);
    const bucket = buckets.get(derived.solverPlies) ?? new Set<number>();
    bucket.add(derived.score);
    buckets.set(derived.solverPlies, bucket);
  }
  const counts = new Map<number, number>();
  for (const puzzle of corpus) {
    const depth = deriveXiangqiPuzzleDifficulty(puzzle).solverPlies;
    counts.set(depth, (counts.get(depth) ?? 0) + 1);
  }
  const [largestDepth, size] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  const distinct = buckets.get(largestDepth)?.size ?? 0;
  assert.ok(size >= 5, 'expected a meaningful tie bucket in the corpus');
  assert.ok(
    distinct >= Math.ceil(size * 0.75),
    `depth ${largestDepth}: ${distinct} distinct scores across ${size} puzzles`,
  );
});

test('a capturing key is never tagged quiet, and quiet keys are tagged', () => {
  for (const puzzle of corpus) {
    const first = puzzle.solution[0];
    if (!first) continue;
    const capturing = puzzle.initial.board[first.to] !== undefined;
    const derived = deriveXiangqiPuzzleDifficulty(puzzle);
    assert.equal(
      derived.quietFirstMove,
      !capturing,
      `${puzzle.id} quiet flag disagrees with the board`,
    );
    assert.equal(derived.motifs.includes('quiet-move'), !capturing);
  }
});

test('an unrecovered concession books a sacrifice, a recovered one does not', () => {
  for (const puzzle of corpus) {
    const derived = deriveXiangqiPuzzleDifficulty(puzzle);
    assert.ok(derived.sacrificeCp >= 0);
    assert.equal(derived.motifs.includes('sacrifice'), derived.sacrificeCp >= 200);
  }
  // At least one real puzzle must exercise each side, or the branch is untested.
  const withSacrifice = corpus.filter((p) => deriveXiangqiPuzzleDifficulty(p).sacrificeCp >= 200);
  const withoutSacrifice = corpus.filter((p) => deriveXiangqiPuzzleDifficulty(p).sacrificeCp === 0);
  assert.ok(withSacrifice.length > 0, 'no corpus puzzle exercises the sacrifice branch');
  assert.ok(withoutSacrifice.length > 0, 'no corpus puzzle exercises the clean-line branch');
});

test('derivation is deterministic', () => {
  for (const puzzle of corpus.slice(0, 10)) {
    assert.deepEqual(deriveXiangqiPuzzleDifficulty(puzzle), deriveXiangqiPuzzleDifficulty(puzzle));
  }
});
