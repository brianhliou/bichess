// Jungle (Dou Shou Qi) material-tactic miner.
//
// Complements the forced-win miner (jungle-puzzle-miner.ts): instead of lines that
// END the game (den entry / capture-all / stalemate), this mines positions where the
// solver forces a decisive MATERIAL gain with the game still going — "Black to move,
// win the lion". Uses the kernel material minimax (findJungleMaterialTactic): pure
// material with quiescence, so the win is exact + kernel-verifiable (no engine).
//
// Emits `winning-advantage` puzzles (line ends on the solver's move; `centipawns`
// records the guaranteed material gain). Every emit is re-validated.
//
// Run:
//   node_modules/.bin/tsx scripts/variant-lab/jungle-material-miner.ts --random-games 1500 --min-gain 40
//   node_modules/.bin/tsx scripts/variant-lab/jungle-material-miner.ts --random-games 3000 --limit 40 --emit-module > packages/game/src/puzzles-jungle-material.ts

import { parseArgs } from 'node:util';
import {
  applyJungleMove,
  createInitialJungleState,
  findJungleMaterialTactic,
  getJungleLegalMoves,
  JUNGLE_DENS,
  JUNGLE_SPEC_ID,
  type JungleColor,
  type JungleGameState,
  type JungleMove,
  type JunglePieceRole,
  type JunglePuzzle,
  type JunglePuzzleTheme,
  jungleCoordOf,
  junglePositionRepetitionKey,
  junglePuzzleMoveLabel,
  jungleTrapOwner,
  validateJunglePuzzle,
} from '../../packages/game/src/index.ts';

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    'random-games': { type: 'string', default: '1500' },
    'random-max-plies': { type: 'string', default: '140' },
    seed: { type: 'string', default: '20260705' },
    'max-solver-plies': { type: 'string', default: '2' },
    'min-gain': { type: 'string', default: '40' },
    'unique-margin': { type: 'string', default: '25' },
    'node-limit': { type: 'string', default: '150000' },
    limit: { type: 'string', default: '40' },
    'emit-module': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help) {
  console.log(`usage: node_modules/.bin/tsx scripts/variant-lab/jungle-material-miner.ts [options]

  --random-games N       Deterministic self-play games to scan. Default: 1500.
  --random-max-plies N   Max plies per game. Default: 140.
  --seed N               Self-play RNG seed. Default: 20260705.
  --max-solver-plies N   Material tactic depth in solver moves (1 or 2). Default: 2.
  --min-gain N           Minimum guaranteed material gain (value units). Default: 40.
  --unique-margin N      Best move must beat the 2nd best by this. Default: 25.
  --node-limit N         Search budget per position. Default: 150000.
  --limit N              Max tactics to emit. Default: 40.
  --emit-module          Print a ready-to-paste puzzles-jungle-material.ts module.
  --json                 Structured JSON instead of compact text.`);
  process.exit(0);
}

const randomGames = parseInt(values['random-games'] ?? '', 10) || 1500;
const randomMaxPlies = parseInt(values['random-max-plies'] ?? '', 10) || 140;
const seed = parseInt(values.seed ?? '', 10) || 20_260_705;
const maxSolverPlies = parseInt(values['max-solver-plies'] ?? '', 10) || 2;
const minGain = parseInt(values['min-gain'] ?? '', 10) || 40;
const uniqueMargin = parseInt(values['unique-margin'] ?? '', 10) || 25;
const nodeLimit = parseInt(values['node-limit'] ?? '', 10) || 150_000;
const limit = parseInt(values.limit ?? '', 10) || 40;
const emitModule = values['emit-module'] === true;
const asJson = values.json === true;

type MinedMaterial = {
  puzzle: JunglePuzzle;
  gain: number;
  solutionLabel: string;
};

const rng = createRng(seed);
const seenPositions = new Set<string>();
const seenSolutions = new Set<string>();
const emitted: MinedMaterial[] = [];
let scanned = 0;
const multiAnswer = 0;

outer: for (let game = 1; game <= randomGames; game += 1) {
  let state = createInitialJungleState(`material-${game}`);
  for (let ply = 0; ply <= randomMaxPlies; ply += 1) {
    if (state.status.type !== 'playing') break;
    scanPosition(state);
    if (emitted.length >= limit) break outer;
    const moves = getJungleLegalMoves(state);
    if (moves.length === 0) break;
    state = applyJungleMove(state, chooseRandomMove(state, moves, rng));
  }
}

function scanPosition(state: JungleGameState): void {
  scanned += 1;
  const key = junglePositionRepetitionKey(state);
  if (seenPositions.has(key)) return;
  seenPositions.add(key);

  const tactic = findJungleMaterialTactic(state, {
    maxSolverPlies,
    minGain,
    uniqueMargin,
    nodeLimit,
  });
  if (!tactic) return;
  const side = state.status.type === 'playing' ? state.status.turn : 'red';
  const solutionLabel = tactic.line.map((move) => junglePuzzleMoveLabel(move)).join(' ');
  const solutionKey = `${side}|${solutionLabel}`;
  if (seenSolutions.has(solutionKey)) return;

  const id = `jungle-material-${String(emitted.length + 1).padStart(3, '0')}`;
  const initial: JungleGameState = {
    ...state,
    id,
    lastMove: undefined,
    positionCounts: { [junglePositionRepetitionKey({ ...state, lastMove: undefined })]: 1 },
  };
  const puzzle: JunglePuzzle = {
    id,
    variant: JUNGLE_SPEC_ID,
    title: materialTitle(state, tactic.line, side, tactic.gain),
    initial,
    solution: tactic.line,
    goal: { type: 'winning-advantage', winner: side, centipawns: tactic.gain },
    themes: materialThemes(state, tactic.line),
  };
  if (!validateJunglePuzzle(puzzle).ok) return;
  seenSolutions.add(solutionKey);
  emitted.push({ puzzle, gain: tactic.gain, solutionLabel });
}

