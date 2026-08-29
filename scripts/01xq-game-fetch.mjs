#!/usr/bin/env node
// Fetch ONE game from 01xq by id, verify it, and print its ICCS mainline.
//
// Why this exists as its own tiny script rather than a mode of the dpxq
// harvester: it is not a harvester. It takes an id you already chose and pulls
// exactly that game. The two world champions missing from dpxq's archive
// (Xu Tianhong 1993, Xu Chao 2019) are hand-picked one at a time, which is the
// whole reason this is acceptable use of a source we do not mirror.
//
//   node scripts/01xq-game-fetch.mjs --id 027018BA8E0272
//
// Moves only. 01xq's own commentary, ratings and openings classification are
// third-party authored work and are never read or written here, the same rule
// the dpxq harvester follows.
//
// The move payload lives in a `MOVE_STR` javascript variable as 4 digits per
// ply, the same encoding dpxq uses, so it is verified through the SAME
// converter and rule engine: a game that does not replay legally is reported
// as broken rather than printed.

import {
  convertWxfDhtmlXqPageToSnapshot,
  STANDARD_DHTMLXQ_BINIT,
} from '../apps/server/dist/xiangqi-broadcast-wxf-dhtmlxq.js';

const HOST = 'http://www.01xq.com';
const args = process.argv.slice(2);
const argOf = (k, d = '') => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : (args[i + 1] ?? d);
};

function textField(html, label) {
  // The record page renders its metadata as plain table cells.
  const m = new RegExp(`${label}[^<]*</td>\\s*<td[^>]*>([^<]*)`, 'i').exec(html);
  return (m?.[1] ?? '').trim();
}

async function main() {
  const id = argOf('id');
  if (!id) throw new Error('need --id');

  const res = await fetch(`${HOST}/e_game_view.asp?id=${encodeURIComponent(id)}`, {
    headers: { 'user-agent': 'mistboard-article-research/1.0' },
  });
  if (!res.ok) throw new Error(`01xq returned ${res.status}`);
  const html = await res.text();

  const moveStr = /MOVE_STR\s*=\s*"(\d+)"/.exec(html)?.[1];
  if (!moveStr) throw new Error('no MOVE_STR on the record page');
  if (moveStr.length % 4 !== 0)
    throw new Error(`MOVE_STR is ${moveStr.length} digits, not a whole number of plies`);

  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const frame = [
    '[DhtmlXQiFrame]',
    `[DhtmlXQ_title]${title}[/DhtmlXQ_title]`,
    `[DhtmlXQ_event]${textField(html, 'Match')}[/DhtmlXQ_event]`,
    `[DhtmlXQ_date]${textField(html, 'Date')}[/DhtmlXQ_date]`,
    `[DhtmlXQ_red]${textField(html, 'Red')}[/DhtmlXQ_red]`,
    `[DhtmlXQ_black]${textField(html, 'Black')}[/DhtmlXQ_black]`,
    `[DhtmlXQ_result]${textField(html, 'Result')}[/DhtmlXQ_result]`,
    `[DhtmlXQ_binit]${STANDARD_DHTMLXQ_BINIT}[/DhtmlXQ_binit]`,
    `[DhtmlXQ_movelist]${moveStr}[/DhtmlXQ_movelist]`,
    '[/DhtmlXQiFrame]',
  ].join('\n');

  const converted = convertWxfDhtmlXqPageToSnapshot(frame, {
    tourSlug: '01xq-pick',
    roundId: `01xq-${id}`,
  });
  if (!converted.ok) {
    console.error('did not replay legally:', JSON.stringify(converted.issues, null, 1));
    process.exit(1);
  }
  const board = converted.snapshot.boards[0];
  const iccs = (board?.moves ?? []).map((m) => `${m.from}${m.to}`).join(' ');

  console.log(
    JSON.stringify(
      {
        id,
        sourceUrl: `${HOST}/e_game_view.asp?id=${id}`,
        title,
        plies: moveStr.length / 4,
        replayedPlies: board?.moves?.length ?? 0,
        iccs,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
