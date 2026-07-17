/**
 * Server-side PikaJieQi loop for Jieqi (揭棋) PvE.
 *
 * Tier-B: jieqi is driven by a Pikafish-jieqi UCI subprocess (jieqi-engine.ts),
 * the same shape as Crossroads/Fairy-Stockfish — NOT the hidden-info Misty
 * engine-worker. Unlike crossroads (perfect info, replayed from move history),
 * jieqi has hidden identities, so we hand the engine a redacted current-position
 * FEN built by jieqi-fen.ts from canonical state. Engine moves are injected
 * through the same append+broadcast path as human moves, so clocks, persistence,
 * reconnect, and review stay event-sourced.
 *
 * The engine SEAT is whichever projection.seats slot holds an engine clientId
 * (jieqi-engine.ts owns the id set); no dedicated room field, so it survives
 * hydration. The room types come from the generic tenant runtime, kept local to
 * avoid an import cycle with server-ws-jieqi.ts.
 */

import {
  getJieqiLegalMoves,
  isJieqiLegalMove,
  type JieqiColor,
  type JieqiGameState,
  type JieqiMove,
} from '@mistboard/game';
import {
  buildEngineDecisionRecord,
  reportEngineFallback,
  reportEngineMoveOk,
  resolveValidatedEngineMove,
} from './engine-move-guard.js';
import { budgetForMove } from './engine-time-budget.js';
import {
  isJieqiEngineClientId,
  JIEQI_ENGINE_VERSION,
  jieqiEngineTierFor,
  jieqiLiveEngineMove,
} from './jieqi-engine.js';
import {
  jieqiMoveToPikafishUci,
  jieqiStateToPikafishFen,
  pikafishUciToJieqiMove,
} from './jieqi-fen.js';
import type { JieqiEvent, JieqiSpecId } from './jieqi-runtime.js';
import { jieqiTenant } from './jieqi-tenant.js';
import { logger } from './obs.js';
import type { TenantLifecycleContext } from './variant-tenant/lifecycle.js';
import {
  applyTenantEvent,
  replayTenantEvents,
  tenantClockRemainingMs,
} from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';
import type { TenantLiveRoom } from './variant-tenant/ws.js';

const CLOCK_SAFETY_MS = 1_000;
const MIN_MOVETIME_MS = 50;

// Bounded retries before failing closed (see engine-move-guard.ts).
const ENGINE_MOVE_MAX_ATTEMPTS = 2;

type JieqiEngineRoom = TenantLiveRoom<'jieqi', JieqiColor, JieqiMove, JieqiGameState, JieqiSpecId>;
type JieqiEngineContext = TenantLifecycleContext<
  JieqiColor,
  JieqiMove,
  JieqiGameState,
  JieqiSpecId,
  JieqiEngineRoom
>;

