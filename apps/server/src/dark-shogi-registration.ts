/**
 * Dark Shogi (9x9, hidden/dev-only) registry entry. Owns the tenant's live-room
 * map, the room-factory binding, hydration, and watch channel metadata. No
 * rematch/lobby yet (deep-link PvP only, like the Dark Xiangqi / Dark
 * Crossroads launches) — the lobby route answers dark_shogi_not_integrated
 * while the flag is on. Imported for side effects by
 * variant-tenant/register-tenants.ts.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type { DarkShogiCreatorPreference, DarkShogiRuntimeRoom } from './dark-shogi-runtime.js';
import { darkShogiTenant } from './dark-shogi-tenant.js';
import * as persistence from './persistence.js';
import { handleDarkShogiCreate, requestsDarkShogi } from './routes/dark-shogi-rooms.js';
import {
  createDarkShogiLiveRoom,
  type DarkShogiLiveRoomCreation,
} from './server-dark-shogi-room-factory.js';
import {
  clearDarkShogiRuntimeTimers,
  type DarkShogiLiveRoom,
  handleDarkShogiWebSocketConnection,
} from './server-ws-dark-shogi.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';

export const darkShogiRooms = new Map<string, DarkShogiLiveRoom>();

export async function createDarkShogiRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkShogiCreatorPreference,
): Promise<DarkShogiLiveRoomCreation> {
  return createDarkShogiLiveRoom(
    {
      appendRoomEvent: persistence.appendRoomEvent,
      darkShogiRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, darkShogiTenant.kind),
      isPersistenceEnabled: persistence.isInitialized,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(darkShogiTenant, roomId, seq, eventType, err),
    },
    timeControl,
    creatorPreference,
  );
}

export async function getOrLoadDarkShogiRoom(roomId: string): Promise<DarkShogiLiveRoom | null> {
  const room = await getOrLoadTenantRoom(
    darkShogiTenant,
    darkShogiRooms as unknown as Map<string, DarkShogiRuntimeRoom>,
    roomId,
  );
  return room as DarkShogiLiveRoom | null;
}

registerVariantTenant({
  kind: darkShogiTenant.kind,
  gameSpecId: darkShogiTenant.gameSpecId,
  roomIdPrefix: darkShogiTenant.roomIdPrefix,
  // Parked for the xiangqi-focused launch. Runtime/postgame support stays
  // registered, but Mistboard TV must not advertise a Shogi channel.
  watch: null,
  ownsSpecRouting: true,
  errorPrefix: 'dark_shogi',
  enabled: darkShogiTenant.enabled,
  rooms: darkShogiRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(darkShogiRooms.values()),
  getOrLoadRoom: (roomId) => getOrLoadDarkShogiRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    handleDarkShogiWebSocketConnection(
      {
        defaultRoomRegion: ctx.defaultRoomRegion,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as DarkShogiLiveRoom,
    ),
  clearRuntimeTimers: (room) => clearDarkShogiRuntimeTimers(room as unknown as DarkShogiLiveRoom),
  clearRooms: () => darkShogiRooms.clear(),
  http: {
    matchesCreateRequest: requestsDarkShogi,
    handleCreate: (ctx, _request, response, body) =>
      handleDarkShogiCreate({ ...ctx, createDarkShogiRoom }, response, body),
  },
  lobby: null,
  sweepDueDeadline: null,
});
