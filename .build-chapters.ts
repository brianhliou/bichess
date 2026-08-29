import { readFileSync, writeFileSync } from 'node:fs';
import {
  createInitialJieqiState, jieqiStateToDealtFen, pikafishUciToJieqiMove,
} from './packages/game/src/index.js';

type Row = {
  game: number; plies: number; status: string; winner: string | null; reason: string | null;
  deal: { red: string[]; black: string[] }; moves: string;
};

const rows: Row[] = readFileSync(process.argv[2]!, 'utf8')
  .split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));

// A chapter must be a GAME: one that reached a real termination through the
// kernel. Requiring status === 'finished' is what excludes the runs that hit the
// generator's ply cap, which look decisive-ish in a summary (no draw reason) but
// simply stop mid-position. Short games are engine accidents, not study material.
const MIN_PLIES = 40;
const kept = rows
  .filter((r) => r.status === 'finished' && r.plies >= MIN_PLIES)
  .sort((a, b) => b.plies - a.plies);
console.log(`kept ${kept.length}/${rows.length} (finished, >= ${MIN_PLIES} plies)`);
const dropped = rows.filter((r) => r.status !== 'finished');
if (dropped.length) console.log(`  dropped ${dropped.length} unfinished (hit the generator ply cap)`);

// The last move is a LEAF: a trailing childless node without a uci would be
// dropped by the deserializer, so shipping one puts junk in every chapter.
function chain(ucis: string[]): { uci: string; children: unknown[] } {
  let node = { uci: ucis[ucis.length - 1]!, children: [] as unknown[] };
  for (let i = ucis.length - 2; i >= 0; i--) node = { uci: ucis[i]!, children: [node] };
  return node;
}

const chapters = kept.map((r, i) => {
  const state = createInitialJieqiState(`sp-${r.game}`, r.deal as never);
  const rootFen = jieqiStateToDealtFen(state);
  // The harness records PIKAFISH uci (ranks 0-9); a SerializedTree stores the
  // kernel's own square names (ranks 1-10), which is what the study replays.
  const ucis = r.moves.split(' ').filter(Boolean).map((tok) => {
    const sq = pikafishUciToJieqiMove(tok);
    if (!sq) throw new Error(`unconvertible engine uci ${tok} in game ${r.game}`);
    return `${sq.from}${sq.to}`;
  });
  const outcome = `${r.winner === 'red' ? 'Red' : 'Black'} wins by ${r.reason}`;
  return {
    name: `Game ${i + 1}: ${outcome}, ${Math.ceil(r.plies / 2)} moves`,
    orientation: 'red',
    root: { version: 1, rootFen, root: { children: [chain(ucis)] } },
  };
});

writeFileSync(process.argv[3]!, JSON.stringify(chapters, null, 2));
console.log(`wrote ${chapters.length} chapters`);
