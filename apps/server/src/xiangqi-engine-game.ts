import {
  getStandardXiangqiLegalMoves,
  XIANGQI_SPEC_ID,
  type XiangqiMove,
  xiangqiMoveToPikafishUci,
} from '@mistboard/game';
import { replayTenantEvents } from './variant-tenant/runtime.js';
import {
  type XiangqiEngineTier,
  xiangqiEngineTierFor,
  xiangqiLiveEngineMove,
} from './xiangqi-engine-catalog.js';
import { isXiangqiRandomEngine, xiangqiRandomMoveUci } from './xiangqi-random-engine.js';
import type { XiangqiEvent } from './xiangqi-runtime.js';
import { xiangqiTenant } from './xiangqi-tenant.js';

export type XiangqiGameMoveRequest = {
  engineId: string;
  history: string[];
  legalMoves: readonly XiangqiMove[];
  tier: XiangqiEngineTier;
};

export type XiangqiGameMoveProvider = (request: XiangqiGameMoveRequest) => Promise<string | null>;

export type XiangqiEngineGameResult = {
  events: XiangqiEvent[];
  plyCount: number;
  result: 'red-wins' | 'black-wins' | 'draw' | null;
  status: 'completed' | 'aborted';
  termination: string;
  totalThinkTimeMs: number;
};

export async function playXiangqiEngineGame(input: {
  blackEngineId: string;
  maxPlies: number;
  moveProvider?: XiangqiGameMoveProvider;
  onEvent?: (event: XiangqiEvent, seq: number) => Promise<void>;
  openingPolicy?: Record<string, unknown>;
  redEngineId: string;
  roomId: string;
  startedAt?: number;
}): Promise<XiangqiEngineGameResult> {
  const redTier = requiredTier(input.redEngineId);
  const blackTier = requiredTier(input.blackEngineId);
  const startedAt = input.startedAt ?? Date.now();
  const moveProvider = input.moveProvider ?? defaultMoveProvider;
  const events: XiangqiEvent[] = [
    {
      type: 'room-created',
      at: startedAt,
      roomId: input.roomId,
      gameSpecId: XIANGQI_SPEC_ID,
    },
    {
      type: 'seat-assigned',
      at: startedAt,
      roomId: input.roomId,
      clientId: input.redEngineId,
      seat: 'red',
    },
    {
      type: 'seat-assigned',
      at: startedAt,
      roomId: input.roomId,
      clientId: input.blackEngineId,
      seat: 'black',
    },
  ];
  const history: string[] = [];
  let totalThinkTimeMs = 0;
  for (let seq = 0; seq < events.length; seq++) {
    await input.onEvent?.(events[seq]!, seq);
  }

  const openingPlies = randomOpeningPlies(input.openingPolicy);
  let openingSeed = seedFrom(input.openingPolicy?.seed);
  while (history.length < Math.min(openingPlies, input.maxPlies)) {
    const projection = replayTenantEvents(xiangqiTenant, events);
    if (projection.state.status.type !== 'playing') break;
    const legalMoves = getStandardXiangqiLegalMoves(projection.state);
    if (legalMoves.length === 0) break;
    const move = legalMoves[Number(openingSeed % BigInt(legalMoves.length))]!;
    openingSeed = nextSeed(openingSeed);
    history.push(xiangqiMoveToPikafishUci(move));
    events.push({
      type: 'move-played',
      at: startedAt + history.length,
      roomId: input.roomId,
      color: projection.state.status.turn,
      move,
    });
    await input.onEvent?.(events[events.length - 1]!, events.length - 1);
  }

  while (history.length < input.maxPlies) {
    const projection = replayTenantEvents(xiangqiTenant, events);
    if (projection.state.status.type === 'finished') {
      const winner = projection.state.status.winner;
      return {
        events,
        plyCount: history.length,
        result: winner === 'red' ? 'red-wins' : winner === 'black' ? 'black-wins' : 'draw',
        status: 'completed',
        termination: projection.state.status.reason,
        totalThinkTimeMs,
      };
    }
    if (projection.state.status.type !== 'playing') {
      return aborted(events, history.length, 'invalid-game-state', totalThinkTimeMs);
    }

    const color = projection.state.status.turn;
    const legalMoves = getStandardXiangqiLegalMoves(projection.state);
    if (legalMoves.length === 0) {
      return aborted(events, history.length, 'no-legal-moves', totalThinkTimeMs);
    }
    const engineId = color === 'red' ? input.redEngineId : input.blackEngineId;
    const tier = color === 'red' ? redTier : blackTier;
    const thinkStartedAt = Date.now();
    const uci = await moveProvider({ engineId, history: [...history], legalMoves, tier });
    const thinkTimeMs = Math.max(0, Date.now() - thinkStartedAt);
    totalThinkTimeMs += thinkTimeMs;
    const move = uci === null ? null : legalMoveForUci(legalMoves, uci);
    if (move === null) {
      return aborted(events, history.length, 'engine-failure', totalThinkTimeMs);
    }
    history.push(xiangqiMoveToPikafishUci(move));
    events.push({
      type: 'move-played',
      at: startedAt + Math.max(1, totalThinkTimeMs),
      roomId: input.roomId,
      color,
      move,
    });
    await input.onEvent?.(events[events.length - 1]!, events.length - 1);
  }

  return {
    events,
    plyCount: history.length,
    result: 'draw',
    status: 'completed',
    termination: 'truncated',
    totalThinkTimeMs,
  };
}

function requiredTier(engineId: string): XiangqiEngineTier {
  const tier = xiangqiEngineTierFor(engineId);
  if (!tier) throw new Error(`engine ${engineId} is not a standard-Xiangqi engine profile`);
  return tier;
}

async function defaultMoveProvider(request: XiangqiGameMoveRequest): Promise<string | null> {
  // The random floor bot plays a uniformly random legal move in-process — no UCI.
  if (isXiangqiRandomEngine(request.engineId)) {
    return xiangqiRandomMoveUci(request.legalMoves);
  }
  return xiangqiLiveEngineMove(request.engineId, request.history, {
    movetimeMs: request.tier.movetimeMs,
  });
}

export function legalMoveForUci(
  legalMoves: readonly XiangqiMove[],
  uci: string,
): XiangqiMove | null {
  return legalMoves.find((move) => xiangqiMoveToPikafishUci(move) === uci) ?? null;
}

function aborted(
  events: XiangqiEvent[],
  plyCount: number,
  termination: string,
  totalThinkTimeMs: number,
): XiangqiEngineGameResult {
  return { events, plyCount, result: null, status: 'aborted', termination, totalThinkTimeMs };
}

function randomOpeningPlies(policy: Record<string, unknown> | undefined): number {
  if (policy?.kind !== 'random_first_n_plies') return 0;
  const n = policy.n;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0;
}

function seedFrom(value: unknown): bigint {
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      let hash = 1469598103934665603n;
      for (const char of value) hash = (hash ^ BigInt(char.codePointAt(0)!)) * 1099511628211n;
      return hash & ((1n << 63n) - 1n);
    }
  }
  return 1n;
}

function nextSeed(seed: bigint): bigint {
  return (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 63n) - 1n);
}
