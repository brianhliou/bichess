// Xiangqi Learn — scripted-scenario engine (lila scenario.ts port).
//
// A scenario is a flat move list from the level-start position, consumed in
// strict turn order. Steps landing on the player's turn are the only accepted
// player moves; steps landing on the opponent's turn are auto-played by the
// runner (after a beat), optionally annotating the board. The runner owns the
// state and timing; this module owns the cursor + matching.

import type { XiangqiMove } from '@mistboard/game';
import type { LearnShape, ScenarioLevel, ScenarioStep } from './learn-types.js';

const normalize = (step: XiangqiMove | ScenarioStep): ScenarioStep =>
  'move' in step ? step : { move: step };

export type ScenarioPlayerResult = 'matched' | 'failed' | 'inactive';

export interface LearnScenario {
  /** True once every step has been consumed. */
  isComplete(): boolean;
  /** True once the player deviated from a scripted player step. */
  isFailed(): boolean;
  /** The next step if it exists and the cursor has not failed. */
  peek(): ScenarioStep | null;
  /** Try to consume the next step with a PLAYER move: 'matched' consumes it,
   *  'failed' marks the scenario failed, 'inactive' means no script is live
   *  (empty or exhausted — free play). */
  player(move: XiangqiMove): ScenarioPlayerResult;
  /** Consume the next step as the OPPONENT's scripted reply. Returns the step
   *  to play, or null when the script is exhausted/failed. */
  opponent(): ScenarioStep | null;
}

export function createScenario(level: ScenarioLevel | undefined): LearnScenario {
  const steps = (level ?? []).map(normalize);
  let cursor = 0;
  let failed = false;

  const active = (): boolean => !failed && cursor < steps.length;

  return {
    isComplete: () => !failed && steps.length > 0 && cursor >= steps.length,
    isFailed: () => failed,
    peek: () => (active() ? (steps[cursor] ?? null) : null),
    player(move: XiangqiMove): ScenarioPlayerResult {
      if (!active()) return 'inactive';
      const step = steps[cursor];
      if (step && step.move.from === move.from && step.move.to === move.to) {
        cursor += 1;
        return 'matched';
      }
      failed = true;
      return 'failed';
    },
    opponent(): ScenarioStep | null {
      if (!active()) return null;
      const step = steps[cursor] ?? null;
      if (step) cursor += 1;
      return step;
    },
  };
}

export function scenarioShapes(step: ScenarioStep): LearnShape[] {
  return step.shapes ?? [];
}
