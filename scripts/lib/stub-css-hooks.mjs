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
export function resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) {
    return { url: 'data:text/javascript,export%20default%20%7B%7D', shortCircuit: true };
  }
  return next(specifier, context);
}
