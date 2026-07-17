// Headless engine smoke: proves BOTH in-browser analysis backends actually RUN
// end-to-end against prod, not just that their assets serve. This is the check
// that would have caught the 2026-07-06 prod outage (five stacked
// serving/isolation bugs, all hidden behind green deploys because nothing
// exercised a real search).
//
// Backends (see apps/web/src/review/engine/):
//   fsf   - Fairy-Stockfish pthread wasm on /analysis/xiangqi (needs COOP/COEP
//           cross-origin isolation + SharedArrayBuffer). ceval.ts.
//   misty - Misty single-threaded wasm (MistyBanqi) on a finished banqi game's
//           review page. The game id is DISCOVERED at runtime from the public
//           /api/watch?channel=banqi feed, never hardcoded. misty-ceval.ts.
//           Note: the review document carries COEP, so the dedicated worker
//           script must itself be served with a compatible COEP header or
//           Chrome blocks the load (net::ERR_BLOCKED_BY_RESPONSE) - the exact
//           class that broke FSF on 2026-07-06. A header preflight asserts
//           this before the browser run so the failure names the real cause.
//
// Each check: load the page, mount the board/panel, toggle the engine on, and
// wait for a real eval + at least one PV line. Fails on engine console errors.
//
// Usage: node scripts/prod-ceval-smoke.mjs [--backend fsf|misty|all]
// Defaults to prod + all backends; point MISTBOARD_WEB_URL at a local build to
// smoke locally. MISTBOARD_CEVAL_SMOKE_BACKEND is the env equivalent.
import { readFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(
  options.baseUrl ?? process.env.MISTBOARD_WEB_URL ?? 'https://mistboard.com',
);
const timeoutMs = Number(process.env.MISTBOARD_CEVAL_SMOKE_TIMEOUT_MS ?? 45000);
const moves = process.env.MISTBOARD_CEVAL_SMOKE_MOVES ?? 'b3e3,h8e8,b1c3';
const backend = options.backend;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const failures = [];
try {
  if (backend === 'fsf' || backend === 'all') {
    await runCheck('fsf', () => checkFsf(browser));
  }
  if (backend === 'misty' || backend === 'all') {
    await runCheck('misty', () => checkMisty(browser));
  }
} finally {
  await browser.close();
}
if (failures.length > 0) process.exitCode = 1;

async function runCheck(name, fn) {
  try {
    const result = await fn();
    console.log(JSON.stringify({ ok: true, check: name, baseUrl, ...result }));
  } catch (err) {
    failures.push(name);
    console.error(
      JSON.stringify({ ok: false, check: name, baseUrl, error: err?.message ?? String(err) }),
    );
  }
}

// ── Fairy-Stockfish on the standalone analysis board ────────────────────────
async function checkFsf(browser) {
  const url = `${baseUrl}/analysis/xiangqi?moves=${encodeURIComponent(moves)}`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    const errors = collectErrors(page);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (!response?.ok())
      throw new Error(`${url} returned HTTP ${response?.status() ?? 'no response'}`);

    const isolated = await page.evaluate(() => globalThis.crossOriginIsolated === true);
    if (!isolated) {
      throw new Error(
        'page is not cross-origin isolated: COOP/COEP missing, so SharedArrayBuffer (and the WASM engine) is unavailable',
      );
    }

    // The board must reconstruct from the pasted move list.
    await page
      .locator('.xiangqi-live-board svg')
      .first()
      .waitFor({ state: 'attached', timeout: timeoutMs });

    await toggleEngineOn(page);
    await waitForEvalAndLines(page);
    const result = await readPanel(page);
    assertNoFatalErrors(errors);
    return { url, ...result };
  } finally {
    await page.close();
  }
}

// ── MistyBanqi wasm on a finished banqi game's review page ──────────────────
async function checkMisty(browser) {
  // Preflight: the review document is served with COEP, so the dedicated
  // worker script must carry a compatible COEP of its own or Chrome refuses to
  // start it. Assert the served headers first so a regression fails with the
  // real cause instead of an opaque "worker error".
  await assertMistyAssetHeaders();

  const roomId = await discoverFinishedBanqiGame();
  if (!roomId) {
    // Watch feed had no finished banqi game to open (feed drained). The asset
    // preflight above already passed; report the degraded mode loudly instead
    // of failing a deploy on missing content.
    return { mode: 'assets-only', reason: 'no finished banqi game in /api/watch?channel=banqi' };
  }

  const url = `${baseUrl}/banqi/game/${encodeURIComponent(roomId)}`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    const errors = collectErrors(page);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (!response?.ok())
      throw new Error(`${url} returned HTTP ${response?.status() ?? 'no response'}`);

    await page.locator('.engine-panel').waitFor({ state: 'attached', timeout: timeoutMs });
    await toggleEngineOn(page);
    await waitForEvalAndLines(page);
    const result = await readPanel(page);

    // Prove the Misty backend answered, not FSF: the panel names its engine.
    const engineNamed = await page.evaluate(() =>
      (document.querySelector('.engine-panel')?.textContent ?? '').includes('MistyBanqi'),
    );
    if (!engineNamed) throw new Error('engine panel did not name MistyBanqi');
    assertNoFatalErrors(errors);
    return { url, engine: 'MistyBanqi', ...result };
  } finally {
    await page.close();
  }
}

async function discoverFinishedBanqiGame() {
  const feedUrl = `${baseUrl}/api/watch?channel=banqi`;
  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`${feedUrl} returned HTTP ${response.status}`);
  const feed = await response.json();
  const game = (feed.unlocked ?? []).find((entry) => typeof entry.roomId === 'string');
  return game?.roomId ?? null;
}

