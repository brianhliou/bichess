// Viewer country, from Cloudflare to the browser in one cookie.
//
// Cloudflare stamps every proxied request with CF-IPCountry (ISO 3166-1
// alpha-2, or XX unknown / T1 Tor). The web app needs it to skip links that
// are dead ends where the viewer is (Discord is blocked in mainland China,
// which was a third of visitors in Aug 2026), and it needs it synchronously
// while building the nav, before any fetch. So page navigations get a small
// readable cookie, mb_cc, and the client reads that (apps/web/src/viewer-geo.ts).
//
// Not personal data at this granularity, not HttpOnly on purpose (the client
// is the reader), a day long so a traveller's cookie catches up. Absent
// header (local dev, direct Railway hits) means no cookie, and the client
// treats no cookie as "show everything".

import type { IncomingMessage } from 'node:http';
import { isProductionLikeRuntime } from './server-policy.js';

export const VIEWER_COUNTRY_COOKIE = 'mb_cc';
const VIEWER_COUNTRY_MAX_AGE_S = 24 * 60 * 60;

export function viewerCountryFromRequest(request: Pick<IncomingMessage, 'headers'>): string | null {
  const raw = request.headers['cf-ipcountry'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase() ?? '';
  // XX (unknown) and T1 (Tor) are Cloudflare's non-countries; treat as unknown.
  if (!/^[A-Z]{2}$/.test(value) || value === 'XX' || value === 'T1') return null;
  return value;
}

export function viewerCountryCookie(country: string, env: NodeJS.ProcessEnv = process.env): string {
  const parts = [
    `${VIEWER_COUNTRY_COOKIE}=${country}`,
    'Path=/',
    `Max-Age=${VIEWER_COUNTRY_MAX_AGE_S}`,
    'SameSite=Lax',
  ];
  if (isProductionLikeRuntime(env)) parts.push('Secure');
  return parts.join('; ');
}
