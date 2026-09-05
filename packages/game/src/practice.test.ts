import assert from 'node:assert/strict';
import { test } from 'node:test';
import { winPercent } from './analysis.js';
import {
  describePracticeGoal,
  evaluatePracticeGoal,
  PRACTICE_DRAW_CP,
  PRACTICE_WIN_CP,
  type PracticeGoal,
  type PracticeProgress,
  parsePracticeGoal,
  practiceJudgment,
  practiceJudgmentFromEval,
  practiceMoveFails,
} from './practice.js';

// ── Parsing ──────────────────────────────────────────────────────────────────

test('parsePracticeGoal reads the mate forms', () => {
  assert.deepEqual(parsePracticeGoal('mate'), { kind: 'mate' });
  assert.deepEqual(parsePracticeGoal('checkmate'), { kind: 'mate' });
  assert.deepEqual(parsePracticeGoal('Mate in 3'), { kind: 'mate', moves: 3 });
  assert.deepEqual(parsePracticeGoal('  checkmate in 2  '), { kind: 'mate', moves: 2 });
});

test('parsePracticeGoal reads win, draw, and raw centipawn forms', () => {
  assert.deepEqual(parsePracticeGoal('win'), { kind: 'win', centipawns: PRACTICE_WIN_CP });
  assert.deepEqual(parsePracticeGoal('win in 12'), {
    kind: 'win',
    centipawns: PRACTICE_WIN_CP,
    moves: 12,
  });
  assert.deepEqual(parsePracticeGoal('draw'), { kind: 'draw' });
  assert.deepEqual(parsePracticeGoal('equalise'), { kind: 'draw' });
  assert.deepEqual(parsePracticeGoal('draw in 20'), { kind: 'draw', moves: 20 });
  assert.deepEqual(parsePracticeGoal('+500cp'), { kind: 'win', centipawns: 500 });
  assert.deepEqual(parsePracticeGoal('+500cp in 2'), { kind: 'win', centipawns: 500, moves: 2 });
  assert.deepEqual(parsePracticeGoal('-800cp in 3'), { kind: 'win', centipawns: -800, moves: 3 });
});

test('parsePracticeGoal returns null rather than guessing', () => {
  // lila silently defaults an unparseable goal to `mate`, which is how 27 of its
  // 316 practice chapters ended up with a goal nobody authored. We refuse.
  assert.equal(parsePracticeGoal('promotion with +100cp'), null);
  assert.equal(parsePracticeGoal('win the rook'), null);
  assert.equal(parsePracticeGoal(''), null);
  assert.equal(parsePracticeGoal('   '), null);
  assert.equal(parsePracticeGoal(null), null);
  assert.equal(parsePracticeGoal(undefined), null);
});

test('parsePracticeGoal rejects a move bound that fails before the learner moves', () => {
  assert.equal(parsePracticeGoal('mate in 0'), null);
  assert.equal(parsePracticeGoal('draw in 0'), null);
});

test('describePracticeGoal renders an instruction for each goal', () => {
  assert.equal(describePracticeGoal({ kind: 'mate' }), 'Checkmate');
  assert.equal(describePracticeGoal({ kind: 'mate', moves: 3 }), 'Checkmate in 3');
  assert.equal(describePracticeGoal({ kind: 'win', centipawns: PRACTICE_WIN_CP }), 'Win');
  assert.equal(describePracticeGoal({ kind: 'win', centipawns: 300 }), 'Reach +300');
  assert.equal(describePracticeGoal({ kind: 'draw' }), 'Hold the draw');
  assert.equal(describePracticeGoal({ kind: 'draw', moves: 20 }), 'Hold the draw for 20 moves');
});

// ── Grading ──────────────────────────────────────────────────────────────────

test('practiceJudgment grades by win% given up, and improving is always good', () => {
  assert.equal(practiceJudgment(80, 80), 'good');
  assert.equal(practiceJudgment(80, 90), 'good');
  assert.equal(practiceJudgment(80, 79), 'good'); // 1 point, under the 1.25 floor
  assert.equal(practiceJudgment(80, 78.5), 'inaccuracy'); // 1.5
  assert.equal(practiceJudgment(80, 76), 'mistake'); // 4
  assert.equal(practiceJudgment(80, 70), 'blunder'); // 10
});

test('practiceJudgment sits exactly on the lila practice thresholds', () => {
  // 0.025 / 0.06 / 0.14 on lila's [-1, 1] scale = 1.25 / 3 / 7 win% points.
  assert.equal(practiceJudgment(50, 50 - 1.25), 'inaccuracy');
  assert.equal(practiceJudgment(50, 50 - 1.24), 'good');
  assert.equal(practiceJudgment(50, 50 - 3), 'mistake');
  assert.equal(practiceJudgment(50, 50 - 2.99), 'inaccuracy');
  assert.equal(practiceJudgment(50, 50 - 7), 'blunder');
  assert.equal(practiceJudgment(50, 50 - 6.99), 'mistake');
});

