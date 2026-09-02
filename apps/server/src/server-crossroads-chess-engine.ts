/**
 * Server-side Fairy-Stockfish loop for Crossroads Chess PvE.
 *
 * Crossroads is perfect-information, so it can use FSF directly instead of the
 * hidden-info Misty engine-worker protocol. The engine seat is stored as a
 * normal seat-assigned event. Engine moves are injected through the same
 * append+broadcast path as human moves so clocks, persistence, reconnect, and
 * review remain event-sourced.
 */

import {
  applyCrossroadsChessOpenMove,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessMove,
  getCrossroadsChessOpenLegalMoves,
} from '@mistboard/game';
import {
  CROSSROADS_CHESS_ENGINE_VERSION,
  crossroadsChessEngineTierFor,
  crossroadsChessLiveEngineMove,
  isCrossroadsChessEngineClientId,
} from './crossroads-chess-engine.js';
import type { CrossroadsChessEvent } from './crossroads-chess-runtime.js';
import {
  buildEngineDecisionRecord,
  reportEngineFallback,
  reportEngineMoveOk,
  resolveValidatedEngineMove,
} from './engine-move-guard.js';
import { budgetForMove } from './engine-time-budget.js';
import { logger } from './obs.js';
import type { CrossroadsChessLiveRoom } from './server-crossroads-chess-live-room.js';
import { tenantClockRemainingMs } from './variant-tenant/runtime.js';

const CLOCK_SAFETY_MS = 1_000;
const MIN_MOVETIME_MS = 50;

// Bounded retries before failing closed (see engine-move-guard.ts).
const ENGINE_MOVE_MAX_ATTEMPTS = 2;

export type CrossroadsChessEngineContext = {
  appendEvent(room: CrossroadsChessLiveRoom, event: CrossroadsChessEvent): Promise<number>;
  broadcastEventAppended(
    room: CrossroadsChessLiveRoom,
    event: CrossroadsChessEvent,
    seq: number,
  ): void;
  engineMove?(
    engineId: string,
    moves: string[],
    opts: { movetimeMs: number },
  ): Promise<string | null>;
  now?(): number;
};

