import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptMiniXiangqiPuzzleLine,
  DEFAULT_DROP_MINI_XIANGQI_RULES,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiPuzzle,
  findMiniXiangqiMateInOneCandidates,
  isMiniXiangqiGeneralInCheckOnBoard,
  isMiniXiangqiPuzzleSolverPly,
  MINI_XIANGQI_PUZZLES,
  MINI_XIANGQI_SPEC_ID,
  miniXiangqiPuzzleById,
  miniXiangqiPuzzleMoveEquals,
  miniXiangqiPuzzleMoveLabel,
  miniXiangqiPuzzleNextMove,
  miniXiangqiPuzzleSideToMove,
  miniXiangqiPuzzlesForVariant,
  type OpenMiniXiangqiPuzzle,
  oppositeMiniXiangqiColor,
  validateMiniXiangqiPuzzle,
} from './index.js';

test('Mini Xiangqi puzzle registry validates', () => {
  // The 12 hand-built fixtures; the SERVED corpus (these + the mined drop-mini
  // set) is the seed asset since #183 (see puzzles-seed.test.ts).
  assert.equal(MINI_XIANGQI_PUZZLES.length, 12);

  for (const puzzle of MINI_XIANGQI_PUZZLES) {
    const result = validateMiniXiangqiPuzzle(puzzle);

    assert.equal(result.ok, true, puzzle.id);
    assert.equal(result.ok && result.finalStatus.reason, 'checkmate');
    assert.equal(result.ok && result.plyCount, puzzle.solution.length);
    assert.equal(
      puzzle.initial.status.type === 'playing' &&
        isMiniXiangqiGeneralInCheckOnBoard(
          puzzle.initial.board,
          oppositeMiniXiangqiColor(puzzle.initial.status.turn),
        ),
      false,
      `${puzzle.id} should not start with the defender already in check`,
    );
  }
});

test('puzzle lookup and variant filtering expose Mini and Drop Mini tracks', () => {
  assert.equal(miniXiangqiPuzzleById('missing-puzzle'), null);
  assert.equal(
    miniXiangqiPuzzleById('mini-xiangqi-red-back-rank-net-1')?.variant,
    MINI_XIANGQI_SPEC_ID,
  );
  assert.deepEqual(
    miniXiangqiPuzzlesForVariant(MINI_XIANGQI_SPEC_ID).map((puzzle) => puzzle.id),
    [
      'mini-xiangqi-red-back-rank-net-1',
      'mini-xiangqi-black-back-rank-net-1',
      'mini-xiangqi-black-two-step-file-net-1',
      'mini-xiangqi-red-cannon-switch-mate-1',
      'mini-xiangqi-red-double-chariot-file-mate-1',
      'mini-xiangqi-red-horse-return-mate-1',
    ],
  );
  assert.deepEqual(
    miniXiangqiPuzzlesForVariant(DROP_MINI_XIANGQI_SPEC_ID).map((puzzle) => puzzle.id),
    [
      'drop-mini-xiangqi-red-chariot-drop-mate-1',
      'drop-mini-xiangqi-black-soldier-drop-net-1',
      'drop-mini-xiangqi-red-cannon-clearance-mate-1',
      'drop-mini-xiangqi-red-twin-cannon-mate-1',
      'drop-mini-xiangqi-black-cannon-ladder-mate-1',
      'drop-mini-xiangqi-black-chariot-drop-mate-1',
    ],
  );
});

test('puzzle move helpers support solver plies and drop notation', () => {
  const puzzle = miniXiangqiPuzzleById(
    'drop-mini-xiangqi-red-chariot-drop-mate-1',
  ) as DropMiniXiangqiPuzzle;
  const move = miniXiangqiPuzzleNextMove(puzzle, 0);

  assert.equal(miniXiangqiPuzzleSideToMove(puzzle), 'red');
  assert.equal(isMiniXiangqiPuzzleSolverPly(0), true);
  assert.equal(isMiniXiangqiPuzzleSolverPly(1), false);
  assert.deepEqual(move, { drop: 'chariot', to: 'd4' });
  assert.equal(move ? miniXiangqiPuzzleMoveLabel(move) : null, 'R@d4');
  assert.equal(
    move ? miniXiangqiPuzzleMoveEquals(move, { drop: 'chariot', to: 'd4' }) : false,
    true,
  );
  assert.equal(
    move ? miniXiangqiPuzzleMoveEquals(move, { drop: 'horse', to: 'd4' }) : false,
    false,
  );
});

