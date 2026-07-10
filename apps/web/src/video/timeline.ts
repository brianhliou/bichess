// Expand a scene plan into a flat shot list plus an absolute-time sound-event
// track. Pure data → data: no DOM, no I/O, so the timing model is
// unit-testable.
//
// Timing model: a segment's target duration arrives explicitly on the plan
// (studio derives it from measured narration audio). Steps run sequentially
// from segment start; when the target outlasts the steps, the final state
// holds for the remainder; steps that run longer extend the segment.

import type { XiangqiBoard, XiangqiMove, XiangqiPiece, XiangqiSquare } from '@mistboard/game';
import { createInitialXiangqiBoard } from '@mistboard/game';
import { easeInOut } from './geometry.js';
import {
  DEFAULT_FLASH_HOLD_MS,
  DEFAULT_MOVE_DURATION_MS,
  DEFAULT_MOVE_HOLD_AFTER_MS,
  DEFAULT_POSITION_HOLD_MS,
  DEFAULT_STEP_HOLD_MS,
  type ScenePlan,
  type VideoArrowSpec,
  type VideoRegion,
} from './manifest.js';

export type OverlayState = {
  glow: readonly XiangqiSquare[];
  dimOthers: boolean;
  points: readonly XiangqiSquare[];
  pointsCapture: boolean;
  raysFrom: XiangqiSquare | null;
  region: VideoRegion | null;
  arrows: readonly VideoArrowSpec[];
  flash: { from: XiangqiSquare; to: XiangqiSquare } | null;
};

export type MovingPiece = {
  piece: XiangqiPiece;
  from: XiangqiSquare;
  to: XiangqiSquare;
  /** Eased interpolation progress in (0, 1]. */
  t: number;
};

/** One renderable board state held for durationMs. Static holds are long;
 *  animation shots are single-frame (1000/fps). */
export type Shot = {
  board: XiangqiBoard;
  lastMove: XiangqiMove | null;
  overlays: OverlayState;
  moving: MovingPiece | null;
  durationMs: number;
};

export type SoundEvent = { atMs: number; sound: 'move' | 'capture' };

export type Timeline = {
  shots: Shot[];
  soundEvents: SoundEvent[];
  /** Segment id → absolute start ms (narration alignment). */
  segmentStartsMs: Record<string, number>;
  totalMs: number;
};

const EMPTY_OVERLAYS: OverlayState = {
  glow: [],
  dimOthers: false,
  points: [],
  pointsCapture: false,
  raysFrom: null,
  region: null,
  arrows: [],
  flash: null,
};

/** Segment-local shot with stretch metadata: still holds absorb narration
 *  time proportionally; animation frames and flash blinks keep their rhythm. */
type PendingShot = Omit<Shot, 'durationMs'> & {
  durationMs: number;
  stretchable: boolean;
};

