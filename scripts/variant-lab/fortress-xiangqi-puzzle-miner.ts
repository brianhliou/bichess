// Fortress Xiangqi forced-mate puzzle miner.
//
// Fortress's "lichess puzzle gen": scan positions (random FSF-style self-play,
// tenant event logs, or the existing curated corpus), run an exhaustive
// forced-mate search over the Fortress kernel, and emit positions with a UNIQUE
// winning first move that forces mate in the requested number of solver plies.
// Every emitted candidate is re-validated with validateFortressXiangqiPuzzle so
// the corpus is guaranteed sound.
//
// Run:
//   node_modules/.bin/tsx scripts/variant-lab/fortress-xiangqi-puzzle-miner.ts --random-games 400
//   node_modules/.bin/tsx scripts/variant-lab/fortress-xiangqi-puzzle-miner.ts --events tmp/games --solver-plies 1
//   node_modules/.bin/tsx scripts/variant-lab/fortress-xiangqi-puzzle-miner.ts --random-games 800 --solver-plies 2 --strict-replies
//   node_modules/.bin/tsx scripts/variant-lab/fortress-xiangqi-puzzle-miner.ts --random-games 400 --emit-seed > mined.json
//
// Storage (#183): puzzle content lives in the committed seed asset
// (packages/game/seed/puzzles/fortress-xiangqi.json) + the server's `puzzles`
// table, not TS modules. --emit-seed prints this run's puzzles as seed-format
// entries (one per line); merge them into the seed's mined section (keep the
// tactic entries), then update the pins in
// packages/game/src/puzzles-seed.test.ts and re-run test:puzzles:corpus.
// NOTE (#180): Fortress must switch OFF self-play sourcing before it re-mines
// for the discoverable pool.

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  FORTRESS_XIANGQI_PUZZLES,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiColor,
  type FortressXiangqiDropRole,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiPuzzle,
  type FortressXiangqiPuzzleTheme,
  type FortressXiangqiSquare,
  findFortressXiangqiMateInOneCandidates,
  fortressXiangqiPositionRepetitionKey,
  fortressXiangqiPuzzleMoveLabel,
  getFortressXiangqiLegalMoves,
  isFortressXiangqiDropMove,
  isFortressXiangqiGeneralInCheckOnBoard,
  isFortressXiangqiLegalMove,
  oppositeFortressXiangqiColor,
  validateFortressXiangqiPuzzle,
} from '../../packages/game/src/index.ts';

type SolverPlyCount = 1 | 2 | 3;

type CliOptions = {
  allowMultiple: boolean;
  checkingFirstMoves: boolean;
  curated: boolean;
  emitSeed: boolean;
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
  state: FortressXiangqiGameState;
};

type MinedCandidate = {
  id: string;
  key: string;
  source: string;
  ply: number;
  sideToMove: FortressXiangqiColor;
  solution: FortressXiangqiMove[];
  solutionLabel: string;
  solverPlies: SolverPlyCount;
  alternatives: number;
  puzzle: FortressXiangqiPuzzle;
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

const SQUARE_RE = /^[a-g][1-8]$/;
const DEFAULT_LIMIT = 60;
const DEFAULT_NODE_LIMIT = 60_000;
const DEFAULT_DEEP_NODE_LIMIT = 400;

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    'allow-multiple': { type: 'boolean', default: false },
    'checking-first-moves': { type: 'boolean', default: false },
    curated: { type: 'string', default: 'true' },
    'emit-seed': { type: 'boolean', default: false },
    events: { type: 'string', multiple: true },
    help: { type: 'boolean', default: false, short: 'h' },
    json: { type: 'boolean', default: false },
    limit: { type: 'string', default: String(DEFAULT_LIMIT) },
    'node-limit': { type: 'string' },
    'random-games': { type: 'string', default: '0' },
    'random-max-plies': { type: 'string', default: '120' },
    seed: { type: 'string', default: '20260703' },
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
  checkingFirstMoves: values['checking-first-moves'] === true,
  curated: parseBooleanString(values.curated, true),
  emitSeed: values['emit-seed'] === true,
  events: values.events ?? [],
  json: values.json === true,
  limit: parsePositiveInt(values.limit, DEFAULT_LIMIT),
  nodeLimit: parseOptionalPositiveInt(values['node-limit']),
  randomGames: parseNonNegativeInt(values['random-games'], 0),
  randomMaxPlies: parsePositiveInt(values['random-max-plies'], 120),
  randomSeed: parsePositiveInt(values.seed, 20_260_703),
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

if (options.emitSeed) {
  process.stdout.write(renderSeedEntries(emitted));
  console.error(
    'merge these entries into packages/game/seed/puzzles/fortress-xiangqi.json (mined section), then update puzzles-seed.test.ts pins',
  );
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
        candidate.solverPlies > 1 ? `mate-in-${candidate.solverPlies}` : null,
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
    positions.push(
      ...FORTRESS_XIANGQI_PUZZLES.map((puzzle) => ({
        source: `curated:${puzzle.id}`,
        ply: 0,
        state: puzzle.initial,
      })),
    );
  }
  for (const path of options.events) {
    positions.push(...(await loadEventPositions(path)));
  }
  if (options.randomGames > 0) {
    positions.push(...generateRandomPositions(options));
  }
  return positions;
}

