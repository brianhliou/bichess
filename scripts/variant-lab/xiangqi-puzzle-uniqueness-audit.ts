// Per-ply uniqueness audit for the live standard-xiangqi puzzle corpus.
//
// Independent re-verification of the gated miner (#180): for each solver ply it
// re-searches the position with Pikafish MultiPV 2 at a depth floor and reports
// whether the shipped move is the engine's best AND uniquely best by the SAME
// winning-floor gate the miner uses (isXiangqiSolverMoveUnique — shared, so this
// is apples-to-apples, not a second, drifting definition). It does not mutate
// the corpus. NOTE: this tool loads each position via `position fen` (history-
// free), while the miner searches via `position startpos moves` (full game
// history); at near-equal plies those evals can differ, so an aligned position
// path is the remaining half of the cross-check (#185).
//
// Scores are read from the side-to-move (solver) POV, so a positive gap means
// the shipped move beats the runner-up. Mate scores map to a large synthetic cp.
// A depth floor (not just a node cap) is used because too-low search mis-orders
// best vs second and makes the gap lie.
//
// Run (needs the local Pikafish binary + NNUE net; auto-resolved via
// xiangqi-pikafish-engine.ts, or set MISTBOARD_PIKAFISH_XIANGQI_PATH/_NET):
//   node_modules/.bin/tsx scripts/variant-lab/xiangqi-puzzle-uniqueness-audit.ts \
//     --depth 22 --out scripts/variant-lab/out/xiangqi-uniqueness-audit.jsonl
//   # quick smoke on a handful first:
//   node_modules/.bin/tsx scripts/variant-lab/xiangqi-puzzle-uniqueness-audit.ts --limit 3 --depth 16

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  pikafishXiangqiNetPath,
  pikafishXiangqiPath,
} from '../../apps/server/src/xiangqi-pikafish-engine.ts';
import {
  applyStandardXiangqiMove,
  isXiangqiSolverMoveUnique,
  pikafishUciToXiangqiSquares,
  standardXiangqiEngineFen,
  XIANGQI_PUZZLES,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPuzzle,
  type XiangqiVerifyLine,
  xiangqiWinRate,
} from '../../packages/game/src/index.ts';

type CliOptions = {
  depth: number;
  nodes: number | null;
  winHi: number;
  winLo: number;
  materialGapCp: number;
  limit: number;
  ids: Set<string> | null;
  out: string | null;
};

