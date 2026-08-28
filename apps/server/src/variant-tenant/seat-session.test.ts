import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserAccount } from '../persistence.js';
import { assignTenantSeat, type TenantSeatRoom } from './seat-session.js';
import type { TenantSeatTokenState } from './tenant.js';

type Color = 'white' | 'black';

const tenant = { colors: ['white', 'black'] as const };

function emptyRoom(): TenantSeatRoom<Color> {
  return { clients: new Set(), projection: { seats: {} }, seatTokens: {} };
}

function account(overrides: Partial<UserAccount> = {}): UserAccount {
  return { id: 'user-1', handle: 'tester', displayName: 'Tester', ...overrides } as UserAccount;
}

function seatToken(userId: string): TenantSeatTokenState<Color> {
  return {
    clientId: 'old-client',
    seat: 'white',
    tokenHash: 'hash',
    userId,
    userHandle: 'tester',
    userDisplayName: 'Tester',
    issuedAt: new Date(0),
    lastSeenAt: new Date(0),
    revokedAt: null,
  };
}

// The per-account play lock (126). Every tenant reaches a seat through this
// function, so these three cases are the whole tenant-side contract: a locked
// account takes no new seat, keeps one it already holds, and locks nobody else.

test('assignTenantSeat: a play-disabled account is refused a new seat', () => {
  const assignment = assignTenantSeat(
    tenant,
    emptyRoom(),
    'locked-client',
    undefined,
    account({ playDisabledAt: new Date() }),
  );

  assert.deepEqual(assignment, { ok: false, reason: 'play disabled' });
});

test('assignTenantSeat: a play-disabled account keeps the seat it already holds', () => {
  const room = emptyRoom();
  room.seatTokens.white = seatToken('user-1');

  const assignment = assignTenantSeat(
    tenant,
    room,
    'new-client',
    undefined,
    account({ playDisabledAt: new Date() }),
  );

  assert.ok(assignment.ok, 'the account re-attaches to its own seat by identity');
  assert.equal(assignment.seat, 'white');
});

test('assignTenantSeat: the play lock leaves a signed-out player alone', () => {
  const assignment = assignTenantSeat(tenant, emptyRoom(), 'guest-client', undefined, null);

  assert.ok(assignment.ok);
  assert.equal(assignment.seat, 'white');
});
