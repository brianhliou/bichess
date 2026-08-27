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
    else if (arg === '--min-viewers') args.minViewers = Number(argv[++i]);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/dpxq-tour-recon.mjs --tour <id> [--host <origin>] [--max-rounds <n>] [--json]

  --tour          dpxq tour id, e.g. 12683 (2026 全国象棋男子甲级联赛)
  --online        rank currently-watched board ids from the online-user list.
                  This is the live-discovery path; --tour only maps structure.
  --min-viewers   only report boards with at least this many viewers (default 1)
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.tour && !args.online)) {
    usage();
    process.exit(args.tour || args.online ? 0 : 1);
  }

  if (args.online) {
    const onlineReport = await reconOnline(args);
    emitOnline(onlineReport, args.json);
    process.exit(onlineReport.error ? 2 : 0);
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