function parseOptions(): CliOptions {
  const { values } = parseArgs({
    options: {
      depth: { type: 'string', default: '22' },
      nodes: { type: 'string' },
      // Same winning-floor gate the miner uses (isXiangqiSolverMoveUnique), so
      // this audit is an apples-to-apples re-verification of the mined corpus.
      'win-hi': { type: 'string', default: '0.80' },
      'win-lo': { type: 'string', default: '0.60' },
      'material-gap-cp': { type: 'string', default: '250' },
      limit: { type: 'string', default: '0' },
      ids: { type: 'string' },
      out: { type: 'string' },
    },
  });
  return {
    depth: parsePositiveInt(values.depth, 22),
    nodes: values.nodes ? parsePositiveInt(values.nodes, 0) || null : null,
    winHi: Number.parseFloat(values['win-hi'] ?? '0.80'),
    winLo: Number.parseFloat(values['win-lo'] ?? '0.60'),
    materialGapCp: parsePositiveInt(values['material-gap-cp'], 250),
    limit: parsePositiveInt(values.limit, 0),
    ids: values.ids
      ? new Set(
          values.ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : null,
    out: values.out ?? null,
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// A mate is treated as a decisive cp so gap math and win% stay monotone. Closer
// mates score higher, so the runner-up (slower mate / non-mate) trails.
const MATE_CP = 30_000;
function scoreToCp(kind: 'cp' | 'mate', raw: number): number {
  if (kind === 'cp') return raw;
  return raw >= 0 ? MATE_CP - raw : -MATE_CP - raw;
}

type ScoredLine = { rank: number; cp: number; mate: number | null; moveUci: string };

const ANALYZE_TIMEOUT_MS = 240_000;
const MULTIPV_RE = /\bmultipv (\d+)\b/;
const SCORE_RE = /\bscore (cp|mate) (-?\d+)\b/;
const PV_RE = /\bpv (\S+)/;

class PikafishEngine {
  #proc: ChildProcessWithoutNullStreams;
  #buf = '';
  #waiter: {
    pred: (line: string) => boolean;
    resolve: (lines: string[]) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    lines: string[];
  } | null = null;
  #multipv = 1;
  net: string;

  constructor(binary: string, net: string) {
    this.#proc = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.#proc.stdout.setEncoding('utf8');
    this.#proc.stdout.on('data', (chunk: string) => this.#onData(chunk));
    this.net = net;
  }

  #onData(chunk: string): void {
    this.#buf += chunk;
    let nl = this.#buf.indexOf('\n');
    while (nl >= 0) {
      const line = this.#buf.slice(0, nl).trim();
      this.#buf = this.#buf.slice(nl + 1);
      const w = this.#waiter;
      if (w) {
        w.lines.push(line);
        if (w.pred(line)) {
          clearTimeout(w.timer);
          this.#waiter = null;
          w.resolve(w.lines);
        }
      }
      nl = this.#buf.indexOf('\n');
    }
  }

  #request(cmds: string[], pred: (line: string) => boolean): Promise<string[]> {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.#waiter = null;
        rej(new Error(`pikafish request timed out: ${cmds[cmds.length - 1]}`));
      }, ANALYZE_TIMEOUT_MS);
      timer.unref();
      this.#waiter = { pred, resolve: res, reject: rej, timer, lines: [] };
      for (const cmd of cmds) this.#proc.stdin.write(`${cmd}\n`);
    });
  }

  async init(): Promise<void> {
    await this.#request(['uci'], (l) => l === 'uciok');
    await this.#request([`setoption name EvalFile value ${this.net}`, 'isready'], (l) =>
      l.startsWith('readyok'),
    );
  }

  async newGame(): Promise<void> {
    await this.#request(['ucinewgame', 'isready'], (l) => l.startsWith('readyok'));
  }

  // Analyze a raw FEN (puzzles start mid-game, so `position fen` is the natural
  // entry — no game-length move list to replay). `go depth` is the primary knob;
  // an optional node cap bounds pathological positions.
  async analyzeFen(
    fen: string,
    depth: number,
    nodes: number | null,
    multipv: number,
  ): Promise<ScoredLine[]> {
    const cmds: string[] = [];
    if (multipv !== this.#multipv) {
      cmds.push(`setoption name MultiPV value ${multipv}`);
      this.#multipv = multipv;
    }
    const go = nodes ? `go depth ${depth} nodes ${nodes}` : `go depth ${depth}`;
    cmds.push(`position fen ${fen}`, go);
    const lines = await this.#request(cmds, (l) => l.startsWith('bestmove'));
    return parseScoredLines(lines);
  }

  quit(): void {
    if (this.#waiter) {
      clearTimeout(this.#waiter.timer);
      this.#waiter = null;
    }
    this.#proc.stdin.write('quit\n');
    this.#proc.stdin.end();
  }
}

// Keep only the last `info` line per multipv rank (the deepest completed one).
function parseScoredLines(lines: string[]): ScoredLine[] {
  const byRank = new Map<number, ScoredLine>();
  for (const line of lines) {
    if (!line.startsWith('info ')) continue;
    const score = SCORE_RE.exec(line);
    const pv = PV_RE.exec(line);
    if (!score || !pv) continue;
    const rank = Number(MULTIPV_RE.exec(line)?.[1] ?? '1');
    const kind = score[1] as 'cp' | 'mate';
    const raw = Number(score[2]);
    byRank.set(rank, {
      rank,
      cp: scoreToCp(kind, raw),
      mate: kind === 'mate' ? raw : null,
      moveUci: pv[1] as string,
    });
  }
  return [...byRank.values()].sort((a, b) => a.rank - b.rank);
}

type SolverPlyReport = {
  solutionPly: number;
  shippedMove: string;
  engineBestMove: string;
  matchesShipped: boolean;
  bestCp: number;
  secondCp: number | null;
  bestMate: number | null;
  secondMate: number | null;
  gapCp: number | null;
  gapWinrate: number | null;
  unique: boolean;
};

function toVerifyLine(line: ScoredLine | null | undefined): XiangqiVerifyLine | undefined {
  return line ? { scoreCp: line.cp, mate: line.mate } : undefined;
}

type PuzzleReport = {
  id: string;
  goal: string;
  solverPlies: number;
  plies: SolverPlyReport[];
  allMatch: boolean;
  firstNonUniquePly: number | null; // solution index of the first non-unique solver ply
  verdict: 'clean' | 'non-unique-followups' | 'engine-disagrees';
};

function moveLabel(move: XiangqiMove): string {
  return `${move.from}-${move.to}`;
}

