/**
 * Mini Xiangqi VariantTenant — perfect-information 7x7 mini xiangqi.
 *
 * This is the open base game for the mini-xiangqi cluster: full public board,
 * no reserves, no fog, checkmate/stalemate adjudication.
 */

import {
  type AbortReason,
  applyMiniXiangqiOpenMove,
  createInitialMiniXiangqiState,
  getMiniXiangqiOpenPlayerView,
  isMiniXiangqiOpenLegalMove,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
  type MiniXiangqiSquare,
  oppositeMiniXiangqiColor,
} from '@mistboard/game';
import {
  isMiniXiangqiEngineClientId,
  miniXiangqiEngineDisplayName,
  miniXiangqiEngineVersion,
} from './mini-xiangqi-engine.js';
import type * as persistence from './persistence.js';
import { tenantForfeitDeadlineForClient, tenantPveEngineId } from './variant-tenant/runtime.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

export const MINI_XIANGQI_ROOM_ID_PREFIX = 'mxq_';

export type MiniXiangqiEvent = TenantRoomEvent<
  MiniXiangqiColor,
  MiniXiangqiMove,
  typeof MINI_XIANGQI_SPEC_ID
>;

export type MiniXiangqiClientEvent = TenantClientEvent<
  MiniXiangqiColor,
  MiniXiangqiMove,
  typeof MINI_XIANGQI_SPEC_ID
>;

export type MiniXiangqiTenant = VariantTenant<
  'mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  MiniXiangqiPlayerView,
  typeof MINI_XIANGQI_SPEC_ID
>;

export function isMiniXiangqiSquare(value: unknown): value is MiniXiangqiSquare {
  return typeof value === 'string' && /^[a-g][1-7]$/.test(value);
}

function isMiniXiangqiColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
}

function isMiniXiangqiMove(value: unknown): value is MiniXiangqiMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  return isMiniXiangqiSquare(move.from) && isMiniXiangqiSquare(move.to);
}

export function miniXiangqiClientEventFor(
  event: MiniXiangqiEvent,
  _seat: TenantSeat<MiniXiangqiColor>,
  ply: number,
): MiniXiangqiClientEvent {
  if (event.type !== 'move-played') return event;
  return { ...event, ply };
}

export function getMiniXiangqiClientView(
  state: MiniXiangqiGameState,
  client: TenantSnapshotClient<MiniXiangqiColor>,
): MiniXiangqiPlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'red';
  return getMiniXiangqiOpenPlayerView(state, perspective);
}

export const miniXiangqiTenant: MiniXiangqiTenant = {
  kind: 'mini-xiangqi',
  gameSpecId: MINI_XIANGQI_SPEC_ID,
  roomIdPrefix: MINI_XIANGQI_ROOM_ID_PREFIX,
  colors: ['red', 'black'],
  enabled: () => true,
  oppositeColor: oppositeMiniXiangqiColor,
  rules: {
    createInitialState: createInitialMiniXiangqiState,
    applyMove: applyMiniXiangqiOpenMove,
    isLegalMove: isMiniXiangqiOpenLegalMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isMiniXiangqiColor,
    isMove: isMiniXiangqiMove,
    moveFromMessage: (message) => {
      if (!isMiniXiangqiSquare(message.from) || !isMiniXiangqiSquare(message.to)) return null;
      return { from: message.from, to: message.to };
    },
  },
  visibility: {
    clientEventFor: miniXiangqiClientEventFor,
    viewForClient: (state, client) => getMiniXiangqiClientView(state, client),
  },
  engine: {
    isEngineClientId: isMiniXiangqiEngineClientId,
    displayName: miniXiangqiEngineDisplayName,
    engineVersion: miniXiangqiEngineVersion,
    reservationReleaseTag: 'mini-xiangqi',
  },
  wire: {
    snapshotExtras: (room, client) => {
      const pveEngineId = tenantPveEngineId(miniXiangqiTenant, room);
      return {
        mode: pveEngineId ? 'pve' : 'pvp',
        pveEngineId,
        rated: room.rated,
        forfeitDeadline: tenantForfeitDeadlineForClient(miniXiangqiTenant, room, client),
      };
    },
  },
  persistence: {
    resultForWinner: (winner: MiniXiangqiColor | null): persistence.GameResult => {
      if (winner === 'red') return 'red-wins';
      if (winner === 'black') return 'black-wins';
      return 'draw';
    },
    termination: (reason: string) => reason as persistence.GameTermination,
    logKindPrefix: 'mini_xiangqi',
    logLabel: 'Mini Xiangqi',
  },
};
