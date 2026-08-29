import { readFileSync } from 'node:fs';
import {
  jieqiStateToDealtFen, parseJieqiFen, getJieqiLegalMoves, applyJieqiMove,
} from './packages/game/src/index.js';

const chapters = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as {
  name: string; root: { rootFen: string; root: { children: { uci?: string; children: unknown[] }[] } };
}[];
const SQ = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/;
let ok = 0, bad = 0;
for (const ch of chapters) {
  const parsed = parseJieqiFen(ch.root.rootFen);
  if (!parsed.ok) { console.log(`PARSE FAIL: ${ch.name}`); bad++; continue; }
  if (jieqiStateToDealtFen(parsed.state) !== ch.root.rootFen) {
    console.log(`ROUND-TRIP MISMATCH: ${ch.name}`); bad++; continue;
  }
  const line: string[] = [];
  let n = ch.root.root.children[0] as { uci?: string; children: unknown[] } | undefined;
  while (n?.uci) { line.push(n.uci); n = n.children[0] as typeof n; }
  let s = parsed.state, applied = 0;
  for (const uci of line) {
    const m = SQ.exec(uci);
    const mv = m && getJieqiLegalMoves(s).find((x) => x.from === m[1] && x.to === m[2]);
    if (!mv) break;
    s = applyJieqiMove(s, mv, { noCaptureClockLimit: Number.POSITIVE_INFINITY });
    applied++;
  }
  if (applied !== line.length) { console.log(`REPLAY FAIL: ${ch.name} — ${applied}/${line.length}`); bad++; continue; }
  ok++;
}
console.log(`\n${ok} chapters verified, ${bad} bad`);
