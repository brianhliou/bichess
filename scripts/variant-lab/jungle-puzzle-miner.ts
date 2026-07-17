// Jungle (Dou Shou Qi) forced-win puzzle miner.
//
// Jungle's "lichess puzzle gen": scan positions (deterministic random self-play,
// tenant event logs, or the existing curated corpus), run an exhaustive
// forced-WIN search over the Jungle kernel, and emit positions with a UNIQUE
// winning first move that forces a win (den entry / final capture / stalemate)
// in the requested number of solver plies. Jungle has no check/checkmate, so the
// terminal oracle is the kernel itself: a move wins when applyJungleMove finishes
// with the mover as winner. Every emitted candidate is re-validated with
// validateJunglePuzzle so the corpus is guaranteed sound.
//
// Run:
//   node_modules/.bin/tsx scripts/variant-lab/jungle-puzzle-miner.ts --random-games 400
//   node_modules/.bin/tsx scripts/variant-lab/jungle-puzzle-miner.ts --random-games 800 --solver-plies 2 --strict-replies
//   node_modules/.bin/tsx scripts/variant-lab/jungle-puzzle-miner.ts --random-games 400 --unique-solutions --limit 24 --emit-module > packages/game/src/puzzles-jungle-mined.ts

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  applyJungleMove,
  createInitialJungleState,
  findJungleWinInOneCandidates,
  getJungleLegalMoves,
  isJungleLegalMove,
  JUNGLE_DENS,
  JUNGLE_PUZZLES,
  JUNGLE_SPEC_ID,
  type JungleColor,
  type JungleGameState,
  type JungleMove,
  type JunglePieceRole,
  type JunglePuzzle,
  type JunglePuzzleTheme,
  type JungleSquare,
  jungleCoordOf,
  junglePositionRepetitionKey,
  junglePuzzleMoveLabel,
  jungleTrapOwner,
  validateJunglePuzzle,
} from '../../packages/game/src/index.ts';

type SolverPlyCount = 1 | 2 | 3;

type CliOptions = {
  allowMultiple: boolean;
  curated: boolean;
  emitModule: boolean;
  events: string[];
  json: boolean;
  limit: number;
  nodeLimit: number | null;
  randomGames: number;
  randomMaxPlies: number;
  randomSeed: number;
  solverPlies: SolverPlyCount;
  strictReplies: boolean;
  uniqueSolutions: boolean;
};

type SourcePosition = {
  source: string;
  ply: number;
  state: JungleGameState;
};

type MinedCandidate = {
  id: string;
  key: string;
  source: string;
  ply: number;
  sideToMove: JungleColor;
  solution: JungleMove[];
  solutionLabel: string;
  solverPlies: SolverPlyCount;
  alternatives: number;
  puzzle: JunglePuzzle;
};

type MinerStats = {
  candidatePositions: number;
  duplicatePositions: number;
  duplicateSolutions: number;
  emitted: number;
  invalidEventLogs: number;
  invalidMoves: number;
  invalidPuzzles: number;
  multiAnswerPositions: number;
  positions: number;
  searchCutoffs: number;
  skippedFinished: number;
};

const SQUARE_RE = /^[a-g][1-9]$/;
const DEFAULT_LIMIT = 60;
const DEFAULT_NODE_LIMIT = 120_000;
const DEFAULT_DEEP_NODE_LIMIT = 40_000;

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    'allow-multiple': { type: 'boolean', default: false },
    curated: { type: 'string', default: 'true' },
    'emit-module': { type: 'boolean', default: false },
    events: { type: 'string', multiple: true },
    help: { type: 'boolean', default: false, short: 'h' },
    json: { type: 'boolean', default: false },
    limit: { type: 'string', default: String(DEFAULT_LIMIT) },
    'node-limit': { type: 'string' },
    'random-games': { type: 'string', default: '0' },
    'random-max-plies': { type: 'string', default: '140' },
    seed: { type: 'string', default: '20260704' },
    'solver-plies': { type: 'string', default: '1' },
    'strict-replies': { type: 'boolean', default: false },
    'unique-solutions': { type: 'boolean', default: false },
  },
});

