// The one place that talks to YouTube.
//
// Two scripts need it: `videos-audit.mjs` re-checks catalogued entries, and
// `videos-mine.mjs` looks for new ones. Both hit the same rate limiter, and both
// have to tell "YouTube declined to answer" apart from "this video is gone" —
// which is knowledge that must not exist twice. A miner that read the bot wall
// as an empty result set would report the catalogue as exhaustive.
//
// No API key and no quota: everything comes out of the JSON blobs the watch and
// results pages already embed.

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const BROWSER_HEADERS = {
  'user-agent': USER_AGENT,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'upgrade-insecure-requests': '1',
  // Pre-answers the EU consent interstitial, which otherwise replaces the page
  // data with a cookie wall on some exit nodes.
  cookie: 'SOCS=CAI; CONSENT=YES+1',
};

export const RETRIES = 3;

/** Playability states that mean "YouTube declined to answer us", not "this video
 *  is gone". A bot check reported as rot would send someone deleting live
 *  entries out of the catalogue, so callers retry these and then report them as
 *  unverified rather than as findings. */
export function isThrottle(status, reason) {
  if (status === 'LOGIN_REQUIRED' && /bot|sign in/i.test(reason ?? '')) return true;
  return status === 'ERROR' && /try again later/i.test(reason ?? '');
}

/** Index of the bracket closing the one at `open`, skipping string literals. */
export function matchingBracket(source, open) {
  const close = source[open] === '[' ? ']' : '}';
  const bracket = source[open];
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === "'" || char === '"' || char === '`') {
      i = endOfString(source, i);
      continue;
    }
    if (char === bracket) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced ${bracket} at offset ${open}`);
}

export function endOfString(source, open) {
  const quote = source[open];
  for (let i = open + 1; i < source.length; i += 1) {
    if (source[i] === '\\') {
      i += 1;
      continue;
    }
    if (source[i] === quote) return i;
  }
  throw new Error(`unterminated string at offset ${open}`);
}

/** JSON.parse the object literal that follows `key` in the page, or null.
 *
 *  Anchoring on a key and brace-matching beats field regexes here: these pages
 *  embed several JSON blobs and a bare /"viewCount":"(\d+)"/ will happily match
 *  a recommended video's. */
export function parseEmbeddedObject(html, key, from = 0) {
  const at = html.indexOf(key, from);
  if (at === -1) return null;
  const open = html.indexOf('{', at + key.length);
  if (open === -1) return null;
  try {
    return JSON.parse(html.slice(open, matchingBracket(html, open) + 1));
  } catch {
    return null;
  }
}

/** Every occurrence of an embedded object, in page order. */
export function parseEmbeddedObjects(html, key) {
  const found = [];
  let cursor = 0;
  for (;;) {
    const at = html.indexOf(key, cursor);
    if (at === -1) return found;
    const parsed = parseEmbeddedObject(html, key, at);
    if (parsed) found.push(parsed);
    cursor = at + key.length;
  }
}

/** Fetch a YouTube page as a browser would, retrying past throttles.
 *
 *  `classify` inspects the parsed page and returns a retry reason (a string) or
 *  null to accept it, so each caller decides what "YouTube declined" looks like
 *  on its own page shape. Returns `{ html }` or `{ error }`. */
export async function fetchYoutubePage(url, classify = () => null) {
  let lastError = null;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) {
      // Not unref'd: this backoff is the work, not a speculative timer, and an
      // unref'd one lets the process exit mid-retry with the await unsettled.
      const backoff = 800 * 2 ** (attempt - 1) + Math.random() * 400;
      await new Promise((done) => {
        setTimeout(done, backoff);
      });
    }
    try {
      const response = await fetch(url, { headers: BROWSER_HEADERS });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const html = await response.text();
      const retry = classify(html);
      if (retry) {
        lastError = retry;
        continue;
      }
      return { html };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { error: lastError ?? 'unknown fetch failure' };
}

/** Run `worker` over `items` with a fixed number of runners. */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
