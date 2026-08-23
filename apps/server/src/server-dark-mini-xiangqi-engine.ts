/**
 * Server-side engine-move loop for Dark Mini Xiangqi PvE.
 *
 * The chess PvE loop (room-manager.ts: playRandomEngineMoveIfReady /
 * scheduleRandomEngineMove) is welded to the chess Room; DMX is a separate
 * runtime, so this is the parallel implementation. When it's the engine seat's
 * turn it builds the redacted request (build-mini-xiangqi.ts — the redaction
 * boundary), asks the engine over the same internal-engine HTTP client chess
 * uses, then injects the move through the normal append+broadcast path
 * (appendDarkMiniXiangqiEvent) so persistence, clock, timers, and clients all
 * update exactly as for a human move.
 *
 * The engine seat is whichever seat in projection.seats holds a DMX engine id
 * (set by a seat-assigned event at room creation), so it survives hydration.
 * Engine failure (HTTP error / illegal move) FORFEITS the engine seat — the
 * human wins — rather than hanging the room.
 */

import { getMiniXiangqiLegalMoves, type MiniXiangqiColor } from '@mistboard/game';
import type { DarkMiniXiangqiEvent } from './dark-mini-xiangqi-runtime.js';
import { sendEngineAlertNotification } from './engine-alert-email.js';
import { reportEngineMoveOk } from './engine-move-guard.js';
import { buildMiniXiangqiEngineTurnRequest } from './engine-protocol/build-mini-xiangqi.js';
import { isDarkMiniXiangqiEngineClientId, loadEngine } from './engines/registry.js';
import { requestInternalEngineTurn } from './internal-engine-client.js';
import { engineCounters, logger } from './obs.js';
import type { DarkMiniXiangqiLiveRoom } from './server-dark-mini-xiangqi-live-room.js';
import { tenantClockRemainingMs } from './variant-tenant/runtime.js';

const ENGINE_SECRET = process.env.MISTBOARD_ENGINE_SECRET ?? 'mistboard-dev-engine-secret';
const DEFAULT_TIMEOUT_MS = 30_000;
const BUDGET_SAFETY_MS = 1_500;
const PROCESS_OVERHEAD_MS = 1_500;
const CLOCK_GRACE_MS = 2_000;
const MAX_TIMEOUT_MS = 60_000;

// Same shape as DarkMiniXiangqiLifecycleContext's first two methods, so the WS
// module's existing lifecycle ctx satisfies it directly.
export type DarkMiniXiangqiEngineContext = {
  appendEvent(room: DarkMiniXiangqiLiveRoom, event: DarkMiniXiangqiEvent): Promise<number>;
  broadcastEventAppended(
    room: DarkMiniXiangqiLiveRoom,
    event: DarkMiniXiangqiEvent,
    seq: number,
  ): void;
  now?(): number;
};

