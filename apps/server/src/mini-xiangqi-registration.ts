/**
 * Mini Xiangqi registry entry. Owns the tenant's live-room map and binds the
 * generic tenant room factory, hydration, WebSocket runtime, HTTP create route,
 * lobby route, and watch metadata.
 */

import type {
  MINI_XIANGQI_SPEC_ID,
  MiniXiangqiColor,
  MiniXiangqiGameState,
  MiniXiangqiMove,
  RoomTimeControl,
} from '@mistboard/game';
import { type MiniXiangqiEvent, miniXiangqiTenant } from './mini-xiangqi-tenant.js';
import * as persistence from './persistence.js';
import { isAllowedFullTimeControl } from './routes/lib.js';
import { handleMiniXiangqiCreate, requestsMiniXiangqi } from './routes/mini-xiangqi-rooms.js';
import { scheduleMiniXiangqiEngineMove } from './server-mini-xiangqi-engine.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import type { TenantRoomEngineSeat } from './variant-tenant/room-factory.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';
import type { TenantRuntimeRoom } from './variant-tenant/tenant.js';
import {
  clearTenantRuntimeTimers,
  createTenantWsRuntime,
  type TenantLiveRoom,
} from './variant-tenant/ws.js';

export type MiniXiangqiRuntimeRoom = TenantRuntimeRoom<
  'mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof MINI_XIANGQI_SPEC_ID
>;

type MiniXiangqiLiveRoom = TenantLiveRoom<
  'mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof MINI_XIANGQI_SPEC_ID
>;

export type MiniXiangqiLiveRoomCreation =
  | { ok: true; room: MiniXiangqiRuntimeRoom }
  | {
      ok: false;
      error: 'persistence_failure' | 'room_id_collision';
    };

export const miniXiangqiRooms = new Map<string, MiniXiangqiRuntimeRoom>();

const miniXiangqiWs = createTenantWsRuntime(miniXiangqiTenant, {
  scheduleEngineMove: (ctx, room) => scheduleMiniXiangqiEngineMove(ctx, room),
});

export async function createMiniXiangqiRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: MiniXiangqiColor | 'random',
  rated = false,
  engine?: TenantRoomEngineSeat<MiniXiangqiColor>,
): Promise<MiniXiangqiLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    miniXiangqiTenant,
    {
      rooms: miniXiangqiRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, miniXiangqiTenant.kind),
      appendRoomEvent: (roomId, seq, event: MiniXiangqiEvent) =>
        persistence.appendRoomEvent(roomId, seq, event),
      isPersistenceEnabled: persistence.isInitialized,
      recordGameStart: persistence.recordGameStart,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(miniXiangqiTenant, roomId, seq, eventType, err),
    },
    { timeControl, creatorPreference, rated, engine },
  );
  if (!created.ok) {
    if (created.error === 'disabled') {
      throw new Error('Mini Xiangqi tenant is always enabled');
    }
    return { ok: false, error: created.error };
  }
  return created;
}

export function getOrLoadMiniXiangqiRoom(roomId: string): Promise<MiniXiangqiRuntimeRoom | null> {
  return getOrLoadTenantRoom(miniXiangqiTenant, miniXiangqiRooms, roomId);
}

registerVariantTenant({
  kind: miniXiangqiTenant.kind,
  gameSpecId: miniXiangqiTenant.gameSpecId,
  roomIdPrefix: miniXiangqiTenant.roomIdPrefix,
  // Retired 2026-07-05 (xiangqi pivot): no Mistboard TV channel, so it also
  // drops out of the homepage showcase. Existing games stay reviewable via the
  // /mini-xiangqi/game postgame route and playable by deep link (enabled() and
  // acceptsDeepLink are untouched) — only the watch surface is removed.
  watch: null,
  ownsSpecRouting: true,
  errorPrefix: 'mini_xiangqi',
  enabled: miniXiangqiTenant.enabled,
  rooms: miniXiangqiRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(miniXiangqiRooms.values()),
  getOrLoadRoom: (roomId) => getOrLoadMiniXiangqiRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    miniXiangqiWs.handleConnection(
      {
        defaultRoomRegion: ctx.defaultRoomRegion,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as MiniXiangqiLiveRoom,
    ),
  clearRuntimeTimers: (room) => clearTenantRuntimeTimers(room as unknown as MiniXiangqiLiveRoom),
  clearRooms: () => miniXiangqiRooms.clear(),
  http: {
    matchesCreateRequest: requestsMiniXiangqi,
    handleCreate: async (ctx, _request, response, body) => {
      await handleMiniXiangqiCreate({ ...ctx, createMiniXiangqiRoom }, response, body);
    },
  },
  lobby: {
    supportsRated: false,
    allowsTimeControl: isAllowedFullTimeControl,
    createRoom: async (timeControl, rated) => {
      const created = await createMiniXiangqiRoom(timeControl, 'random', rated);
      if (!created.ok) throw new Error(`mini_xiangqi_room_create_failed:${created.error}`);
      return { id: created.room.id, region: 'global' };
    },
  },
  sweepDueDeadline: null,
});
