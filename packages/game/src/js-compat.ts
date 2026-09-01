// Shims for JS builtins newer than the browsers that actually reach us.
//
// Vite's `build.target` lowers *syntax* only, never builtins, so a call to a
// too-new global ships verbatim in the bundle and throws at runtime on an old
// engine. No bundler setting fixes that; the call site has to change.
//
// Evidence, not hypothesis: Chrome 92 / Android threw `Object.hasOwn is not a
// function` on /puzzles (PostHog error tracking, 2026-08-25 and 2026-08-29),
// which hard-failed the page before the board rendered. Pre-Chrome-93 traffic
// is roughly 20 sessions per 30 days.
//
// `apps/web/src/web-builtin-floor.test.ts` fails the build if either builtin
// comes back into code that ships to the browser.

/** `Object.hasOwn` (Chrome 93+, Safari 15.4+) without the version floor. */
export function hasOwnKey(target: object, key: PropertyKey): boolean {
  // biome-ignore lint/suspicious/noPrototypeBuiltins: rewriting this to Object.hasOwn is the bug this file exists to fix; the prototype call IS the shim.
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * `structuredClone` (Chrome 98+, Safari 15.4+) with a JSON fallback.
 *
 * The fallback is only faithful for JSON-safe values: no Map, Set, Date,
 * cycles, or undefined-valued keys survive it. Every caller today clones a
 * wire payload that arrived as JSON or is about to be stringified into it, so
 * the precondition holds by construction. Check it before adding a caller.
 */
export function deepCloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