test('practice grading is strictly harsher than post-game blunder detection', () => {
  // The whole reason this is a separate grader: a 6-point drop is not even an
  // inaccuracy to `moveJudgment` (5/10/15) but is a mistake here. If these ever
  // converge, one of the two ports is wrong.
  assert.equal(practiceJudgment(80, 74), 'mistake');
  assert.ok(practiceMoveFails(practiceJudgment(80, 74)));
});

test('practiceMoveFails ends the attempt on a mistake, not an inaccuracy', () => {
  assert.equal(practiceMoveFails('good'), false);
  assert.equal(practiceMoveFails('inaccuracy'), false);
  assert.equal(practiceMoveFails('mistake'), true);
  assert.equal(practiceMoveFails('blunder'), true);
});

test('practiceJudgmentFromEval runs evaluations through the calibrated curve', () => {
  const before = { cp: 600, mate: null };
  const after = { cp: 200, mate: null };
  assert.equal(
    practiceJudgmentFromEval(before, after),
    practiceJudgment(winPercent(600, null), winPercent(200, null)),
  );
  // Losing a won endgame down to level is a blunder on any sane curve.
  assert.equal(practiceJudgmentFromEval({ cp: 800, mate: null }, { cp: 0, mate: null }), 'blunder');
});

test('the curve compresses at the extremes, which is why grading is not in centipawns', () => {
  // The SAME 300cp swing costs very different amounts of win probability
  // depending on where it happens. This is the whole reason grading runs in
  // win% space; a flat centipawn threshold cannot express it.
  const nearLevelDrop = winPercent(100, null) - winPercent(-200, null);
  const alreadyWinningDrop = winPercent(900, null) - winPercent(600, null);

  assert.ok(
    nearLevelDrop > alreadyWinningDrop * 3,
    `a 300cp swing near level (${nearLevelDrop.toFixed(1)} pts) should cost far more than the` +
      ` same swing when winning (${alreadyWinningDrop.toFixed(1)} pts)`,
  );
  // Crossing from slightly better to clearly worse is a blunder; shedding the
  // same centipawns while still winning comfortably is not.
  assert.equal(
    practiceJudgmentFromEval({ cp: 100, mate: null }, { cp: -200, mate: null }),
    'blunder',
  );
  assert.notEqual(
    practiceJudgmentFromEval({ cp: 900, mate: null }, { cp: 600, mate: null }),
    'blunder',
  );
});

// ── Adjudication ─────────────────────────────────────────────────────────────

// Defaults to one move played, because that is the state almost every
// adjudication question is about; the move-zero guard is tested explicitly.
const progress = (over: Partial<PracticeProgress> & { goal: PracticeGoal }): PracticeProgress => ({
  movesPlayed: 1,
  cp: 0,
  mate: null,
  termination: 'none',
  ...over,
});

test('a real result outranks the evaluation', () => {
  // Delivered mate wins any goal, including a draw goal (you did better).
  for (const goal of [
    { kind: 'mate' } as const,
    { kind: 'win', centipawns: PRACTICE_WIN_CP } as const,
    { kind: 'draw' } as const,
  ]) {
    assert.equal(
      evaluatePracticeGoal(progress({ goal, termination: 'learner-wins', cp: -900 })),
      'success',
      `${goal.kind} should succeed on a delivered mate even against a hostile eval`,
    );
  }
  assert.equal(
    evaluatePracticeGoal(progress({ goal: { kind: 'mate' }, termination: 'learner-loses' })),
    'failure',
  );
});

test('an actual draw succeeds only a draw goal', () => {
  assert.equal(
    evaluatePracticeGoal(progress({ goal: { kind: 'draw' }, termination: 'drawn' })),
    'success',
  );
  assert.equal(
    evaluatePracticeGoal(progress({ goal: { kind: 'mate' }, termination: 'drawn' })),
    'failure',
  );
  assert.equal(
    evaluatePracticeGoal(
      progress({ goal: { kind: 'win', centipawns: 600 }, termination: 'drawn', cp: 900 }),
    ),
    'failure',
    'a drawn game fails a win goal no matter what the engine thought',
  );
});

test('a bounded mate goal fails as soon as the mate no longer fits the budget', () => {
  const goal = { kind: 'mate', moves: 3 } as const;
  // Two moves in, mate-in-1 remaining: total 3, still on track.
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 2, mate: 1 })), 'ongoing');
  // Two moves in, mate-in-2 remaining: total 4, out of budget.
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 2, mate: 2 })), 'failure');
  // No forced mate visible at all.
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 1, mate: null })), 'failure');
  // Being the one getting mated is not progress toward mating.
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 1, mate: -2 })), 'failure');
});

