// Base-URL resolution shared by the prod smoke scripts.
//
// Every smoke resolves its target the same way: explicit --base beats the
// MISTBOARD_BASE_URL env var beats the prod default. The URL is normalized to
// an origin-only URL object so path/query/hash noise in the input can never
// leak into the probes.

export const DEFAULT_PROD_BASE_URL = 'https://mistboard.com';

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

export function resolveBaseUrl(
  explicitBaseUrl,
  { defaultBaseUrl = DEFAULT_PROD_BASE_URL, env = process.env } = {},
) {
  return normalizeBaseUrl(explicitBaseUrl ?? env.MISTBOARD_BASE_URL ?? defaultBaseUrl);
}

// Deploys report short or long SHAs depending on the source; treat either
// prefix direction as a match.
export function revisionMatches(actual, expected) {
  return actual === expected || actual.startsWith(expected) || expected.startsWith(actual);
}