function materialTitle(
  state: JungleGameState,
  line: JungleMove[],
  side: JungleColor,
  gain: number,
): string {
  const role = state.board[line[0]!.from]?.role;
  const piece = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Piece';
  return `${side === 'red' ? 'Red' : 'Black'} ${piece} wins material (+${gain})`;
}

function materialThemes(state: JungleGameState, line: JungleMove[]): JunglePuzzleTheme[] {
  const themes = new Set<JunglePuzzleTheme>(['winning']);
  let cursor: JungleGameState = state;
  for (const move of line) {
    if (cursor.status.type !== 'playing') break;
    const piece = cursor.board[move.from];
    if (piece && cursor.status.turn === state.status.turn) {
      addRoleTheme(themes, piece.role);
      if ((piece.role === 'lion' || piece.role === 'tiger') && isRiverJump(move)) {
        themes.add('water-leap');
      }
      const target = cursor.board[move.to];
      if (target && jungleTrapOwner(move.to) === piece.color) themes.add('trap');
      else if (target) themes.add('rank-up');
    }
    cursor = applyJungleMove(cursor, move);
  }
  return [...themes];
}

function addRoleTheme(themes: Set<JunglePuzzleTheme>, role: JunglePieceRole | undefined): void {
  if (role === 'rat' || role === 'elephant' || role === 'lion' || role === 'tiger') {
    themes.add(role);
  }
}

function isRiverJump(move: JungleMove): boolean {
  const from = jungleCoordOf(move.from);
  const to = jungleCoordOf(move.to);
  return Math.abs(from.file - to.file) + Math.abs(from.rank - to.rank) > 1;
}

if (emitModule) {
  process.stdout.write(renderModule(emitted));
} else if (asJson) {
  console.log(
    JSON.stringify(
      {
        scanned,
        emitted: emitted.length,
        multiAnswer,
        tactics: emitted.map((m) => ({
          id: m.puzzle.id,
          side: m.puzzle.goal.winner,
          line: m.solutionLabel,
          gain: m.gain,
          themes: m.puzzle.themes,
        })),
      },
      null,
      2,
    ),
  );
} else {
  for (const m of emitted) {
    console.log(
      `${m.puzzle.id}  ${m.puzzle.goal.winner} to move  ${m.solutionLabel}  +${m.gain}  [${m.puzzle.themes.join(',')}]`,
    );
  }
  console.log(`\nscanned ${scanned} positions, emitted ${emitted.length} material tactics`);
}

function renderModule(mined: MinedMaterial[]): string {
  const puzzles = mined.map((m) => m.puzzle);
  const header = `// Generated by the Jungle material-tactic miner
// (scripts/variant-lab/jungle-material-miner.ts). Do not hand-edit; re-run the
// miner and paste its \`--emit-module\` output here.
//
// Material tactics: the solver forces a decisive material gain (a captured piece)
// with the game still in progress. Found by a pure-material minimax with
// quiescence, so the gain is exact; \`centipawns\` = the guaranteed value won.
//
// The local structural type mirrors \`JunglePuzzle\` in puzzles-jungle.ts so the
// array is assignable when spread there, while keeping this file free of a
// circular import.

import type { JUNGLE_SPEC_ID } from './game-specs.js';
import type { JungleColor, JungleGameState, JungleMove } from './variants-jungle.js';

type MaterialJunglePuzzleTheme =
  | 'trap'
  | 'water-leap'
  | 'rank-up'
  | 'rat'
  | 'elephant'
  | 'lion'
  | 'tiger'
  | 'winning';

type MaterialJunglePuzzle = {
  id: string;
  variant: typeof JUNGLE_SPEC_ID;
  title: string;
  initial: JungleGameState;
  solution: JungleMove[];
  goal: { type: 'winning-advantage'; winner?: JungleColor; centipawns?: number };
  themes: MaterialJunglePuzzleTheme[];
};

export const MATERIAL_JUNGLE_PUZZLES: readonly MaterialJunglePuzzle[] = `;
  return `${header}${JSON.stringify(puzzles, null, 2)};\n`;
}

function chooseRandomMove(
  state: JungleGameState,
  moves: JungleMove[],
  rng: () => number,
): JungleMove {
  const enemyDen =
    JUNGLE_DENS[state.status.type === 'playing' && state.status.turn === 'red' ? 'black' : 'red'];
  const captures = moves.filter((move) => state.board[move.to] !== undefined);
  const denApproaches = moves.filter((move) => near(move.to, enemyDen));
  const pool =
    captures.length > 0 && rng() < 0.5
      ? captures
      : denApproaches.length > 0 && rng() < 0.25
        ? denApproaches
        : moves;
  return pool[Math.floor(rng() * pool.length)]!;
}

function near(a: string, b: string): boolean {
  const from = jungleCoordOf(a as never);
  const to = jungleCoordOf(b as never);
  return Math.abs(from.file - to.file) + Math.abs(from.rank - to.rank) <= 2;
}

function createRng(seedValue: number): () => number {
  let s = seedValue >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 2 ** 32;
  };
}