/** The seat an engine occupies in this room, or null if it's not a PvE room. */
export function darkMiniXiangqiEngineSeatFor(
  room: DarkMiniXiangqiLiveRoom,
): MiniXiangqiColor | null {
  for (const seat of ['red', 'black'] as const) {
    if (isDarkMiniXiangqiEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

function bothSeatsFilled(room: DarkMiniXiangqiLiveRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: DarkMiniXiangqiLiveRoom, seat: MiniXiangqiColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

/**
 * Queue an engine move if it's the engine's turn. Debounced via room.engineTimer
 * (a setTimeout(0), like the chess scheduler) so repeated triggers — seat-assign,
 * each opponent move — never stack multiple in-flight engine moves.
 */
export function scheduleDarkMiniXiangqiEngineMove(
  ctx: DarkMiniXiangqiEngineContext,
  room: DarkMiniXiangqiLiveRoom,
): void {
  if (room.engineTimer) return;
  const seat = darkMiniXiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playDarkMiniXiangqiEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        { kind: 'dmx_engine_move_failure', room_id: room.id, error: (err as Error).message },
        'dmx engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

function budgetFor(
  remainingMs: number | null,
  incrementMs: number,
  configuredMs: number,
): { computeBudgetMs: number; watchdogTimeoutMs: number } {
  if (remainingMs === null) {
    return { computeBudgetMs: configuredMs, watchdogTimeoutMs: configuredMs };
  }
  const usable = Math.max(0, remainingMs - BUDGET_SAFETY_MS);
  // Solvent-ish per-move spend (a fraction of the bank + most of the increment),
  // capped so the engine can't flag. The worker re-derives its own budget from
  // the request clock; this sets the HTTP/compute ceiling.
  const perMove = Math.min(usable > 0 ? usable : 50, usable * 0.1 + incrementMs * 0.8 + 250);
  // Liveness bound only — NOT derived from the per-move allocation (see the
  // dxq twin and engine issue #11): the server bounds a true hang and clock
  // exhaustion; overspending shows up as flag-fall, not a watchdog forfeit.
  const watchdogTimeoutMs = Math.max(
    1,
    Math.min(MAX_TIMEOUT_MS, Math.ceil(Math.max(0, remainingMs) + CLOCK_GRACE_MS)),
  );
  return {
    computeBudgetMs: Math.max(1, Math.min(Math.ceil(perMove), watchdogTimeoutMs)),
    watchdogTimeoutMs,
  };
}

export async function playDarkMiniXiangqiEngineMoveIfReady(
  ctx: DarkMiniXiangqiEngineContext,
  room: DarkMiniXiangqiLiveRoom,
): Promise<void> {
  const seat = darkMiniXiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const engine = loadEngine(engineId);

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  const incrementMs = clock?.incrementMs ?? 0;
  if (remainingMs !== null && remainingMs <= 0) return; // the clock timer handles expiry

  const ply = room.events.reduce((n, e) => (e.type === 'move-played' ? n + 1 : n), 0);
  const request = buildMiniXiangqiEngineTurnRequest({
    gameId: room.id,
    engineId,
    engineSecret: ENGINE_SECRET,
    engineColor: seat,
    state: room.projection.state,
    events: room.events,
    ply,
    clockRemainingMs: remainingMs,
    incrementMs,
  });
  const { computeBudgetMs, watchdogTimeoutMs } = budgetFor(
    remainingMs,
    incrementMs,
    engine.livePolicy?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let response: Awaited<ReturnType<typeof requestInternalEngineTurn>>;
  try {
    response = await requestInternalEngineTurn(
      request,
      watchdogTimeoutMs,
      room.engineReservationId ?? undefined,
      { computeBudgetMs },
    );
  } catch (err) {
    logger.error(
      {
        kind: 'dmx_engine_request_failed',
        room_id: room.id,
        engine_id: engineId,
        error: (err as Error).message,
      },
      'dmx engine request failed',
    );
    engineCounters.recordMove(true);
    await forfeitDarkMiniXiangqiEngine(ctx, room, seat, (err as Error).message);
    return;
  }

  // State may have advanced during the await (clock expiry, resign) — re-check
  // before committing the move.
  if (!engineToMove(room, seat)) return;
  const legal = getMiniXiangqiLegalMoves(room.projection.state);
  const chosen = legal.find((m) => m.from === response.move.from && m.to === response.move.to);
  if (!chosen) {
    // Already fail-closed (forfeit). Count it so the engine_fallback_rate page
    // sees dark-mini too — a spike here means the engine stopped producing
    // playable moves.
    engineCounters.recordMove(true);
    logger.error(
      { kind: 'dmx_engine_illegal_move', room_id: room.id, move: response.move },
      'dmx engine returned a move illegal in the true position',
    );
    await forfeitDarkMiniXiangqiEngine(ctx, room, seat, 'illegal move in true position');
    return;
  }
  reportEngineMoveOk();

  const event: DarkMiniXiangqiEvent = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}

async function forfeitDarkMiniXiangqiEngine(
  ctx: DarkMiniXiangqiEngineContext,
  room: DarkMiniXiangqiLiveRoom,
  seat: MiniXiangqiColor,
  reason?: string,
): Promise<void> {
  if (room.projection.state.status.type !== 'playing') return;
  const event: DarkMiniXiangqiEvent = {
    type: 'seat-forfeited',
    at: Date.now(),
    roomId: room.id,
    color: seat,
  };
  try {
    const seq = await ctx.appendEvent(room, event);
    ctx.broadcastEventAppended(room, event, seq);
    // Page, don't just count: the forfeit's cause was previously only
    // reconstructible by joining adjacent log lines by timestamp.
    logger.error(
      {
        kind: 'engine_seat_forfeited',
        variant: 'dark-mini-xiangqi',
        room_id: room.id,
        color: seat,
        reason: reason ?? null,
      },
      'engine seat forfeited',
    );
    void sendEngineAlertNotification({
      severity: 'critical',
      alert_kind: 'engine_seat_forfeited',
      variant: 'dark-mini-xiangqi',
      room_id: room.id,
      color: seat,
      reason: reason ?? undefined,
    }).catch(() => {});
  } catch (err) {
    logger.error(
      { kind: 'dmx_engine_forfeit_failed', room_id: room.id, error: (err as Error).message },
      'dmx engine forfeit failed',
    );
  }
}
