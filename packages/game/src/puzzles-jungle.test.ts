import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JUNGLE_SPEC_ID } from './game-specs.js';
import {
  attemptJunglePuzzleLine,
  findJungleForcedWinLine,
  findJungleForcedWinLines,
  findJungleMaterialTactic,
  findJungleWinInOneCandidates,
  isJunglePuzzleSolverPly,
  JUNGLE_PUZZLES,
  type JunglePuzzle,
  jungleMaterialBalance,
  junglePuzzleById,
  junglePuzzleMoveEquals,
  junglePuzzleMoveLabel,
  junglePuzzleNextMove,
  junglePuzzleSideToMove,
  jungleSourceGameById,
  replayJungleSourceGameToPly,
  validateJunglePuzzle,
} from './puzzles-jungle.js';
import {
  applyJungleMove,
  createInitialJungleState,
  getJungleLegalMoves,
  type JungleMove,
} from './variants-jungle.js';

// Builds a legal N-ply line from the opening by always taking the first legal
// move, so winning-advantage tests do not depend on hand-authored coordinates.
function openingLine(plies: number): {
  initial: ReturnType<typeof createInitialJungleState>;
  moves: JungleMove[];
} {
  const initial = createInitialJungleState('advantage-fixture');
  let state = initial;
  const moves: JungleMove[] = [];
  for (let i = 0; i < plies; i += 1) {
    const move = getJungleLegalMoves(state)[0] as JungleMove;
    moves.push(move);
    state = applyJungleMove(state, move);
  }
  return { initial, moves };
}

function advantagePuzzle(solution: JungleMove[]): JunglePuzzle {
  const initial = createInitialJungleState('advantage-fixture');
  return {
    id: 'advantage-fixture',
    variant: JUNGLE_SPEC_ID,
    title: 'Red wins material',
    initial,
    solution,
    goal: { type: 'winning-advantage', winner: 'red', centipawns: 600 },
    themes: ['winning'],
  };
}

test('no forced win-in-one exists from the opening position', () => {
  const state = createInitialJungleState('opening');
  assert.equal(findJungleWinInOneCandidates(state).length, 0);
});

test('the forced-win line finder returns null from the opening position', () => {
  const state = createInitialJungleState('opening');
  assert.equal(findJungleForcedWinLine(state, 3), null);
  assert.equal(findJungleForcedWinLines(state, 1).length, 0);
});

// Exercise the primitive on the shallow (win-in-1/2) puzzles: cheap, deterministic,
// and enough to prove the finder agrees with the corpus. The deeper win-in-3/4
// tactics are already guaranteed sound by validateJunglePuzzle (they replay the
// full solution) and by the miner that emitted them, so re-searching them here
// would only add slow, budget-sensitive duplication.
const SHALLOW_WIN_PUZZLES = JUNGLE_PUZZLES.filter(
  (puzzle) => puzzle.goal.type === 'win' && puzzle.solution.length <= 3,
);
const AMPLE_BUDGET = { nodeLimit: 5_000_000 };

test('the forced-win line finder recovers shallow mined win puzzles at their depth', () => {
  for (const puzzle of SHALLOW_WIN_PUZZLES) {
    const solverPlies = Math.ceil(puzzle.solution.length / 2);
    const line = findJungleForcedWinLine(puzzle.initial, solverPlies, AMPLE_BUDGET);
    assert.ok(line, `${puzzle.id}: no forced win found at depth ${solverPlies}`);
    // The miner enforced a unique winning first move, so the finder must agree on it.
    assert.equal(line[0]?.from, puzzle.solution[0]?.from, `${puzzle.id} first-move from`);
    assert.equal(line[0]?.to, puzzle.solution[0]?.to, `${puzzle.id} first-move to`);
  }
});

