// Mini / Drop Mini Xiangqi mate puzzle miner.
//
// Run:
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --events tmp/games
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --states tmp/states.json --json
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --solver-plies 2 --variant drop-mini-xiangqi
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --solver-plies 2 --strict-replies
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --solver-plies 2 --strict-replies --checking-first-moves
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --solver-plies 3 --strict-replies
//   node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts --curated=false --random-games 200 --variant mini-xiangqi --json

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  applyDropMiniXiangqiMove,
  applyMiniXiangqiOpenMove,
  createInitialDropMiniXiangqiState,
  createInitialMiniXiangqiState,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  dropMiniXiangqiPositionRepetitionKey,
  findMiniXiangqiMateInOneCandidates,
  getLegalDropMiniXiangqiMoves,
  getMiniXiangqiOpenLegalMoves,
  isDropMiniXiangqiDropMove,
  isDropMiniXiangqiGeneralInCheck,
  isLegalDropMiniXiangqiMove,
  isMiniXiangqiGeneralInCheckOnBoard,
  isMiniXiangqiOpenLegalMove,
  MINI_XIANGQI_PUZZLES,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPuzzleMove,
  type MiniXiangqiPuzzleState,
  type MiniXiangqiPuzzleVariant,
  type MiniXiangqiSquare,
  miniXiangqiPositionRepetitionKey,
  miniXiangqiPuzzleMoveLabel,
  oppositeMiniXiangqiColor,
} from '../../packages/game/src/index.ts';

type SolverPlyCount = 1 | 2 | 3;

type CliOptions = {
  allowMultiple: boolean;
  checkingFirstMoves: boolean;
  curated: boolean;
  events: string[];
  json: boolean;
  limit: number;
  nodeLimit: number | null;
  randomGames: number;
  randomMaxPlies: number;
  randomSeed: number;
  solverPlies: SolverPlyCount;
  states: string[];
  strictReplies: boolean;
  uniqueSolutions: boolean;
  variant: MiniXiangqiPuzzleVariant | null;
};

type SourcePosition = {
  source: string;
  variant: MiniXiangqiPuzzleVariant;
  ply: number;
  state: MiniXiangqiPuzzleState;
};

type MinedCandidate = {
  key: string;
  source: string;
  variant: MiniXiangqiPuzzleVariant;
  ply: number;
  sideToMove: MiniXiangqiColor;
  move: MiniXiangqiPuzzleMove;
  moveLabel: string;
  initial: MiniXiangqiPuzzleState;
  solution: MiniXiangqiPuzzleMove[];
  solutionLabel: string;
  solverPlies: SolverPlyCount;
  alternatives: number;
};

type MinerStats = {
  candidatePositions: number;
  duplicatePositions: number;
  duplicateSolutions: number;
  emitted: number;
  invalidEventLogs: number;
  invalidMoves: number;
  multiAnswerPositions: number;
  positions: number;
  searchCutoffs: number;
  skippedFinished: number;
};

const SQUARE_RE = /^[a-g][1-7]$/;
const DEFAULT_LIMIT = 100;
const DEFAULT_NODE_LIMIT = 25_000;
const DEFAULT_DEEP_NODE_LIMIT = 100;

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    'allow-multiple': { type: 'boolean', default: false },
    'checking-first-moves': { type: 'boolean', default: false },
    curated: { type: 'string', default: 'true' },
    events: { type: 'string', multiple: true },
    help: { type: 'boolean', default: false, short: 'h' },
    json: { type: 'boolean', default: false },
    limit: { type: 'string', default: String(DEFAULT_LIMIT) },
    'node-limit': { type: 'string' },
    'random-games': { type: 'string', default: '0' },
    'random-max-plies': { type: 'string', default: '80' },
    seed: { type: 'string', default: '20260622' },
    'solver-plies': { type: 'string', default: '1' },
    states: { type: 'string', multiple: true },
    'strict-replies': { type: 'boolean', default: false },
    'unique-solutions': { type: 'boolean', default: false },
    variant: { type: 'string' },
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
  events: values.events ?? [],
  json: values.json === true,
  limit: parsePositiveInt(values.limit, DEFAULT_LIMIT),
  nodeLimit: parseOptionalPositiveInt(values['node-limit']),
  randomGames: parseNonNegativeInt(values['random-games'], 0),
  randomMaxPlies: parsePositiveInt(values['random-max-plies'], 80),
  randomSeed: parsePositiveInt(values.seed, 20_260_622),
  solverPlies,
  states: values.states ?? [],
  strictReplies: values['strict-replies'] === true,
  uniqueSolutions: values['unique-solutions'] === true,
  variant: parseVariant(values.variant),
};

