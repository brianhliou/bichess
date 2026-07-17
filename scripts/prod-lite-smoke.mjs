// Lite prod smoke: read-only GET checks (health, homepage, server-status,
// playable engines, /watch shell, one zh-hans prerendered page). Runs on every
// release tier; creates nothing.
import { resolveBaseUrl } from './lib/base-url.mjs';
import { fetchJson, fetchText } from './lib/http.mjs';
import { parseSmokeArgs } from './lib/smoke-args.mjs';
import { reportResult } from './lib/smoke-report.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;

const options = parseSmokeArgs(process.argv.slice(2), {
  usage: 'npm run prod:smoke:lite -- [options]',
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

const health = await fetchJson(new URL('/health', baseUrl), { timeoutMs });
if (health.status !== 200 || health.body?.ok !== true) {
  throw new Error(`/health failed: ${health.status} ${JSON.stringify(health.body)}`);
}

const index = await fetchText(new URL('/', baseUrl), { timeoutMs });
if (index.status !== 200) throw new Error(`/ failed: ${index.status}`);
if (!index.body.includes('Mistboard')) {
  throw new Error('homepage did not include Mistboard brand text');
}

const serverStatus = await fetchJson(new URL('/api/server-status', baseUrl), { timeoutMs });
if (serverStatus.status !== 200) {
  throw new Error(`/api/server-status failed: ${serverStatus.status}`);
}
if (!serverStatus.body || typeof serverStatus.body !== 'object') {
  throw new Error('/api/server-status returned invalid JSON');
}
if (!('restartAt' in serverStatus.body) || !('activeGames' in serverStatus.body)) {
  throw new Error('/api/server-status missing restartAt or activeGames');
}

const engines = await fetchJson(new URL('/api/engines/playable', baseUrl), { timeoutMs });
if (engines.status !== 200) {
  throw new Error(`/api/engines/playable failed: ${engines.status}`);
}
if (!Array.isArray(engines.body?.engines) || engines.body.engines.length === 0) {
  throw new Error('/api/engines/playable returned no engines');
}

// /watch is a registered SPA client route (unknown paths 404), so a 200 with
// the app shell proves the route registration survived the deploy. The shell
// markers are the SPA mount node and the brand title from apps/web/index.html.
const watch = await fetchText(new URL('/watch', baseUrl), { timeoutMs });
if (watch.status !== 200) throw new Error(`/watch failed: ${watch.status}`);
if (!watch.body.includes('id="app"') || !watch.body.includes('Mistboard')) {
  throw new Error('/watch did not serve the app shell (missing id="app" or Mistboard marker)');
}

// One Chinese-localized page: /zh-hans/rules/xiangqi is published (slug
// "xiangqi" is in TRANSLATED_ARTICLE_SLUGS, apps/web/src/article-i18n.ts) and
// prerendered, so the document itself must carry the translated title string
// (the zh-Hans value of the "Xiangqi Rules" catalog key).
const zhRules = await fetchText(new URL('/zh-hans/rules/xiangqi', baseUrl), { timeoutMs });
if (zhRules.status !== 200) throw new Error(`/zh-hans/rules/xiangqi failed: ${zhRules.status}`);
if (!zhRules.body.includes('象棋规则')) {
  throw new Error('/zh-hans/rules/xiangqi missing translated title marker 象棋规则');
}

reportResult({
  ok: true,
  baseUrl: baseUrl.href,
  health: health.body,
  serverStatus: serverStatus.body,
  playableEngines: engines.body.engines.map((engine) => engine.id),
  watchShell: true,
  zhHansRulesXiangqi: true,
});