test('puzzle attempts advance correct moves to the solved state', () => {
  const puzzle = miniXiangqiPuzzleById(
    'drop-mini-xiangqi-red-chariot-drop-mate-1',
  ) as DropMiniXiangqiPuzzle;

  const result = attemptMiniXiangqiPuzzleLine(puzzle, [{ drop: 'chariot', to: 'd4' }]);

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.complete, true);
  assert.equal(result.ok && result.state.status.type, 'finished');
  assert.deepEqual(result.ok && result.playedMoves, [{ drop: 'chariot', to: 'd4' }]);
  assert.deepEqual(result.ok && result.solverMoves, [{ drop: 'chariot', to: 'd4' }]);
  assert.deepEqual(result.ok && result.lastMove, { drop: 'chariot', to: 'd4' });
});

test('puzzle attempts accept solver moves only and auto-apply opponent replies', () => {
  const puzzle = miniXiangqiPuzzleById(
    'mini-xiangqi-black-two-step-file-net-1',
  ) as OpenMiniXiangqiPuzzle;

  const first = attemptMiniXiangqiPuzzleLine(puzzle, [{ from: 'c5', to: 'd5' }]);

  assert.equal(first.ok, true);
  assert.equal(first.ok && first.complete, false);
  assert.equal(first.ok && first.ply, 2);
  assert.deepEqual(first.ok && first.playedMoves, [
    { from: 'c5', to: 'd5' },
    { from: 'e2', to: 'e3' },
  ]);
  assert.deepEqual(first.ok && first.solverMoves, [{ from: 'c5', to: 'd5' }]);
  assert.deepEqual(first.ok && first.state.status, { type: 'playing', turn: 'black' });
  assert.deepEqual(first.ok && first.lastMove, { from: 'e2', to: 'e3' });

  const solved = attemptMiniXiangqiPuzzleLine(puzzle, [
    { from: 'c5', to: 'd5' },
    { from: 'f1', to: 'e1' },
  ]);

  assert.equal(solved.ok, true);
  assert.equal(solved.ok && solved.complete, true);
  assert.equal(solved.ok && solved.ply, 3);
  assert.deepEqual(solved.ok && solved.playedMoves, [
    { from: 'c5', to: 'd5' },
    { from: 'e2', to: 'e3' },
    { from: 'f1', to: 'e1' },
  ]);
  assert.deepEqual(solved.ok && solved.state.status, {
    type: 'finished',
    winner: 'black',
    reason: 'checkmate',
  });
});

test('Drop Mini puzzle attempts auto-apply opponent replies after a reserve drop', () => {
  const puzzle = miniXiangqiPuzzleById(
    'drop-mini-xiangqi-black-soldier-drop-net-1',
  ) as DropMiniXiangqiPuzzle;

  const first = attemptMiniXiangqiPuzzleLine(puzzle, [{ drop: 'soldier', to: 'd4' }]);

  assert.equal(first.ok, true);
  assert.equal(first.ok && first.complete, false);
  assert.deepEqual(first.ok && first.playedMoves, [
    { drop: 'soldier', to: 'd4' },
    { from: 'e3', to: 'd3' },
  ]);
  assert.deepEqual(first.ok && first.solverMoves, [{ drop: 'soldier', to: 'd4' }]);

  const solved = attemptMiniXiangqiPuzzleLine(puzzle, [
    { drop: 'soldier', to: 'd4' },
    { from: 'g3', to: 'd3' },
  ]);

  assert.equal(solved.ok, true);
  assert.equal(solved.ok && solved.complete, true);
  assert.deepEqual(solved.ok && solved.state.status, {
    type: 'finished',
    winner: 'black',
    reason: 'checkmate',
  });
});

