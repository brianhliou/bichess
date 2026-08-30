/**
 * Resolve `.css` imports to an empty module.
 *
 * Article content modules import stylesheets, which the bundler handles and node
 * does not. Without this, importing them from a script fails with
 * ERR_UNKNOWN_FILE_EXTENSION, and a script that merely skips the ones that fail
 * silently does less than it claims: article-line-evals.mjs exists to stop an
 * article shipping without assessments, so an article it cannot even read is the
 * exact case it must not miss.
 *
 * Stubbing is safe here because nothing these scripts do renders anything; the
 * stylesheet's only role at import time is to exist.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) {
    return { url: 'data:text/javascript,export%20default%20%7B%7D', shortCircuit: true };
  }
  // TypeScript source written for a bundler imports a sibling as `./x.js`, the
  // name it will have after a build. Node resolves that literally and fails on
  // a tree that was never built.
  //
  // This went unnoticed for a while because it only bites on a VALUE import:
  // the article content modules import their siblings with `import type`, which
  // is erased before resolution ever happens, so scripts that read only those
  // worked. The first script to import a module with real runtime imports hit
  // it immediately.
  if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL) {
    const candidate = new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return { url: pathToFileURL(fileURLToPath(candidate)).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