if (values.help) {
  printUsage();
  process.exit(0);
}

const solverPlies = parseSolverPlies(values['solver-plies']);
const options: CliOptions = {
  allowMultiple: values['allow-multiple'] === true,
  curated: parseBooleanString(values.curated, true),
  emitModule: values['emit-module'] === true,
  events: values.events ?? [],
  json: values.json === true,
  limit: parsePositiveInt(values.limit, DEFAULT_LIMIT),
  nodeLimit: parseOptionalPositiveInt(values['node-limit']),
  randomGames: parseNonNegativeInt(values['random-games'], 0),
  randomMaxPlies: parsePositiveInt(values['random-max-plies'], 140),
  randomSeed: parsePositiveInt(values.seed, 20_260_704),
  solverPlies,
  strictReplies: values['strict-replies'] === true,
  uniqueSolutions: values['unique-solutions'] === true,
};

const stats: MinerStats = {
  candidatePositions: 0,
  duplicatePositions: 0,
  duplicateSolutions: 0,
  emitted: 0,
  invalidEventLogs: 0,
  invalidMoves: 0,
  invalidPuzzles: 0,
  multiAnswerPositions: 0,
  positions: 0,
  searchCutoffs: 0,
  skippedFinished: 0,
};
const seenPositions = new Set<string>();
const seenSolutions = new Set<string>();
const emitted: MinedCandidate[] = [];

for (const position of await loadSourcePositions(options)) {
  scanPosition(position, options, stats, seenPositions, seenSolutions, emitted);
  if (emitted.length >= options.limit) break;
}

if (options.emitModule) {
  process.stdout.write(renderCorpusModule(emitted));
} else if (options.json) {
  console.log(
    JSON.stringify(
      { stats, candidates: emitted.map(({ puzzle, ...rest }) => ({ ...rest, puzzle })) },
      null,
      2,
    ),
  );
} else {
  for (const candidate of emitted) {
    console.log(
      [
        candidate.id,
        candidate.source,
        `ply=${candidate.ply}`,
        `${candidate.sideToMove} to move`,
        candidate.solutionLabel,
        candidate.solverPlies > 1 ? `win-in-${candidate.solverPlies}` : null,
        candidate.alternatives > 1 ? `alternatives=${candidate.alternatives}` : null,
      ]
        .filter(Boolean)
        .join('  '),
    );
  }
  console.log(
    [
      `scanned ${stats.positions} positions`,
      `emitted ${stats.emitted}`,
      `duplicates ${stats.duplicatePositions}`,
      `duplicate solutions ${stats.duplicateSolutions}`,
      `multi-answer ${stats.multiAnswerPositions}`,
      `search cutoffs ${stats.searchCutoffs}`,
      `invalid puzzles ${stats.invalidPuzzles}`,
      `invalid logs ${stats.invalidEventLogs}`,
      `invalid moves ${stats.invalidMoves}`,
    ].join('\n'),
  );
}

async function loadSourcePositions(options: CliOptions): Promise<SourcePosition[]> {
  const positions: SourcePosition[] = [];
  if (options.curated) {
    for (const puzzle of JUNGLE_PUZZLES) {
      positions.push({ source: `curated:${puzzle.id}`, ply: 0, state: puzzle.initial });
    }
  }
  for (const path of options.events) {
    // Push element-by-element: spreading a large array as call args blows the stack.
    for (const position of await loadEventPositions(path)) positions.push(position);
  }
  if (options.randomGames > 0) {
    for (const position of generateRandomPositions(options)) positions.push(position);
  }
  return positions;
}