test('mate-in-three puzzles accept solver moves and auto-apply both replies', () => {
  const open = miniXiangqiPuzzleById(
    'mini-xiangqi-red-cannon-switch-mate-1',
  ) as OpenMiniXiangqiPuzzle;
  const drop = miniXiangqiPuzzleById(
    'drop-mini-xiangqi-red-cannon-clearance-mate-1',
  ) as DropMiniXiangqiPuzzle;

  const openSecond = attemptMiniXiangqiPuzzleLine(open, [
    { from: 'e2', to: 'd2' },
    { from: 'g1', to: 'e1' },
  ]);
  assert.equal(openSecond.ok, true);
  assert.equal(openSecond.ok && openSecond.complete, false);
  assert.equal(openSecond.ok && openSecond.ply, 4);
  assert.deepEqual(openSecond.ok && openSecond.playedMoves, [
    { from: 'e2', to: 'd2' },
    { from: 'd6', to: 'e6' },
    { from: 'g1', to: 'e1' },
    { from: 'f4', to: 'e4' },
  ]);

  const openSolved = attemptMiniXiangqiPuzzleLine(open, [
    { from: 'e2', to: 'd2' },
    { from: 'g1', to: 'e1' },
    { from: 'e1', to: 'e4' },
  ]);
  assert.equal(openSolved.ok, true);
  assert.deepEqual(openSolved.ok && openSolved.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'checkmate',
  });

  const dropSolved = attemptMiniXiangqiPuzzleLine(drop, [
    { from: 'f5', to: 'f7' },
    { drop: 'cannon', to: 'b7' },
    { from: 'b1', to: 'b7' },
  ]);
  assert.equal(dropSolved.ok, true);
  assert.deepEqual(dropSolved.ok && dropSolved.playedMoves, [
    { from: 'f5', to: 'f7' },
    { from: 'g7', to: 'f7' },
    { drop: 'cannon', to: 'b7' },
    { from: 'a7', to: 'b7' },
    { from: 'b1', to: 'b7' },
  ]);
  assert.deepEqual(dropSolved.ok && dropSolved.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'checkmate',
  });
});

test('puzzle attempts reject wrong moves without returning the solution', () => {
  const puzzle = miniXiangqiPuzzleById('mini-xiangqi-red-back-rank-net-1') as OpenMiniXiangqiPuzzle;

  const result = attemptMiniXiangqiPuzzleLine(puzzle, [{ from: 'c4', to: 'c5' }]);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.code, 'incorrect-move');
  assert.equal(JSON.stringify(result).includes('"to":"d4"'), false);
});

test('mate-in-one finder discovers Mini and Drop Mini puzzle moves', () => {
  const open = miniXiangqiPuzzleById('mini-xiangqi-red-back-rank-net-1') as OpenMiniXiangqiPuzzle;
  const drop = miniXiangqiPuzzleById(
    'drop-mini-xiangqi-red-chariot-drop-mate-1',
  ) as DropMiniXiangqiPuzzle;

  assert.deepEqual(
    findMiniXiangqiMateInOneCandidates(open.variant, open.initial).map((candidate) =>
      miniXiangqiPuzzleMoveLabel(candidate.move),
    ),
    ['c4-d4'],
  );
  assert.deepEqual(
    findMiniXiangqiMateInOneCandidates(drop.variant, drop.initial).map((candidate) =>
      miniXiangqiPuzzleMoveLabel(candidate.move),
    ),
    ['R@d4'],
  );
});