test('forced-win depth is exact: a shallow win-in-k position is empty at other depths', () => {
  for (const puzzle of SHALLOW_WIN_PUZZLES) {
    const k = Math.ceil(puzzle.solution.length / 2);
    assert.ok(
      findJungleForcedWinLines(puzzle.initial, k, AMPLE_BUDGET).length > 0,
      `${puzzle.id}: none at k=${k}`,
    );
    for (let shorter = 1; shorter < k; shorter += 1) {
      assert.equal(
        findJungleForcedWinLines(puzzle.initial, shorter, AMPLE_BUDGET).length,
        0,
        `${puzzle.id}: unexpected win at depth ${shorter} < ${k}`,
      );
    }
  }
});

test('material balance is even at the opening and no material tactic exists there', () => {
  const opening = createInitialJungleState('opening');
  assert.equal(jungleMaterialBalance(opening.board, 'red'), 0);
  assert.equal(jungleMaterialBalance(opening.board, 'black'), 0);
  assert.equal(findJungleMaterialTactic(opening), null);
});

test('the material finder spots an undefended winning capture', () => {
  // Red elephant on e1 can take the black lion on e2 (elephant outranks lion), and
  // black has no piece that can recapture on e2 — a clean +90 material win, game on.
  const base = createInitialJungleState('mat-fixture');
  const fixture = {
    ...base,
    board: {
      e1: { color: 'red', role: 'elephant' },
      e2: { color: 'black', role: 'lion' },
      a1: { color: 'red', role: 'rat' },
      a9: { color: 'black', role: 'rat' },
    },
    status: { type: 'playing', turn: 'red' },
    positionCounts: {},
  } as const;
  const tactic = findJungleMaterialTactic(fixture, { minGain: 40 });
  assert.ok(tactic, 'expected a material tactic (elephant takes lion)');
  assert.equal(tactic.line[0]?.from, 'e1');
  assert.equal(tactic.line[0]?.to, 'e2');
  assert.ok(tactic.gain >= 90, `expected gain >= 90, got ${tactic.gain}`);
  // The line ends on the solver's move and does not finish the game.
  assert.equal(tactic.line.length % 2, 1);
});

test('the material finder rejects a capture that is dominated by a forced win', () => {
  // Regression for jungle-material-038: black tiger c2 can grab the red leopard on c3
  // (+50, game continues), but c2-c1 then c1-d1 is a forced den-win in 2 solver plies.
  // A den-entry changes zero material, so the pure-material search only sees it by
  // reaching the terminal — the miner must not emit a "win material" puzzle here.
  const base = createInitialJungleState('dominated-fixture');
  const fixture = {
    ...base,
    board: {
      f7: { color: 'black', role: 'dog' },
      c7: { color: 'black', role: 'wolf' },
      a8: { color: 'black', role: 'elephant' },
      f8: { color: 'black', role: 'leopard' },
      g5: { color: 'red', role: 'cat' },
      e6: { color: 'black', role: 'rat' },
      g8: { color: 'black', role: 'lion' },
      f2: { color: 'red', role: 'tiger' },
      c3: { color: 'red', role: 'leopard' },
      c2: { color: 'black', role: 'tiger' },
      e2: { color: 'red', role: 'elephant' },
    },
    status: { type: 'playing', turn: 'black' },
    positionCounts: {},
  } as const;
  // The dominating forced win really exists (unique in its first move: c2-c1).
  const win = findJungleForcedWinLine(fixture, 4, { requireUnique: false });
  assert.ok(win, 'expected a forced den-win from the fixture');
  assert.equal(win[0]?.from, 'c2');
  assert.equal(win[0]?.to, 'c1');
  // ...so the material finder must refuse the position, not emit the +50 capture.
  assert.equal(findJungleMaterialTactic(fixture, { minGain: 40 }), null);
});

test('the win-in-one finder skips finished positions', () => {
  const state = createInitialJungleState('finished');
  const finished = {
    ...state,
    status: { type: 'finished', winner: 'red', reason: 'resignation' } as const,
  };
  assert.equal(findJungleWinInOneCandidates(finished).length, 0);
});

test('move helpers format and compare moves', () => {
  const move: JungleMove = { from: 'd2', to: 'd1' };
  assert.equal(junglePuzzleMoveLabel(move), 'd2-d1');
  assert.ok(junglePuzzleMoveEquals(move, { from: 'd2', to: 'd1' }));
  assert.ok(!junglePuzzleMoveEquals(move, { from: 'd2', to: 'c2' }));
});