export function crossroadsChessEngineSeatFor(
  room: CrossroadsChessLiveRoom,
): CrossroadsChessColor | null {
  for (const seat of ['white', 'red'] as const) {
    if (isCrossroadsChessEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

export function scheduleCrossroadsChessEngineMove(
  ctx: CrossroadsChessEngineContext,
  room: CrossroadsChessLiveRoom,
): void {
  if (room.engineTimer) return;
  const seat = crossroadsChessEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playCrossroadsChessEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        {
          kind: 'crossroads_chess_engine_move_failure',
          room_id: room.id,
          error: (err as Error).message,
        },
        'Crossroads Chess engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export async function playCrossroadsChessEngineMoveIfReady(
  ctx: CrossroadsChessEngineContext,
  room: CrossroadsChessLiveRoom,
): Promise<void> {
  const seat = crossroadsChessEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = crossroadsChessEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  const incrementMs = clock?.incrementMs ?? 0;
  if (remainingMs !== null && remainingMs <= 0) return;

  const history = crossroadsChessUciHistory(room.events);
  // Clock-aware per-move budget (shared allocator). NOTE: Crossroads has no node
  // budget, so this movetime IS the strength knob — existing ceiling preserved
  // (behavior-neutral for untimed play; adds increment awareness + graceful shrink
  // when timed). A CPU-independent node anchor is a separate follow-up.
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
  } = await resolveValidatedEngineMove<CrossroadsChessMove>({
    maxAttempts: ENGINE_MOVE_MAX_ATTEMPTS,
    requestMove: () =>
      (ctx.engineMove ?? crossroadsChessLiveEngineMove)(engineId, history, { movetimeMs }),
    validate: (uci) =>
      legalMoveForUci(getCrossroadsChessOpenLegalMoves(room.projection.state), uci),
    stillOnTurn: () => engineToMove(room, seat),
    onReject: ({ attempt, maxAttempts, uci, reason, error }) =>
      logger.warn(
        {
          kind: 'crossroads_chess_engine_move_rejected',
          room_id: room.id,
          engine_id: engineId,
          attempt,
          max_attempts: maxAttempts,
          uci,
          reject_reason: reason,
          error,
        },
        'Crossroads Chess engine output rejected by kernel; retrying',
      ),
  });
  if (aborted || !engineToMove(room, seat)) return;

  if (validated === null) {
    // FAIL CLOSED: capture a complete replayable record, page, and resign.
    const record = buildEngineDecisionRecord({
      variant: 'crossroads-chess',
      roomId: room.id,
      engineId,
      engineVersion: CROSSROADS_CHESS_ENGINE_VERSION,
      movetimeMs,
      tier: { movetimeMs: tier.movetimeMs },
      ply: history.length,
      toMove: seat,
      inCheck: false,
      history,
      legalUci: getCrossroadsChessOpenLegalMoves(room.projection.state).map(
        crossroadsChessMoveToUci,
      ),
      attempts,
    });
    reportEngineFallback(record, 'crossroads_chess_engine_failed_closed', 'Crossroads Chess');
    const resign: CrossroadsChessEvent = {
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
  let chosen: CrossroadsChessMove = validated;
  const legalMoves = getCrossroadsChessOpenLegalMoves(room.projection.state);
  const guarded = guardCrossroadsChessEngineMove(room.projection.state, chosen, legalMoves);
  if (guarded.move !== chosen) {
    logger.warn(
      {
        kind: 'crossroads_chess_engine_immediate_loss_guard',
        room_id: room.id,
        engine_id: engineId,
        move: crossroadsChessMoveToUci(chosen),
        replacement_move: crossroadsChessMoveToUci(guarded.move),
      },
      'Crossroads Chess engine immediate-loss guard replaced an avoidable losing move',
    );
    chosen = guarded.move;
  }

  const event: CrossroadsChessEvent = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}

function bothSeatsFilled(room: CrossroadsChessLiveRoom): boolean {
  return Boolean(room.projection.seats.white && room.projection.seats.red);
}

function engineToMove(room: CrossroadsChessLiveRoom, seat: CrossroadsChessColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

function legalMoveForUci(
  legalMoves: readonly CrossroadsChessMove[],
  uci: string,
): CrossroadsChessMove | null {
  const parsed = crossroadsChessMoveFromUci(uci);
  if (!parsed) return null;
  return (
    legalMoves.find(
      (move) =>
        move.from === parsed.from &&
        move.to === parsed.to &&
        (move.promotion ?? null) === (parsed.promotion ?? null),
    ) ?? null
  );
}

function guardCrossroadsChessEngineMove(
  state: CrossroadsChessGameState,
  chosen: CrossroadsChessMove,
  legalMoves: readonly CrossroadsChessMove[],
): { move: CrossroadsChessMove } {
  if (!allowsImmediateOpponentWin(state, chosen)) return { move: chosen };
  return {
    move: legalMoves.find((move) => !allowsImmediateOpponentWin(state, move)) ?? chosen,
  };
}

function allowsImmediateOpponentWin(
  state: CrossroadsChessGameState,
  move: CrossroadsChessMove,
): boolean {
  if (state.status.type !== 'playing') return false;
  const mover = state.status.turn;
  const opponent = mover === 'white' ? 'red' : 'white';
  const after = applyCrossroadsChessOpenMove(state, move, { progressClockLimit: Infinity });
  if (after === state || after.status.type !== 'playing') return false;
  return getCrossroadsChessOpenLegalMoves(after).some((reply) => {
    const afterReply = applyCrossroadsChessOpenMove(after, reply, {
      progressClockLimit: Infinity,
    });
    return afterReply.status.type === 'finished' && afterReply.status.winner === opponent;
  });
}

function crossroadsChessUciHistory(events: readonly CrossroadsChessEvent[]): string[] {
  return events
    .filter(
      (event): event is Extract<CrossroadsChessEvent, { type: 'move-played' }> =>
        event.type === 'move-played',
    )
    .map((event) => crossroadsChessMoveToUci(event.move));
}

function crossroadsChessMoveToUci(move: CrossroadsChessMove): string {
  return `${move.from}${move.to}${move.promotion === 'queen' ? 'q' : ''}`;
}

function crossroadsChessMoveFromUci(uci: string): CrossroadsChessMove | null {
  const match = uci.match(/^([a-f][1-8])([a-f][1-8])(q)?$/);
  if (!match) return null;
  return {
    from: match[1] as CrossroadsChessMove['from'],
    to: match[2] as CrossroadsChessMove['to'],
    ...(match[3] ? { promotion: 'queen' as const } : {}),
  };
}
