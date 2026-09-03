import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORTRESS_XIANGQI_SPEC_ID } from './game-specs.js';
import {
  attemptFortressXiangqiPuzzleLine,
  FORTRESS_XIANGQI_PUZZLES,
  type FortressXiangqiPuzzle,
  findFortressXiangqiMateInOneCandidates,
  fortressXiangqiPuzzleById,
  fortressXiangqiPuzzleMoveEquals,
  fortressXiangqiPuzzleMoveLabel,
  fortressXiangqiPuzzleNextMove,
  fortressXiangqiPuzzleSideToMove,
  fortressXiangqiSourceGameById,
  isFortressXiangqiPuzzleSolverPly,
  replayFortressXiangqiSourceGameToPly,
  validateFortressXiangqiPuzzle,
} from './puzzles-fortress-xiangqi.js';
import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  type FortressXiangqiMove,
  getFortressXiangqiLegalMoves,
} from './variants-fortress-xiangqi.js';

// Builds a legal N-ply line from the opening by always taking the first legal
// move, so winning-advantage tests do not depend on hand-authored coordinates.
function openingLine(plies: number): {
  initial: ReturnType<typeof createInitialFortressXiangqiState>;
  moves: FortressXiangqiMove[];
} {
  const initial = createInitialFortressXiangqiState('advantage-fixture');
  let state = initial;
  const moves: FortressXiangqiMove[] = [];
  for (let i = 0; i < plies; i += 1) {
    const move = getFortressXiangqiLegalMoves(state)[0] as FortressXiangqiMove;
    moves.push(move);
    state = applyFortressXiangqiMove(state, move);
  }
  return { initial, moves };
}

function advantagePuzzle(solution: FortressXiangqiMove[]): FortressXiangqiPuzzle {
  const initial = createInitialFortressXiangqiState('advantage-fixture');
  return {
    id: 'advantage-fixture',
    variant: FORTRESS_XIANGQI_SPEC_ID,
    title: 'Red wins material',
    initial,
    solution,
    goal: { type: 'winning-advantage', winner: 'red', centipawns: 600 },
    themes: ['chariot'],
  };
}

test('no forced mate-in-one exists from the opening position', () => {
  const state = createInitialFortressXiangqiState('opening');
  assert.equal(findFortressXiangqiMateInOneCandidates(state).length, 0);
});

test('the mate-in-one finder skips finished positions', () => {
  const state = createInitialFortressXiangqiState('finished');
  const finished = {
    ...state,
    status: { type: 'finished', winner: 'red', reason: 'resignation' } as const,
  };
  assert.equal(findFortressXiangqiMateInOneCandidates(finished).length, 0);
});

test('move helpers format and compare board and drop moves', () => {
  const board: FortressXiangqiMove = { from: 'c6', to: 'c8' };
  const drop: FortressXiangqiMove = { drop: 'chariot', to: 'd4' };
  assert.equal(fortressXiangqiPuzzleMoveLabel(board), 'c6-c8');
  assert.equal(fortressXiangqiPuzzleMoveLabel(drop), 'R@d4');
  assert.ok(fortressXiangqiPuzzleMoveEquals(board, { from: 'c6', to: 'c8' }));
  assert.ok(!fortressXiangqiPuzzleMoveEquals(board, { from: 'c6', to: 'c7' }));
  assert.ok(fortressXiangqiPuzzleMoveEquals(drop, { drop: 'chariot', to: 'd4' }));
  assert.ok(!fortressXiangqiPuzzleMoveEquals(drop, { drop: 'cannon', to: 'd4' }));
  assert.ok(!fortressXiangqiPuzzleMoveEquals(drop, { from: 'c6', to: 'd4' }));
});

test('solver plies are the even indices', () => {
  assert.ok(isFortressXiangqiPuzzleSolverPly(0));
  assert.ok(!isFortressXiangqiPuzzleSolverPly(1));
  assert.ok(isFortressXiangqiPuzzleSolverPly(2));
});

