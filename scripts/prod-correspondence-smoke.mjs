// Correspondence surface deploy gate (#33): the correspondence HTTP routes must
// EXIST and must GATE correctly for an unauthenticated caller. This is not
// functional coverage; it proves the route registrations and their auth/flag
// gates survived the deploy.
//
// Expected codes are pinned from the route code:
//   - apps/server/src/routes/correspondence-games.ts: account-only, unauthenticated
//     GET -> 401 {"error":"not_signed_in"}; non-GET -> 405.
//   - apps/server/src/routes/correspondence-seeks.ts: every verb is account-only;
//     unauthenticated GET/POST -> 401 {"error":"not_signed_in"}. When the
//     correspondence feature flag is OFF the seeks routes return 404
//     {"error":"correspondence_disabled"}, so a 404 here is a real deploy-config
//     regression (flag lost), not a pass.
//
// Read-only by design: the only POST bodies are empty and rejected by the auth
// gate before any parsing or writes.

import { resolveBaseUrl } from './lib/base-url.mjs';
import { fetchJson } from './lib/http.mjs';
import { parseSmokeArgs } from './lib/smoke-args.mjs';
import { reportResult } from './lib/smoke-report.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;

const options = parseSmokeArgs(process.argv.slice(2), {
  usage: 'node scripts/prod-correspondence-smoke.mjs [options]',
  description: `Asserts the correspondence routes exist and gate correctly for an
unauthenticated caller (deploy-gate coverage, not functional coverage).`,
  flags: {
    '--base': {
      key: 'baseUrl',
      placeholder: '<url>',
      help: 'Base URL to smoke, default https://mistboard.com',
    },
    '--timeout-ms': {
      key: 'timeoutMs',
      placeholder: '<ms>',
      kind: 'positive-int',
      help: `Timeout per network step, default ${DEFAULT_TIMEOUT_MS}`,
    },
  },
});
const baseUrl = resolveBaseUrl(options.baseUrl);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const CHECKS = [
  { method: 'GET', path: '/api/correspondence/games', status: 401, error: 'not_signed_in' },
  { method: 'GET', path: '/api/correspondence/seeks', status: 401, error: 'not_signed_in' },
  {
    method: 'GET',
    path: '/api/correspondence/seeks/incoming',
    status: 401,
    error: 'not_signed_in',
  },
  { method: 'POST', path: '/api/correspondence/seeks', status: 401, error: 'not_signed_in' },
  // Method gate: the games route is GET-only.
  { method: 'POST', path: '/api/correspondence/games', status: 405, error: 'method_not_allowed' },
];

const results = [];
for (const check of CHECKS) {
  const { status, body } = await fetchJson(new URL(check.path, baseUrl), {
    timeoutMs,
    init: {
      method: check.method,
      ...(check.method === 'POST'
        ? { headers: { 'content-type': 'application/json' }, body: '{}' }
        : {}),
    },
  });
  if (status !== check.status || body?.error !== check.error) {
    throw new Error(
      `${check.method} ${check.path}: expected ${check.status} {"error":"${check.error}"}, got ${status} ${JSON.stringify(body)}`,
    );
  }
  results.push({ method: check.method, path: check.path, status });
}

reportResult({ ok: true, baseUrl: baseUrl.href, checks: results });
