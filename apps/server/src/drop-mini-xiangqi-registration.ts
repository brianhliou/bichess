/**
 * Drop Mini Xiangqi registry entry. Owns the tenant's live-room map and binds
 * the generic tenant room factory, hydration, WebSocket runtime, HTTP create
 * route, lobby route, and watch metadata.
 */

import type {
  DROP_MINI_XIANGQI_SPEC_ID,
  DropMiniXiangqiGameState,
  DropMiniXiangqiMove,
  MiniXiangqiColor,
  RoomTimeControl,
} from '@mistboard/game';
import { currentAccountUser } from './account-session.js';
import { type DropMiniXiangqiEvent, dropMiniXiangqiTenant } from './drop-mini-xiangqi-tenant.js';
import * as persistence from './persistence.js';
import {
  handleDropMiniXiangqiCreate,
  requestsDropMiniXiangqi,
} from './routes/drop-mini-xiangqi-rooms.js';
import { isAllowedFullTimeControl } from './routes/lib.js';
import { scheduleDropMiniXiangqiEngineMove } from './server-drop-mini-xiangqi-engine.js';
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

export type DropMiniXiangqiRuntimeRoom = TenantRuntimeRoom<
  'drop-mini-xiangqi',
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  DropMiniXiangqiGameState,
  typeof DROP_MINI_XIANGQI_SPEC_ID
>;

type DropMiniXiangqiLiveRoom = TenantLiveRoom<
  'drop-mini-xiangqi',
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  DropMiniXiangqiGameState,
  typeof DROP_MINI_XIANGQI_SPEC_ID
>;

export type DropMiniXiangqiLiveRoomCreation =
  | { ok: true; room: DropMiniXiangqiRuntimeRoom }
  | {
      ok: false;
      error: 'drop_mini_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision';
    };

export const dropMiniXiangqiRooms = new Map<string, DropMiniXiangqiRuntimeRoom>();

const dropMiniXiangqiWs = createTenantWsRuntime(dropMiniXiangqiTenant, {
  scheduleEngineMove: (ctx, room) => scheduleDropMiniXiangqiEngineMove(ctx, room),
});

export async function createDropMiniXiangqiRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: MiniXiangqiColor | 'random',
  rated = false,
  engine?: TenantRoomEngineSeat<MiniXiangqiColor>,
): Promise<DropMiniXiangqiLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    dropMiniXiangqiTenant,
    {
      rooms: dropMiniXiangqiRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, dropMiniXiangqiTenant.kind),
      appendRoomEvent: (roomId, seq, event: DropMiniXiangqiEvent) =>
        persistence.appendRoomEvent(roomId, seq, event),
      isPersistenceEnabled: persistence.isInitialized,
      recordGameStart: persistence.recordGameStart,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(dropMiniXiangqiTenant, roomId, seq, eventType, err),
    },
    { timeControl, creatorPreference, rated, engine },
  );
  if (!created.ok) {
    return created.error === 'disabled'
      ? { ok: false, error: 'drop_mini_xiangqi_disabled' }
      : { ok: false, error: created.error };
  }
  return created;
}

export function getOrLoadDropMiniXiangqiRoom(
  roomId: string,
): Promise<DropMiniXiangqiRuntimeRoom | null> {
  return getOrLoadTenantRoom(dropMiniXiangqiTenant, dropMiniXiangqiRooms, roomId);
}

registerVariantTenant({
  kind: dropMiniXiangqiTenant.kind,
  gameSpecId: dropMiniXiangqiTenant.gameSpecId,
  roomIdPrefix: dropMiniXiangqiTenant.roomIdPrefix,
  // Retired 2026-07-05 (xiangqi pivot): no Mistboard TV channel, so it also
  // drops out of the homepage showcase. Existing games stay reviewable via the
  // /drop-mini-xiangqi/game postgame route and playable by deep link (enabled()
  // and acceptsDeepLink are untouched) — only the watch surface is removed.
  watch: null,
  ownsSpecRouting: true,
  errorPrefix: 'drop_mini_xiangqi',
  enabled: dropMiniXiangqiTenant.enabled,
  rooms: dropMiniXiangqiRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(dropMiniXiangqiRooms.values()),
  getOrLoadRoom: (roomId) =>
    getOrLoadDropMiniXiangqiRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    dropMiniXiangqiWs.handleConnection(
      {
        defaultRoomRegion: ctx.defaultRoomRegion,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as DropMiniXiangqiLiveRoom,
    ),
  clearRuntimeTimers: (room) =>
    clearTenantRuntimeTimers(room as unknown as DropMiniXiangqiLiveRoom),
  clearRooms: () => dropMiniXiangqiRooms.clear(),
  http: {
    matchesCreateRequest: requestsDropMiniXiangqi,
    handleCreate: async (ctx, request, response, body) => {
      const accountUser = body.rated === true ? await currentAccountUser(request) : null;
      await handleDropMiniXiangqiCreate(
        { ...ctx, createDropMiniXiangqiRoom },
        response,
        body,
        accountUser,
      );
    },
  },
  lobby: {
    supportsRated: true,
    allowsTimeControl: isAllowedFullTimeControl,
    createRoom: async (timeControl, rated) => {
      const created = await createDropMiniXiangqiRoom(timeControl, 'random', rated);
      if (!created.ok) throw new Error(`drop_mini_xiangqi_room_create_failed:${created.error}`);
      return { id: created.room.id, region: 'global' };
    },
  },
  sweepDueDeadline: null,
});
