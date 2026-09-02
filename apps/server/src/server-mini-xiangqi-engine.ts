/**
 * Server-side Fairy-Stockfish loop for Mini Xiangqi PvE.
 *
 * Mini Xiangqi is perfect-information, so it uses FSF directly (the native
 * `minixiangqi` variant) instead of the hidden-info Misty engine-worker
 * protocol. Structurally this mirrors the Drop Mini Xiangqi engine loop (same
 * generic VariantTenant lifecycle), but the move source is an async FSF
 * subprocess (like Crossroads Chess) rather than an in-process heuristic.
 *
 * The engine seat is a normal seat-assigned event; engine moves are injected
 * through the same append+broadcast path as human moves so clocks, persistence,
 * reconnect, and review stay event-sourced.
 *
 * Coordinate note: platform Mini Xiangqi squares (files a-g, ranks 1-7, red on
 * rank 1, red to move first) match FSF's `minixiangqi` exactly, so a move
 * {from,to} maps to the UCI string `${from}${to}` with no transform.
 */

import {
  applyMiniXiangqiOpenMove,
  getMiniXiangqiOpenLegalMoves,
  isMiniXiangqiGeneralInCheck,
  type MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
} from '@mistboard/game';
import {
  buildEngineDecisionRecord,
  reportEngineFallback,
  reportEngineMoveOk,
  resolveValidatedEngineMove,
} from './engine-move-guard.js';
import { budgetForMove } from './engine-time-budget.js';
import {
  isMiniXiangqiEngineClientId,
  MINI_XIANGQI_ENGINE_VERSION,
  miniXiangqiEngineTierFor,
  miniXiangqiLiveEngineMove,
} from './mini-xiangqi-engine.js';
import { logger } from './obs.js';
import type { TenantLifecycleContext } from './variant-tenant/lifecycle.js';
import { tenantClockRemainingMs } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';
import type { TenantLiveRoom } from './variant-tenant/ws.js';

const CLOCK_SAFETY_MS = 1_000;
const MIN_MOVETIME_MS = 50;

// Bounded retries before failing closed (see engine-move-guard.ts).
const ENGINE_MOVE_MAX_ATTEMPTS = 2;

type MiniXiangqiEngineRoom = TenantLiveRoom<
  'mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof MINI_XIANGQI_SPEC_ID
>;
type MiniXiangqiEngineContext = TenantLifecycleContext<
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof MINI_XIANGQI_SPEC_ID,
  MiniXiangqiEngineRoom
>;