test('every shipped Fortress puzzle validates as a forced mate', () => {
  for (const puzzle of FORTRESS_XIANGQI_PUZZLES) {
    const result = validateFortressXiangqiPuzzle(puzzle);
    assert.ok(result.ok, `${puzzle.id} invalid: ${result.ok ? '' : result.issue.message}`);
    assert.equal(fortressXiangqiPuzzleById(puzzle.id), puzzle);
    assert.equal(fortressXiangqiPuzzleSideToMove(puzzle), puzzle.goal.winner ?? null);
    assert.equal(fortressXiangqiPuzzleNextMove(puzzle, 0), puzzle.solution[0] ?? null);
  }
});

test('the exact solution line completes every shipped puzzle', () => {
  for (const puzzle of FORTRESS_XIANGQI_PUZZLES) {
    const solverMoves = puzzle.solution.filter((_, index) => index % 2 === 0);
    const attempt = attemptFortressXiangqiPuzzleLine(puzzle, solverMoves);
    assert.ok(attempt.ok, `${puzzle.id} solver line rejected`);
    assert.ok(attempt.ok && attempt.complete, `${puzzle.id} solver line did not complete`);
  }
});

test('a wrong first move is rejected for every shipped puzzle', () => {
  for (const puzzle of FORTRESS_XIANGQI_PUZZLES) {
    const wrong: FortressXiangqiMove = { from: 'a1', to: 'a1' };
    const attempt = attemptFortressXiangqiPuzzleLine(puzzle, [wrong]);
    assert.ok(!attempt.ok, `${puzzle.id} accepted a bogus move`);
  }
});

test('a winning-advantage puzzle validates without ending in checkmate', () => {
  const { moves } = openingLine(1);
  const result = validateFortressXiangqiPuzzle(advantagePuzzle(moves));
  assert.ok(
    result.ok,
    `winning-advantage puzzle should validate: ${result.ok ? '' : result.issue.message}`,
  );
  // The line stops at the payoff move; the game is still in progress.
  assert.ok(result.ok && result.finalStatus.type === 'playing');
});

test('the solver line completes a winning-advantage puzzle mid-game', () => {
  const { moves } = openingLine(1);
  const attempt = attemptFortressXiangqiPuzzleLine(advantagePuzzle(moves), moves);
  assert.ok(
    attempt.ok && attempt.complete,
    'winning-advantage line should complete when exhausted',
  );
  assert.equal(attempt.ok && attempt.state.status.type, 'playing');
});

test('a winning-advantage solution ending on a defender move is rejected', () => {
  const { moves } = openingLine(2); // even length -> ends on the defender reply
  const result = validateFortressXiangqiPuzzle(advantagePuzzle(moves));
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.issue.code === 'solution-must-end-on-solver-move');
});

// REMOVED 2026-09-03: 'a winning-advantage puzzle dominated by a mate-in-one is
// rejected'. It worked by finding a mate-in-one among the SHIPPED Fortress
// puzzles and relabelling it, and Fortress now ships none. The validator rule it
// covered (goal 'winning-advantage' is rejected with code 'dominated-by-mate-in-one'
// when the line is a forced mate) is still live in puzzles-fortress-xiangqi.ts and
// still enforced on every mined candidate. Restore this test with the corpus if
// Fortress puzzles come back.

test('every puzzle sourceGame replays to its initial position', () => {
  for (const puzzle of FORTRESS_XIANGQI_PUZZLES) {
    if (!puzzle.sourceGame) continue;
    const game = fortressXiangqiSourceGameById(puzzle.sourceGame.gameId);
    assert.ok(game, `${puzzle.id} references missing source game ${puzzle.sourceGame.gameId}`);
    const replayed = replayFortressXiangqiSourceGameToPly(game, puzzle.sourceGame.ply);
    assert.ok(replayed, `${puzzle.id} source game does not reach ply ${puzzle.sourceGame.ply}`);
    // The linkage is only meaningful if the game at that ply IS the puzzle position.
    assert.deepEqual(replayed.board, puzzle.initial.board, `${puzzle.id} board mismatch`);
    assert.deepEqual(replayed.hands, puzzle.initial.hands, `${puzzle.id} hands mismatch`);
    assert.deepEqual(replayed.status, puzzle.initial.status, `${puzzle.id} turn mismatch`);
  }
});

test('an empty solution fails validation', () => {
  const [first] = FORTRESS_XIANGQI_PUZZLES;
  if (!first) return; // corpus not yet generated
  const result = validateFortressXiangqiPuzzle({ ...first, solution: [] });
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.issue.code === 'empty-solution');
});
