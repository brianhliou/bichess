/**
 * Server-side mainline-Pikafish loop for standard (open-information) Xiangqi PvE.
 *
 * Standard xiangqi is perfect-information, so this mirrors the Fortress Xiangqi
 * loop structurally — the only differences are: there are no drops (board moves
 * only), and the UCI coordinate system is Pikafish's native rank-0-9 (translation
 * lives in xiangqi-pikafish-engine.ts). The engine replays the game from
 * `position startpos moves ...` in Pikafish UCI, so this loop hands the provider
 * the Pikafish-UCI move history rather than a FEN.
 *
 * Engine moves are injected through the same append+broadcast path as human
 * moves so clocks, persistence, reconnect, and review stay event-sourced.
 */

import {
  applyStandardXiangqiMove,
  getStandardXiangqiLegalMoves,
  type XIANGQI_SPEC_ID,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import {
  buildEngineDecisionRecord,
  reportEngineFallback,
  reportEngineMoveOk,
  resolveValidatedEngineMove,
} from './engine-move-guard.js';
import { budgetForMove } from './engine-time-budget.js';
import { logger } from './obs.js';
import type { TenantLifecycleContext } from './variant-tenant/lifecycle.js';
import { tenantClockRemainingMs } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';
import type { TenantLiveRoom } from './variant-tenant/ws.js';
import {
  isXiangqiEngineClientId,
  xiangqiEngineTierFor,
  xiangqiEngineVersion,
  xiangqiLiveEngineMove,
  xiangqiMoveToPikafishUci,
} from './xiangqi-engine-catalog.js';

// Re-export the engine metadata so the tenant, registration, and rooms route
// resolve these from this module (matching the Fortress layout).
export {
  isXiangqiEngineClientId,
  XIANGQI_DEFAULT_ENGINE_ID,
  XIANGQI_PLAYABLE_ENGINES,
  type XiangqiEngineTier,
  xiangqiEngineDisplayName,
  xiangqiEngineVersion,
} from './xiangqi-engine-catalog.js';

const CLOCK_SAFETY_MS = 1_000;
const MIN_MOVETIME_MS = 50;
const ENGINE_MOVE_MAX_ATTEMPTS = 2;

type XiangqiSpecId = typeof XIANGQI_SPEC_ID;

type XiangqiEngineRoom = TenantLiveRoom<
  'xiangqi',
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  XiangqiSpecId
>;
type XiangqiEngineContext = TenantLifecycleContext<
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  XiangqiSpecId,
  XiangqiEngineRoom
>;

export function xiangqiEngineSeatFor(room: XiangqiEngineRoom): XiangqiColor | null {
  for (const seat of ['red', 'black'] as const) {
    if (isXiangqiEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

export function scheduleXiangqiEngineMove(
  ctx: XiangqiEngineContext,
  room: XiangqiEngineRoom,
): void {
  if (room.engineTimer) return;
  const seat = xiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playXiangqiEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        {
          kind: 'xiangqi_engine_move_failure',
          room_id: room.id,
          error: (err as Error).message,
        },
        'Xiangqi engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export type XiangqiEngineMoveProvider = (
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number },
) => Promise<string | null>;

export async function playXiangqiEngineMoveIfReady(
  ctx: XiangqiEngineContext,
  room: XiangqiEngineRoom,
  moveProvider: XiangqiEngineMoveProvider = xiangqiLiveEngineMove,
): Promise<void> {
  const seat = xiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = xiangqiEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  const incrementMs = clock?.incrementMs ?? 0;
  if (remainingMs !== null && remainingMs <= 0) return;

  const history = xiangqiUciHistory(room.events);
  // Clock-aware per-move budget (shared allocator): the tier NODE budget is the
  // strength anchor and binds first on a healthy clock; this movetime is the
  // latency ceiling + time-pressure guard.
  const { computeBudgetMs: movetimeMs } = budgetForMove({
    remainingMs,
    incrementMs,
    ceilingMs: tier.movetimeMs,
    reserveMs: CLOCK_SAFETY_MS,
    floorMs: MIN_MOVETIME_MS,
  });

  const {
    chosen: validated,
    attempts,
    aborted,
  } = await resolveValidatedEngineMove({
    maxAttempts: ENGINE_MOVE_MAX_ATTEMPTS,
    requestMove: () => moveProvider(engineId, history, { movetimeMs }),
    validate: (uci) => legalMoveForUci(getStandardXiangqiLegalMoves(room.projection.state), uci),
    stillOnTurn: () => engineToMove(room, seat),
    onReject: ({ attempt, maxAttempts, uci, reason, error }) =>
      logger.warn(
        {
          kind: 'xiangqi_engine_move_rejected',
          room_id: room.id,
          engine_id: engineId,
          attempt,
          max_attempts: maxAttempts,
          uci,
          reject_reason: reason,
          error,
        },
        'Xiangqi engine output rejected by kernel; retrying',
      ),
  });
  if (aborted || !engineToMove(room, seat)) return;

  if (validated === null) {
    const record = buildEngineDecisionRecord({
      variant: 'xiangqi',
      roomId: room.id,
      engineId,
      engineVersion: xiangqiEngineVersion(engineId) ?? 'unknown',
      movetimeMs,
      tier,
      ply: history.length,
      toMove: seat,
      // Diagnostic-only log field; standard xiangqi exposes no in-check predicate
      // and this path (no kernel-legal move after retries) is rare.
      inCheck: false,
      history,
      legalUci: getStandardXiangqiLegalMoves(room.projection.state).map(xiangqiMoveToPikafishUci),
      attempts,
    });
    reportEngineFallback(record, 'xiangqi_engine_failed_closed', 'Xiangqi');
    const resign: TenantRoomEvent<XiangqiColor, XiangqiMove, XiangqiSpecId> = {
      type: 'seat-resigned',
      at: Date.now(),
      roomId: room.id,
      color: seat,
    };
    const seq = await ctx.appendEvent(room, resign);
    ctx.broadcastEventAppended(room, resign, seq);
    return;
  }

  reportEngineMoveOk();
  let chosen: XiangqiMove = validated;
  const legalMoves = getStandardXiangqiLegalMoves(room.projection.state);
  const guarded = guardXiangqiEngineMove(room.projection.state, chosen, legalMoves);
  if (guarded !== chosen) {
    logger.warn(
      {
        kind: 'xiangqi_engine_immediate_loss_guard',
        room_id: room.id,
        engine_id: engineId,
        move: xiangqiMoveToPikafishUci(chosen),
        replacement_move: xiangqiMoveToPikafishUci(guarded),
      },
      'Xiangqi engine immediate-loss guard replaced an avoidable losing move',
    );
    chosen = guarded;
  }

  const event: TenantRoomEvent<XiangqiColor, XiangqiMove, XiangqiSpecId> = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}

function bothSeatsFilled(room: XiangqiEngineRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: XiangqiEngineRoom, seat: XiangqiColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

function xiangqiUciHistory(
  events: readonly TenantRoomEvent<XiangqiColor, XiangqiMove, XiangqiSpecId>[],
): string[] {
  return events
    .filter(
      (
        event,
      ): event is Extract<
        TenantRoomEvent<XiangqiColor, XiangqiMove, XiangqiSpecId>,
        { type: 'move-played' }
      > => event.type === 'move-played',
    )
    .map((event) => xiangqiMoveToPikafishUci(event.move));
}

// Match a Pikafish-UCI bestmove (e.g. "b0c2") against our legal move set by
// translating each legal move to Pikafish UCI. Avoids a bespoke UCI->square
// parser and can never admit an off-board or illegal move.
export function legalMoveForUci(
  legalMoves: readonly XiangqiMove[],
  uci: string,
): XiangqiMove | null {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(uci)) return null;
  return legalMoves.find((move) => xiangqiMoveToPikafishUci(move) === uci) ?? null;
}

/**
 * Replace a move that lets the opponent win on the immediate reply with any legal
 * move that does not — a cheap king-safety backstop matching the Fortress loop.
 */
function guardXiangqiEngineMove(
  state: XiangqiGameState,
  chosen: XiangqiMove,
  legalMoves: readonly XiangqiMove[],
): XiangqiMove {
  if (!allowsImmediateOpponentWin(state, chosen)) return chosen;
  return legalMoves.find((move) => !allowsImmediateOpponentWin(state, move)) ?? chosen;
}

function allowsImmediateOpponentWin(state: XiangqiGameState, move: XiangqiMove): boolean {
  if (state.status.type !== 'playing') return false;
  const after = applyStandardXiangqiMove(state, move);
  if (after.status.type !== 'playing') return false;
  const opponent = after.status.turn;
  return getStandardXiangqiLegalMoves(after).some((reply) => {
    const afterReply = applyStandardXiangqiMove(after, reply);
    return afterReply.status.type === 'finished' && afterReply.status.winner === opponent;
  });
}