export function miniXiangqiEngineSeatFor(room: MiniXiangqiEngineRoom): MiniXiangqiColor | null {
  for (const seat of ['red', 'black'] as const) {
    if (isMiniXiangqiEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

export function scheduleMiniXiangqiEngineMove(
  ctx: MiniXiangqiEngineContext,
  room: MiniXiangqiEngineRoom,
): void {
  if (room.engineTimer) return;
  const seat = miniXiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playMiniXiangqiEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        {
          kind: 'mini_xiangqi_engine_move_failure',
          room_id: room.id,
          error: (err as Error).message,
        },
        'Mini Xiangqi engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export async function playMiniXiangqiEngineMoveIfReady(
  ctx: MiniXiangqiEngineContext,
  room: MiniXiangqiEngineRoom,
): Promise<void> {
  const seat = miniXiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = miniXiangqiEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  const incrementMs = clock?.incrementMs ?? 0;
  if (remainingMs !== null && remainingMs <= 0) return;

  const history = miniXiangqiUciHistory(room.events);
  // Clock-aware per-move budget (shared allocator). The tier's NODE budget is the
  // strength anchor; this movetime is the latency ceiling + time-pressure guard.
  // Existing ceiling preserved — behavior-neutral for untimed play; adds increment
  // awareness + graceful shrink when timed. Replaces the old naive clamp.
  const { computeBudgetMs: movetimeMs } = budgetForMove({
    remainingMs,
    incrementMs,
    ceilingMs: tier.movetimeMs,
    reserveMs: CLOCK_SAFETY_MS,
    floorMs: MIN_MOVETIME_MS,
  });

  // Engine-move boundary contract (see engine-move-guard.ts): bounded retries,
  // validate every output against the kernel, FAIL CLOSED (resign + page) rather
  // than silently substituting a threat-blind legal move.
  const {
    chosen: validated,
    attempts,
    aborted,
  } = await resolveValidatedEngineMove({
    maxAttempts: ENGINE_MOVE_MAX_ATTEMPTS,
    requestMove: () => miniXiangqiLiveEngineMove(engineId, history, { movetimeMs }),
    validate: (uci) => legalMoveForUci(getMiniXiangqiOpenLegalMoves(room.projection.state), uci),
    stillOnTurn: () => engineToMove(room, seat),
    onReject: ({ attempt, maxAttempts, uci, reason, error }) =>
      logger.warn(
        {
          kind: 'mini_xiangqi_engine_move_rejected',
          room_id: room.id,
          engine_id: engineId,
          attempt,
          max_attempts: maxAttempts,
          uci,
          reject_reason: reason,
          error,
        },
        'Mini Xiangqi engine output rejected by kernel; retrying',
      ),
  });
  if (aborted || !engineToMove(room, seat)) return;

  if (validated === null) {
    // FAIL CLOSED: capture a complete replayable record, page, and resign.
    const record = buildEngineDecisionRecord({
      variant: 'mini-xiangqi',
      roomId: room.id,
      engineId,
      engineVersion: MINI_XIANGQI_ENGINE_VERSION,
      movetimeMs,
      tier,
      ply: history.length,
      toMove: seat,
      inCheck: isMiniXiangqiGeneralInCheck(room.projection.state, seat),
      history,
      legalUci: getMiniXiangqiOpenLegalMoves(room.projection.state).map(miniXiangqiMoveToUci),
      attempts,
    });
    reportEngineFallback(record, 'mini_xiangqi_engine_failed_closed', 'Mini Xiangqi');
    const resign: TenantRoomEvent<MiniXiangqiColor, MiniXiangqiMove, typeof MINI_XIANGQI_SPEC_ID> =
      {
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
  let chosen: MiniXiangqiMove = validated;
  const legalMoves = getMiniXiangqiOpenLegalMoves(room.projection.state);
  const guarded = guardMiniXiangqiEngineMove(room.projection.state, chosen, legalMoves);
  if (guarded !== chosen) {
    logger.warn(
      {
        kind: 'mini_xiangqi_engine_immediate_loss_guard',
        room_id: room.id,
        engine_id: engineId,
        move: miniXiangqiMoveToUci(chosen),
        replacement_move: miniXiangqiMoveToUci(guarded),
      },
      'Mini Xiangqi engine immediate-loss guard replaced an avoidable losing move',
    );
    chosen = guarded;
  }

  const event: TenantRoomEvent<MiniXiangqiColor, MiniXiangqiMove, typeof MINI_XIANGQI_SPEC_ID> = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}

function bothSeatsFilled(room: MiniXiangqiEngineRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: MiniXiangqiEngineRoom, seat: MiniXiangqiColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

function miniXiangqiUciHistory(
  events: readonly TenantRoomEvent<
    MiniXiangqiColor,
    MiniXiangqiMove,
    typeof MINI_XIANGQI_SPEC_ID
  >[],
): string[] {
  return events
    .filter(
      (
        event,
      ): event is Extract<
        TenantRoomEvent<MiniXiangqiColor, MiniXiangqiMove, typeof MINI_XIANGQI_SPEC_ID>,
        { type: 'move-played' }
      > => event.type === 'move-played',
    )
    .map((event) => miniXiangqiMoveToUci(event.move));
}

function miniXiangqiMoveToUci(move: MiniXiangqiMove): string {
  return `${move.from}${move.to}`;
}

function legalMoveForUci(
  legalMoves: readonly MiniXiangqiMove[],
  uci: string,
): MiniXiangqiMove | null {
  const match = uci.match(/^([a-g][1-7])([a-g][1-7])$/);
  if (!match) return null;
  const from = match[1] as MiniXiangqiMove['from'];
  const to = match[2] as MiniXiangqiMove['to'];
  return legalMoves.find((move) => move.from === from && move.to === to) ?? null;
}

/**
 * Replace a move that lets the opponent win on the immediate reply with any
 * legal move that does not — a cheap king-safety backstop for the lower tiers
 * (FSF rarely needs it, but it is harmless insurance and matches Crossroads).
 */
function guardMiniXiangqiEngineMove(
  state: MiniXiangqiGameState,
  chosen: MiniXiangqiMove,
  legalMoves: readonly MiniXiangqiMove[],
): MiniXiangqiMove {
  if (!allowsImmediateOpponentWin(state, chosen)) return chosen;
  return legalMoves.find((move) => !allowsImmediateOpponentWin(state, move)) ?? chosen;
}

function allowsImmediateOpponentWin(state: MiniXiangqiGameState, move: MiniXiangqiMove): boolean {
  if (state.status.type !== 'playing') return false;
  const mover = state.status.turn;
  const opponent = mover === 'red' ? 'black' : 'red';
  const after = applyMiniXiangqiOpenMove(state, move);
  if (after === state || after.status.type !== 'playing') return false;
  return getMiniXiangqiOpenLegalMoves(after).some((reply) => {
    const afterReply = applyMiniXiangqiOpenMove(after, reply);
    return afterReply.status.type === 'finished' && afterReply.status.winner === opponent;
  });
}
