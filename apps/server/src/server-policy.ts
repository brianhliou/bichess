import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { type GameEvent, type GameProjection, replayGameEvents } from '@mistboard/game';

// Visibility rule: live games are visible only to seated players; finished
// games are public via replay endpoints. This is enforced at two layers —
// connection accept (canObserveLiveRoom) and replay HTTP (eventReplayResponse).

export type GameAccessMode = 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';

type RuntimeEnvKey =
  | 'MISTBOARD_ADMIN_DEBUG_TOKEN'
  | 'MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE'
  | 'MISTBOARD_ALLOWED_ORIGINS'
  | 'MISTBOARD_ABORT_POLICY_SWEEP_MS'
  | 'MISTBOARD_DRAIN_TOKEN'
  | 'MISTBOARD_GUEST_PRESTART_ABORT_MS'
  | 'MISTBOARD_REQUIRE_DATABASE'
  | 'MISTBOARD_TRUSTED_PROXY_HOPS'
  | 'NODE_ENV'
  | 'RAILWAY_ENVIRONMENT'
  | 'RAILWAY_ENVIRONMENT_NAME'
  | 'RAILWAY_SERVICE_NAME';

export type RuntimeEnv = Partial<Record<RuntimeEnvKey, string>>;

export type EventReplayResponse =
  | { status: 200; body: { events: GameEvent[] } }
  | { status: 403; body: { error: 'game_not_public' } }
  | { status: 404; body: { error: 'not_found' } };

export function eventReplayResponse(events: GameEvent[] | null): EventReplayResponse {
  if (!events) return { status: 404, body: { error: 'not_found' } };
  if (canExposeFullEventReplay(events)) return { status: 200, body: { events } };
  return { status: 403, body: { error: 'game_not_public' } };
}

export function canExposeFullEventReplay(events: GameEvent[]): boolean {
  try {
    return replayGameEvents(events).state.status.type === 'finished';
  } catch {
    // Unknown or non-chess room-family event logs are not public replay data.
    return false;
  }
}

export function modeForProjection(projection: GameProjection): GameAccessMode {
  const whiteIsEngine = isServerEngineClient(projection.seats.white);
  const blackIsEngine = isServerEngineClient(projection.seats.black);
  if (whiteIsEngine && blackIsEngine) return 'eve';
  if (whiteIsEngine !== blackIsEngine) return 'pve';
  return 'pvp';
}

export function isServerEngineClient(clientId: string | undefined): boolean {
  if (!clientId) return false;
  return (
    clientId === 'random-engine' ||
    clientId === 'engine:white' ||
    clientId === 'engine:black' ||
    clientId.startsWith('engine:') ||
    clientId.startsWith('builtin-') ||
    clientId.startsWith('python-')
  );
}

export function canObserveLiveRoom(projection: GameProjection): boolean {
  return projection.state.status.type === 'finished';
}

// SPA fallback allowlist. The web client owns these routes (see apps/web/src/main.ts);
// the server must hand them index.html so direct hits and refreshes don't 404. Keep in
// sync with main.ts — server-policy.test.ts covers literal-route parity, and
// apps/web/src/variant-registry-sync.test.ts covers the per-tenant game/review routes.
export function isClientRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return (
    normalized === '/about' ||
    normalized === '/learn' ||
    normalized === '/rules' ||
    normalized === '/zh-hans/rules' ||
    normalized === '/zh-hant/rules' ||
    normalized === '/play' ||
    normalized === '/watch' ||
    normalized === '/puzzles' ||
    normalized === '/source' ||
    normalized === '/contact' ||
    normalized === '/patron' ||
    normalized === '/faq' ||
    normalized === '/terms' ||
    normalized === '/privacy' ||
    normalized === '/account' ||
    normalized === '/account/settings' ||
    normalized.startsWith('/account/settings/') ||
    normalized === '/inbox' ||
    normalized.startsWith('/inbox/') ||
    normalized === '/correspondence' ||
    normalized.startsWith('/challenge/') ||
    normalized === '/player' ||
    normalized === '/player/rating-stats' ||
    normalized === '/leaderboard' ||
    normalized === '/news' ||
    normalized === '/feed' ||
    normalized === '/forum' ||
    normalized === '/forum/reports' ||
    normalized === '/forum/etiquette' ||
    normalized === '/database' ||
    normalized === '/engines' ||
    normalized === '/bots' ||
    normalized === '/mini-xiangqi-spike' ||
    normalized === '/xiangqi-demo' ||
    normalized.startsWith('/crossroads-chess/game/') ||
    normalized === '/articles' ||
    normalized === '/zh-hans/articles' ||
    normalized === '/zh-hant/articles' ||
    normalized.startsWith('/articles/') ||
    normalized.startsWith('/puzzles/') ||
    normalized.startsWith('/zh-hans/articles/') ||
    normalized.startsWith('/zh-hant/articles/') ||
    normalized.startsWith('/rules/') ||
    /^\/forum\/[^/]+$/.test(normalized) ||
    normalized.startsWith('/forum/t/') ||
    normalized.startsWith('/forum/redirect/post/') ||
    normalized === '/broadcast/xiangqi' ||
    normalized === '/broadcast/xiangqi/ops' ||
    /^\/broadcast\/xiangqi\/(?!board$)[^/]+$/.test(normalized) ||
    /^\/broadcast\/xiangqi\/[^/]+\/round\/[^/]+$/.test(normalized) ||
    /^\/broadcast\/xiangqi\/board\/[^/]+$/.test(normalized) ||
    normalized.startsWith('/zh-hans/rules/') ||
    normalized.startsWith('/zh-hant/rules/') ||
    normalized.startsWith('/xiangqi/game/') ||
    normalized.startsWith('/dark-xiangqi/game/') ||
    normalized.startsWith('/mini-xiangqi/game/') ||
    normalized.startsWith('/dark-mini-xiangqi/game/') ||
    normalized.startsWith('/drop-mini-xiangqi/game/') ||
    normalized.startsWith('/dark-shogi/game/') ||
    normalized.startsWith('/banqi/game/') ||
    normalized.startsWith('/jungle/game/') ||
    normalized.startsWith('/jungle-flip/game/') ||
    normalized.startsWith('/jieqi/game/') ||
    normalized.startsWith('/reveal-chess/game/') ||
    normalized.startsWith('/dark-crossroads-chess/game/') ||
    normalized.startsWith('/dark-crazyhouse/game/') ||
    normalized.startsWith('/kriegspiel/game/') ||
    normalized.startsWith('/fortress-xiangqi/game/') ||
    normalized.startsWith('/game/') ||
    // Standalone analysis board (/analysis/:variant), fed by a move list rather
    // than a room. Serves the review SPA shell and mounts the ceval engine, so it
    // must also be a review-shell route (COOP/COEP) below.
    /^\/analysis\/[a-z0-9-]+$/.test(normalized) ||
    // /engine/:id is the admin engine-profile SPA page (single segment). Deeper
    // paths like /engine/fairy-stockfish/stockfish.js are vendored ceval assets
    // and MUST fall through to the static handler, not the index.html rewrite.
    /^\/engine\/[^/]+$/.test(normalized) ||
    normalized.startsWith('/bot/') ||
    normalized.startsWith('/@/') ||
    normalized.startsWith('/room/')
  );
}