// Preflight the exact versioned URLs the client fetches (?v= from
// MISTY_ASSET_VERSION in misty-ceval.ts, read from source so it always matches
// the deployed revision). The bare path is a DIFFERENT edge-cache key and can
// hold a stale header-less copy long after a fix deploys, which is exactly the
// false signal this smoke exists to prevent: worker script must be JS with a
// COEP the isolated review document accepts; the wasm must serve as
// application/wasm.
function mistyAssetVersion() {
  const source = readFileSync(
    new URL('../apps/web/src/review/engine/misty-ceval.ts', import.meta.url),
    'utf8',
  );
  const match = source.match(/MISTY_ASSET_VERSION = '([^']+)'/);
  if (!match) throw new Error('MISTY_ASSET_VERSION not found in misty-ceval.ts');
  return match[1];
}

async function assertMistyAssetHeaders() {
  const v = encodeURIComponent(mistyAssetVersion());
  const workerUrl = `${baseUrl}/engine/misty-banqi/worker.js?v=${v}`;
  const worker = await fetch(workerUrl);
  if (!worker.ok) throw new Error(`${workerUrl} returned HTTP ${worker.status}`);
  const workerType = worker.headers.get('content-type') ?? '';
  if (!/javascript/.test(workerType)) {
    throw new Error(`${workerUrl} content-type is ${workerType || 'missing'}, expected javascript`);
  }
  const coep = worker.headers.get('cross-origin-embedder-policy');
  if (coep !== 'require-corp' && coep !== 'credentialless') {
    throw new Error(
      `${workerUrl} is served without a compatible Cross-Origin-Embedder-Policy (got ${coep ?? 'none'}); ` +
        'the COEP review document blocks the worker load (net::ERR_BLOCKED_BY_RESPONSE). ' +
        'Serve /engine/misty-*/ assets with COEP like the /engine/fairy-stockfish/ branch in apps/server/src/server-http.ts.',
    );
  }

  const wasmUrl = `${baseUrl}/engine/misty-banqi/banqi_wasm_bg.wasm?v=${v}`;
  const wasm = await fetch(wasmUrl, { method: 'HEAD' });
  if (!wasm.ok) throw new Error(`${wasmUrl} returned HTTP ${wasm.status}`);
  const wasmType = wasm.headers.get('content-type') ?? '';
  if (!wasmType.includes('application/wasm')) {
    throw new Error(
      `${wasmUrl} content-type is ${wasmType || 'missing'}, expected application/wasm`,
    );
  }
}

// ── shared page steps ────────────────────────────────────────────────────────
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('requestfailed', (request) => {
    errors.push(`${request.url()} ${request.failure()?.errorText ?? 'request failed'}`);
  });
  return errors;
}

// Toggle the engine on. Programmatic click fires the handler synchronously and
// sets aria-pressed, so we can assert the toggle actually engaged.
async function toggleEngineOn(page) {
  const engaged = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) =>
      /^Engine/.test((el.textContent ?? '').trim()),
    );
    if (!button) return { ok: false, reason: 'engine toggle button not found' };
    if (button.disabled)
      return { ok: false, reason: 'engine toggle is disabled (engine reported unsupported)' };
    button.click();
    return { ok: button.getAttribute('aria-pressed') === 'true', reason: 'toggle did not engage' };
  });
  if (!engaged.ok) throw new Error(engaged.reason);
}

// The engine must return a real eval and at least one principal variation.
async function waitForEvalAndLines(page) {
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('.engine-panel');
      const evalText = panel?.querySelector('.engine-panel__eval')?.textContent?.trim();
      const lineCount = panel?.querySelectorAll('.engine-panel__line').length ?? 0;
      return Boolean(evalText) && lineCount >= 1;
    },
    { timeout: timeoutMs },
  );
}

function readPanel(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.engine-panel');
    return {
      eval: panel?.querySelector('.engine-panel__eval')?.textContent?.trim() ?? null,
      lines: panel?.querySelectorAll('.engine-panel__line').length ?? 0,
      meta: (panel?.textContent ?? '').match(/depth\s+\d+[\s\S]*?nps/)?.[0] ?? null,
    };
  });
}

function assertNoFatalErrors(errors) {
  const fatal = errors.filter((message) =>
    /pthread|SharedArrayBuffer|ceval|engine global missing|failed to load engine|misty|ERR_BLOCKED_BY_RESPONSE|Engine unavailable/i.test(
      message,
    ),
  );
  if (fatal.length > 0) throw new Error(`engine console errors: ${fatal.join(' | ')}`);
}

function parseArgs(args) {
  const parsed = {
    backend: process.env.MISTBOARD_CEVAL_SMOKE_BACKEND ?? 'all',
    baseUrl: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--backend') {
      parsed.backend = args[++index];
    } else if (arg === '--base') {
      parsed.baseUrl = args[++index];
    } else {
      throw new Error(`unknown argument: ${arg} (usage: [--backend fsf|misty|all] [--base <url>])`);
    }
  }
  if (parsed.backend !== 'fsf' && parsed.backend !== 'misty' && parsed.backend !== 'all') {
    throw new Error(`--backend must be fsf, misty, or all (got ${parsed.backend ?? 'nothing'})`);
  }
  if (parsed.baseUrl !== null && !parsed.baseUrl) throw new Error('--base requires a value');
  return parsed;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}
