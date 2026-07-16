/**
 * Crossroads Chess registry entry. Owns the tenant's live-room map, the
 * room-factory binding, hydration, and the rematch context (all moved out of
 * index.ts at the registry dispatch collapse), and registers the type-erased
 * closures the shared dispatch sites route through. Imported for side effects
 * by variant-tenant/register-tenants.ts.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  CrossroadsChessCreatorPreference,
  CrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import { crossroadsChessTenant } from './crossroads-chess-tenant.js';
import * as persistence from './persistence.js';
import {
  handleCrossroadsChessCreate,
  requestsCrossroadsChess,
} from './routes/crossroads-chess-rooms.js';
import { isAllowedFullTimeControl } from './routes/lib.js';
import type { CrossroadsChessRematchContext } from './server-crossroads-chess-rematch.js';
import {
  type CrossroadsChessLiveRoomCreation,
  type CrossroadsChessRoomEngineSeat,
  createCrossroadsChessLiveRoom,
} from './server-crossroads-chess-room-factory.js';
import {
  type CrossroadsChessLiveRoom,
  clearCrossroadsChessRuntimeTimers,
  handleCrossroadsChessWebSocketConnection,
  sendCrossroadsChessPayload,
} from './server-ws-crossroads-chess.js';
import {
  persistenceRecordForTenantSeatToken,
  recordTenantPersistenceError,
} from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';
import { mintTenantSeatToken } from './variant-tenant/seat-session.js';

export const crossroadsChessRooms = new Map<string, CrossroadsChessRuntimeRoom>();

export async function createCrossroadsChessRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: CrossroadsChessCreatorPreference,
  engine?: CrossroadsChessRoomEngineSeat,
): Promise<CrossroadsChessLiveRoomCreation> {
  return createCrossroadsChessLiveRoom(
    {
      appendRoomEvent: persistence.appendRoomEvent,
      crossroadsChessRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, crossroadsChessTenant.kind),
      isPersistenceEnabled: persistence.isInitialized,
      recordGameStart: persistence.recordGameStart,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(crossroadsChessTenant, roomId, seq, eventType, err),
    },
    timeControl,
    creatorPreference,
    engine,
  );
}

export function getOrLoadCrossroadsChessRoom(
  roomId: string,
): Promise<CrossroadsChessRuntimeRoom | null> {
  return getOrLoadTenantRoom(crossroadsChessTenant, crossroadsChessRooms, roomId);
}

const crossroadsChessRematchCtx: CrossroadsChessRematchContext = {
  send: (client, payload) => sendCrossroadsChessPayload(client, payload),
  createRoom: (timeControl) => createCrossroadsChessRoom(timeControl),
  buildRoomUrl: (roomId) => `/room/${encodeURIComponent(roomId)}`,
  issueSeatToken: async (room, seat, identity) => {
    const minted = mintTenantSeatToken(room, seat, identity);
    if (persistence.isInitialized()) {
      await persistence.upsertRoomSeatToken(
        room.id,
        persistenceRecordForTenantSeatToken(minted.state),
      );
    }
    return minted;
  },
};

registerVariantTenant({
  kind: crossroadsChessTenant.kind,
  gameSpecId: crossroadsChessTenant.gameSpecId,
  roomIdPrefix: crossroadsChessTenant.roomIdPrefix,
  watch: {
    channelId: 'crossroads-chess',
    family: 'crossroads-chess',
    label: 'Crossroads Chess',
    // 'dual-chess' is the pre-rename alias still seen in persisted records.
    legacyVariants: ['crossroads-chess', 'dual-chess'],
  },
  ownsSpecRouting: true,
  errorPrefix: 'crossroads_chess',
  enabled: crossroadsChessTenant.enabled,
  rooms: crossroadsChessRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(crossroadsChessRooms.values()),
  getOrLoadRoom: (roomId) =>
    getOrLoadCrossroadsChessRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    handleCrossroadsChessWebSocketConnection(
      {
        crossroadsChessRematch: crossroadsChessRematchCtx,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as CrossroadsChessLiveRoom,
    ),
  clearRuntimeTimers: (room) =>
    clearCrossroadsChessRuntimeTimers(room as unknown as CrossroadsChessLiveRoom),
  clearRooms: () => crossroadsChessRooms.clear(),
  http: {
    matchesCreateRequest: requestsCrossroadsChess,
    handleCreate: (ctx, _request, response, body) =>
      handleCrossroadsChessCreate({ ...ctx, createCrossroadsChessRoom }, response, body),
  },
  lobby: {
    supportsRated: false,
    allowsTimeControl: isAllowedFullTimeControl,
    createRoom: async (timeControl) => {
      const created = await createCrossroadsChessRoom(timeControl, 'random');
      if (!created.ok) throw new Error(`crossroads_chess_room_create_failed:${created.error}`);
      return { id: created.room.id, region: 'global' };
    },
  },
  // Perfect-info: excluded from correspondence by decision (engine-soaked
  // everywhere it exists); the per-spec allowlist also fails closed.
  sweepDueDeadline: null,
});