export function jieqiEngineSeatFor(room: JieqiEngineRoom): JieqiColor | null {
  for (const seat of ['red', 'black'] as const) {
    if (isJieqiEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

function bothSeatsFilled(room: JieqiEngineRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: JieqiEngineRoom, seat: JieqiColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

// Build the repetition WINDOW for PikaJieQi: the redacted FEN at the last irreversible
// move (capture OR reveal) plus the quiet plies since, sent as `position fen <ws> moves
// <...>` so pikafish's is_repeated() (gated on pliesFromNull>=4) activates and honors the
// xiangqi repetition / perpetual-check / perpetual-chase rules. The window must contain NO
// reveal: a reveal flips a dark piece to an identity the engine cannot replay from a UCI
// move (and noCaptureClock only resets on capture, not reveal), so we detect both here by
// replaying move-by-move — capture = target occupied, reveal = moving piece faceDown.
// Within a window every piece's revealed-ness is constant, so the window-start redacted FEN
// plus the quiet moves leak no hidden identity and replay cleanly. Empty window => FEN only.
function jieqiEngineRepWindow(room: JieqiEngineRoom): { fen: string; moves: string[] } {
  const events = room.events as readonly JieqiEvent[];
  const created = events[0];
  if (created?.type !== 'room-created') {
    return { fen: jieqiStateToPikafishFen(room.projection.state), moves: [] };
  }
  let proj = replayTenantEvents(jieqiTenant, [created]);
  let startState = proj.state;
  let windowMoves: JieqiMove[] = [];
  for (const event of events.slice(1)) {
    if (event.type !== 'move-played') {
      proj = applyTenantEvent(jieqiTenant, proj, event);
      continue;
    }
    const board = proj.state.board;
    const irreversible = board[event.move.from]?.faceDown === true || board[event.move.to] != null;
    proj = applyTenantEvent(jieqiTenant, proj, event);
    if (irreversible) {
      startState = proj.state;
      windowMoves = [];
    } else {
      windowMoves.push(event.move);
    }
  }
  return {
    fen: jieqiStateToPikafishFen(startState),
    moves: windowMoves.map(jieqiMoveToPikafishUci),
  };
}

export function scheduleJieqiEngineMove(ctx: JieqiEngineContext, room: JieqiEngineRoom): void {
  if (room.engineTimer) return;
  const seat = jieqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playJieqiEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        { kind: 'jieqi_engine_move_failure', room_id: room.id, error: (err as Error).message },
        'Jieqi engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export async function playJieqiEngineMoveIfReady(
  ctx: JieqiEngineContext,
  room: JieqiEngineRoom,
): Promise<void> {
  const seat = jieqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = jieqiEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  const incrementMs = clock?.incrementMs ?? 0;
  if (remainingMs !== null && remainingMs <= 0) return;

  const { fen, moves } = jieqiEngineRepWindow(room);
  // Clock-aware per-move budget (shared allocator). Jieqi's strength anchor is the
  // tier's search DEPTH (set inside jieqiLiveEngineMove); this movetime is the
  // latency ceiling + time-pressure guard. Existing ceiling preserved —
  // behavior-neutral for untimed play; adds increment awareness + graceful shrink.
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
  } = await resolveValidatedEngineMove<JieqiMove>({
    maxAttempts: ENGINE_MOVE_MAX_ATTEMPTS,
    requestMove: () => jieqiLiveEngineMove(engineId, fen, { movetimeMs, moves }),
    validate: (uci) => {
      const parsed = pikafishUciToJieqiMove(uci);
      return parsed && isJieqiLegalMove(room.projection.state, parsed) ? parsed : null;
    },
    stillOnTurn: () => engineToMove(room, seat),
    onReject: ({ attempt, maxAttempts, uci, reason, error }) =>
      logger.warn(
        {
          kind: 'jieqi_engine_move_rejected',
          room_id: room.id,
          engine_id: engineId,
          attempt,
          max_attempts: maxAttempts,
          uci,
          reject_reason: reason,
          error,
        },
        'Jieqi engine output rejected by kernel; retrying',
      ),
  });
  if (aborted || !engineToMove(room, seat)) return;

  if (validated === null) {
    // FAIL CLOSED: capture a complete replayable record, page, and resign. Jieqi
    // is perfect-information at decision time (only hidden piece identities, which
    // do not change the current legal-move set), so a rejected move is a bug.
    const record = buildEngineDecisionRecord({
      variant: 'jieqi',
      roomId: room.id,
      engineId,
      engineVersion: JIEQI_ENGINE_VERSION,
      movetimeMs,
      tier: { movetimeMs: tier.movetimeMs },
      ply: moves.length,
      toMove: seat,
      inCheck: false,
      fen,
      history: moves,
      legalUci: getJieqiLegalMoves(room.projection.state).map(jieqiMoveToPikafishUci),
      attempts,
    });
    reportEngineFallback(
      record,
      'jieqi_engine_failed_closed',
      'Jieqi engine failed closed: no kernel-legal move after retries; resigning the engine seat',
    );
    const resign: TenantRoomEvent<JieqiColor, JieqiMove, JieqiSpecId> = {
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
  const event: TenantRoomEvent<JieqiColor, JieqiMove, JieqiSpecId> = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: validated,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}