test('solver plies are the even indices', () => {
  assert.ok(isJunglePuzzleSolverPly(0));
  assert.ok(!isJunglePuzzleSolverPly(1));
  assert.ok(isJunglePuzzleSolverPly(2));
});

test('every shipped Jungle puzzle validates as a forced win', () => {
  for (const puzzle of JUNGLE_PUZZLES) {
    const result = validateJunglePuzzle(puzzle);
    assert.ok(result.ok, `${puzzle.id} invalid: ${result.ok ? '' : result.issue.message}`);
    assert.equal(junglePuzzleById(puzzle.id), puzzle);
    assert.equal(junglePuzzleSideToMove(puzzle), puzzle.goal.winner ?? null);
    assert.equal(junglePuzzleNextMove(puzzle, 0), puzzle.solution[0] ?? null);
  }
});

test('the exact solution line completes every shipped puzzle', () => {
  for (const puzzle of JUNGLE_PUZZLES) {
    const solverMoves = puzzle.solution.filter((_, index) => index % 2 === 0);
    const attempt = attemptJunglePuzzleLine(puzzle, solverMoves);
    assert.ok(attempt.ok, `${puzzle.id} solver line rejected`);
    assert.ok(attempt.ok && attempt.complete, `${puzzle.id} solver line did not complete`);
  }
});

test('a wrong first move is rejected for every shipped puzzle', () => {
  for (const puzzle of JUNGLE_PUZZLES) {
    const wrong: JungleMove = { from: 'a1', to: 'a1' };
    const attempt = attemptJunglePuzzleLine(puzzle, [wrong]);
    assert.ok(!attempt.ok, `${puzzle.id} accepted a bogus move`);
  }
});

test('a winning-advantage puzzle validates without ending the game', () => {
  const { moves } = openingLine(1);
  const result = validateJunglePuzzle(advantagePuzzle(moves));
  assert.ok(
    result.ok,
    `winning-advantage puzzle should validate: ${result.ok ? '' : result.issue.message}`,
  );
  // The line stops at the payoff move; the game is still in progress.
  assert.ok(result.ok && result.finalStatus.type === 'playing');
});

test('the solver line completes a winning-advantage puzzle mid-game', () => {
  const { moves } = openingLine(1);
  const attempt = attemptJunglePuzzleLine(advantagePuzzle(moves), moves);
  assert.ok(
    attempt.ok && attempt.complete,
    'winning-advantage line should complete when exhausted',
  );
  assert.equal(attempt.ok && attempt.state.status.type, 'playing');
});

test('a winning-advantage solution ending on a defender move is rejected', () => {
  const { moves } = openingLine(2); // even length -> ends on the defender reply
  const result = validateJunglePuzzle(advantagePuzzle(moves));
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.issue.code === 'solution-must-end-on-solver-move');
});

test('every puzzle sourceGame replays to its initial position', () => {
  for (const puzzle of JUNGLE_PUZZLES) {
    if (!puzzle.sourceGame) continue;
    const game = jungleSourceGameById(puzzle.sourceGame.gameId);
    assert.ok(game, `${puzzle.id} references missing source game ${puzzle.sourceGame.gameId}`);
    const replayed = replayJungleSourceGameToPly(game, puzzle.sourceGame.ply);
    assert.ok(replayed, `${puzzle.id} source game does not reach ply ${puzzle.sourceGame.ply}`);
    // The linkage is only meaningful if the game at that ply IS the puzzle position.
    assert.deepEqual(replayed.board, puzzle.initial.board, `${puzzle.id} board mismatch`);
    assert.deepEqual(replayed.status, puzzle.initial.status, `${puzzle.id} turn mismatch`);
  }
});

test('an empty solution fails validation', () => {
  const [first] = JUNGLE_PUZZLES;
  if (!first) return; // corpus not yet generated
  const result = validateJunglePuzzle({ ...first, solution: [] });
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.issue.code === 'empty-solution');
});
