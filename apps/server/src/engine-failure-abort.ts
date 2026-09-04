/**
 * One rule for "this finished game is really an engine failure", shared by every
 * game-summary builder (the generic tenant builder, fog xiangqi's own builder,
 * and the legacy room-manager builder) so they cannot disagree about it.
 *
 * Why the rule can be this simple: an engine seat can never forfeit by
 * disconnect. `forfeitingSeat` (room-manager.ts) and `tenantForfeitingSeat`
 * (variant-tenant/lifecycle.ts) both treat the engine seat as always present,
 * so the only route to a forfeit charged to an engine is the explicit
 * forfeitEngineOnFailure / forfeitDarkXiangqiEngine call. Every abandonment
 * charged to an engine is therefore an engine failure by construction.
 *
 * The kernel still finishes the room as an abandonment, which is what live
 * clients need in order to see the game end. This only changes the ROW.
 */
import type { GameSummary } from './persistence-games.js';

/** Written to games.aborted_reason so the cause is legible in the DB itself. */
export const ENGINE_FAILURE_ABORTED_REASON = 'pve engine failed to move';

/**
 * The aborted terminal shape for a finish that is an engine failure, or
 * undefined when the finish is a real result.
 *
 * Fails closed: with no engine seat, no winner (a draw), or any reason other
 * than abandonment, this is a genuine result and the caller records it as one.
 */
export function engineFailureAbort(args: {
  /** Seat the engine occupies, or null for a human-vs-human room. */
  engineSeat: string | null;
  /** Seat that won, or null/undefined for a draw. */
  winner: string | null | undefined;
  /** Kernel end reason for the finish. */
  reason: string;
}): GameSummary['abortedAs'] | undefined {
  if (args.reason !== 'abandonment') return undefined;
  if (args.engineSeat === null) return undefined;
  // A draw is not a forfeit, and a human who abandoned against a bot really did
  // abandon: only the engine LOSING by abandonment is an engine failure.
  if (!args.winner || args.winner === args.engineSeat) return undefined;
  return {
    termination: 'engine-failure',
    abortedReason: ENGINE_FAILURE_ABORTED_REASON,
  };
}
