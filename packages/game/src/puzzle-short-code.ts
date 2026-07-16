// Stable, human-referenceable short code for a puzzle id (lichess-style, e.g.
// "bMpKA", rendered as "Puzzle #bMpKA"). A deterministic hash of the full id
// maps to a fixed-length base62 code, so the client and server derive the same
// code with no stored mapping. Display and URL resolution both go through here;
// resolvePuzzleShortCode inverts it by scanning a candidate id list (each side
// scans the ids it already holds: the server the built-in registries, the
// client the fetched puzzle summaries). Uniqueness across the loaded corpus is
// a conformance-test invariant (puzzle-short-code.test.ts), so the inverse is
// unambiguous.

// base62 alphabet: digits, lowercase, uppercase. Case-sensitive on purpose so
// a 5-char code has 62^5 (~916M) distinct values, far above the puzzle count.
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 5;

// cyrb53 (public-domain string hash, good avalanche, no deps). Returns a 53-bit
// integer, comfortably above the 62^5 code space we sample from.
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function puzzleShortCode(id: string): string {
  let n = cyrb53(id);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code = BASE62[n % 62] + code;
    n = Math.floor(n / 62);
  }
  return code;
}

// True when `value` has the shape of a short code (all-base62, exact length), so
// callers can skip the (potentially large) scan for anything that is obviously a
// full puzzle id (which carry `xq-mined-` / `jungle-` / ... prefixes and hyphens).
export function looksLikePuzzleShortCode(value: string): boolean {
  if (value.length !== CODE_LENGTH) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (!BASE62.includes(value[i]!)) return false;
  }
  return true;
}

// Invert a short code to its full puzzle id by scanning candidate ids. Returns
// null when nothing matches. Exact (case-sensitive) match on the derived code.
export function resolvePuzzleShortCode(code: string, ids: Iterable<string>): string | null {
  if (!looksLikePuzzleShortCode(code)) return null;
  for (const id of ids) {
    if (puzzleShortCode(id) === code) return id;
  }
  return null;
}