function generateRandomPositions(options: CliOptions): SourcePosition[] {
  const positions: SourcePosition[] = [];
  const rng = createRng(options.randomSeed);
  for (let game = 1; game <= options.randomGames; game += 1) {
    let state = createInitialJungleState(`random-${game}`);
    for (let ply = 0; ply <= options.randomMaxPlies; ply += 1) {
      positions.push({ source: `random:game-${game}:ply-${ply}`, ply, state });
      if (state.status.type !== 'playing') break;
      const moves = getJungleLegalMoves(state);
      if (moves.length === 0) break;
      const move = chooseRandomMove(state, moves, rng);
      state = applyJungleMove(state, move);
    }
  }
  return positions;
}

async function loadEventPositions(path: string): Promise<SourcePosition[]> {
  const paths = await listInputFiles(resolve(path));
  const positions: SourcePosition[] = [];
  for (const fullPath of paths) {
    const records = await readRecords(fullPath);
    if (records.length === 0) continue;
    const first = readObject(records[0]);
    if (first?.type !== 'room-created') {
      stats.invalidEventLogs += 1;
      continue;
    }
    const variant = first.gameSpecId ?? first.variant;
    if (variant !== JUNGLE_SPEC_ID) {
      stats.invalidEventLogs += 1;
      continue;
    }
    const roomId = typeof first.roomId === 'string' ? first.roomId : fileRoomId(fullPath);
    let ply = 0;
    let state = createInitialJungleState(roomId);
    const sourceBase = relative(process.cwd(), fullPath);
    positions.push({ source: `${sourceBase}:start`, ply, state });
    for (const record of records.slice(1)) {
      const event = readObject(record);
      if (event?.type !== 'move-played') continue;
      const move = parseMove(event.move);
      if (!move || !isJungleLegalMove(state, move)) {
        stats.invalidMoves += 1;
        continue;
      }
      state = applyJungleMove(state, move);
      ply += 1;
      positions.push({ source: `${sourceBase}:ply-${ply}`, ply, state });
    }
  }
  return positions;
}

function scanPosition(
  position: SourcePosition,
  options: CliOptions,
  stats: MinerStats,
  seen: Set<string>,
  seenSolutions: Set<string>,
  emitted: MinedCandidate[],
): void {
  stats.positions += 1;
  if (position.state.status.type !== 'playing') {
    stats.skippedFinished += 1;
    return;
  }
  const key = positionKey(position.state);
  if (seen.has(key)) {
    stats.duplicatePositions += 1;
    return;
  }
  seen.add(key);

  const budget: SearchBudget = {
    cutOff: false,
    remaining: options.nodeLimit ?? defaultNodeLimit(options.solverPlies),
  };
  const lines = findWinLines(position.state, options.solverPlies, options.strictReplies, budget);
  if (budget.cutOff) {
    stats.searchCutoffs += 1;
    return;
  }
  if (lines.length === 0) return;
  stats.candidatePositions += 1;
  const firstMoveCount = new Set(lines.map((line) => moveKey(line[0]!))).size;
  if (firstMoveCount > 1 && !options.allowMultiple) {
    stats.multiAnswerPositions += 1;
    return;
  }

  const outputLines = options.allowMultiple ? lines : [lines[0]!];
  const sideToMove = position.state.status.turn;
  for (const solution of outputLines) {
    const solutionLabel = solution.map((move) => junglePuzzleMoveLabel(move)).join(' ');
    const solutionKey = `${sideToMove}|${solutionLabel}`;
    if (options.uniqueSolutions && seenSolutions.has(solutionKey)) {
      stats.duplicateSolutions += 1;
      continue;
    }
    const id = `jungle-mined-${String(emitted.length + 1).padStart(3, '0')}`;
    const puzzle = buildPuzzle(id, position.state, solution, sideToMove);
    const validation = validateJunglePuzzle(puzzle);
    if (!validation.ok) {
      stats.invalidPuzzles += 1;
      continue;
    }
    seenSolutions.add(solutionKey);
    emitted.push({
      id,
      key,
      source: position.source,
      ply: position.ply,
      sideToMove,
      solution,
      solutionLabel,
      solverPlies: options.solverPlies,
      alternatives: firstMoveCount,
      puzzle,
    });
    stats.emitted += 1;
    if (emitted.length >= options.limit) return;
  }
}

