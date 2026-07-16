// Xiangqi Learn — the per-level VM (lila levelCtrl.ts port).
//
// Owns the truth state, apple set, scenario cursor, and score for one level
// attempt, and runs the full move pipeline: apple pickup → capture points →
// scenario matching (with delayed scripted replies) → failure asserts →
// detectCapture threat → success + par bonus. The page layer owns all DOM;
// this module only emits events. All timers are tracked and cleared on
// dispose (a leaked timer here would outlive level navigation).

import type {
  StandardXiangqiPlayerView,
  XiangqiGameState,
  XiangqiMove,
  XiangqiSquare,
} from '@mistboard/game';
import { applesEaten } from './learn-assert.js';
import {
  applyLearnMove,
  checkArrowShapes,
  findCaptureThreat,
  learnLegalMoves,
  makeLearnState,
  oppositeColor,
  XIANGQI_PIECE_VALUE,
} from './learn-rules.js';
import { createScenario, type LearnScenario, scenarioShapes } from './learn-scenario.js';
import { APPLE_POINTS, CAPTURE_POINTS, levelBonus, SCENARIO_POINTS } from './learn-score.js';
import {
  type AssertData,
  arrow,
  circle,
  type LearnLevel,
  type LearnShape,
  readApples,
} from './learn-types.js';

const OPPONENT_REPLY_DELAY_MS = 1000;
const SCENARIO_SHAPES_DELAY_MS = 500;
const FAILURE_FOLLOW_UP_DELAY_MS = 600;

export type LearnSound = 'move' | 'take' | 'capture' | 'failure' | 'levelEnd';

export interface LevelRunnerEvents {
  /** Board or panel state changed: re-render from runner.view(). */
  onChange(): void;
  /** Replace the annotation overlay (initial hints, scenario notes, threats). */
  onShapes(shapes: readonly LearnShape[]): void;
  onSound(sound: LearnSound): void;
  /** Level solved; `score` is final (items + captures + par bonus). */
  onComplete(score: number): void;
  onFail(): void;
}

export interface LevelRunner {
  readonly level: LearnLevel;
  /** Display view for the interactive board: apples hidden from the piece
   *  layer (they render as star markers), legal moves only while the level is
   *  live and it is the player's turn. */
  view(): StandardXiangqiPlayerView;
  /** Remaining apple intersections (star markers). */
  apples(): readonly XiangqiSquare[];
  vm(): { moves: number; score: number; completed: boolean; failed: boolean };
  /** Attempt a player move (already geometry-legal via the board's dests). */
  userMove(move: XiangqiMove): void;
  /** Begin the level: initial shapes, opponent-first scenario kick. */
  start(): void;
  dispose(): void;
}