async function auditPuzzle(
  engine: PikafishEngine,
  puzzle: XiangqiPuzzle,
  opts: CliOptions,
): Promise<PuzzleReport> {
  const plies: SolverPlyReport[] = [];
  let state: XiangqiGameState = puzzle.initial;
  await engine.newGame();
  for (let ply = 0; ply < puzzle.solution.length; ply += 1) {
    const move = puzzle.solution[ply] as XiangqiMove;
    if (ply % 2 === 0 && state.status.type === 'playing') {
      const fen = standardXiangqiEngineFen(state);
      const lines = await engine.analyzeFen(fen, opts.depth, opts.nodes, 2);
      const best = lines[0];
      const second = lines[1] ?? null;
      const engineBest = best ? pikafishUciToXiangqiSquares(best.moveUci) : null;
      const engineBestMove = engineBest
        ? `${engineBest.from}-${engineBest.to}`
        : (best?.moveUci ?? '?');
      const matchesShipped = engineBest?.from === move.from && engineBest?.to === move.to;
      const bestCp = best?.cp ?? 0;
      const secondCp = second?.cp ?? null;
      const gapCp = secondCp === null ? null : bestCp - secondCp;
      const gapWinrate =
        secondCp === null ? null : xiangqiWinRate(bestCp) - xiangqiWinRate(secondCp);
      plies.push({
        solutionPly: ply,
        shippedMove: moveLabel(move),
        engineBestMove,
        matchesShipped,
        bestCp,
        secondCp,
        bestMate: best?.mate ?? null,
        secondMate: second?.mate ?? null,
        gapCp,
        gapWinrate,
        unique: isXiangqiSolverMoveUnique(toVerifyLine(best), toVerifyLine(second), {
          winHi: opts.winHi,
          winLo: opts.winLo,
          materialGapCp: opts.materialGapCp,
        }),
      });
    }
    if (state.status.type !== 'playing') break;
    state = applyStandardXiangqiMove(state, move);
  }

  const allMatch = plies.every((p) => p.matchesShipped);
  const firstBad = plies.find((p) => !p.matchesShipped || !p.unique) ?? null;
  const verdict: PuzzleReport['verdict'] = !allMatch
    ? 'engine-disagrees'
    : plies.every((p) => p.unique)
      ? 'clean'
      : 'non-unique-followups';
  return {
    id: puzzle.id,
    goal: puzzle.goal.type,
    solverPlies: plies.length,
    plies,
    allMatch,
    firstNonUniquePly: firstBad ? firstBad.solutionPly : null,
    verdict,
  };
}

async function main(): Promise<void> {
  const opts = parseOptions();
  const bin = pikafishXiangqiPath();
  const net = pikafishXiangqiNetPath(bin);
  const engine = new PikafishEngine(bin, net);
  await engine.init();

  let corpus: readonly XiangqiPuzzle[] = XIANGQI_PUZZLES;
  if (opts.ids) corpus = corpus.filter((p) => opts.ids?.has(p.id));
  if (opts.limit > 0) corpus = corpus.slice(0, opts.limit);

  const reports: PuzzleReport[] = [];
  const summary = { clean: 0, nonUnique: 0, engineDisagrees: 0, singleMove: 0, multiMove: 0 };
  for (let i = 0; i < corpus.length; i += 1) {
    const puzzle = corpus[i] as XiangqiPuzzle;
    const report = await auditPuzzle(engine, puzzle, opts);
    reports.push(report);
    if (report.solverPlies <= 1) summary.singleMove += 1;
    else summary.multiMove += 1;
    if (report.verdict === 'clean') summary.clean += 1;
    else if (report.verdict === 'non-unique-followups') summary.nonUnique += 1;
    else summary.engineDisagrees += 1;
    process.stderr.write(
      `[${i + 1}/${corpus.length}] ${report.id} ${report.goal} plies=${report.solverPlies} ` +
        `${report.verdict}${report.firstNonUniquePly !== null ? ` @ply ${report.firstNonUniquePly}` : ''}\n`,
    );
  }

  engine.quit();

  if (opts.out) {
    const outPath = resolve(opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${reports.map((r) => JSON.stringify(r)).join('\n')}\n`);
    process.stderr.write(`\nwrote ${reports.length} reports to ${outPath}\n`);
  }

  process.stdout.write(
    `\n=== audit summary (depth=${opts.depth} win-hi=${opts.winHi} win-lo=${opts.winLo} material-gap-cp=${opts.materialGapCp}) ===\n` +
      `puzzles:            ${reports.length}\n` +
      `  single solver move: ${summary.singleMove}\n` +
      `  multi solver move:  ${summary.multiMove}\n` +
      `clean:              ${summary.clean}\n` +
      `non-unique followup:${summary.nonUnique}\n` +
      `engine-disagrees:   ${summary.engineDisagrees}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