const stats: MinerStats = {
  candidatePositions: 0,
  duplicatePositions: 0,
  duplicateSolutions: 0,
  emitted: 0,
  invalidEventLogs: 0,
  invalidMoves: 0,
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

if (options.json) {
  console.log(
    JSON.stringify(
      {
        stats,
        candidates: emitted,
      },
      null,
      2,
    ),
  );
} else {
  for (const candidate of emitted) {
    console.log(
      [
        candidate.variant,
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
      `invalid logs ${stats.invalidEventLogs}`,
      `invalid moves ${stats.invalidMoves}`,
    ].join('\n'),
  );
}

async function loadSourcePositions(options: CliOptions): Promise<SourcePosition[]> {
  const positions: SourcePosition[] = [];
  if (options.curated) {
    positions.push(
      ...MINI_XIANGQI_PUZZLES.map((puzzle) => ({
        source: `curated:${puzzle.id}`,
        variant: puzzle.variant,
        ply: 0,
        state: puzzle.initial,
      })),
    );
  }
  for (const path of options.states) {
    positions.push(...(await loadStatePositions(path)));
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
  const variants = options.variant
    ? [options.variant]
    : ([MINI_XIANGQI_SPEC_ID, DROP_MINI_XIANGQI_SPEC_ID] as const);
  const rng = createRng(options.randomSeed);
  for (let game = 1; game <= options.randomGames; game += 1) {
    for (const variant of variants) {
      let state: MiniXiangqiPuzzleState =
        variant === MINI_XIANGQI_SPEC_ID
          ? createInitialMiniXiangqiState(`random-${variant}-${game}`)
          : createInitialDropMiniXiangqiState(`random-${variant}-${game}`);
      for (let ply = 0; ply <= options.randomMaxPlies; ply += 1) {
        positions.push({
          source: `random:${variant}:game-${game}:ply-${ply}`,
          variant,
          ply,
          state,
        });
        if (state.status.type !== 'playing') break;
        const moves = legalMoves(variant, state);
        if (moves.length === 0) break;
        const move = chooseRandomMove(variant, state, moves, rng);
        const next = applyMove(variant, state, move);
        if (!next) break;
        state = next;
      }
    }
  }
  return positions;
}

async function loadStatePositions(path: string): Promise<SourcePosition[]> {
  const fullPath = resolve(path);
  const records = await readRecords(fullPath);
  const positions: SourcePosition[] = [];
  let index = 0;
  for (const record of records) {
    index += 1;
    const variant = parseVariant(readRecordField(record, 'variant'));
    const state = readRecordField(record, 'state');
    if (!variant || !state || typeof state !== 'object') continue;
    positions.push({
      source: String(
        readRecordField(record, 'source') ?? `${relative(process.cwd(), fullPath)}#${index}`,
      ),
      variant,
      ply: Number(readRecordField(record, 'ply') ?? 0),
      state: state as MiniXiangqiPuzzleState,
    });
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
    const variant = parseVariant(first.gameSpecId ?? first.variant);
    const roomId = typeof first.roomId === 'string' ? first.roomId : fileRoomId(fullPath);
    if (!variant) {
      stats.invalidEventLogs += 1;
      continue;
    }

    let ply = 0;
    let state: MiniXiangqiPuzzleState =
      variant === MINI_XIANGQI_SPEC_ID
        ? createInitialMiniXiangqiState(roomId)
        : createInitialDropMiniXiangqiState(roomId);
    const sourceBase = relative(process.cwd(), fullPath);
    positions.push({ source: `${sourceBase}:start`, variant, ply, state });

    for (const record of records.slice(1)) {
      const event = readObject(record);
      if (event?.type !== 'move-played') continue;
      const move = parseMove(event.move);
      if (!move) {
        stats.invalidMoves += 1;
        continue;
      }
      const next = applyMove(variant, state, move);
      if (!next) {
        stats.invalidMoves += 1;
        continue;
      }
      state = next;
      ply += 1;
      positions.push({ source: `${sourceBase}:ply-${ply}`, variant, ply, state });
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
  if (options.variant && position.variant !== options.variant) return;
  if (position.state.status.type !== 'playing') {
    stats.skippedFinished += 1;
    return;
  }
  const key = `${position.variant}|${positionKey(position.variant, position.state)}`;
  if (seen.has(key)) {
    stats.duplicatePositions += 1;
    return;
  }
  seen.add(key);

  const budget: SearchBudget = {
    cutOff: false,
    remaining: options.nodeLimit ?? defaultNodeLimit(options.solverPlies, position.variant),
  };
  const lines = findMiniXiangqiMateLines(
    position.variant,
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
  for (const solution of outputLines) {
    const firstMove = solution[0]!;
    const solutionLabel = solution.map((move) => miniXiangqiPuzzleMoveLabel(move)).join(' ');
    const solutionKey = `${position.variant}|${position.state.status.turn}|${solutionLabel}`;
    if (options.uniqueSolutions && seenSolutions.has(solutionKey)) {
      stats.duplicateSolutions += 1;
      continue;
    }
    seenSolutions.add(solutionKey);
    emitted.push({
      key,
      source: position.source,
      variant: position.variant,
      ply: position.ply,
      sideToMove: position.state.status.turn,
      move: firstMove,
      moveLabel: miniXiangqiPuzzleMoveLabel(firstMove),
      initial: position.state,
      solution,
      solutionLabel,
      solverPlies: options.solverPlies,
      alternatives: firstMoveCount,
    });
    stats.emitted += 1;
    if (emitted.length >= options.limit) return;
  }
}

function findMiniXiangqiMateLines(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  solverPlies: SolverPlyCount,
  strictReplies: boolean,
  checkingFirstMoves: boolean,
  budget: SearchBudget,
): MiniXiangqiPuzzleMove[][] {
  if (solverPlies === 1) {
    return findMiniXiangqiMateInOneCandidates(variant, state).map((candidate) => [candidate.move]);
  }
  if (state.status.type !== 'playing') return [];
  if (isDefenderAlreadyInCheck(variant, state, state.status.turn)) return [];
  if (solverPlies === 3) {
    const shorterLines = findExactMateLines(
      variant,
      state,
      state.status.turn,
      2,
      strictReplies,
      checkingFirstMoves,
      budget,
    );
    if (budget.cutOff || shorterLines.length > 0) return [];
  }
  return findExactMateLines(
    variant,
    state,
    state.status.turn,
    solverPlies,
    strictReplies,
    checkingFirstMoves,
    budget,
  );
}

type SearchBudget = {
  cutOff: boolean;
  remaining: number;
};

function findExactMateLines(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  attacker: MiniXiangqiColor,
  solverPlies: SolverPlyCount,
  strictReplies: boolean,
  checkingFirstMoves: boolean,
  budget: SearchBudget,
): MiniXiangqiPuzzleMove[][] {
  budget.remaining -= 1;
  if (budget.remaining < 0) {
    budget.cutOff = true;
    return [];
  }
  if (state.status.type !== 'playing') return [];
  if (state.status.turn !== attacker) return [];

  const immediateMates = findMateInOneMoves(variant, state, attacker, budget);
  if (budget.cutOff) return [];
  if (solverPlies === 1) {
    return immediateMates.map((move) => [move]);
  }
  if (immediateMates.length > 0) return [];

  const lines: MiniXiangqiPuzzleMove[][] = [];
  for (const firstMove of legalMoves(variant, state)) {
    const afterFirst = applyMove(variant, state, firstMove);
    if (afterFirst?.status.type !== 'playing') continue;
    if (checkingFirstMoves && !isDefenderAlreadyInCheck(variant, afterFirst, attacker)) {
      continue;
    }

    const defenderReplies = legalMoves(variant, afterFirst);
    if (defenderReplies.length === 0) continue;

    const replyLines: MiniXiangqiPuzzleMove[][] = [];
    for (const reply of defenderReplies) {
      const afterReply = applyMove(variant, afterFirst, reply);
      if (afterReply?.status.type !== 'playing' || afterReply.status.turn !== attacker) {
        replyLines.length = 0;
        break;
      }
      const continuations = findExactMateLines(
        variant,
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
          replyLines.length = 0;
          break;
        }
        continue;
      }
      replyLines.push([firstMove, reply, ...continuations[0]!]);
    }
    if (replyLines.length > 0 && (!strictReplies || replyLines.length === defenderReplies.length)) {
      lines.push(...replyLines);
    }
  }
  return lines;
}

function findMateInOneMoves(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  attacker: MiniXiangqiColor,
  budget: SearchBudget,
): MiniXiangqiPuzzleMove[] {
  if (state.status.type !== 'playing' || state.status.turn !== attacker) return [];
  if (isDefenderAlreadyInCheck(variant, state, attacker)) return [];
  const moves: MiniXiangqiPuzzleMove[] = [];
  for (const move of legalMoves(variant, state)) {
    budget.remaining -= 1;
    if (budget.remaining < 0) {
      budget.cutOff = true;
      return [];
    }
    const next = applyMove(variant, state, move);
    if (
      next?.status.type === 'finished' &&
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
  const records = readRecordField(parsed, 'records') ?? readRecordField(parsed, 'states');
  if (Array.isArray(records)) return records;
  return [parsed];
}

function applyMove(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  move: MiniXiangqiPuzzleMove,
): MiniXiangqiPuzzleState | null {
  if (variant === MINI_XIANGQI_SPEC_ID) {
    if (
      isDropMiniXiangqiDropMove(move) ||
      !isMiniXiangqiOpenLegalMove(state as MiniXiangqiGameState, move)
    ) {
      return null;
    }
    return applyMiniXiangqiOpenMove(state as MiniXiangqiGameState, move);
  }
  if (!isLegalDropMiniXiangqiMove(state as DropMiniXiangqiGameState, move)) return null;
  return applyDropMiniXiangqiMove(state as DropMiniXiangqiGameState, move);
}

function legalMoves(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
): MiniXiangqiPuzzleMove[] {
  if (variant === MINI_XIANGQI_SPEC_ID) {
    return getMiniXiangqiOpenLegalMoves(state as MiniXiangqiGameState);
  }
  return getLegalDropMiniXiangqiMoves(state as DropMiniXiangqiGameState);
}

function chooseRandomMove(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  moves: MiniXiangqiPuzzleMove[],
  rng: () => number,
): MiniXiangqiPuzzleMove {
  const drops =
    variant === DROP_MINI_XIANGQI_SPEC_ID ? moves.filter(isDropMiniXiangqiDropMove) : [];
  const captures = moves.filter(
    (move) => !isDropMiniXiangqiDropMove(move) && state.board[move.to] !== undefined,
  );
  const pool =
    drops.length > 0 && rng() < 0.25
      ? drops
      : captures.length > 0 && rng() < 0.6
        ? captures
        : moves;
  return pool[Math.floor(rng() * pool.length)]!;
}

function moveKey(move: MiniXiangqiPuzzleMove): string {
  return isDropMiniXiangqiDropMove(move) ? `${move.drop}@${move.to}` : `${move.from}-${move.to}`;
}

function isDefenderAlreadyInCheck(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  attacker: MiniXiangqiColor,
): boolean {
  const defender = oppositeMiniXiangqiColor(attacker);
  if (variant === MINI_XIANGQI_SPEC_ID) {
    return isMiniXiangqiGeneralInCheckOnBoard((state as MiniXiangqiGameState).board, defender);
  }
  return isDropMiniXiangqiGeneralInCheck(state as DropMiniXiangqiGameState, defender);
}

function parseMove(value: unknown): MiniXiangqiPuzzleMove | null {
  const move = readObject(value);
  if (!move) return null;
  if (
    typeof move.from === 'string' &&
    isMiniXiangqiSquare(move.from) &&
    typeof move.to === 'string' &&
    isMiniXiangqiSquare(move.to)
  ) {
    return { from: move.from, to: move.to } as MiniXiangqiMove;
  }
  if (
    typeof move.drop === 'string' &&
    isDropRole(move.drop) &&
    typeof move.to === 'string' &&
    isMiniXiangqiSquare(move.to)
  ) {
    return { drop: move.drop, to: move.to } as DropMiniXiangqiMove;
  }
  return null;
}

function positionKey(variant: MiniXiangqiPuzzleVariant, state: MiniXiangqiPuzzleState): string {
  return variant === MINI_XIANGQI_SPEC_ID
    ? miniXiangqiPositionRepetitionKey(state as MiniXiangqiGameState)
    : dropMiniXiangqiPositionRepetitionKey(state as DropMiniXiangqiGameState);
}

function parseVariant(value: unknown): MiniXiangqiPuzzleVariant | null {
  return value === MINI_XIANGQI_SPEC_ID || value === DROP_MINI_XIANGQI_SPEC_ID ? value : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readRecordField(value: unknown, key: string): unknown {
  return readObject(value)?.[key];
}

function isMiniXiangqiSquare(value: string): value is MiniXiangqiSquare {
  return SQUARE_RE.test(value);
}

function isDropRole(value: string): value is Exclude<DropMiniXiangqiMove, MiniXiangqiMove>['drop'] {
  return value === 'chariot' || value === 'horse' || value === 'cannon' || value === 'soldier';
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

function defaultNodeLimit(solverPlies: SolverPlyCount, variant: MiniXiangqiPuzzleVariant): number {
  if (solverPlies < 3) return DEFAULT_NODE_LIMIT;
  return variant === DROP_MINI_XIANGQI_SPEC_ID ? DEFAULT_DEEP_NODE_LIMIT : DEFAULT_NODE_LIMIT;
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
  console.log(`usage: node_modules/.bin/tsx scripts/variant-lab/mini-xiangqi-puzzle-miner.ts [options]

Options:
  --curated=false         Do not scan built-in curated puzzle seeds.
  --events PATH           Scan a JSON/JSONL tenant event log file, or a directory of logs.
  --states PATH           Scan JSON/JSONL records shaped like { variant, state, ply?, source? }.
  --allow-multiple        Emit positions with more than one solution line.
  --node-limit N          Maximum recursive search nodes per position. Default: ${DEFAULT_NODE_LIMIT}; Drop Mini depth 3 defaults to ${DEFAULT_DEEP_NODE_LIMIT}.
  --random-games N        Generate deterministic random self-play games per selected variant.
  --random-max-plies N    Maximum random plies per generated game. Default: 80.
  --seed N                Random self-play seed. Default: 20260622.
  --solver-plies N        Solver moves to search: 1, 2, or 3. Default: 1.
  --strict-replies        Require every legal defender reply to allow continuation.
  --checking-first-moves  For depth > 1, only search first moves that immediately give check.
  --unique-solutions      Suppress later candidates with the same variant/side/solution line.
  --variant ID            Restrict to mini-xiangqi or drop-mini-xiangqi.
  --limit N               Maximum emitted candidates. Default: ${DEFAULT_LIMIT}.
  --json                  Print structured JSON instead of compact text.`);
}
