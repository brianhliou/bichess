// Fetch dpxq.com archive pages (view_m_<id>.html) into a local corpus folder
// for the historical xiangqi test corpus. Writes ONE .dhtmlxq file per valid
// game in exactly the shape import-historical-xiangqi.ts consumes (a single
// [DhtmlXQ_movelist] digit block plus title/event/round/date/result/red/black
// tags), so the corpus can be imported with the existing CLI.
//
//   tsx src/scripts/fetch-dpxq-archive.ts \
//     --start 141150 --min-id 120000 --count 1000 \
//     --out /path/outside/any/repo/dpxq-viewm [--delay-ms 1100] [--min-plies 8]
//
// Behavior notes:
// - Iterates ids DESCENDING from --start until --count valid games are
//   collected or --min-id is passed. Sequential, ~1.1s + jitter between
//   requests, honest User-Agent, aborts after 25 consecutive network failures.
// - dpxq pages embed the real movelist in a JS var; the visible tag block's
//   [DhtmlXQ_movelist] is empty (see apps/server/fixtures/dpxq/). We take the
//   digit-richest movelist occurrence on the page.
// - Pages with a non-empty [DhtmlXQ_binit] start from a custom position, which is
//   what classical endgame compositions are. These are kept: the binit tag is
//   carried into the written record and importXiangqiGame decodes it, so the
//   candidate is validated against its own start rather than the opening array.
//   (Before 2026-09-04 the importer could only replay from the standard opening,
//   so they were skipped and ledgered as 'custom-binit'.)
// - Each candidate is replayed through importXiangqiGame before it counts as
//   valid; games that fail legality land in <out>/rejects/ with the reason in
//   the ledger, so import-time rejects stay near zero and are inspectable.
// - RESUMABLE: a JSONL ledger (<out>/fetch-ledger.jsonl) records every id with
//   a terminal status; re-runs skip those (network/5xx failures are retried).

import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { importXiangqiGame } from '@mistboard/game';

const USER_AGENT = 'Mistboard archive research fetcher (contact: brianhliou@gmail.com)';
const MAX_CONSECUTIVE_NETWORK_FAILURES = 25;
const REQUEST_TIMEOUT_MS = 20_000;
const LEDGER_FILE = 'fetch-ledger.jsonl';
const PROGRESS_FILE = 'fetch-progress.json';

type Args = {
  count: number;
  delayMs: number;
  minId: number;
  minPlies: number;
  out: string;
  start: number;
};

type LedgerStatus =
  | 'game'
  | 'reject'
  | 'no-movelist'
  | 'short'
  // Retired 2026-09-04 (compositions are now kept); still parsed so ledgers
  // written before that date load without error.
  | 'custom-binit'
  | 'http'
  | 'network';

type LedgerEntry = {
  id: number;
  status: LedgerStatus;
  plies?: number;
  httpStatus?: number;
  reason?: string;
  ts: string;
};

// Retryable outcomes are re-attempted on resume; everything else is settled.
function isTerminal(entry: LedgerEntry): boolean {
  if (entry.status === 'network') return false;
  if (entry.status === 'http') return (entry.httpStatus ?? 0) < 500;
  return true;
}

function parseCliArgs(argv: string[]): Args {
  const { values } = parseArgs({
    args: argv,
    options: {
      start: { type: 'string' },
      'min-id': { type: 'string' },
      count: { type: 'string' },
      out: { type: 'string' },
      'delay-ms': { type: 'string', default: '1100' },
      'min-plies': { type: 'string', default: '8' },
    },
  });
  const start = Number.parseInt(values.start ?? '', 10);
  const minId = Number.parseInt(values['min-id'] ?? '', 10);
  const count = Number.parseInt(values.count ?? '', 10);
  if (
    !values.out ||
    !Number.isFinite(start) ||
    !Number.isFinite(minId) ||
    !Number.isFinite(count)
  ) {
    console.error(
      'usage: fetch-dpxq-archive --start <id> --min-id <id> --count <n> --out <dir> [--delay-ms 1100] [--min-plies 8]',
    );
    process.exit(1);
  }
  return {
    count,
    delayMs: Math.max(0, Number.parseInt(values['delay-ms'] ?? '1100', 10) || 1100),
    minId,
    minPlies: Math.max(1, Number.parseInt(values['min-plies'] ?? '8', 10) || 8),
    out: resolve(values.out),
    start,
  };
}

