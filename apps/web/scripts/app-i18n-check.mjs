#!/usr/bin/env node
// Enforces app-catalog structure and critical translations while reporting
// noncritical gaps without blocking feature delivery.

import { createServer } from 'vite';
import { buildI18nReport, formatI18nReport } from '../../../scripts/i18n-check-lib.mjs';

const args = new Set(process.argv.slice(2));
if (args.has('--help') || args.has('-h')) {
  console.log(`Usage:
  npm run i18n:check
  npm run i18n:check -- --json

Fails on invalid catalogs, stale locale keys, or missing critical translations.
Noncritical gaps are reported but do not fail the command.`);
  process.exit(0);
}

const unknownArgs = [...args].filter((arg) => arg !== '--json');
if (unknownArgs.length > 0) {
  console.error(`unknown option: ${unknownArgs.join(', ')}`);
  process.exit(1);
}

const server = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
});

try {
  const [{ APP_I18N_DOMAINS }, { SUPPORTED_LOCALES }] = await Promise.all([
    server.ssrLoadModule('/src/i18n/catalog.ts'),
    server.ssrLoadModule('/src/i18n/locale.ts'),
  ]);
  const report = buildI18nReport(APP_I18N_DOMAINS, SUPPORTED_LOCALES);
  console.log(args.has('--json') ? JSON.stringify(report, null, 2) : formatI18nReport(report));
  if (!report.ok) process.exitCode = 1;
} finally {
  await server.close();
}
