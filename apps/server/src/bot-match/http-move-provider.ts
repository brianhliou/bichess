/**
 * A move provider that reaches a real engine over HTTP via the redacted
 * protocol. Used for BOTH seats in the local self-test (live Misty v1.5 +
 * stand-in Misty v1.1), and for the live seat in a real external match. The
 * remote endpoint receives ONLY the request the arbiter built — the arbiter
 * measures the wall-clock round-trip as the move's think time.
 */
import type { EngineObservationPush, EngineTurnRequest } from '@mistboard/game';
import {
  type EngineEndpoint,
  pushEngineObservationAt,
  requestEngineTurnAt,
} from '../internal-engine-client.js';
import type { ArbiterMove, ArbiterMoveProvider } from './arbiter.js';

export function httpMoveProvider(
  endpoint: EngineEndpoint,
  opts: { reservationId?: string; trustDiagnostics?: boolean } = {},
): ArbiterMoveProvider {
  return async (request: EngineTurnRequest, ctx): Promise<ArbiterMove> => {
    const response = await requestEngineTurnAt(endpoint, request, ctx.watchdogMs, {
      computeBudgetMs: ctx.budgetMs,
      reservationId: opts.reservationId,
      trustDiagnostics: opts.trustDiagnostics,
    });
    // thinkTimeMs omitted → arbiter substitutes its measured wall-clock round-trip.
    return { move: response.move, diagnostics: response.diagnostics };
  };
}

/** Post-move observation sink that POSTs to the endpoint's `/observe` route. */
export function httpObserveSink(
  endpoint: EngineEndpoint,
): (push: EngineObservationPush) => Promise<void> {
  return (push) => pushEngineObservationAt(endpoint, push);
}