// Review-shell document routes: the postgame board at /game/:id and each
// /<variant>/game/:id, plus the standalone analysis board /analysis/:variant.
// These serve the review SPA shell, which can mount the in-browser analysis
// engine (WASM threads → SharedArrayBuffer → requires cross-origin isolation).
// server-http sends COOP/COEP on exactly these responses so the isolation stays
// scoped to the review surface. Live /room/ routes are deliberately excluded:
// the engine is postgame-only, and isolation there would buy nothing. Keep the
// single optional variant segment in sync with the /<variant>/game/ tenants in
// isClientRoute above.
export function isReviewShellRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return (
    /^(?:\/[a-z0-9-]+)?\/game\/[^/]+$/.test(normalized) ||
    /^\/analysis\/[a-z0-9-]+$/.test(normalized)
  );
}

export function adminDebugTokenFromProtocolHeader(
  value: string | string[] | undefined,
): string | undefined {
  return tokenFromProtocolHeader(value, 'mistboard-admin-debug.');
}

export function seatTokenFromProtocolHeader(
  value: string | string[] | undefined,
): string | undefined {
  return tokenFromProtocolHeader(value, 'mistboard-seat.');
}

function tokenFromProtocolHeader(
  value: string | string[] | undefined,
  prefix: string,
): string | undefined {
  const header = Array.isArray(value) ? value.join(',') : value;
  if (!header) return undefined;
  return header
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export function isAdminDebugToken(
  candidate: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  const expected = env.MISTBOARD_ADMIN_DEBUG_TOKEN;
  if (!expected || !candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Drain-token check. Uses a SEPARATE env var from the debug token so a leak in
// either secret doesn't escalate. Constant-time compare. See
// docs/server-restart-pause-resume.md (Security & hardening).
export function isDrainToken(
  candidate: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  const expected = env.MISTBOARD_DRAIN_TOKEN;
  if (!expected || !candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isDatabaseRequired(env: RuntimeEnv = process.env): boolean {
  if (parseBooleanEnv(env.MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE)) return false;
  if (parseBooleanEnv(env.MISTBOARD_REQUIRE_DATABASE)) return true;
  return isProductionLikeRuntime(env);
}

export function isProductionLikeRuntime(env: RuntimeEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'production' ||
    env.RAILWAY_ENVIRONMENT === 'production' ||
    env.RAILWAY_ENVIRONMENT_NAME === 'production' ||
    env.RAILWAY_SERVICE_NAME !== undefined
  );
}

export function isAllowedWebSocketOrigin(
  origin: string | undefined,
  host: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  if (!isProductionLikeRuntime(env)) return true;
  if (!origin) return false;
  return allowedWebSocketOrigins(host, env).has(origin);
}

export function allowedWebSocketOrigins(
  host: string | undefined,
  env: RuntimeEnv = process.env,
): Set<string> {
  const configured = parseCsvEnv(env.MISTBOARD_ALLOWED_ORIGINS);
  if (configured.length > 0) return new Set(configured);
  return host ? new Set([`https://${host}`]) : new Set();
}

export function recordMessageTimestamp(
  timestamps: number[],
  now: number,
  limit: number,
  windowMs: number,
): boolean {
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0]! < cutoff) timestamps.shift();
  timestamps.push(now);
  return timestamps.length <= limit;
}

export function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseNonNegativeInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

// Number of proxy hops in front of the server that we trust to have appended a
// correct client address to X-Forwarded-For. The trusted client IP is that many
// hops from the END of the list — everything to its left is client-supplied and
// must not be trusted. Defaults to 1, matching the Railway deployment (a single
// edge proxy). Set MISTBOARD_TRUSTED_PROXY_HOPS to the real depth if the request
// path changes. A value of 0 means "trust no forwarded hop" — use the socket
// address only.
export function trustedProxyHops(env: RuntimeEnv = process.env): number {
  return parseNonNegativeInteger(env.MISTBOARD_TRUSTED_PROXY_HOPS) ?? 1;
}

// True if `ip` is private, loopback, link-local, CGNAT, unspecified, or the
// 'unknown' sentinel — i.e. not a public address. A correctly-resolved client
// IP should be public, so a private one signals that MISTBOARD_TRUSTED_PROXY_HOPS
// no longer matches the real proxy topology. Handles IPv4, IPv6, and IPv4-mapped
// IPv6 (::ffff:a.b.c.d).
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith('[')) addr = addr.slice(1);
  if (addr.endsWith(']')) addr = addr.slice(0, -1);
  const zone = addr.indexOf('%');
  if (zone !== -1) addr = addr.slice(0, zone);
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) addr = mapped[1]!;

  if (addr.includes(':')) {
    if (addr === '::1' || addr === '::') return true; // loopback / unspecified
    const head = Number.parseInt(addr.split(':')[0] ?? '', 16);
    if (Number.isNaN(head)) return true; // unparseable → not a usable public addr
    if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    return false;
  }

  const octets = addr.split('.');
  if (octets.length !== 4) return true;
  const o = octets.map((p) => Number.parseInt(p, 10));
  if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = o as number[];
  if (a === 10 || a === 127 || a === 0) return true; // 10/8, loopback, 0/8
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 172 && b! >= 16 && b! <= 31) return true; // 172.16/12
  if (a === 169 && b === 254) return true; // 169.254/16 link-local
  if (a === 100 && b! >= 64 && b! <= 127) return true; // 100.64/10 CGNAT
  return false;
}