export function expandTimeline(plan: ScenePlan): Timeline {
  const frameMs = 1000 / plan.fps;
  const shots: Shot[] = [];
  const soundEvents: SoundEvent[] = [];
  const segmentStartsMs: Record<string, number> = {};

  let board: XiangqiBoard = {};
  let lastMove: XiangqiMove | null = null;
  let overlays: OverlayState = EMPTY_OVERLAYS;
  let clockMs = 0;

  for (const segment of plan.segments) {
    segmentStartsMs[segment.id] = clockMs;
    const targetMs = segment.durationMs;

    const pending: PendingShot[] = [];
    // Sound boundaries: fire when the shot at this index starts.
    const pendingSounds: Array<{ beforeShotIndex: number; sound: 'move' | 'capture' }> = [];
    const push = (
      shot: Omit<Shot, 'durationMs'>,
      durationMs: number,
      stretchable: boolean,
    ): void => {
      if (durationMs <= 0) return;
      pending.push({ ...shot, durationMs, stretchable });
    };
    const still = (durationMs: number): void =>
      push({ board, lastMove, overlays, moving: null }, durationMs, true);

    for (const step of segment.steps) {
      switch (step.kind) {
        case 'position': {
          board =
            step.position === 'start'
              ? createInitialXiangqiBoard()
              : step.position === 'empty'
                ? {}
                : Object.fromEntries(
                    step.position.map((spec) => [
                      spec.square,
                      { color: spec.color, role: spec.role },
                    ]),
                  );
          lastMove = null;
          overlays = EMPTY_OVERLAYS;
          still(step.holdMs ?? DEFAULT_POSITION_HOLD_MS);
          break;
        }
        case 'move': {
          const piece = board[step.from];
          if (!piece) throw new Error(`move step: no piece on ${step.from} (${segment.id})`);
          const capture = board[step.to] !== undefined;
          const durationMs = step.durationMs ?? DEFAULT_MOVE_DURATION_MS;
          const boardWithout = { ...board };
          delete boardWithout[step.from];
          if (capture) delete boardWithout[step.to];
          const frameCount = Math.max(2, Math.round(durationMs / frameMs));
          for (let i = 1; i <= frameCount; i++) {
            push(
              {
                board: boardWithout,
                lastMove,
                overlays,
                moving: { piece, from: step.from, to: step.to, t: easeInOut(i / frameCount) },
              },
              frameMs,
              false,
            );
          }
          const sound = step.sound ?? (capture ? 'capture' : 'move');
          if (sound !== 'none') pendingSounds.push({ beforeShotIndex: pending.length, sound });
          board = { ...boardWithout, [step.to]: piece };
          lastMove = { from: step.from, to: step.to };
          still(step.holdAfterMs ?? DEFAULT_MOVE_HOLD_AFTER_MS);
          break;
        }
        case 'flash': {
          const holdMs = step.holdMs ?? DEFAULT_FLASH_HOLD_MS;
          const on: OverlayState = { ...overlays, flash: { from: step.from, to: step.to } };
          const off: OverlayState = { ...overlays, flash: null };
          // Two blinks (fixed rhythm), then hold lit for the remainder.
          const blink = Math.min(280, holdMs / 5);
          for (const state of [on, off, on, off, on]) {
            push({ board, lastMove, overlays: state, moving: null }, blink, false);
          }
          push(
            { board, lastMove, overlays: on, moving: null },
            Math.max(0, holdMs - blink * 5),
            true,
          );
          overlays = off;
          break;
        }
        case 'glow': {
          overlays = { ...overlays, glow: step.squares, dimOthers: step.dimOthers ?? false };
          still(step.holdMs ?? DEFAULT_STEP_HOLD_MS);
          break;
        }
        case 'rays': {
          overlays = { ...overlays, raysFrom: step.square };
          still(step.holdMs ?? DEFAULT_STEP_HOLD_MS);
          break;
        }
        case 'points': {
          overlays = { ...overlays, points: step.squares, pointsCapture: step.capture ?? false };
          still(step.holdMs ?? DEFAULT_STEP_HOLD_MS);
          break;
        }
        case 'region': {
          overlays = { ...overlays, region: step.region };
          still(step.holdMs ?? DEFAULT_STEP_HOLD_MS);
          break;
        }
        case 'arrows': {
          overlays = { ...overlays, arrows: step.arrows };
          still(step.holdMs ?? DEFAULT_STEP_HOLD_MS);
          break;
        }
        case 'clearOverlays': {
          overlays = EMPTY_OVERLAYS;
          still(step.holdMs ?? 0);
          break;
        }
        case 'hold': {
          still(step.ms);
          break;
        }
      }
    }

    // Stretch: distribute any deficit vs the target across the segment's
    // still holds proportionally, so visuals pace across the narration
    // instead of front-loading and going dead. No stretchable shots (or an
    // empty segment) falls back to one tail hold.
    const elapsed = pending.reduce((sum, shot) => sum + shot.durationMs, 0);
    const deficit = targetMs - elapsed;
    if (deficit > 0) {
      const flexible = pending
        .filter((shot) => shot.stretchable)
        .reduce((sum, shot) => sum + shot.durationMs, 0);
      if (flexible > 0) {
        const factor = (flexible + deficit) / flexible;
        for (const shot of pending) {
          if (shot.stretchable) shot.durationMs *= factor;
        }
      } else {
        pending.push({
          board,
          lastMove,
          overlays,
          moving: null,
          durationMs: deficit,
          stretchable: true,
        });
      }
    }

    let soundCursor = 0;
    pending.forEach((shot, index) => {
      while (
        soundCursor < pendingSounds.length &&
        pendingSounds[soundCursor]!.beforeShotIndex === index
      ) {
        soundEvents.push({ atMs: clockMs, sound: pendingSounds[soundCursor]!.sound });
        soundCursor += 1;
      }
      const { stretchable: _stretchable, ...rest } = shot;
      shots.push(rest);
      clockMs += shot.durationMs;
    });
    while (soundCursor < pendingSounds.length) {
      soundEvents.push({ atMs: clockMs, sound: pendingSounds[soundCursor]!.sound });
      soundCursor += 1;
    }
  }

  return { shots, soundEvents, segmentStartsMs, totalMs: clockMs };
}
