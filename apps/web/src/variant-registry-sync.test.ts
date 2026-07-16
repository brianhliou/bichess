import { describe, expect, it } from 'vitest';
// The server cannot import the web bundle, so two of its dispatch surfaces
// hand-maintain per-variant entries that must mirror the web tenant registry:
// the SPA fallback allowlist (server-policy.ts isClientRoute) and the tenant
// registry populated by register-tenants.ts. These tests import the server
// source directly (same pattern as articles-meta-sync.test.ts) so a new
// variant that misses either surface fails here instead of shipping 404s on
// postgame refreshes or create requests that silently fall through to the
// chess stack. When this test landed it caught five tenants whose game routes
// were missing from isClientRoute (reveal-chess, dark-crossroads-chess,
// dark-crazyhouse, kriegspiel, fortress-xiangqi).
import { isClientRoute } from '../../server/src/server-policy.js';
// Side-effect import: populates the server tenant registry exactly like
// apps/server/src/index.ts (and registry.test.ts) do.
import '../../server/src/variant-tenant/register-tenants.js';
import { registeredVariantTenants } from '../../server/src/variant-tenant/registry.js';
import {
  XIANGQI_DEFAULT_ENGINE_ID,
  XIANGQI_PUBLIC_ENGINES,
} from '../../server/src/xiangqi-engine-catalog.js';
import { webVariantTenants } from './variant-tenant/registry.js';

const SAMPLE_ROOM_SUFFIX = 'abc123';

describe('web tenant routes <-> server SPA fallback allowlist', () => {
  it('every tenant postgame route serves the SPA shell on direct hits', () => {
    for (const tenant of webVariantTenants()) {
      // Tenants without a postgame surface (dark-chess correspondence) review
      // finished games at the legacy /game/:id, asserted below.
      if (!tenant.gameRouteBase) continue;
      const url = `${tenant.gameRouteBase}/${tenant.roomIdPrefix}${SAMPLE_ROOM_SUFFIX}`;
      expect(
        isClientRoute(url),
        `${tenant.gameSpecId}: ${url} is missing from isClientRoute() (apps/server/src/server-policy.ts), so direct hits and refreshes 404 in production`,
      ).toBe(true);
    }
  });

  it('every tenant review route serves the SPA shell on direct hits', () => {
    for (const tenant of webVariantTenants()) {
      // Tenants without their own reviewRouteBase keep the legacy /game/:id
      // link that shared surfaces (game-meta) always produced.
      const base = tenant.reviewRouteBase ?? '/game';
      const url = `${base}/${tenant.roomIdPrefix}${SAMPLE_ROOM_SUFFIX}`;
      expect(
        isClientRoute(url),
        `${tenant.gameSpecId}: review link ${url} is missing from isClientRoute() (apps/server/src/server-policy.ts)`,
      ).toBe(true);
    }
  });
});

describe('web tenant registry <-> server tenant registry parity', () => {
  const webTenants = webVariantTenants();
  const serverTenants = registeredVariantTenants();

  it('web and server registries cover the same game spec ids', () => {
    // Chess itself is deliberately in NEITHER registry (a registry miss IS the
    // chess fallback; see the header comments of both registry files), and the
    // dark-chess correspondence tenant (dchx_) is registered on BOTH sides, so
    // the spec-id sets must match exactly with no exception list.
    const webSpecs = new Set<string>(webTenants.map((tenant) => tenant.gameSpecId));
    const serverSpecs = new Set(serverTenants.map((registration) => registration.gameSpecId));
    const missingOnServer = [...webSpecs].filter((id) => !serverSpecs.has(id)).sort();
    const missingOnWeb = [...serverSpecs].filter((id) => !webSpecs.has(id)).sort();
    expect(
      { missingOnServer, missingOnWeb },
      `tenant registries drifted: [${missingOnServer.join(', ')}] need a side-effect import in apps/server/src/variant-tenant/register-tenants.ts; [${missingOnWeb.join(', ')}] need a WEB_VARIANT_TENANTS entry in apps/web/src/variant-tenant/registry.ts`,
    ).toEqual({ missingOnServer: [], missingOnWeb: [] });
  });

  it('web and server tenants agree on roomIdPrefix per spec', () => {
    for (const tenant of webTenants) {
      const serverPrefixes = serverTenants
        .filter((registration) => registration.gameSpecId === tenant.gameSpecId)
        .map((registration) => registration.roomIdPrefix);
      expect(
        serverPrefixes,
        `${tenant.gameSpecId}: web roomIdPrefix '${tenant.roomIdPrefix}' has no matching server registration prefix`,
      ).toContain(tenant.roomIdPrefix);
    }
  });

  it('xiangqi picker engine options mirror the server engine catalog', () => {
    // The web engineOptions list is a hand-maintained mirror of the server's
    // XIANGQI_PUBLIC_ENGINES (apps/server/src/xiangqi-engine-catalog.ts): the
    // ids ride the create payload straight into the server's engine-id gate, so
    // drift means a picker entry that cannot seat an engine. The picker orders
    // strongest-first; the server table orders weakest-first.
    const tenant = webTenants.find((candidate) => candidate.gameSpecId === 'xiangqi');
    expect(tenant?.landing?.engineOptions, 'xiangqi tenant must expose engineOptions').toBeTruthy();
    const options = tenant?.landing?.engineOptions ?? [];
    expect(options.map((option) => ({ id: option.id, name: option.name }))).toEqual(
      [...XIANGQI_PUBLIC_ENGINES].reverse().map((tier) => ({ id: tier.id, name: tier.name })),
    );
    expect(tenant?.landing?.defaultEngineId).toBe(XIANGQI_DEFAULT_ENGINE_ID);
  });

  it('web tenant roomIdPrefixes are unique', () => {
    // Server-side uniqueness is enforced at registration time
    // (registerVariantTenant throws on a cross-kind prefix collision; covered
    // by apps/server/src/variant-tenant/registry.test.ts). WEB_VARIANT_TENANTS
    // is a plain array with no such guard, so assert it here.
    const claimedBy = new Map<string, string>();
    for (const tenant of webTenants) {
      const existing = claimedBy.get(tenant.roomIdPrefix);
      expect(
        existing,
        `roomIdPrefix '${tenant.roomIdPrefix}' claimed by both '${existing}' and '${tenant.gameSpecId}'`,
      ).toBeUndefined();
      claimedBy.set(tenant.roomIdPrefix, tenant.gameSpecId);
    }
  });
});
