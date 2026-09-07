// Bundle the diagram generator so it can run outside Vite: the article diagram
// modules import CSS, which node cannot load, and esbuild can stub it.

import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const out = new URL('./.benedict-diagrams.mjs', import.meta.url).pathname;
await build({
  entryPoints: [new URL('./gen-benedict-diagrams.mts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty', '.woff2': 'empty' },
  packages: 'external',
  logLevel: 'error',
});
await import(pathToFileURL(out).href);
