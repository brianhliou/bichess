import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
// Importing register-tenants registers every tenant (module-scope side effect
// of each *-registration.ts module — the "one registry entry" of the tenant
// contract).
import './register-tenants.js';
import {
  registeredVariantTenants,
  registerVariantTenant,
  variantTenantForRoomId,
  variantTenantForSpecId,
} from './registry.js';

test('registry: DMX registration resolves by room id prefix and spec id', () => {
  const byRoom = variantTenantForRoomId('dmxq_some-room');
  assert.equal(byRoom?.kind, 'dark-mini-xiangqi');
  const bySpec = variantTenantForSpecId('dark-mini-xiangqi');
  assert.equal(bySpec?.roomIdPrefix, 'dmxq_');
});

test('registry: Drop Mini Xiangqi registration resolves by room id prefix and spec id', () => {
  assert.equal(variantTenantForRoomId('dmxqd_some-room')?.kind, 'drop-mini-xiangqi');
  assert.equal(variantTenantForSpecId('drop-mini-xiangqi')?.roomIdPrefix, 'dmxqd_');
});

test('registry: Mini Xiangqi registration resolves by room id prefix and spec id', () => {
  assert.equal(variantTenantForRoomId('mxq_some-room')?.kind, 'mini-xiangqi');
  assert.equal(variantTenantForSpecId('mini-xiangqi')?.roomIdPrefix, 'mxq_');
});

test('registry: Dark Xiangqi registration resolves by room id prefix and spec id', () => {
  assert.equal(variantTenantForRoomId('dxq_some-room')?.kind, 'dark-xiangqi');
  assert.equal(variantTenantForSpecId('dark-xiangqi')?.roomIdPrefix, 'dxq_');
});

test('registry: Crossroads registration resolves by room id prefix and spec id', () => {
  assert.equal(variantTenantForRoomId('dchess_some-room')?.kind, 'crossroads-chess');
  assert.equal(variantTenantForSpecId('crossroads-chess')?.roomIdPrefix, 'dchess_');
});

test('registry: misses fall through to null (chess fallback stays untouched)', () => {
  assert.equal(variantTenantForRoomId('room_chess-id'), null);
  assert.equal(variantTenantForSpecId('dark-chess'), null);
});

test('registry: every product-profile variant tenant exposes a lobby (Find opponent matchmaking)', () => {
  // The homepage Find-opponent picker offers every product-profile variant, and
  // POST /api/lobby resolves the tenant via variantTenantForSpecId. A tenant with
  // lobby=null answers `${errorPrefix}_not_integrated` (501), which the client
  // surfaces as "Could not join the lobby." dark-chess is the chess-fallback
  // registry MISS (variantTenantForSpecId=null) and matchmakes through the shared
  // room factory, so it is exempt here. This is the guard that a NEW product
  // variant cannot ship into the picker without a matchmaking surface.
  const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const profile = JSON.parse(
    readFileSync(resolve(repoRoot, 'config/product-profile.json'), 'utf8'),
  ) as { gameSpecIds: string[] };
  const missing = profile.gameSpecIds.filter((gameSpecId) => {
    const registration = variantTenantForSpecId(gameSpecId);
    return registration !== null && registration.lobby === null;
  });
  assert.deepEqual(
    missing,
    [],
    `product variants offered in Find opponent but missing a server lobby (add a lobby to their *-registration.ts): ${missing.join(', ')}`,
  );
});

test('registry: re-registration is idempotent for the same kind, throws across kinds', () => {
  const dmx = registeredVariantTenants().find((entry) => entry.kind === 'dark-mini-xiangqi');
  assert.ok(dmx);
  const before = registeredVariantTenants().length;
  registerVariantTenant(dmx);
  assert.equal(registeredVariantTenants().length, before);
  assert.throws(() => registerVariantTenant({ ...dmx, kind: 'other-variant' }), /prefix collision/);
});