test('an unbounded mate goal runs until mate is actually delivered', () => {
  const goal = { kind: 'mate' } as const;
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 40, mate: 5 })), 'ongoing');
  assert.equal(
    evaluatePracticeGoal(progress({ goal, movesPlayed: 40, termination: 'learner-wins' })),
    'success',
  );
});

test('a win goal succeeds on reaching the threshold or a forced mate', () => {
  const goal = { kind: 'win', centipawns: 600 } as const;
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 1, cp: 599 })), 'ongoing');
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 1, cp: 600 })), 'success');
  assert.equal(
    evaluatePracticeGoal(progress({ goal, movesPlayed: 1, cp: null, mate: 4 })),
    'success',
  );
  assert.equal(
    evaluatePracticeGoal(progress({ goal, movesPlayed: 1, cp: null, mate: -4 })),
    'ongoing',
  );
});

test('nothing is decided on evaluation alone before the learner has moved', () => {
  // A book endgame win is ALREADY winning at move zero -- that is what the book
  // verdict means. Without this guard every "Red to play and win" exercise in
  // the endgame corpus would report success on load, before a piece was touched.
  assert.equal(
    evaluatePracticeGoal(
      progress({ goal: { kind: 'win', centipawns: 600 }, movesPlayed: 0, cp: 1200 }),
    ),
    'ongoing',
  );
  assert.equal(
    evaluatePracticeGoal(
      progress({ goal: { kind: 'mate', moves: 3 }, movesPlayed: 0, mate: null }),
    ),
    'ongoing',
    'a bounded mate goal cannot fail before the learner has had a move',
  );
  assert.equal(
    evaluatePracticeGoal(progress({ goal: { kind: 'draw' }, movesPlayed: 0, cp: -900 })),
    'ongoing',
    'a losing start position is the premise of a hold-the-draw exercise, not a loss',
  );
  // A real result still decides, even at move zero.
  assert.equal(
    evaluatePracticeGoal(
      progress({ goal: { kind: 'mate' }, movesPlayed: 0, termination: 'learner-loses' }),
    ),
    'failure',
  );
});

test('a bounded win goal fails when the move budget runs out short of the threshold', () => {
  const goal = { kind: 'win', centipawns: 600, moves: 5 } as const;
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 4, cp: 100 })), 'ongoing');
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 5, cp: 100 })), 'failure');
  // Reaching it on the last permitted move still counts.
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 5, cp: 700 })), 'success');
});

test('a draw goal fails the moment the position leaves the level band', () => {
  const goal = { kind: 'draw' } as const;
  assert.equal(evaluatePracticeGoal(progress({ goal, cp: 0 })), 'ongoing');
  assert.equal(evaluatePracticeGoal(progress({ goal, cp: PRACTICE_DRAW_CP - 1 })), 'ongoing');
  assert.equal(evaluatePracticeGoal(progress({ goal, cp: -(PRACTICE_DRAW_CP - 1) })), 'ongoing');
  assert.equal(evaluatePracticeGoal(progress({ goal, cp: -PRACTICE_DRAW_CP })), 'failure');
  // Being the one who is now winning also leaves the band; the exercise was to
  // hold a draw, and the engine no longer agrees the position is one.
  assert.equal(evaluatePracticeGoal(progress({ goal, cp: PRACTICE_DRAW_CP })), 'failure');
  // A forced mate either way ends it.
  assert.equal(evaluatePracticeGoal(progress({ goal, cp: null, mate: -6 })), 'failure');
  assert.equal(evaluatePracticeGoal(progress({ goal, cp: null, mate: 6 })), 'failure');
});

test('a bounded draw goal is held by surviving the budget at level', () => {
  const goal = { kind: 'draw', moves: 20 } as const;
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 19, cp: 40 })), 'ongoing');
  assert.equal(evaluatePracticeGoal(progress({ goal, movesPlayed: 20, cp: 40 })), 'success');
});

test('an unknown evaluation never silently succeeds a goal', () => {
  // cp null / mate null is "the engine has not spoken". Nothing may be decided
  // on it: a confident verdict from a missing eval is the failure mode that
  // makes engine adjudication untrustworthy.
  assert.equal(
    evaluatePracticeGoal(progress({ goal: { kind: 'win', centipawns: 600 }, cp: null })),
    'ongoing',
  );
  assert.equal(
    evaluatePracticeGoal(progress({ goal: { kind: 'draw' }, cp: null })),
    'failure',
    'a draw goal cannot be confirmed without an eval, and must not be assumed held',
  );
});
