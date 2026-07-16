// Bounded self-play ladder check for the standard-Xiangqi Pikafish tiers.
//
// Pits the tiers head-to-head (color-swapped) refereed by our kernel and reports
// W/L/D so we can confirm the strength ladder is MONOTONIC (strongest > strong >
// amateur) before any launch. Also samples per-move search latency so we can see
// whether the NODE budget (strength anchor) or the movetime ceiling binds first
// on this machine.
//
//   tsx src/scripts/xiangqi-pikafish-ladder.ts [gamesPerColor] [maxPlies] [movetimeCapMs]
//
// gamesPerColor=1 -> 2 games per pairing (each tier plays red once, black once).

import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  getStandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import {
  XIANGQI_PLAYABLE_ENGINES,
  xiangqiEngineMove,
  xiangqiMoveToPikafishUci,
} from '../xiangqi-pikafish-engine.js';

const gamesPerColor = Number(process.argv[2] ?? 1);
const maxPlies = Number(process.argv[3] ?? 240);
const movetimeCapMs = Number(process.argv[4] ?? 1500);
// Optional 5th arg: comma-separated tier-id substrings to INCLUDE (e.g. "strong"
// keeps both -strong and -strongest, dropping amateur). Empty = all tiers.
const tierFilter = (process.argv[5] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type Tier = (typeof XIANGQI_PLAYABLE_ENGINES)[number];

function legalMoves(state: XiangqiGameState): XiangqiMove[] {
  const turn = state.status.type === 'playing' ? state.status.turn : 'red';
  return getStandardXiangqiPlayerView(state, turn).legalMoves;
}

function matchUci(moves: XiangqiMove[], uci: string): XiangqiMove | null {
  return moves.find((m) => xiangqiMoveToPikafishUci(m) === uci) ?? null;
}

type GameResult = { winner: XiangqiColor | 'draw'; plies: number; reason: string };

// Latency samples across the whole run, per tier id.
const latency = new Map<string, number[]>();
function recordLatency(id: string, ms: number): void {
  const arr = latency.get(id) ?? [];
  arr.push(ms);
  latency.set(id, arr);
}

async function moveFor(tier: Tier, history: string[]): Promise<string | null> {
  const started = performance.now();
  const uci = await xiangqiEngineMove(history, {
    nodes: tier.nodes,
    movetimeMs: Math.min(tier.movetimeMs, movetimeCapMs),
  });
  recordLatency(tier.id, performance.now() - started);
  return uci;
}

async function playGame(red: Tier, black: Tier): Promise<GameResult> {
  let state = createInitialXiangqiState('ladder');
  const history: string[] = [];
  for (let ply = 0; ply < maxPlies; ply++) {
    if (state.status.type !== 'playing') break;
    const turn = state.status.turn;
    const tier = turn === 'red' ? red : black;
    const uci = await moveFor(tier, history);
    if (!uci) return { winner: turn === 'red' ? 'black' : 'red', plies: ply, reason: 'no-move' };
    const move = matchUci(legalMoves(state), uci);
    if (!move) {
      return { winner: turn === 'red' ? 'black' : 'red', plies: ply, reason: `illegal(${uci})` };
    }
    state = applyStandardXiangqiMove(state, move);
    history.push(uci);
  }
  if (state.status.type === 'finished') {
    const w = state.status.winner;
    return {
      winner: w ?? 'draw',
      plies: history.length,
      reason: state.status.reason ?? 'finished',
    };
  }
  return { winner: 'draw', plies: history.length, reason: 'ply-cap' };
}

type Score = { wins: number; losses: number; draws: number };
function emptyScore(): Score {
  return { wins: 0, losses: 0, draws: 0 };
}

async function pairing(a: Tier, b: Tier): Promise<{ a: Score; b: Score }> {
  const scoreA = emptyScore();
  const scoreB = emptyScore();
  const credit = (winner: XiangqiColor | 'draw', aColor: XiangqiColor) => {
    if (winner === 'draw') {
      scoreA.draws++;
      scoreB.draws++;
    } else if (winner === aColor) {
      scoreA.wins++;
      scoreB.losses++;
    } else {
      scoreA.losses++;
      scoreB.wins++;
    }
  };
  for (let g = 0; g < gamesPerColor; g++) {
    // a as red, then a as black — cancels first-move advantage.
    let r = await playGame(a, b);
    console.log(`  ${a.id}(red) vs ${b.id}(black): ${r.winner} in ${r.plies} (${r.reason})`);
    credit(r.winner, 'red');
    r = await playGame(b, a);
    console.log(`  ${b.id}(red) vs ${a.id}(black): ${r.winner} in ${r.plies} (${r.reason})`);
    credit(r.winner, 'black');
  }
  return { a: scoreA, b: scoreB };
}

function fmt(s: Score): string {
  return `${s.wins}W-${s.losses}L-${s.draws}D`;
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main(): Promise<void> {
  const tiers =
    tierFilter.length > 0
      ? XIANGQI_PLAYABLE_ENGINES.filter((t) => tierFilter.some((f) => t.id.includes(f)))
      : XIANGQI_PLAYABLE_ENGINES;
  console.log(
    `ladder: gamesPerColor=${gamesPerColor} maxPlies=${maxPlies} movetimeCap=${movetimeCapMs}ms`,
  );
  for (const t of tiers) console.log(`  tier ${t.id}: nodes=${t.nodes}`);
  console.log('');

  // Adjacent pairings + the extreme, to verify a monotonic ladder.
  const pairs: [Tier, Tier][] = [];
  for (let i = 0; i < tiers.length; i++) {
    for (let j = i + 1; j < tiers.length; j++) pairs.push([tiers[i], tiers[j]]);
  }
  for (const [a, b] of pairs) {
    console.log(`== ${a.id} vs ${b.id} ==`);
    const { a: sa } = await pairing(a, b);
    // From the STRONGER-expected tier's perspective (b is later in the list).
    console.log(`  => ${a.id}: ${fmt(sa)}  (higher tier = ${b.id})\n`);
  }

  console.log('== per-move search latency (nodes-bound if well under the cap) ==');
  for (const t of tiers) {
    const arr = latency.get(t.id) ?? [];
    console.log(
      `  ${t.id}: n=${arr.length} p50=${pct(arr, 50).toFixed(0)}ms p90=${pct(arr, 90).toFixed(0)}ms max=${Math.max(0, ...arr).toFixed(0)}ms (cap ${movetimeCapMs}ms)`,
    );
  }
}

void main();
