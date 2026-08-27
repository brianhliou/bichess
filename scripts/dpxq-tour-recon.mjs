#!/usr/bin/env node
// Recon a dpxq.com tournament: walk the tour page and its round pages and
// report which board/game ids are visible.
//
// Why this exists: dpxq publishes no public index of currently-live boards.
// /hldcg/chess/ is a viewer *builder* (you type comma-separated game numbers
// and it composes live.htm?id=A-B-C), not a directory. So relaying a live
// event depends on learning the ids some other way, and the only honest way
// to find out is to watch a tour page populate.
//
// Run it weekly against the target tour before the event. A baseline of zero
// game ids is the expected pre-event result; the run where that changes tells
// us the populated shape with time to wire it up, instead of racing round 1.
//
// Verified 2026-08-27: dpxq's tournament pages (tour_/round_/player_/movelist_)
// carry pairings, players and standings but NEVER link a game record. The two
// silos are joined by /hldcg/search/s_online.asp, the online-user list, which
// shows which board each logged-in viewer is sitting on. During a live event
// the crowd concentrates on the tournament boards, so ranking that list by
// viewer count surfaces the live board ids without any permission or index.
//
//   node scripts/dpxq-tour-recon.mjs --tour 12683
//   node scripts/dpxq-tour-recon.mjs --online
//   node scripts/dpxq-tour-recon.mjs --online --min-viewers 3 --json
//
// Read-only. Fetches public pages at a polite pace, nothing else.

const DEFAULT_HOST = 'http://www.dpxq.com';
const REQUEST_TIMEOUT_MS = 15000;
const POLITE_DELAY_MS = 400;