// --- charset-aware decode (same approach as xiangqi-broadcast-fetch.ts; kept
// local so this one-off script has no coupling to broadcast-owned files) ------

function charsetFromContentType(contentType: string | null): string | undefined {
  const match = contentType?.match(/charset=["']?([\w-]+)/i);
  return match?.[1]?.toLowerCase();
}

function charsetFromMetaSniff(bytes: Uint8Array): string | undefined {
  const head = Buffer.from(bytes.subarray(0, 2048)).toString('latin1');
  const match =
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i) ?? head.match(/charset=["']?([\w-]+)["']?/i);
  return match?.[1]?.toLowerCase();
}

function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const charset = charsetFromContentType(contentType) ?? charsetFromMetaSniff(bytes) ?? 'utf-8';
  try {
    // WHATWG maps gb2312 -> GBK; TextDecoder throws RangeError on unknown labels.
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// --- page extraction ----------------------------------------------------------

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function pageTag(html: string, name: string): string {
  const match = html.match(new RegExp(`\\[DhtmlXQ_${name}\\]([^\\[]*)`, 'i'));
  return match ? decodeEntities(match[1]!).replace(/\s+/g, ' ').trim() : '';
}

// The real movelist is usually in a JS var while the tag block's copy is
// empty; take the occurrence with the most digits.
function extractMovelistDigits(html: string): string {
  let best = '';
  for (const match of html.matchAll(/\[DhtmlXQ_movelist\]([^[]*)/gi)) {
    const digits = match[1]!.replace(/\D/g, '');
    if (digits.length > best.length) best = digits;
  }
  return best;
}

function customStartPosition(html: string): string | null {
  for (const match of html.matchAll(/\[DhtmlXQ_binit\]([^[]*)/gi)) {
    const value = match[1]!.trim();
    if (value.length > 0) return value;
  }
  return null;
}

function buildGameFile(html: string, url: string, digits: string): string {
  const binit = customStartPosition(html);
  const lines = ['[DhtmlXQ]'];
  for (const name of ['title', 'event', 'round', 'date', 'result', 'red', 'black'] as const) {
    const value = pageTag(html, name);
    if (value) lines.push(`[DhtmlXQ_${name}]${value}[/DhtmlXQ_${name}]`);
  }
  lines.push(`[DhtmlXQ_source_url]${url}[/DhtmlXQ_source_url]`);
  // Must precede the movelist in spirit if not in fact: without it a composition
  // replays from the opening array and silently becomes a different game.
  if (binit) lines.push(`[DhtmlXQ_binit]${binit}[/DhtmlXQ_binit]`);
  lines.push(`[DhtmlXQ_movelist]${digits}[/DhtmlXQ_movelist]`);
  lines.push('[/DhtmlXQ]');
  return `${lines.join('\n')}\n`;
}

// --- fetch loop -----------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function loadLedger(path: string): Promise<Map<number, LedgerEntry>> {
  const settled = new Map<number, LedgerEntry>();
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return settled;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as LedgerEntry;
      settled.set(entry.id, entry);
    } catch {
      // A torn tail line from an interrupted run is fine to ignore.
    }
  }
  return settled;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  await mkdir(args.out, { recursive: true });
  const ledgerPath = join(args.out, LEDGER_FILE);
  const ledger = await loadLedger(ledgerPath);

  const existingFiles = new Set(await readdir(args.out));
  let valid = 0;
  for (const file of existingFiles) {
    if (/^view_m_\d+\.dhtmlxq$/.test(file)) valid += 1;
  }
  console.log(
    `fetch-dpxq-archive: start=${args.start} min-id=${args.minId} target=${args.count} ` +
      `out=${args.out} (resuming with ${valid} games, ${ledger.size} ledger entries)`,
  );

  const startedAt = Date.now();
  const counts: Record<string, number> = {};
  let scanned = 0;
  let requests = 0;
  let consecutiveNetworkFailures = 0;

  const record = async (entry: LedgerEntry): Promise<void> => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    await appendFile(ledgerPath, `${JSON.stringify(entry)}\n`);
  };
  const writeProgress = async (lastId: number): Promise<void> => {
    const elapsedS = (Date.now() - startedAt) / 1000;
    await writeFile(
      join(args.out, PROGRESS_FILE),
      `${JSON.stringify(
        {
          lastId,
          scanned,
          requests,
          valid,
          target: args.count,
          counts,
          elapsedS: Math.round(elapsedS),
          reqPerS: requests > 0 ? Number((requests / elapsedS).toFixed(3)) : 0,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
  };

  let id = args.start;
  for (; id >= args.minId && valid < args.count; id -= 1) {
    const fileName = `view_m_${id}.dhtmlxq`;
    if (existingFiles.has(fileName)) continue; // already collected
    const settled = ledger.get(id);
    if (settled && isTerminal(settled)) continue;

    scanned += 1;
    const url = `http://www.dpxq.com/hldcg/search/view_m_${id}.html`;
    let html: string;
    try {
      requests += 1;
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        consecutiveNetworkFailures = 0;
        await record({
          id,
          status: 'http',
          httpStatus: response.status,
          ts: new Date().toISOString(),
        });
        await sleep(args.delayMs + Math.random() * 250);
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      html = decodeBody(bytes, response.headers.get('content-type'));
      consecutiveNetworkFailures = 0;
    } catch (error) {
      consecutiveNetworkFailures += 1;
      await record({
        id,
        status: 'network',
        reason: error instanceof Error ? error.message : String(error),
        ts: new Date().toISOString(),
      });
      if (consecutiveNetworkFailures >= MAX_CONSECUTIVE_NETWORK_FAILURES) {
        await writeProgress(id);
        console.error(
          `aborting: ${consecutiveNetworkFailures} consecutive network failures (last id ${id})`,
        );
        process.exit(1);
      }
      await sleep(args.delayMs + Math.random() * 250);
      continue;
    }

    const digits = extractMovelistDigits(html);
    if (digits.length === 0) {
      await record({ id, status: 'no-movelist', ts: new Date().toISOString() });
    } else if (digits.length < args.minPlies * 4 || digits.length % 4 !== 0) {
      await record({
        id,
        status: 'short',
        plies: Math.floor(digits.length / 4),
        ts: new Date().toISOString(),
      });
    } else {
      const content = buildGameFile(html, url, digits);
      const imported = importXiangqiGame(content);
      if (imported.error || imported.format !== 'dhtmlxq' || imported.moves.length === 0) {
        await mkdir(join(args.out, 'rejects'), { recursive: true });
        await writeFile(join(args.out, 'rejects', fileName), content);
        await record({
          id,
          status: 'reject',
          plies: Math.floor(digits.length / 4),
          reason: imported.error ?? `format=${imported.format ?? 'none'}`,
          ts: new Date().toISOString(),
        });
      } else {
        await writeFile(join(args.out, fileName), content);
        existingFiles.add(fileName);
        valid += 1;
        await record({
          id,
          status: 'game',
          plies: imported.moves.length,
          ts: new Date().toISOString(),
        });
      }
    }

    if (scanned % 25 === 0) {
      await writeProgress(id);
      console.log(
        `progress: id=${id} scanned=${scanned} valid=${valid}/${args.count} ` +
          `counts=${JSON.stringify(counts)}`,
      );
    }
    await sleep(args.delayMs + Math.random() * 250);
  }

  await writeProgress(id);
  const elapsedS = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `done: valid=${valid}/${args.count} scanned=${scanned} requests=${requests} ` +
      `elapsed=${elapsedS}s lastId=${id + 1} counts=${JSON.stringify(counts)}`,
  );
}

void main();
