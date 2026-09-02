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

// The key move takes a chariot on c8 that nothing defends, and the line runs on
// for six more plies. This is the shape that scored 2250 out of 2600 in the
// served corpus before free-material was measured: the miner's gate admits it
// with its widest margin (a hanging piece is the most uniquely best move on the
// board) and the depth-driven prior then rates it expert.
const FREE_CHARIOT: XiangqiPuzzle = {
  id: 'test-free-chariot',
  variant: XIANGQI_SPEC_ID,
  title: 'free chariot',
  initial: {
    id: 'test-free-chariot',
    board: {
      c8: { role: 'chariot', color: 'red' },
      c3: { role: 'chariot', color: 'black' },
      e1: { role: 'general', color: 'red' },
      e10: { role: 'general', color: 'black' },
    },
    status: { type: 'playing', turn: 'black' },
    moveNumber: 40,
    progressClock: 0,
    positionCounts: {},
  },
  solution: [{ from: 'c3', to: 'c8' }],
  goal: { type: 'winning-advantage', winner: 'black', centipawns: 900 },
  themes: [],
} as unknown as XiangqiPuzzle;

test('an unanswerable capture is scored as free material, not as a hard puzzle', () => {
  const derived = deriveXiangqiPuzzleDifficulty(FREE_CHARIOT);
  assert.equal(derived.freeCaptureCp, 900, 'a chariot nothing defends is 900cp of free material');
  assert.ok(derived.motifs.includes('free-material'));
  const penalised = derived.score;

  // Same line, but a red general now guards c8, so the capture has to be
  // calculated rather than seen. Nothing else about the puzzle changes.
  const defended = structuredClone(FREE_CHARIOT);
  defended.initial.board.c9 = { role: 'general', color: 'red' };
  delete defended.initial.board.e1;
  const guarded = deriveXiangqiPuzzleDifficulty(defended);
  assert.equal(guarded.freeCaptureCp, 0, 'a defended capture is not free material');
  assert.ok(
    guarded.score > penalised,
    `defended (${guarded.score}) should outrank free (${penalised})`,
  );
});

// A capture that mates leaves the opponent no legal moves at all, which a naive
// "can anything recapture?" check reads as unanswerable. It is not free: the
// game is simply over. Without this guard every mating capture in the corpus
// takes the full penalty.
test('a capture that delivers mate is not counted as free material', () => {
  const mating = corpus.filter((puzzle) => {
    const derived = deriveXiangqiPuzzleDifficulty(puzzle);
    return derived.complete && !derived.quietFirstMove && puzzle.solution.length === 1;
  });
  for (const puzzle of mating) {
    const derived = deriveXiangqiPuzzleDifficulty(puzzle);
    if (puzzle.goal.type !== 'checkmate') continue;
    assert.equal(
      derived.freeCaptureCp,
      0,
      `${puzzle.id}: a mating capture must not be read as free material`,
    );
  }
});