function parseArgs(argv) {
  const args = {
    tour: null,
    host: DEFAULT_HOST,
    json: false,
    maxRounds: 24,
    online: false,
    minViewers: 1,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tour') args.tour = argv[++i];
    else if (arg === '--host') args.host = argv[++i];
    else if (arg === '--max-rounds') args.maxRounds = Number(argv[++i]);
    else if (arg === '--online') args.online = true;
    else if (arg === '--manifest') args.manifest = true;
    else if (arg === '--tour-slug') args.tourSlug = argv[++i];
    else if (arg === '--tour-name') args.tourName = argv[++i];
    else if (arg === '--round-id') args.roundId = argv[++i];
    else if (arg === '--round-name') args.roundName = argv[++i];
    else if (arg === '--event') args.event = argv[++i];
    else if (arg === '--max-boards') args.maxBoards = Number(argv[++i]);
    else if (arg === '--min-viewers') args.minViewers = Number(argv[++i]);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/dpxq-tour-recon.mjs (--tour <id> | --online) [options]

  --tour          dpxq tour id, e.g. 12683 (2026 全国象棋男子甲级联赛)
  --online        rank currently-watched board ids from the online-user list.
                  This is the live-discovery path; --tour only maps structure.
  --min-viewers   only report boards with at least this many viewers (default 1)

Manifest mode (with --online), emits a poller manifest on stdout:
  --manifest      emit mistboard.xiangqi.broadcast.manifest.v1 instead of a report
  --tour-slug     REQUIRED with --manifest. Pins every entry to one tour.
  --tour-name     display name for the tour
  --round-id      pins the round, e.g. r07. Pass it: dpxq's round tag is unreliable.
  --round-name    display name for the round, e.g. "Round 7"
  --event         keep only boards whose [DhtmlXQ_event] contains this string
  --max-boards    cap entries (default and hard ceiling 32)
  --host          origin to fetch from (default ${DEFAULT_HOST})
  --max-rounds    stop probing rounds after this many (default 24)
  --json          emit a machine-diffable JSON report instead of text
`);
}

// dpxq serves gb2312/GBK. Decode as gb18030, which is a superset, so player
// names and event titles survive. Game data is ASCII either way, but a report
// full of mojibake is unreadable and easy to misread as a parse failure.
async function fetchDecoded(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'mistboard-broadcast-recon/1.0 (+https://mistboard.com)' },
    });
    const buffer = new Uint8Array(await response.arrayBuffer());
    const header = response.headers.get('content-type') ?? '';
    const charset = /charset=([\w-]+)/i.exec(header)?.[1]?.toLowerCase();
    const utf8 = charset === 'utf-8' || charset === 'utf8';
    const text = new TextDecoder(utf8 ? 'utf-8' : 'gb18030').decode(buffer);
    return {
      ok: response.ok,
      status: response.status,
      bytes: buffer.length,
      text,
      finalUrl: response.url,
    };
  } catch (error) {
    return { ok: false, status: 0, bytes: 0, text: '', error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function uniqueMatches(text, pattern) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[1]))];
}

// The four id-bearing shapes our adapter already understands, plus the roster
// link that tells us a round page has actually been filled in.
function extractIds(text) {
  return {
    liveBoards: uniqueMatches(text, /view\.asp\?[^"'\s]*\bid=(\d+)/gi),
    archiveGames: uniqueMatches(text, /view_m_(\d+)\.html/gi),
    liveViewerGroups: uniqueMatches(text, /live\.htm\?id=([\d-]+)/gi),
    players: uniqueMatches(text, /player_\d+_(\d+)\.html/gi),
  };
}

function extractTitle(text) {
  const raw = /<title>([^<]*)<\/title>/i.exec(text)?.[1] ?? '';
  return raw.split(' - ')[0].trim();
}

async function probe(host, path) {
  const result = await fetchDecoded(`${host}${path}`);
  await sleep(POLITE_DELAY_MS);
  return { path, ...result };
}

// The online-user list is the only join between dpxq's tournament structure and
// its game records. Each logged-in viewer row carries the board they are on, so
// counting ids gives a live popularity ranking. During a tournament the top
// entries are the tournament boards.
async function reconOnline(args) {
  const page = await probe(args.host, '/hldcg/search/s_online.asp');
  const report = {
    fetchedAt: new Date().toISOString(),
    host: args.host,
    mode: 'online',
    status: page.status,
    bytes: page.bytes,
    minViewers: args.minViewers,
    boards: [],
  };

  if (!page.ok) {
    report.error = `online list unreachable (status ${page.status})${page.error ? `: ${page.error}` : ''}`;
    return report;
  }

  const counts = new Map();
  for (const match of page.text.matchAll(/view\.asp\?[^"'\s]*\bid=(\d+)/gi)) {
    const id = match[1];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  report.distinctBoards = counts.size;
  report.boards = [...counts.entries()]
    .map(([id, viewers]) => ({
      id,
      viewers,
      url: `${args.host}/hldcg/search/view.asp?owner=u&id=${id}`,
    }))
    .filter((board) => board.viewers >= args.minViewers)
    .sort((a, b) => b.viewers - a.viewers || Number(b.id) - Number(a.id));

  return report;
}

function emitOnline(report, asJson) {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`dpxq online-board recon  ${report.fetchedAt}`);
  if (report.error) {
    console.log(`\nERROR: ${report.error}`);
    return;
  }
  console.log(
    `online list  ${report.status}  ${report.bytes}B  ${report.distinctBoards} distinct board(s) being watched`,
  );
  console.log(`showing boards with >= ${report.minViewers} viewer(s)\n`);
  if (report.boards.length === 0) {
    console.log('  (none)');
  }
  for (const board of report.boards.slice(0, 40)) {
    console.log(
      `  ${String(board.viewers).padStart(3)} viewer(s)  id=${board.id.padEnd(9)} ${board.url}`,
    );
  }
  console.log('\n=> during a live event, the top ids here are the tournament boards.');
  console.log('   Feed them to the ops console as a manifest, or dry-run one directly.');
}

const MANIFEST_SCHEMA = 'mistboard.xiangqi.broadcast.manifest.v1';
const MANIFEST_MAX_SOURCES = 32;

function dhtmlxqTag(text, tag) {
  const match = new RegExp(`\\[DhtmlXQ_${tag}\\]([^\\[]*)`, 'i').exec(text);
  return match ? match[1].trim() : '';
}

// dpxq board pages carry a duplicate empty [DhtmlXQ_movelist] placeholder ahead
// of the real one, so first-non-empty wins. Same rule the adapter uses; keeping
// them in step matters, because a board we count as started but the adapter
// reads as empty would be imported as a phantom.
function movelistPlyCount(text) {
  for (const match of text.matchAll(/\[DhtmlXQ_movelist\]([^[]*)/gi)) {
    const moves = match[1].trim();
    if (moves.length > 0) return Math.floor(moves.length / 4);
  }
  return 0;
}

async function describeBoard(host, id) {
  const page = await probe(host, `/hldcg/search/view.asp?owner=u&id=${id}`);
  if (!page.ok) return { id, reachable: false };
  return {
    id,
    reachable: true,
    event: dhtmlxqTag(page.text, 'event'),
    round: dhtmlxqTag(page.text, 'round'),
    table: dhtmlxqTag(page.text, 'table'),
    red: dhtmlxqTag(page.text, 'red'),
    black: dhtmlxqTag(page.text, 'black'),
    result: dhtmlxqTag(page.text, 'result'),
    plies: movelistPlyCount(page.text),
  };
}

// Build a poller manifest from the ranked live boards.
//
// Every entry pins tourSlug/roundId explicitly rather than letting the adapter
// derive them from dpxq's tags. That is deliberate: tag hygiene varies by
// whoever created the record (a sampled board carried event="2020",
// round="2020-10" and an empty table), so trusting it would collapse all 18
// rounds of a league onto one round and collide boards on
// (tour_slug, source_board_id).
async function buildManifest(args, boards) {
  const candidates = [];
  for (const board of boards) {
    const detail = await describeBoard(args.host, board.id);
    if (!detail.reachable) continue;
    if (args.event && !detail.event.includes(args.event)) continue;
    candidates.push({ ...detail, viewers: board.viewers });
    if (candidates.length >= Math.min(args.maxBoards, MANIFEST_MAX_SOURCES)) break;
  }

  const sources = candidates.map((board) => {
    const entry = { url: `${args.host}/hldcg/search/view.asp?owner=u&id=${board.id}` };
    if (args.tourSlug) entry.tourSlug = args.tourSlug;
    if (args.tourName) entry.tourName = args.tourName;
    if (args.roundId) entry.roundId = args.roundId;
    if (args.roundName) entry.roundName = args.roundName;
    return entry;
  });

  return { manifest: { schema: MANIFEST_SCHEMA, sources }, candidates };
}

function emitManifest(result, args) {
  const { manifest, candidates } = result;
  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  console.error(
    `matched ${candidates.length} board(s)${args.event ? ` on event ~ "${args.event}"` : ''}:`,
  );
  for (const board of candidates) {
    console.error(
      `  id=${board.id.padEnd(9)} ${String(board.plies).padStart(3)} plies  ${board.red || '?'} vs ${board.black || '?'}  [${board.event || 'no event'} / ${board.round || 'no round'}]`,
    );
  }
  console.log(JSON.stringify(manifest, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.tour && !args.online)) {
    usage();
    process.exit(args.tour || args.online ? 0 : 1);
  }

  if (args.online) {
    const onlineReport = await reconOnline(args);
    if (onlineReport.error) {
      emitOnline(onlineReport, args.json);
      process.exit(2);
    }

    if (!args.manifest) {
      emitOnline(onlineReport, args.json);
      process.exit(0);
    }

    // Refuse to emit an unpinned manifest. Without a tour slug the adapter
    // falls back to dpxq's event tag, which is exactly the derivation this
    // mode exists to bypass, and a wrong slug spreads a league across several
    // half-populated tours that then have to be deleted by hand.
    if (!args.tourSlug) {
      console.error('--manifest requires --tour-slug (and normally --round-id).');
      process.exit(1);
    }

    const built = await buildManifest(args, onlineReport.boards);
    if (built.manifest.sources.length === 0) {
      console.error(
        `no boards matched${args.event ? ` for event ~ "${args.event}"` : ''}. The poller rejects an empty manifest, so nothing was emitted.`,
      );
      process.exit(3);
    }
    emitManifest(built, args);
    process.exit(0);
  }

  const tour = args.tour;
  const report = {
    fetchedAt: new Date().toISOString(),
    host: args.host,
    tour,
    tourTitle: null,
    pages: [],
    rounds: [],
    totals: { liveBoards: [], archiveGames: [], liveViewerGroups: [] },
  };

  const tourPage = await probe(args.host, `/hldcg/tour_${tour}.html`);
  report.tourTitle = tourPage.ok ? extractTitle(tourPage.text) : null;
  report.pages.push({ path: tourPage.path, status: tourPage.status, bytes: tourPage.bytes });

  if (!tourPage.ok) {
    report.error = `tour page unreachable (status ${tourPage.status})${tourPage.error ? `: ${tourPage.error}` : ''}`;
    emit(report, args.json);
    process.exit(2);
  }

  // Round pages are linked from the tour page. Trust the links rather than
  // guessing a range: a tour's round count is not knowable up front, and
  // probing past the end just adds noise.
  const roundNumbers = uniqueMatches(tourPage.text, new RegExp(`round_${tour}_(\\d+)\\.html`, 'gi'))
    .map(Number)
    .sort((a, b) => a - b)
    .slice(0, args.maxRounds);

  // The tournament movelist page is a known empty shell pre-event; probe it
  // anyway, because "it filled in" is exactly the signal we are waiting for.
  const movelist = await probe(args.host, `/hldcg/movelist_${tour}.html`);
  const movelistIds = movelist.ok ? extractIds(movelist.text) : null;
  report.pages.push({
    path: movelist.path,
    status: movelist.status,
    bytes: movelist.bytes,
    gameIds: movelistIds ? movelistIds.archiveGames.length + movelistIds.liveBoards.length : 0,
  });

  for (const roundNumber of roundNumbers) {
    const page = await probe(args.host, `/hldcg/round_${tour}_${roundNumber}.html`);
    if (!page.ok) {
      report.rounds.push({ round: roundNumber, status: page.status, reachable: false });
      continue;
    }
    const ids = extractIds(page.text);
    report.rounds.push({
      round: roundNumber,
      status: page.status,
      bytes: page.bytes,
      reachable: true,
      populated: ids.players.length > 0,
      playerCount: ids.players.length,
      liveBoards: ids.liveBoards,
      archiveGames: ids.archiveGames,
      liveViewerGroups: ids.liveViewerGroups,
    });
    report.totals.liveBoards.push(...ids.liveBoards);
    report.totals.archiveGames.push(...ids.archiveGames);
    report.totals.liveViewerGroups.push(...ids.liveViewerGroups);
  }

  for (const key of ['liveBoards', 'archiveGames', 'liveViewerGroups']) {
    report.totals[key] = [...new Set(report.totals[key])];
  }

  emit(report, args.json);
}

function emit(report, asJson) {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`dpxq tour recon  ${report.fetchedAt}`);
  console.log(`tour ${report.tour}  ${report.tourTitle ?? '(unreadable)'}`);
  if (report.error) {
    console.log(`\nERROR: ${report.error}`);
    return;
  }

  console.log('');
  for (const page of report.pages) {
    const extra = page.gameIds === undefined ? '' : `  gameIds=${page.gameIds}`;
    console.log(
      `  ${String(page.status).padEnd(4)} ${String(page.bytes).padStart(7)}B  ${page.path}${extra}`,
    );
  }

  console.log(`\nrounds linked from the tour page: ${report.rounds.length}`);
  for (const round of report.rounds) {
    if (!round.reachable) {
      console.log(`  r${String(round.round).padStart(2)}  unreachable (status ${round.status})`);
      continue;
    }
    const found = [
      round.liveBoards.length ? `live=${round.liveBoards.length}` : null,
      round.archiveGames.length ? `archive=${round.archiveGames.length}` : null,
      round.liveViewerGroups.length ? `groups=${round.liveViewerGroups.length}` : null,
    ].filter(Boolean);
    const state = round.populated ? `populated (${round.playerCount} players)` : 'empty';
    console.log(
      `  r${String(round.round).padStart(2)}  ${String(round.bytes).padStart(7)}B  ${state}${found.length ? `  ${found.join(' ')}` : ''}`,
    );
  }

  const { liveBoards, archiveGames, liveViewerGroups } = report.totals;
  console.log('\nboard ids discovered across all rounds:');
  console.log(
    `  live boards (view.asp?id=)   ${liveBoards.length}${liveBoards.length ? `  ${liveBoards.slice(0, 12).join(', ')}` : ''}`,
  );
  console.log(
    `  archive games (view_m_)      ${archiveGames.length}${archiveGames.length ? `  ${archiveGames.slice(0, 12).join(', ')}` : ''}`,
  );
  console.log(
    `  live viewer groups (live.htm) ${liveViewerGroups.length}${liveViewerGroups.length ? `  ${liveViewerGroups.slice(0, 6).join(', ')}` : ''}`,
  );

  const total = liveBoards.length + archiveGames.length + liveViewerGroups.length;
  console.log(
    total === 0
      ? '\n=> no board ids exposed yet. Expected before the event starts; re-run weekly.'
      : `\n=> ${total} board id(s) exposed. The populated shape is now known: wire these into a manifest and dry-run one through the ops console.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