let cachedProxyTrustWarning: string | null = null;

// Returns a warning string if `ip` (resolved from X-Forwarded-For) is
// private/reserved in a production-like runtime — the signature of a proxy-depth
// misconfiguration — else null. Pure; the once-per-process side effect lives in
// clientIpForRateLimit.
export function proxyTrustWarningFor(
  ip: string,
  hops: number,
  env: RuntimeEnv = process.env,
): string | null {
  if (!isProductionLikeRuntime(env)) return null;
  if (!isPrivateOrReservedIp(ip)) return null;
  return (
    `[proxy-trust] client IP "${ip}" resolved from X-Forwarded-For is private/reserved; ` +
    `MISTBOARD_TRUSTED_PROXY_HOPS=${hops} likely no longer matches the real proxy depth. ` +
    `Rate-limit keys may collapse into one bucket (over-throttle), or if hops is too high the ` +
    `spoofable X-Forwarded-For prefix is being read (GHSA-3fx7 reopened). Verify the proxy topology.`
  );
}

// The first proxy-trust warning observed this process, or null. Exposed on
// /api/server-status so the proxy-depth assumption can be checked without log access.
export function getProxyTrustWarning(): string | null {
  return cachedProxyTrustWarning;
}

// Resolve the client IP used as a rate-limit / abuse key. We trust only the hop
// the proxy appended (counted from the right), never the leftmost hop, which is
// fully attacker-controlled: a client can send any X-Forwarded-For it likes, and
// the proxy only appends — it does not strip — so the first entry is spoofable.
// Reading the wrong end let an attacker rotate the header to land in a fresh
// bucket every request and bypass every per-IP limit. Falls back to the socket
// address when the header is missing, has too few hops, or hop trust is disabled,
// and to a stable 'unknown' so address-less requests still share one bucket
// rather than slipping past the limiter.
export function clientIpForRateLimit(
  request: Pick<IncomingMessage, 'headers' | 'socket'>,
  env: RuntimeEnv = process.env,
): string {
  const hops = trustedProxyHops(env);
  const header = request.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (hops > 0 && typeof raw === 'string' && raw.length > 0) {
    const forwarded = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const trusted = forwarded[forwarded.length - hops];
    if (trusted) {
      if (cachedProxyTrustWarning === null) {
        const warning = proxyTrustWarningFor(trusted, hops, env);
        if (warning) {
          cachedProxyTrustWarning = warning;
          console.warn(warning);
        }
      }
      return trusted;
    }
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function parseBooleanEnv(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
