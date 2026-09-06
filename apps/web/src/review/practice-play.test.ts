import type { PracticeGoal, PracticeTermination } from '@mistboard/game';
import { expect, test } from 'vitest';
import { createPracticeSession, type PracticeEval } from './practice-play.js';

// Thin assertion helpers so each check can carry the sentence explaining WHY it
// holds; vitest takes the message as expect()'s second argument.
const expectBe = (actual: unknown, expected: unknown, why?: string): void => {
  expect(actual, why).toBe(expected);
};
const expectNotBe = (actual: unknown, expected: unknown, why?: string): void => {
  expect(actual, why).not.toBe(expected);
};
const expectOk = (value: unknown, why?: string): void => {
  expect(value, why).toBeTruthy();
};

// A deliberately tiny fake game so the state machine is provable without a board
// or an engine. "Truth" is a move list; each move is a token. The fake engine
// reads its verdicts from a table keyed by the position's move list, so a test
// can script exactly what the engine says at every point.

type Truth = { moves: string[]; turn: 'learner' | 'defender' | null };

const key = (truth: Truth) => truth.moves.join(' ');

interface FakeGame {
  evals: Record<string, PracticeEval>;
  terminal?: Record<string, PracticeTermination>;
  /** Moves the learner is allowed to play, by position. Defaults to permissive. */
  legal?: Record<string, string[]>;
}

function harness(
  game: FakeGame,
  goal: PracticeGoal,
  start: Truth = { moves: [], turn: 'learner' },
) {
  let evaluations = 0;
  const terminationAt = (truth: Truth): PracticeTermination =>
    game.terminal?.[key(truth)] ?? 'none';

  const session = createPracticeSession<string, Truth>({
    goal,
    learner: 'learner',
    initialTruth: start,
    isLegal: (truth, move) => {
      const allowed = game.legal?.[key(truth)];
      return allowed ? allowed.includes(move) : true;
    },
    applyMove: (truth, move) => {
      const moves = [...truth.moves, move];
      const next: Truth = {
        moves,
        turn: truth.turn === 'learner' ? 'defender' : 'learner',
      };
      if (terminationAt(next) !== 'none') next.turn = null;
      return next;
    },
    sideToMove: (truth) => truth.turn,
    termination: (truth) => terminationAt(truth),
    fromUci: (uci) => uci,
    moveLabel: (move) => move.toUpperCase(),
    evaluate: async (truth) => {
      evaluations += 1;
      const found = game.evals[key(truth)];
      expectOk(found, `test did not script an evaluation for position "${key(truth)}"`);
      return found;
    },
  });
  return { session, evaluations: () => evaluations };
}

const ev = (
  cp: number | null,
  bestUci: string | null,
  mate: number | null = null,
): PracticeEval => ({
  cp,
  mate,
  bestUci,
});

const WIN: PracticeGoal = { kind: 'win', centipawns: 600 };

test('start evaluates, then hands the learner the move', async () => {
  const { session } = harness({ evals: { '': ev(300, 'a1') } }, WIN);
  await session.start();
  const view = session.view();
  expectBe(view.phase, 'play');
  expectBe(view.awaitingMove, true);
  expectBe(view.movesPlayed, 0);
  expectOk(view.winPercent !== null && view.winPercent > 50);
});

test('a good move advances and the defender replies with the engine best move', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(300, 'a1'),
        L: ev(-320, 'd1'), // defender to move, its POV: learner still ~+320
        'L d1': ev(310, 'a2'),
      },
    },
    WIN,
  );
  await session.start();
  const verdict = await session.attempt('L');
  expectBe(verdict, 'good');
  const view = session.view();
  expectBe(view.phase, 'play');
  expectBe(view.movesPlayed, 1);
  // The defender played the engine's best move, so the position advanced twice.
  expectBe(session.truth().moves.join(' '), 'L d1');
});

test('evaluations are flipped into the learner POV', async () => {
  // After the learner moves it is the defender's turn, so the raw engine score
  // is from the DEFENDER's side. A +320 for the defender must read as losing
  // for the learner. Getting this backwards would grade every move inverted.
  const { session } = harness(
    {
      evals: {
        '': ev(300, 'a1'),
        L: ev(320, 'd1'), // defender to move and winning
      },
    },
    WIN,
  );
  await session.start();
  const before = session.view().winPercent!;
  await session.attempt('L');
  const after = session.view().winPercent!;
  expectOk(before > 50, 'learner started better');
  expectOk(after < 50, `learner POV should be losing after the flip, got ${after}`);
});

test('a mistake fails the attempt and does not let the defender move', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(600, 'a1'),
        L: ev(-100, 'd1'), // learner POV +100: threw most of the win away
      },
    },
    WIN,
  );
  await session.start();
  const verdict = await session.attempt('L');
  expectOk(verdict === 'mistake' || verdict === 'blunder', `graded ${verdict}`);
  expectBe(session.view().phase, 'failed');
  expectBe(session.view().awaitingMove, false);
  expectBe(session.truth().moves.join(' '), 'L', 'defender must not reply to a failed move');
});

test('the played line is recorded for both sides, and take-back rewinds it', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(300, 'a1'),
        L: ev(-320, 'd1'),
        'L d1': ev(310, 'a2'),
      },
    },
    WIN,
  );
  await session.start();
  expectBe(session.view().moves.length, 0);
  await session.attempt('L');
  // Learner move then the engine's reply, in order.
  expect(session.view().moves).toEqual(['L', 'D1']);
});