export function createLevelRunner(level: LearnLevel, events: LevelRunnerEvents): LevelRunner {
  const appleSquares = new Set(readApples(level.apples));
  let state = materializeApples(
    makeLearnState(level.fen, `learn-${level.id}`),
    level,
    appleSquares,
  );
  const scenario: LearnScenario = createScenario(level.scenario);
  const timers = new Set<ReturnType<typeof setTimeout>>();

  let moves = 0;
  let score = 0;
  let completed = false;
  let failed = false;
  let lastPlayerMove: XiangqiMove | null = null;

  const later = (fn: () => void, ms: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };

  const assertData = (): AssertData => ({
    state,
    playerColor: level.color,
    items: appleSquares,
    vm: {
      moves,
      lastPlayerMove,
      scenarioComplete: scenario.isComplete(),
      scenarioFailed: scenario.isFailed(),
    },
  });

  const playerToMove = (): boolean =>
    state.status.type === 'playing' && state.status.turn === level.color;

  /** Base shapes plus auto-drawn yellow check arrows (lila parity: a delivered
   *  check is always shown, and stays visible in the final position). Apple
   *  levels skip the scan: materialized apple-soldiers are not real threats. */
  const withCheckArrows = (base: readonly LearnShape[]): LearnShape[] =>
    level.apples ? [...base] : [...base, ...checkArrowShapes(state)];

  const succeeds = (): boolean => (level.success ?? applesEaten)(assertData());
  const failsByAssert = (): boolean =>
    scenario.isFailed() || (level.failure?.(assertData()) ?? false);

  function complete(): void {
    completed = true;
    score += levelBonus(level, moves);
    events.onSound('levelEnd');
    events.onChange();
    events.onComplete(score);
  }

  function fail(): void {
    failed = true;
    events.onSound('failure');
    events.onChange();
    events.onFail();
  }

  /** detectCapture hit: mark the doomed piece, then demonstrate the capture. */
  function failWithThreat(threatMove: XiangqiMove): void {
    failed = true;
    events.onSound('failure');
    events.onShapes([circle(threatMove.to, 'red'), arrow(threatMove.from, threatMove.to, 'red')]);
    events.onChange();
    later(() => {
      state = applyLearnMove(asOpponentTurn(state), 'relaxed', threatMove);
      events.onSound('capture');
      events.onChange();
    }, FAILURE_FOLLOW_UP_DELAY_MS);
    events.onFail();
  }

  /** Fail, then let the opponent show the consequence with one scripted-or-
   *  random legal reply (lila showFailureFollowUp). */
  function failWithFollowUp(): void {
    failed = true;
    events.onSound('failure');
    events.onChange();
    later(() => {
      const probe = asOpponentTurn(state);
      const replies = learnLegalMoves(probe, 'relaxed');
      const reply = replies[Math.floor(Math.random() * replies.length)];
      if (reply) {
        const wasCapture = state.board[reply.to] !== undefined;
        state = applyLearnMove(probe, 'relaxed', reply);
        events.onSound(wasCapture ? 'capture' : 'move');
        events.onChange();
      }
    }, FAILURE_FOLLOW_UP_DELAY_MS);
    events.onFail();
  }

  function playScheduledOpponentStep(): void {
    if (completed || failed) return;
    const step = scenario.opponent();
    if (!step) return;
    later(() => {
      if (completed || failed) return;
      const wasCapture = state.board[step.move.to] !== undefined;
      state = applyLearnMove(state, level.rules, step.move);
      events.onSound(wasCapture ? 'capture' : 'move');
      events.onShapes(withCheckArrows([]));
      events.onChange();
      const shapes = scenarioShapes(step);
      if (shapes.length > 0) {
        later(() => events.onShapes(withCheckArrows(shapes)), SCENARIO_SHAPES_DELAY_MS);
      }
      if (failsByAssert()) fail();
      else if (succeeds()) complete();
    }, OPPONENT_REPLY_DELAY_MS);
  }

  function userMove(move: XiangqiMove): void {
    if (completed || failed || !playerToMove()) return;
    moves += 1;
    lastPlayerMove = move;

    const target = state.board[move.to];
    const wasApple = appleSquares.has(move.to);

    state = applyLearnMove(state, level.rules, move, {
      keepTurn: level.rules === 'relaxed' && level.keepTurn,
    });

    // Item pickup / capture scoring + sound.
    if (wasApple) {
      appleSquares.delete(move.to);
      score += APPLE_POINTS;
      events.onSound('take');
    } else if (target !== undefined) {
      if (level.pointsForCapture) {
        score += level.showPieceValues ? XIANGQI_PIECE_VALUE[target.role] : CAPTURE_POINTS;
      }
      events.onSound('capture');
    } else {
      events.onSound('move');
    }

    // Scenario matching: a scripted player step is the only accepted move.
    const inScenario = scenario.player(move) === 'matched';
    if (inScenario) score += SCENARIO_POINTS;

    events.onShapes(withCheckArrows([]));
    events.onChange();

    // lila pipeline order (levelCtrl.makeSendMove): a matched scenario move
    // skips the threat/failure gates entirely; otherwise the capture-threat
    // scan runs FIRST, then the failure assert, and success only when nothing
    // failed. Protection levels depend on this order: their success is the
    // trivial default, so the threat scan must gate it.
    if (!inScenario) {
      // Opponent's threatened capture of the player's piece = failure
      // (Protection/Combat pedagogy). Apple levels default this off. The scan
      // is a geometry probe, valid in both rules modes.
      if (level.detectCapture !== false && state.status.type === 'playing') {
        const threat = findCaptureThreat(
          state,
          level.color,
          level.detectCapture === true ? true : 'unprotected',
          level.rules,
        );
        if (threat) {
          failWithThreat(threat.move);
          return;
        }
      }
      if (failsByAssert()) {
        if (level.showFailureFollowUp) failWithFollowUp();
        else fail();
        return;
      }
    }

    if (succeeds()) {
      complete();
      return;
    }

    // Strict-mode apply flips the turn to the opponent. If a scenario scripts
    // the reply, play it. Otherwise the player made a non-solving move on a
    // one-move puzzle (mate / stalemate / flying-general) that has no scripted
    // continuation: that is a failure, not a dead end where the board locks on
    // the opponent's turn with no legal player move.
    if (!playerToMove()) {
      if (scenario.peek()) playScheduledOpponentStep();
      else fail();
      return;
    }

    playScheduledOpponentStep();
  }

  /** The same position with the opponent to move (demonstration captures on
   *  keepTurn levels, failure follow-ups). */
  function asOpponentTurn(current: XiangqiGameState): XiangqiGameState {
    return { ...current, status: { type: 'playing', turn: oppositeColor(level.color) } };
  }

  function start(): void {
    // Check arrows at level start too: the out-of-check stage opens with the
    // player IN check, and the arrow shows exactly where the threat comes from.
    events.onShapes(withCheckArrows(level.shapes ?? []));
    events.onChange();
    // Opponent-to-move at the start = the scenario opens with a scripted
    // opponent move (lila: en-passant-style levels).
    if (!playerToMove()) playScheduledOpponentStep();
  }

  function view(): StandardXiangqiPlayerView {
    const board = { ...state.board };
    if (!level.emptyApples) {
      for (const square of appleSquares) delete board[square];
    }
    const live = !completed && !failed && playerToMove();
    return {
      id: state.id,
      perspective: level.color,
      board,
      legalMoves: live ? learnLegalMoves(state, level.rules) : [],
      status: state.status,
      moveNumber: state.moveNumber,
      lastMove: state.lastMove,
    };
  }

  return {
    level,
    view,
    apples: () => [...appleSquares],
    vm: () => ({ moves, score, completed, failed }),
    userMove,
    start,
    dispose: () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}

/** Materialize apples as enemy soldiers so movegen treats collecting one as a
 *  plain capture — load-bearing for xiangqi: cannons need a screen to take an
 *  apple, horses respect leg-blocks, elephants respect eye-blocks. emptyApples
 *  levels (general/soldier stages) track bare markers instead. */
function materializeApples(
  state: XiangqiGameState,
  level: LearnLevel,
  apples: ReadonlySet<XiangqiSquare>,
): XiangqiGameState {
  if (level.emptyApples || apples.size === 0) return state;
  const board = { ...state.board };
  const enemy = oppositeColor(level.color);
  for (const square of apples) {
    if (board[square] !== undefined) {
      throw new Error(`learn level ${level.id}: apple on occupied point ${square}`);
    }
    board[square] = { color: enemy, role: 'soldier' };
  }
  return { ...state, board };
}