function generateRandomPositions(options: CliOptions): SourcePosition[] {
  const positions: SourcePosition[] = [];
  const rng = createRng(options.randomSeed);
  for (let game = 1; game <= options.randomGames; game += 1) {
    let state = createInitialFortressXiangqiState(`random-${game}`);
    for (let ply = 0; ply <= options.randomMaxPlies; ply += 1) {
      positions.push({ source: `random:game-${game}:ply-${ply}`, ply, state });
      if (state.status.type !== 'playing') break;
      const moves = getFortressXiangqiLegalMoves(state);
      if (moves.length === 0) break;
      const move = chooseRandomMove(state, moves, rng);
      state = applyFortressXiangqiMove(state, move);
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
    if (variant !== FORTRESS_XIANGQI_SPEC_ID) {
      stats.invalidEventLogs += 1;
      continue;
    }
    const roomId = typeof first.roomId === 'string' ? first.roomId : fileRoomId(fullPath);
    let ply = 0;
    let state = createInitialFortressXiangqiState(roomId);
    const sourceBase = relative(process.cwd(), fullPath);
    positions.push({ source: `${sourceBase}:start`, ply, state });
    for (const record of records.slice(1)) {
      const event = readObject(record);
      if (event?.type !== 'move-played') continue;
      const move = parseMove(event.move);
      if (!move || !isFortressXiangqiLegalMove(state, move)) {
        stats.invalidMoves += 1;
        continue;
      }
      state = applyFortressXiangqiMove(state, move);
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
  const lines = findMateLines(
    position.state,
    options.solverPlies,
    options.strictReplies,
    options.checkingFirstMoves,
    budget,
  );
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
    const solutionLabel = solution.map((move) => fortressXiangqiPuzzleMoveLabel(move)).join(' ');
    const solutionKey = `${sideToMove}|${solutionLabel}`;
    if (options.uniqueSolutions && seenSolutions.has(solutionKey)) {
      stats.duplicateSolutions += 1;
      continue;
    }
    const id = `fortress-xiangqi-mined-${String(emitted.length + 1).padStart(3, '0')}`;
    const puzzle = buildPuzzle(id, position.state, solution, sideToMove);
    const validation = validateFortressXiangqiPuzzle(puzzle);
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
  state: FortressXiangqiGameState,
  solution: FortressXiangqiMove[],
  sideToMove: FortressXiangqiColor,
): FortressXiangqiPuzzle {
  const initial: FortressXiangqiGameState = {
    ...state,
    id,
    lastMove: undefined,
    moveLog: [],
    positionCounts: {
      [fortressXiangqiPositionRepetitionKey({ ...state, lastMove: undefined })]: 1,
    },
  };
  return {
    id,
    variant: FORTRESS_XIANGQI_SPEC_ID,
    title: puzzleTitle(state, solution, sideToMove),
    initial,
    solution,
    goal: { type: 'checkmate', winner: sideToMove },
    themes: puzzleThemes(state, solution),
  };
}

function puzzleTitle(
  state: FortressXiangqiGameState,
  solution: FortressXiangqiMove[],
  sideToMove: FortressXiangqiColor,
): string {
  const first = solution[0]!;
  const side = sideToMove === 'red' ? 'Red' : 'Black';
  const mateIn = Math.ceil(solution.length / 2);
  const piece = isFortressXiangqiDropMove(first)
    ? `${roleName(first.drop)} drop`
    : roleName(state.board[first.from]?.role ?? 'chariot');
  return `${side} ${piece} mate in ${mateIn}`;
}

function puzzleThemes(
  state: FortressXiangqiGameState,
  solution: FortressXiangqiMove[],
): FortressXiangqiPuzzleTheme[] {
  const themes = new Set<FortressXiangqiPuzzleTheme>(['checkmate', 'palace-net']);
  for (const move of solution) {
    if (isFortressXiangqiDropMove(move)) {
      themes.add('drop');
      addRoleTheme(themes, move.drop);
    } else {
      addRoleTheme(themes, state.board[move.from]?.role);
    }
  }
  return [...themes];
}

function addRoleTheme(themes: Set<FortressXiangqiPuzzleTheme>, role: string | undefined): void {
  if (role === 'chariot' || role === 'cannon' || role === 'horse' || role === 'treasure') {
    themes.add(role);
  }
}

function roleName(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

type SearchBudget = {
  cutOff: boolean;
  remaining: number;
};

function findMateLines(
  state: FortressXiangqiGameState,
  solverPlies: SolverPlyCount,
  strictReplies: boolean,
  checkingFirstMoves: boolean,
  budget: SearchBudget,
): FortressXiangqiMove[][] {
  if (solverPlies === 1) {
    return findFortressXiangqiMateInOneCandidates(state).map((candidate) => [candidate.move]);
  }
  if (state.status.type !== 'playing') return [];
  if (isDefenderAlreadyInCheck(state, state.status.turn)) return [];
  if (solverPlies === 3) {
    const shorter = findExactMateLines(
      state,
      state.status.turn,
      2,
      strictReplies,
      checkingFirstMoves,
      budget,
    );
    if (budget.cutOff || shorter.length > 0) return [];
  }
  return findExactMateLines(
    state,
    state.status.turn,
    solverPlies,
    strictReplies,
    checkingFirstMoves,
    budget,
  );
}

function findExactMateLines(
  state: FortressXiangqiGameState,
  attacker: FortressXiangqiColor,
  solverPlies: SolverPlyCount,
  strictReplies: boolean,
  checkingFirstMoves: boolean,
  budget: SearchBudget,
): FortressXiangqiMove[][] {
  budget.remaining -= 1;
  if (budget.remaining < 0) {
    budget.cutOff = true;
    return [];
  }
  if (state.status.type !== 'playing' || state.status.turn !== attacker) return [];

  const immediateMates = findMateInOneMoves(state, attacker, budget);
  if (budget.cutOff) return [];
  if (solverPlies === 1) return immediateMates.map((move) => [move]);
  if (immediateMates.length > 0) return [];

  const lines: FortressXiangqiMove[][] = [];
  for (const firstMove of getFortressXiangqiLegalMoves(state)) {
    const afterFirst = applyFortressXiangqiMove(state, firstMove);
    if (afterFirst.status.type !== 'playing') continue;
    if (checkingFirstMoves && !isDefenderAlreadyInCheck(afterFirst, attacker)) continue;

    const defenderReplies = getFortressXiangqiLegalMoves(afterFirst);
    if (defenderReplies.length === 0) continue;

    const replyLines: FortressXiangqiMove[][] = [];
    let refuted = false;
    for (const reply of defenderReplies) {
      const afterReply = applyFortressXiangqiMove(afterFirst, reply);
      if (afterReply.status.type !== 'playing' || afterReply.status.turn !== attacker) {
        refuted = true;
        break;
      }
      const continuations = findExactMateLines(
        afterReply,
        attacker,
        decrementSolverPlies(solverPlies),
        strictReplies,
        checkingFirstMoves,
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

function findMateInOneMoves(
  state: FortressXiangqiGameState,
  attacker: FortressXiangqiColor,
  budget: SearchBudget,
): FortressXiangqiMove[] {
  if (state.status.type !== 'playing' || state.status.turn !== attacker) return [];
  if (isDefenderAlreadyInCheck(state, attacker)) return [];
  const moves: FortressXiangqiMove[] = [];
  for (const move of getFortressXiangqiLegalMoves(state)) {
    budget.remaining -= 1;
    if (budget.remaining < 0) {
      budget.cutOff = true;
      return [];
    }
    const next = applyFortressXiangqiMove(state, move);
    if (
      next.status.type === 'finished' &&
      next.status.reason === 'checkmate' &&
      next.status.winner === attacker
    ) {
      moves.push(move);
    }
  }
  return moves;
}

function decrementSolverPlies(solverPlies: SolverPlyCount): SolverPlyCount {
  return solverPlies === 3 ? 2 : 1;
}

function isDefenderAlreadyInCheck(
  state: FortressXiangqiGameState,
  attacker: FortressXiangqiColor,
): boolean {
  return isFortressXiangqiGeneralInCheckOnBoard(
    state.board,
    oppositeFortressXiangqiColor(attacker),
  );
}

function chooseRandomMove(
  state: FortressXiangqiGameState,
  moves: FortressXiangqiMove[],
  rng: () => number,
): FortressXiangqiMove {
  const drops = moves.filter(isFortressXiangqiDropMove);
  const captures = moves.filter(
    (move) => !isFortressXiangqiDropMove(move) && state.board[move.to] !== undefined,
  );
  const pool =
    drops.length > 0 && rng() < 0.2 ? drops : captures.length > 0 && rng() < 0.6 ? captures : moves;
  return pool[Math.floor(rng() * pool.length)]!;
}

function moveKey(move: FortressXiangqiMove): string {
  return isFortressXiangqiDropMove(move) ? `${move.drop}@${move.to}` : `${move.from}-${move.to}`;
}

function parseMove(value: unknown): FortressXiangqiMove | null {
  const move = readObject(value);
  if (!move) return null;
  if (typeof move.to !== 'string' || !isFortressSquare(move.to)) return null;
  if (typeof move.from === 'string' && isFortressSquare(move.from)) {
    return { from: move.from, to: move.to };
  }
  if (typeof move.drop === 'string' && isDropRole(move.drop)) {
    return { drop: move.drop, to: move.to };
  }
  return null;
}

function positionKey(state: FortressXiangqiGameState): string {
  return fortressXiangqiPositionRepetitionKey(state);
}

// Seed-format entries (#183): one puzzle per line, the same shape
// packages/game/seed/puzzles/fortress-xiangqi.json carries. Printed as a JSON
// array to merge into the seed's `puzzles` list (this miner owns the mined
// mate section; tactic entries come from the tactics ingest).
function renderSeedEntries(candidates: MinedCandidate[]): string {
  const lines = candidates.map((c) => `    ${JSON.stringify(c.puzzle)}`);
  return `[\n${lines.join(',\n')}\n]\n`;
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

function isFortressSquare(value: string): value is FortressXiangqiSquare {
  return SQUARE_RE.test(value);
}

function isDropRole(value: string): value is FortressXiangqiDropRole {
  return (
    value === 'chariot' ||
    value === 'horse' ||
    value === 'cannon' ||
    value === 'soldier' ||
    value === 'treasure' ||
    value === 'advisor' ||
    value === 'elephant'
  );
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
  console.log(`usage: node_modules/.bin/tsx scripts/variant-lab/fortress-xiangqi-puzzle-miner.ts [options]

Options:
  --curated=false         Do not scan the built-in Fortress puzzle corpus as seed positions.
  --events PATH           Scan a Fortress tenant event log file, or a directory of logs.
  --random-games N        Generate deterministic random self-play games to mine.
  --random-max-plies N    Maximum random plies per generated game. Default: 120.
  --seed N                Random self-play seed. Default: 20260703.
  --solver-plies N        Solver moves to search: 1, 2, or 3. Default: 1.
  --strict-replies        Require every legal defender reply to allow continuation (true mate).
  --checking-first-moves  For depth > 1, only search first moves that give check.
  --allow-multiple        Emit positions with more than one solution first-move.
  --unique-solutions      Suppress later candidates with the same side/solution line.
  --node-limit N          Max recursive search nodes per position. Default: ${DEFAULT_NODE_LIMIT} (depth 3: ${DEFAULT_DEEP_NODE_LIMIT}).
  --limit N               Maximum emitted candidates. Default: ${DEFAULT_LIMIT}.
  --emit-seed             Print seed-format entries (one JSON puzzle per line) to merge into
                          packages/game/seed/puzzles/fortress-xiangqi.json (#183).
  --json                  Print structured JSON instead of compact text.`);
}