test('a take-back rewinds the played line with the position', async () => {
  const { session } = harness({ evals: { '': ev(600, 'a1'), L: ev(-100, 'd1') } }, WIN);
  await session.start();
  await session.attempt('L');
  expect(session.view().moves).toEqual(['L']);
  session.retry();
  // The line must rewind with the board; a log kept separately from the frame
  // is exactly the thing that drifts out of step on undo.
  expect(session.view().moves).toEqual([]);
});

test('retry stands the learner back at the position before the failed move', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(600, 'a1'),
        L: ev(-100, 'd1'),
      },
    },
    WIN,
  );
  await session.start();
  await session.attempt('L');
  expectBe(session.view().phase, 'failed');
  session.retry();
  const view = session.view();
  expectBe(view.phase, 'play');
  expectBe(view.movesPlayed, 0);
  expectBe(view.verdict, null);
  expectBe(session.truth().moves.length, 0);
});

test('an inaccuracy is survivable and play continues', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(600, 'a1'),
        L: ev(-560, 'd1'), // learner POV +560: a small slip, not a failure
        'L d1': ev(560, 'a2'),
      },
    },
    WIN,
  );
  await session.start();
  const verdict = await session.attempt('L');
  expectBe(verdict, 'inaccuracy');
  expectBe(session.view().phase, 'play');
});

test('reaching the goal ends the exercise in success', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(300, 'a1'),
        L: ev(-700, 'd1'), // learner POV +700, past the 600 threshold
      },
    },
    WIN,
  );
  await session.start();
  await session.attempt('L');
  expectBe(session.view().phase, 'success');
});

test('delivering mate succeeds even when the eval swing looks catastrophic', async () => {
  // The curve reads a mate as an enormous jump; a naive grader could call the
  // mating move a blunder from the defender-POV score. A real result wins.
  const { session } = harness(
    {
      evals: {
        '': ev(300, 'a1'),
        L: ev(-9000, null),
      },
      terminal: { L: 'learner-wins' },
    },
    { kind: 'mate' },
  );
  await session.start();
  const verdict = await session.attempt('L');
  expectBe(verdict, 'good');
  expectBe(session.view().phase, 'success');
});

test('an exercise that opens on the defender move plays it before handing over', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(200, 'd0'),
        d0: ev(300, 'a1'),
      },
    },
    WIN,
    { moves: [], turn: 'defender' },
  );
  await session.start();
  expectBe(session.truth().moves.join(' '), 'd0');
  expectBe(session.view().phase, 'play');
});

test('a defender with no engine move ends the run rather than inventing one', async () => {
  // Playing a random legal reply would silently swap the exercise for a
  // different one and grade the learner against it.
  const { session } = harness(
    {
      evals: {
        '': ev(300, 'a1'),
        L: ev(-300, null),
      },
    },
    WIN,
  );
  await session.start();
  await session.attempt('L');
  expectBe(session.view().phase, 'defeat');
  expectBe(session.truth().moves.join(' '), 'L');
});

test('an illegal move, or a move out of turn, is rejected without consuming the attempt', async () => {
  const { session } = harness({ evals: { '': ev(300, 'a1') }, legal: { '': ['L'] } }, WIN);
  await session.start();
  expectBe(await session.attempt('nope'), 'invalid');
  expectBe(session.view().movesPlayed, 0);
  expectBe(session.view().phase, 'play');
});

test('hints escalate from the origin square to the whole move, and reset on a move', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(300, 'a1b2'),
        L: ev(-320, 'd1'),
        'L d1': ev(310, 'a2b3'),
      },
    },
    WIN,
  );
  await session.start();
  expectBe(session.view().hint, null);
  session.hint();
  expect(session.view().hint).toEqual({ level: 'origin', uci: 'a1b2' });
  session.hint();
  expect(session.view().hint).toEqual({ level: 'move', uci: 'a1b2' });
  session.hint();
  expect(session.view().hint, 'clamped at full reveal').toEqual({ level: 'move', uci: 'a1b2' });

  await session.attempt('L');
  expectBe(session.view().hint, null, 'a new position starts with no hint shown');
});

test('reset returns to the start position and re-runs the opening evaluation', async () => {
  const { session, evaluations } = harness(
    {
      evals: {
        '': ev(300, 'a1'),
        L: ev(-320, 'd1'),
        'L d1': ev(310, 'a2'),
      },
    },
    WIN,
  );
  await session.start();
  await session.attempt('L');
  const before = evaluations();
  await session.reset();
  expectBe(session.truth().moves.length, 0);
  expectBe(session.view().movesPlayed, 0);
  expectBe(session.view().phase, 'play');
  expectOk(evaluations() > before, 'reset re-evaluates the start position');
});

test('a draw goal is failed by drifting out of the level band', async () => {
  const { session } = harness(
    {
      evals: {
        '': ev(0, 'a1'),
        L: ev(400, 'd1'), // learner POV -400: the draw is gone
      },
    },
    { kind: 'draw' },
  );
  await session.start();
  const verdict = await session.attempt('L');
  expectOk(practiceFails(verdict), `expected a failing grade, got ${verdict}`);
  expectNotBe(session.view().phase, 'play');
});

function practiceFails(verdict: string): boolean {
  return verdict === 'mistake' || verdict === 'blunder';
}
