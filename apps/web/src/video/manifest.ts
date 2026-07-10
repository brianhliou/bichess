// Scene-plan types for the video frame exporter — Mistboard's side of the
// frame-export contract with the private mistboard-studio repo (see studio's
// docs/extraction-plan.md "Next Extraction Seam"). Studio owns narration, TTS,
// and final assembly; this tool consumes a scene plan (board steps + explicit
// segment durations, no narration text) and emits a frame bundle. Dev-only:
// nothing here ships in the product bundle.

import type { XiangqiColor, XiangqiPieceRole, XiangqiSquare } from '@mistboard/game';

export type VideoPieceSpec = {
  square: XiangqiSquare;
  color: XiangqiColor;
  role: XiangqiPieceRole;
};

/** 'start' = the full standard starting position; 'empty' = bare board. */
export type VideoPosition = 'start' | 'empty' | readonly VideoPieceSpec[];

export type VideoRegion = 'river' | 'palace-red' | 'palace-black' | { file: string };

export type VideoArrowSpec = { from: XiangqiSquare; to: XiangqiSquare; dashed?: boolean };

export type VideoStep =
  /** Snap the board to a position. Clears overlays and any moving piece. */
  | { kind: 'position'; position: VideoPosition; holdMs?: number }
  /** Slide the piece on `from` to `to` (captures whatever sits there).
   *  Purely presentational: legality is NOT checked, demo boards are sparse. */
  | {
      kind: 'move';
      from: XiangqiSquare;
      to: XiangqiSquare;
      durationMs?: number;
      sound?: 'move' | 'capture' | 'none';
      holdAfterMs?: number;
    }
  /** Red illegal-move pulse: rings on both squares + a red arrow, blinked. */
  | { kind: 'flash'; from: XiangqiSquare; to: XiangqiSquare; holdMs?: number }
  /** Spotlight squares; dimOthers washes the rest of the board dark. */
  | { kind: 'glow'; squares: readonly XiangqiSquare[]; dimOthers?: boolean; holdMs?: number }
  /** Legal-destination markers for the piece on `square`, from the kernel
   *  pseudo-legal generator (fine on sparse demo boards). */
  | { kind: 'rays'; square: XiangqiSquare; holdMs?: number }
  /** Explicit destination markers when auto rays are wrong for the story. */
  | { kind: 'points'; squares: readonly XiangqiSquare[]; capture?: boolean; holdMs?: number }
  | { kind: 'region'; region: VideoRegion; holdMs?: number }
  | { kind: 'arrows'; arrows: readonly VideoArrowSpec[]; holdMs?: number }
  /** Drop all sticky overlays (glow/rays/points/region/arrows). */
  | { kind: 'clearOverlays'; holdMs?: number }
  | { kind: 'hold'; ms: number };

export type SceneSegment = {
  id: string;
  /** Target duration for this segment (studio derives it from measured
   *  narration audio, or estimates). Steps that run longer extend it: an
   *  animation is never cut mid-flight. */
  durationMs: number;
  steps: readonly VideoStep[];
};

export type ScenePlan = {
  id: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  /** Canvas background behind the board. */
  background: string;
  perspective?: XiangqiColor;
  segments: readonly SceneSegment[];
};

export const DEFAULT_STEP_HOLD_MS = 1200;
export const DEFAULT_POSITION_HOLD_MS = 800;
export const DEFAULT_MOVE_DURATION_MS = 420;
export const DEFAULT_MOVE_HOLD_AFTER_MS = 600;
export const DEFAULT_FLASH_HOLD_MS = 1600;

/** Cheap structural validation with readable errors; plans arrive as JSON from
 *  the studio repo, so catch typos before a long render, not after. */
export function validateScenePlan(plan: ScenePlan): string[] {
  const errors: string[] = [];
  if (!plan.id) errors.push('plan.id is required');
  if (!Number.isFinite(plan.fps) || plan.fps < 1 || plan.fps > 60) {
    errors.push(`fps out of range: ${plan.fps}`);
  }
  if (!Array.isArray(plan.segments) || plan.segments.length === 0) {
    errors.push('plan has no segments');
    return errors;
  }
  const seen = new Set<string>();
  for (const segment of plan.segments) {
    if (seen.has(segment.id)) errors.push(`duplicate segment id: ${segment.id}`);
    seen.add(segment.id);
    if (!Number.isFinite(segment.durationMs) || segment.durationMs < 0) {
      errors.push(`segment ${segment.id}: durationMs must be a non-negative number`);
    }
    if (segment.durationMs === 0 && segment.steps.length === 0) {
      errors.push(`segment ${segment.id} has neither duration nor steps`);
    }
    for (const step of segment.steps) {
      if (step.kind === 'move' || step.kind === 'flash') {
        for (const square of [step.from, step.to]) {
          if (!isSquareish(square)) {
            errors.push(`segment ${segment.id}: bad square '${square}' in ${step.kind}`);
          }
        }
      }
      if (step.kind === 'hold' && step.ms <= 0) {
        errors.push(`segment ${segment.id}: hold.ms must be positive`);
      }
    }
  }
  return errors;
}

function isSquareish(square: string): boolean {
  return /^[a-i](?:[1-9]|10)$/.test(square);
}