function buildPuzzle(
  id: string,
  state: JungleGameState,
  solution: JungleMove[],
  sideToMove: JungleColor,
): JunglePuzzle {
  const initial: JungleGameState = {
    ...state,
    id,
    lastMove: undefined,
    positionCounts: {
      [junglePositionRepetitionKey({ ...state, lastMove: undefined })]: 1,
    },
  };
  return {
    id,
    variant: JUNGLE_SPEC_ID,
    title: puzzleTitle(state, solution, sideToMove),
    initial,
    solution,
    goal: { type: 'win', winner: sideToMove },
    themes: puzzleThemes(state, solution),
  };
}

function puzzleTitle(
  state: JungleGameState,
  solution: JungleMove[],
  sideToMove: JungleColor,
): string {
  const first = solution[0]!;
  const side = sideToMove === 'red' ? 'Red' : 'Black';
  const winIn = Math.ceil(solution.length / 2);
  const role = state.board[first.from]?.role;
  const piece = role ? roleName(role) : 'Piece';
  return `${side} ${piece} win in ${winIn}`;
}

function puzzleThemes(state: JungleGameState, solution: JungleMove[]): JunglePuzzleTheme[] {
  const themes = new Set<JunglePuzzleTheme>();
  // Classify by the terminal reason of the solved line.
  const terminal = replayLine(state, solution);
  if (terminal?.status.type === 'finished') {
    if (terminal.status.reason === 'den-entered') themes.add('den-race');
    else if (terminal.status.reason === 'pieces-captured') themes.add('capture-all');
    else if (terminal.status.reason === 'stalemate') themes.add('stalemate');
  }
  let cursor: JungleGameState | null = state;
  for (const move of solution) {
    if (cursor?.status.type !== 'playing') break;
    const piece = cursor.board[move.from];
    if (piece && cursor.status.turn === state.status.turn) {
      addRoleTheme(themes, piece.role);
      if ((piece.role === 'lion' || piece.role === 'tiger') && isRiverJump(move)) {
        themes.add('water-leap');
      }
      const target = cursor.board[move.to];
      if (target && jungleTrapOwner(move.to) === piece.color) themes.add('trap');
      if (target && !themes.has('trap')) themes.add('rank-up');
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

function replayLine(state: JungleGameState, solution: JungleMove[]): JungleGameState | null {
  let cursor: JungleGameState = state;
  for (const move of solution) {
    if (cursor.status.type !== 'playing' || !isJungleLegalMove(cursor, move)) return null;
    cursor = applyJungleMove(cursor, move);
  }
  return cursor;
}

function roleName(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

type SearchBudget = {
  cutOff: boolean;
  remaining: number;
};

function findWinLines(
  state: JungleGameState,
  solverPlies: SolverPlyCount,
  strictReplies: boolean,
  budget: SearchBudget,
): JungleMove[][] {
  if (solverPlies === 1) {
    return findJungleWinInOneCandidates(state).map((candidate) => [candidate.move]);
  }
  if (state.status.type !== 'playing') return [];
  if (solverPlies === 3) {
    // Require the win to be EXACTLY win-in-3: reject if a win-in-2 already exists.
    const shorter = findExactWinLines(state, state.status.turn, 2, strictReplies, budget);
    if (budget.cutOff || shorter.length > 0) return [];
  }
  return findExactWinLines(state, state.status.turn, solverPlies, strictReplies, budget);
}

function findExactWinLines(
  state: JungleGameState,
  attacker: JungleColor,
  solverPlies: SolverPlyCount,
  strictReplies: boolean,
  budget: SearchBudget,
): JungleMove[][] {
  budget.remaining -= 1;
  if (budget.remaining < 0) {
    budget.cutOff = true;
    return [];
  }
  if (state.status.type !== 'playing' || state.status.turn !== attacker) return [];

  const immediateWins = findWinInOneMoves(state, attacker, budget);
  if (budget.cutOff) return [];
  if (solverPlies === 1) return immediateWins.map((move) => [move]);
  if (immediateWins.length > 0) return [];

  const lines: JungleMove[][] = [];
  for (const firstMove of getJungleLegalMoves(state)) {
    const afterFirst = applyJungleMove(state, firstMove);
    if (afterFirst.status.type !== 'playing') continue;

    const defenderReplies = getJungleLegalMoves(afterFirst);
    if (defenderReplies.length === 0) continue;

    const replyLines: JungleMove[][] = [];
    let refuted = false;
    for (const reply of defenderReplies) {
      const afterReply = applyJungleMove(afterFirst, reply);
      if (afterReply.status.type !== 'playing' || afterReply.status.turn !== attacker) {
        // The defender's reply ended the game (or handed the turn away) without
        // an attacker win → this first move does not force the win.
        refuted = true;
        break;
      }
      const continuations = findExactWinLines(
        afterReply,
        attacker,
        decrementSolverPlies(solverPlies),
        strictReplies,
        budget,
      );
      if (budget.cutOff) return [];
      if (continuations.length === 0) {
        if (strictReplies) {
          refuted = true;
          break;
        }
        continue;
      }
      replyLines.push([firstMove, reply, ...continuations[0]!]);
    }
    if (
      !refuted &&
      replyLines.length > 0 &&
      (!strictReplies || replyLines.length === defenderReplies.length)
    ) {
      lines.push(...replyLines);
    }
  }
  return lines;
}

function findWinInOneMoves(
  state: JungleGameState,
  attacker: JungleColor,
  budget: SearchBudget,
): JungleMove[] {
  if (state.status.type !== 'playing' || state.status.turn !== attacker) return [];
  const moves: JungleMove[] = [];
  for (const move of getJungleLegalMoves(state)) {
    budget.remaining -= 1;
    if (budget.remaining < 0) {
      budget.cutOff = true;
      return [];
    }
    const next = applyJungleMove(state, move);
    if (next.status.type === 'finished' && next.status.winner === attacker) {
      moves.push(move);
    }
  }
  return moves;
}

function decrementSolverPlies(solverPlies: SolverPlyCount): SolverPlyCount {
  return solverPlies === 3 ? 2 : 1;
}

function chooseRandomMove(
  state: JungleGameState,
  moves: JungleMove[],
  rng: () => number,
): JungleMove {
  const enemyDen =
    JUNGLE_DENS[oppositeColor(state.status.type === 'playing' ? state.status.turn : 'red')];
  const denApproaches = moves.filter((move) => isNearSquare(move.to, enemyDen));
  const captures = moves.filter((move) => state.board[move.to] !== undefined);
  const pool =
    denApproaches.length > 0 && rng() < 0.25
      ? denApproaches
      : captures.length > 0 && rng() < 0.55
        ? captures
        : moves;
  return pool[Math.floor(rng() * pool.length)]!;
}

function oppositeColor(color: JungleColor): JungleColor {
  return color === 'red' ? 'black' : 'red';
}

function isNearSquare(a: JungleSquare, b: JungleSquare): boolean {
  const from = jungleCoordOf(a);
  const to = jungleCoordOf(b);
  return Math.abs(from.file - to.file) + Math.abs(from.rank - to.rank) <= 2;
}

function moveKey(move: JungleMove): string {
  return `${move.from}-${move.to}`;
}

function parseMove(value: unknown): JungleMove | null {
  const move = readObject(value);
  if (!move) return null;
  if (typeof move.to !== 'string' || !isJungleSquare(move.to)) return null;
  if (typeof move.from === 'string' && isJungleSquare(move.from)) {
    return { from: move.from, to: move.to };
  }
  return null;
}

function positionKey(state: JungleGameState): string {
  return junglePositionRepetitionKey(state);
}

function renderCorpusModule(candidates: MinedCandidate[]): string {
  const header = `// Generated by the Jungle forced-win puzzle miner
// (scripts/variant-lab/jungle-puzzle-miner.ts). Do not hand-edit; re-run the
// miner and paste its \`--emit-module\` output here.
//
// The local structural type mirrors \`JunglePuzzle\` in puzzles-jungle.ts so the
// array is assignable when spread there, while keeping this file free of a
// circular import.

import { JUNGLE_SPEC_ID } from './game-specs.js';
import type { JungleColor, JungleGameState, JungleMove } from './variants-jungle.js';

type MinedJunglePuzzleTheme =
  | 'den-race'
  | 'capture-all'
  | 'stalemate'
  | 'trap'
  | 'water-leap'
  | 'rank-up'
  | 'rat'
  | 'elephant'
  | 'lion'
  | 'tiger';

type MinedJunglePuzzle = {
  id: string;
  variant: typeof JUNGLE_SPEC_ID;
  title: string;
  initial: JungleGameState;
  solution: JungleMove[];
  goal: { type: 'win'; winner?: JungleColor };
  themes: MinedJunglePuzzleTheme[];
};

export const MINED_JUNGLE_PUZZLES: readonly MinedJunglePuzzle[] = `;
  const body = JSON.stringify(
    candidates.map((c) => c.puzzle),
    null,
    2,
  );
  return `${header}${body};\n`;
}

async function listInputFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) return [path];
  if (!info.isDirectory()) return [];
  const names = await readdir(path);
  return names
    .filter((name) => ['.json', '.jsonl'].includes(extname(name)))
    .sort()
    .map((name) => join(path, name));
}

async function readRecords(path: string): Promise<unknown[]> {
  const raw = await readFile(path, 'utf8');
  if (extname(path) === '.jsonl') {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  }
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) return parsed;
  const records = readRecordField(parsed, 'records') ?? readRecordField(parsed, 'events');
  if (Array.isArray(records)) return records;
  return [parsed];
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readRecordField(value: unknown, key: string): unknown {
  return readObject(value)?.[key];
}

function isJungleSquare(value: string): value is JungleSquare {
  return SQUARE_RE.test(value);
}

function fileRoomId(path: string): string {
  return path
    .split(/[\\/]/)
    .at(-1)!
    .replace(/\.(jsonl|json)$/i, '');
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseOptionalPositiveInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseSolverPlies(value: string | undefined): SolverPlyCount {
  if (value === '3') return 3;
  return value === '2' ? 2 : 1;
}

function defaultNodeLimit(solverPlies: SolverPlyCount): number {
  return solverPlies < 3 ? DEFAULT_NODE_LIMIT : DEFAULT_DEEP_NODE_LIMIT;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function parseBooleanString(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'false' || value === '0' || value === 'no') return false;
  if (value === 'true' || value === '1' || value === 'yes') return true;
  return fallback;
}

function printUsage(): void {
  console.log(`usage: node_modules/.bin/tsx scripts/variant-lab/jungle-puzzle-miner.ts [options]

Options:
  --curated=false         Do not scan the built-in Jungle puzzle corpus as seed positions.
  --events PATH           Scan a Jungle tenant event log file, or a directory of logs.
  --random-games N        Generate deterministic random self-play games to mine.
  --random-max-plies N    Maximum random plies per generated game. Default: 140.
  --seed N                Random self-play seed. Default: 20260704.
  --solver-plies N        Solver moves to search: 1, 2, or 3. Default: 1.
  --strict-replies        Require every legal defender reply to allow continuation (true forced win).
  --allow-multiple        Emit positions with more than one solution first-move.
  --unique-solutions      Suppress later candidates with the same side/solution line.
  --node-limit N          Max recursive search nodes per position. Default: ${DEFAULT_NODE_LIMIT} (depth 3: ${DEFAULT_DEEP_NODE_LIMIT}).
  --limit N               Maximum emitted candidates. Default: ${DEFAULT_LIMIT}.
  --emit-module           Print a ready-to-paste puzzles-jungle-mined.ts module.
  --json                  Print structured JSON instead of compact text.`);
}