test('mate-in-one finder rejects positions where the defender starts in check', () => {
  const puzzle: OpenMiniXiangqiPuzzle = {
    id: 'mini-open-starts-in-check',
    variant: MINI_XIANGQI_SPEC_ID,
    title: 'Starts in check',
    initial: {
      id: 'mini-open-starts-in-check',
      board: {
        c1: { color: 'red', role: 'chariot' },
        d1: { color: 'red', role: 'general' },
        d4: { color: 'red', role: 'chariot' },
        e1: { color: 'red', role: 'chariot' },
        d7: { color: 'black', role: 'general' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    },
    solution: [{ from: 'd4', to: 'd3' }],
    goal: { type: 'checkmate', winner: 'red' },
    themes: ['checkmate'],
  };

  assert.deepEqual(findMiniXiangqiMateInOneCandidates(puzzle.variant, puzzle.initial), []);
});

test('empty puzzle attempts return the starting state without leaking the first move', () => {
  const puzzle = miniXiangqiPuzzleById('mini-xiangqi-red-back-rank-net-1') as OpenMiniXiangqiPuzzle;

  const result = attemptMiniXiangqiPuzzleLine(puzzle, []);

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.complete, false);
  assert.deepEqual(result.ok && result.playedMoves, []);
  assert.deepEqual(result.ok && result.solverMoves, []);
  assert.equal(result.ok && 'lastMove' in result, false);
  assert.equal(JSON.stringify(result).includes('"to":"d4"'), false);
});

test('Mini Xiangqi puzzles reject hidden-mode direct general capture', () => {
  const puzzle: OpenMiniXiangqiPuzzle = {
    id: 'mini-open-rejects-flying-capture',
    variant: MINI_XIANGQI_SPEC_ID,
    title: 'Illegal flying capture',
    initial: {
      id: 'mini-open-rejects-flying-capture',
      board: {
        d1: { color: 'red', role: 'general' },
        d7: { color: 'black', role: 'general' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    },
    solution: [{ from: 'd1', to: 'd7' }],
    goal: { type: 'checkmate', winner: 'red' },
    themes: ['checkmate'],
  };

  const result = validateMiniXiangqiPuzzle(puzzle);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.issue.code, 'illegal-move');
  assert.equal(result.ok ? null : result.issue.ply, 0);
});

test('puzzle validation rejects immediate general captures outside the solution', () => {
  const puzzle: OpenMiniXiangqiPuzzle = {
    id: 'mini-open-ambiguous-general-capture',
    variant: MINI_XIANGQI_SPEC_ID,
    title: 'Ambiguous capture',
    initial: {
      id: 'mini-open-ambiguous-general-capture',
      board: {
        c4: { color: 'red', role: 'chariot' },
        d1: { color: 'red', role: 'general' },
        d7: { color: 'black', role: 'general' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    },
    solution: [{ from: 'c4', to: 'd4' }],
    goal: { type: 'checkmate', winner: 'red' },
    themes: ['checkmate'],
  };

  const result = validateMiniXiangqiPuzzle(puzzle);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.issue.code, 'ambiguous-immediate-general-capture');
  assert.deepEqual(result.ok ? null : result.issue.move, { from: 'd1', to: 'd7' });
});

test('Drop Mini Xiangqi puzzles require the drop piece to be in hand', () => {
  const source = miniXiangqiPuzzleById(
    'drop-mini-xiangqi-red-chariot-drop-mate-1',
  ) as DropMiniXiangqiPuzzle;
  const puzzle: DropMiniXiangqiPuzzle = {
    ...source,
    id: 'drop-mini-missing-hand',
    initial: {
      ...source.initial,
      hands: { red: {}, black: {} },
      positionCounts: {},
    },
  };

  const result = validateMiniXiangqiPuzzle(puzzle);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.issue.code, 'illegal-move');
  assert.deepEqual(result.ok ? null : result.issue.move, { drop: 'chariot', to: 'd4' });
});

test('Drop Mini Xiangqi puzzle validation respects normal drop policies', () => {
  const puzzle: DropMiniXiangqiPuzzle = {
    id: 'drop-mini-enemy-palace-drop',
    variant: DROP_MINI_XIANGQI_SPEC_ID,
    title: 'Illegal enemy palace drop',
    initial: {
      id: 'drop-mini-enemy-palace-drop',
      board: {
        d1: { color: 'red', role: 'general' },
        d3: { color: 'red', role: 'soldier' },
        d7: { color: 'black', role: 'general' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      rules: DEFAULT_DROP_MINI_XIANGQI_RULES,
      hands: { red: { horse: 1 }, black: {} },
      cooldownHands: { red: {}, black: {} },
      positionCounts: {},
    },
    solution: [{ drop: 'horse', to: 'd5' }],
    goal: { type: 'checkmate', winner: 'red' },
    themes: ['drop'],
  };

  const result = validateMiniXiangqiPuzzle(puzzle);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.issue.code, 'illegal-move');
});
