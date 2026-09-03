// Fortress Xiangqi soldier-rule A/B study.
//
// Compares BASE (shipped, river-gated soldier: forward-only on own half, +sideways
// after the river) against VET ("veteran" soldier: forward+sideways always, no
// promotion) by running Fairy-Stockfish self-play under identical settings, only
// the .ini differs. Measures sharpness/stability, balance, comeback rate, and
// whether soldiers actually become defenders.
//
// Pure FSF: legal moves + terminal detection via `go perft 1`, per-ply eval via
// `go nodes K`. A tiny variant-agnostic board replayer derives the soldier/
// material features from the move list (no game kernel needed, so BASE and VET
// run the exact same code path).
//
// Usage:
//   npx tsx scripts/variant-lab/fortress-soldier-study.ts \
//     [--games N] [--nodes K] [--open P] [--workers W] [--cap C] \
//     [--open-eval-max CP] [--conditions base,vet] [--seed S] [--out DIR]
// FSF binary: $MISTBOARD_FSF_PATH or ~/projects/tools/fairy-stockfish/src/stockfish.

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

type Color = 'red' | 'black';
type Role =
  | 'general'
  | 'chariot'
  | 'cannon'
  | 'horse'
  | 'advisor'
  | 'elephant'
  | 'treasure'
  | 'soldier';

const LETTER_TO_ROLE: Record<string, Role> = {
  k: 'general',
  r: 'chariot',
  c: 'cannon',
  n: 'horse',
  a: 'advisor',
  e: 'elephant',
  q: 'treasure',
  p: 'soldier',
};
const FILE_CHARS = 'abcdefg';
const START_FEN = 'rnceakq/pp1p1pp/7/7/7/7/PP1P1PP/QKAECNR';
const RIVER_RED_MAX_RANK = 4; // red owns ranks 1-4, black 5-8

const CONDITIONS = {
  // NOTE (updated 2026-09-03): the veteran ship was REVERTED, so
  // apps/server/src/fortress-xiangqi.ini is the river-gated soldier again and
  // `base` now equals `river`, not `vet`. Use `base` vs `vet` for a real A/B.
  // The five-arm study that drove the revert is in the 2026-09-02 section of
  // docs-private/drop-game-lab/DESIGN-SPEC.md.
  base: {
    ini: resolve(REPO, 'apps', 'server', 'src', 'fortress-xiangqi.ini'),
    variant: 'fortressxiangqi',
  },
  river: {
    ini: resolve(REPO, 'scripts', 'variant-lab', 'fortress-xiangqi-river.ini'),
    variant: 'fortressxiangqiriver',
  },
  vet: {
    ini: resolve(REPO, 'scripts', 'variant-lab', 'fortress-xiangqi-vet.ini'),
    variant: 'fortressxiangqivet',
  },
  // 2026-09-02 treasure arm: the Treasure confined to its own half like the
  // elephant, so it can neither move nor be dropped past the river. `base` is
  // the shipped rule, so `base,treasure` is the A/B.
  treasure: {
    ini: resolve(REPO, 'scripts', 'variant-lab', 'fortress-xiangqi-treasure-home.ini'),
    variant: 'fortressxiangqitreasurehome',
  },
} as const;
type ConditionName = keyof typeof CONDITIONS;

// ── Board replayer (variant-agnostic bookkeeping) ───────────────────────────

type Piece = { color: Color; role: Role };

class Board {
  squares = new Map<string, Piece>();
  pockets: Record<Color, Partial<Record<Role, number>>> = { red: {}, black: {} };
  turn: Color = 'red';

  constructor() {
    const rows = START_FEN.split('/');
    for (let ri = 0; ri < rows.length; ri += 1) {
      const rank = 8 - ri;
      let file = 0;
      for (const ch of rows[ri]!) {
        if (/[0-9]/.test(ch)) {
          file += Number(ch);
          continue;
        }
        const color: Color = ch === ch.toUpperCase() ? 'red' : 'black';
        this.squares.set(`${FILE_CHARS[file]}${rank}`, {
          color,
          role: LETTER_TO_ROLE[ch.toLowerCase()]!,
        });
        file += 1;
      }
    }
  }

  static ownHalf(color: Color, rank: number): boolean {
    return color === 'red' ? rank <= RIVER_RED_MAX_RANK : rank > RIVER_RED_MAX_RANK;
  }

  // Apply an FSF UCI token; return a small classification of what happened.
  apply(uci: string): {
    mover: Color;
    isDrop: boolean;
    role: Role;
    captureRole: Role | null;
    fromRank?: number;
    toRank: number;
    sideways: boolean; // board move that kept rank and changed file
    forward: boolean;
    ownHalfBefore: boolean; // mover-relative, at the from/drop square
  } {
    const mover = this.turn;
    const drop = /^([RNCPQAE])@([a-g][1-8])$/.exec(uci);
    if (drop) {
      const role = LETTER_TO_ROLE[drop[1]!.toLowerCase()]!;
      const to = drop[2]!;
      const toRank = Number(to[1]);
      this.pockets[mover][role] = (this.pockets[mover][role] ?? 0) - 1;
      this.squares.set(to, { color: mover, role });
      this.turn = mover === 'red' ? 'black' : 'red';
      return {
        mover,
        isDrop: true,
        role,
        captureRole: null,
        toRank,
        sideways: false,
        forward: false,
        ownHalfBefore: Board.ownHalf(mover, toRank),
      };
    }
    const board = /^([a-g][1-8])([a-g][1-8])$/.exec(uci);
    if (!board) throw new Error(`unparseable uci: ${uci}`);
    const from = board[1]!;
    const to = board[2]!;
    const piece = this.squares.get(from);
    if (!piece) throw new Error(`no piece on ${from} for ${uci}`);
    const captured = this.squares.get(to) ?? null;
    if (captured) {
      // capturesToHand: opponent piece enters the mover's pocket.
      this.pockets[mover][captured.role] = (this.pockets[mover][captured.role] ?? 0) + 1;
    }
    this.squares.delete(from);
    this.squares.set(to, piece);
    this.turn = mover === 'red' ? 'black' : 'red';
    const fromRank = Number(from[1]);
    const toRank = Number(to[1]);
    return {
      mover,
      isDrop: false,
      role: piece.role,
      captureRole: captured?.role ?? null,
      fromRank,
      toRank,
      sideways: fromRank === toRank && from[0] !== to[0],
      forward: from[0] === to[0] && fromRank !== toRank,
      ownHalfBefore: Board.ownHalf(mover, fromRank),
    };
  }

  positionKey(): string {
    const placement = [...this.squares.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sq, p]) => `${sq}${p.color[0]}${p.role[0]}`)
      .join(',');
    const pk = (c: Color): string =>
      Object.entries(this.pockets[c])
        .filter(([, n]) => (n ?? 0) > 0)
        .sort()
        .map(([r, n]) => `${r[0]}${n}`)
        .join('');
    return `${this.turn}|${placement}|r:${pk('red')}|b:${pk('black')}`;
  }

  count(pred: (p: Piece) => boolean): number {
    let n = 0;
    for (const p of this.squares.values()) if (pred(p)) n += 1;
    return n;
  }
}

// ── FSF session ─────────────────────────────────────────────────────────────

function fsfBinaryPath(): string {
  const explicit = process.env.MISTBOARD_FSF_PATH;
  if (explicit) return resolve(explicit);
  const dev = resolve(process.env.HOME ?? '', 'projects/tools/fairy-stockfish/src/stockfish');
  if (existsSync(dev)) return dev;
  throw new Error('FSF binary not found; set MISTBOARD_FSF_PATH');
}

type SearchResult = {
  best: string;
  cp: number | null;
  mate: number | null;
  depth: number;
  nodes: number;
};

class FsfSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private buf = '';
  private readonly sinks = new Set<(line: string) => void>();

  constructor(
    binary: string,
    private readonly iniPath: string,
    private readonly variant: string,
  ) {
    this.child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString('utf8');
      let nl = this.buf.indexOf('\n');
      while (nl >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        for (const sink of [...this.sinks]) sink(line);
        nl = this.buf.indexOf('\n');
      }
    });
  }

  private send(command: string): void {
    this.child.stdin.write(`${command}\n`);
  }
  private waitFor(done: (line: string) => boolean): Promise<void> {
    return new Promise((res) => {
      const sink = (line: string): void => {
        if (done(line)) {
          this.sinks.delete(sink);
          res();
        }
      };
      this.sinks.add(sink);
    });
  }

  async init(): Promise<void> {
    this.send('uci');
    await this.waitFor((l) => l === 'uciok');
    this.send('setoption name Threads value 1');
    this.send(`setoption name VariantPath value ${this.iniPath}`);
    this.send(`setoption name UCI_Variant value ${this.variant}`);
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }
  async newGame(): Promise<void> {
    this.send('ucinewgame');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }

  private position(history: readonly string[]): void {
    this.send(
      history.length > 0 ? `position startpos moves ${history.join(' ')}` : 'position startpos',
    );
  }

  async legalMoves(history: readonly string[]): Promise<string[]> {
    const moves: string[] = [];
    const done = this.waitFor((line) => {
      if (line.startsWith('Nodes searched')) return true;
      const m = /^(\S+):\s*\d+$/.exec(line);
      if (m) moves.push(m[1]!);
      return false;
    });
    this.position(history);
    this.send('go perft 1');
    await done;
    return moves;
  }

  // `limit` is a raw UCI go-limit, e.g. "depth 12" (equal strength across
  // variants) or "nodes 100000" (equal compute; handicaps the bushier variant).
  async search(history: readonly string[], limit: string): Promise<SearchResult> {
    let best = '';
    let cp: number | null = null;
    let mate: number | null = null;
    let depth = 0;
    let nodes = 0;
    const done = this.waitFor((line) => {
      const info = /^info .*\bscore (cp|mate) (-?\d+)/.exec(line);
      if (info) {
        const d = /\bdepth (\d+)/.exec(line);
        if (d) depth = Number(d[1]);
        const nn = /\bnodes (\d+)/.exec(line);
        if (nn) nodes = Number(nn[1]);
        if (info[1] === 'cp') {
          cp = Number(info[2]);
          mate = null;
        } else {
          mate = Number(info[2]);
        }
      }
      const bm = /^bestmove\s+(\S+)/.exec(line);
      if (bm) {
        best = bm[1]!;
        return true;
      }
      return false;
    });
    this.position(history);
    this.send(`go ${limit}`);
    await done;
    return { best, cp, mate, depth, nodes };
  }

  close(): void {
    try {
      this.send('quit');
    } catch {
      /* ignore */
    }
    this.child.kill('SIGKILL');
  }
}

// ── Deterministic PRNG ──────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = (seed % 0x7fffffff) + 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s;
  };
}

// ── Game runner ─────────────────────────────────────────────────────────────

const MATE_CP = 10000; // fold mate scores into cp for volatility/comeback math

type PerPly = {
  ply: number;
  mover: Color;
  uci: string;
  evalRed: number; // red-POV cp (mate folded to ±MATE_CP)
  depth: number;
  searchNodes: number;
  isDrop: boolean;
  role: Role;
  captureRole: Role | null;
  soldierOwnHalfSideways: boolean;
  soldierForward: boolean; // soldier board move that advanced a rank (toward enemy)
  soldierSideways: boolean; // soldier board move that changed file (own OR enemy half)
  soldierRiverCross: boolean; // soldier board move that crossed into the enemy half
  soldierDropOwnHalf: boolean | null; // only for soldier drops
  soldierDropEnemyHalf: boolean | null; // only for soldier drops (attacking parachute)
  // Drop geography for ANY role. The soldier pair above predates the treasure
  // study and is kept so old .jsonl runs stay readable.
  dropOwnHalf: boolean | null;
  piecesOnBoard: number;
};

type GameResult = {
  condition: ConditionName;
  seed: number;
  opening: string[];
  moves: string[];
  plies: number;
  winner: Color | null;
  reason: string;
  decisive: boolean;
  evalRedSeries: number[];
  perPly: PerPly[];
  // Terminal soldier geography (from the final board): are soldiers parked at
  // home or pushed up the board? advance = mover-relative ranks gained from the
  // start rank (red starts rank 2, black rank 7); enemyHalf = across the river.
  terminalSoldierCount: number;
  terminalSoldierAdvanceMean: number;
  terminalSoldiersEnemyHalf: number;
};

function foldEval(res: SearchResult, mover: Color): number {
  let mv: number;
  if (res.mate !== null) mv = res.mate > 0 ? MATE_CP - res.mate : -MATE_CP - res.mate;
  else mv = res.cp ?? 0;
  return mover === 'red' ? mv : -mv; // to red POV
}

type RunConfig = {
  limit: string; // raw UCI go-limit applied every move, e.g. "depth 12"
  openPlies: number;
  cap: number;
  openEvalMax: number;
};

async function playGame(
  session: FsfSession,
  cond: ConditionName,
  seed: number,
  cfg: RunConfig,
): Promise<GameResult | null> {
  await session.newGame();
  const rng = makeRng(seed * 2654435761);
  const board = new Board();
  const history: string[] = [];
  const opening: string[] = [];

  // Random legal opening.
  for (let i = 0; i < cfg.openPlies; i += 1) {
    const legal = await session.legalMoves(history);
    if (legal.length === 0) return null; // opening decided the game; discard
    const uci = legal[rng() % legal.length]!;
    board.apply(uci);
    history.push(uci);
    opening.push(uci);
  }

  // Discard openings that already handed one side a big edge.
  const openEval = await session.search(history, cfg.limit);
  if (cfg.openEvalMax > 0 && Math.abs(foldEval(openEval, board.turn)) > cfg.openEvalMax)
    return null;

  const perPly: PerPly[] = [];
  const evalRedSeries: number[] = [];
  const moves: string[] = [];
  const repCounts = new Map<string, number>();
  repCounts.set(board.positionKey(), 1);

  let winner: Color | null = null;
  let reason = 'capped';
  let decisive = false;

  for (let ply = 0; ply < cfg.cap; ply += 1) {
    const mover = board.turn;
    const legal = await session.legalMoves(history);
    if (legal.length === 0) {
      // No legal move: side to move loses (mate or stalemate; both = loss here).
      winner = mover === 'red' ? 'black' : 'red';
      reason = 'no-legal-moves';
      decisive = true;
      break;
    }
    const search = await session.search(history, cfg.limit);
    const best = legal.includes(search.best) ? search.best : legal[0]!;
    const evalRed = foldEval(search, mover);
    const cls = board.apply(best);
    history.push(best);
    moves.push(best);
    evalRedSeries.push(evalRed);
    perPly.push({
      ply,
      mover,
      uci: best,
      evalRed,
      depth: search.depth,
      searchNodes: search.nodes,
      isDrop: cls.isDrop,
      role: cls.role,
      captureRole: cls.captureRole,
      soldierOwnHalfSideways:
        cls.role === 'soldier' && !cls.isDrop && cls.sideways && cls.ownHalfBefore,
      soldierForward: cls.role === 'soldier' && !cls.isDrop && cls.forward,
      soldierSideways: cls.role === 'soldier' && !cls.isDrop && cls.sideways,
      soldierRiverCross:
        cls.role === 'soldier' &&
        !cls.isDrop &&
        cls.forward &&
        cls.ownHalfBefore &&
        !Board.ownHalf(cls.mover, cls.toRank),
      soldierDropOwnHalf: cls.isDrop && cls.role === 'soldier' ? cls.ownHalfBefore : null,
      soldierDropEnemyHalf: cls.isDrop && cls.role === 'soldier' ? !cls.ownHalfBefore : null,
      dropOwnHalf: cls.isDrop ? cls.ownHalfBefore : null,
      piecesOnBoard: board.squares.size,
    });

    const key = board.positionKey();
    const c = (repCounts.get(key) ?? 0) + 1;
    repCounts.set(key, c);
    if (c >= 3) {
      winner = null;
      reason = 'repetition';
      decisive = false;
      break;
    }
  }

  if (reason === 'capped') {
    const last = evalRedSeries.at(-1) ?? 0;
    if (last > 150) {
      winner = 'red';
      reason = 'adjudicated';
      decisive = true;
    } else if (last < -150) {
      winner = 'black';
      reason = 'adjudicated';
      decisive = true;
    } else {
      winner = null;
      reason = 'adjudicated-draw';
      decisive = false;
    }
  }

  // Terminal soldier geography from the final board.
  const soldierAdvances: number[] = [];
  let soldiersEnemyHalf = 0;
  for (const [sq, p] of board.squares) {
    if (p.role !== 'soldier') continue;
    const rank = Number(sq[1]);
    soldierAdvances.push(p.color === 'red' ? rank - 2 : 7 - rank);
    if (!Board.ownHalf(p.color, rank)) soldiersEnemyHalf += 1;
  }

  return {
    condition: cond,
    seed,
    opening,
    moves,
    plies: moves.length,
    winner,
    reason,
    decisive,
    evalRedSeries,
    perPly,
    terminalSoldierCount: soldierAdvances.length,
    terminalSoldierAdvanceMean: soldierAdvances.length ? mean(soldierAdvances) : 0,
    terminalSoldiersEnemyHalf: soldiersEnemyHalf,
  };
}

// ── Worker pool over one condition ──────────────────────────────────────────

async function runCondition(
  cond: ConditionName,
  target: number,
  workers: number,
  baseSeed: number,
  cfg: RunConfig,
): Promise<GameResult[]> {
  const binary = fsfBinaryPath();
  const kept: GameResult[] = [];
  let attempt = 0;
  let discards = 0;
  const maxAttempts = target * 8 + 50;

  const worker = async (): Promise<void> => {
    const session = new FsfSession(binary, CONDITIONS[cond].ini, CONDITIONS[cond].variant);
    await session.init();
    while (kept.length < target && attempt < maxAttempts) {
      const seed = baseSeed + attempt;
      attempt += 1;
      const game = await playGame(session, cond, seed, cfg);
      if (game && game.plies > 0) kept.push(game);
      else discards += 1;
      if ((kept.length + discards) % 10 === 0) {
        process.stderr.write(`  [${cond}] kept ${kept.length}/${target} (discarded ${discards})\r`);
      }
    }
    session.close();
  };

  await Promise.all(Array.from({ length: workers }, () => worker()));
  process.stderr.write(
    `  [${cond}] done: ${kept.length} games (discarded ${discards})            \n`,
  );
  return kept.slice(0, target);
}

// ── Metrics ─────────────────────────────────────────────────────────────────

function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}
function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i]!;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function volatility(g: GameResult): number {
  const e = g.evalRedSeries;
  if (e.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < e.length; i += 1) sum += Math.abs(e[i]! - e[i - 1]!);
  return sum / (e.length - 1);
}
function leadChanges(g: GameResult): number {
  let state = 0; // -1 black-winning, +1 red-winning, 0 neutral
  let changes = 0;
  for (const v of g.evalRedSeries) {
    if (v > 100 && state !== 1) {
      if (state === -1) changes += 1;
      state = 1;
    } else if (v < -100 && state !== -1) {
      if (state === 1) changes += 1;
      state = -1;
    }
  }
  return changes;
}
function isComeback(g: GameResult): boolean {
  if (!g.decisive || g.winner === null) return false;
  const winnerPov = g.winner === 'red' ? g.evalRedSeries : g.evalRedSeries.map((v) => -v);
  return Math.min(...winnerPov) <= -200;
}

function summarize(cond: ConditionName, games: GameResult[]): Record<string, unknown> {
  const n = games.length;
  const decisive = games.filter((g) => g.decisive);
  const redWins = games.filter((g) => g.winner === 'red').length;
  const blackWins = games.filter((g) => g.winner === 'black').length;
  const draws = n - redWins - blackWins;
  const lengths = games.map((g) => g.plies);
  const vols = games.map(volatility);
  const leads = games.map(leadChanges);
  const comebacks = decisive.filter(isComeback).length;

  // Soldier metrics
  let soldierDrops = 0;
  let soldierDropsOwnHalf = 0;
  let ownHalfSidewaysMoves = 0;
  let soldierMoves = 0;
  let soldierForwardMoves = 0;
  let soldierSidewaysMoves = 0;
  let soldierRiverCrossings = 0;
  for (const g of games)
    for (const p of g.perPly) {
      if (p.isDrop && p.role === 'soldier') {
        soldierDrops += 1;
        if (p.soldierDropOwnHalf) soldierDropsOwnHalf += 1;
      }
      if (!p.isDrop && p.role === 'soldier') soldierMoves += 1;
      if (p.soldierOwnHalfSideways) ownHalfSidewaysMoves += 1;
      if (p.soldierForward) soldierForwardMoves += 1;
      if (p.soldierSideways) soldierSidewaysMoves += 1;
      if (p.soldierRiverCross) soldierRiverCrossings += 1;
    }

  // Treasure + drop-mate metrics (2026-09-02 study). The taste complaint this
  // measures is "the finish is a parachuted piece next to a cornered general",
  // so the headline is what share of decisive games END on a drop, and how much
  // of that the treasure is responsible for. A game ends on a drop when the last
  // ply was a drop and the loser then had no legal move.
  let treasureDrops = 0;
  let treasureDropsEnemyHalf = 0;
  let treasureBoardMoves = 0;
  let dropMates = 0;
  let treasureDropMates = 0;
  let soldierDropMates = 0;
  for (const g of games) {
    for (const p of g.perPly) {
      if (p.role !== 'treasure') continue;
      if (p.isDrop) {
        treasureDrops += 1;
        if (p.dropOwnHalf === false) treasureDropsEnemyHalf += 1;
      } else treasureBoardMoves += 1;
    }
    if (g.reason !== 'no-legal-moves') continue;
    const last = g.perPly.at(-1);
    if (!last?.isDrop) continue;
    dropMates += 1;
    if (last.role === 'treasure') treasureDropMates += 1;
    if (last.role === 'soldier') soldierDropMates += 1;
  }
  const mates = games.filter((g) => g.reason === 'no-legal-moves').length;

  const redScore = (redWins + 0.5 * draws) / n;
  const meanDepth = mean(games.flatMap((g) => g.perPly.map((p) => p.depth)));
  const meanNodes = mean(games.flatMap((g) => g.perPly.map((p) => p.searchNodes)));

  return {
    condition: cond,
    games: n,
    decisiveRate: decisive.length / n,
    drawRate: draws / n,
    redWins,
    blackWins,
    draws,
    redScore,
    redScoreCI: wilson(redWins + 0.5 * draws, n).map((x) => Number(x.toFixed(3))),
    gameLength: {
      median: median(lengths),
      mean: Number(mean(lengths).toFixed(1)),
      p25: quantile(lengths, 0.25),
      p75: quantile(lengths, 0.75),
      quickKillRate: lengths.filter((l) => l < 40).length / n,
    },
    evalVolatility: {
      mean: Number(mean(vols).toFixed(1)),
      median: Number(median(vols).toFixed(1)),
    },
    leadChanges: { mean: Number(mean(leads).toFixed(2)), median: median(leads) },
    comebackRate: decisive.length ? comebacks / decisive.length : 0,
    comebackCI:
      decisive.length > 0
        ? wilson(comebacks, decisive.length).map((x) => Number(x.toFixed(3)))
        : [0, 0],
    treasure: {
      drops: treasureDrops,
      dropsPerGame: Number((treasureDrops / n).toFixed(2)),
      // 0 by construction in the treasure-home arm; the number the arm removes.
      dropsEnemyHalf: treasureDropsEnemyHalf,
      dropsEnemyHalfRate: treasureDrops ? treasureDropsEnemyHalf / treasureDrops : 0,
      boardMoves: treasureBoardMoves,
      boardMovesPerGame: Number((treasureBoardMoves / n).toFixed(2)),
    },
    finishes: {
      mates,
      dropMates,
      // The 56% the design spec flagged as a taste call.
      dropMateShareOfMates: mates ? Number((dropMates / mates).toFixed(3)) : 0,
      treasureDropMates,
      soldierDropMates,
      treasureShareOfDropMates: dropMates ? Number((treasureDropMates / dropMates).toFixed(3)) : 0,
    },
    soldier: {
      drops: soldierDrops,
      dropsOwnHalfRate: soldierDrops ? soldierDropsOwnHalf / soldierDrops : 0,
      boardMoves: soldierMoves,
      ownHalfSidewaysMoves,
      ownHalfSidewaysPerGame: Number((ownHalfSidewaysMoves / n).toFixed(2)),
      // Advancement: does the soldier push up the board, or shuffle sideways at home?
      forwardMoves: soldierForwardMoves,
      sidewaysMoves: soldierSidewaysMoves,
      forwardShareOfMoves: soldierMoves
        ? Number((soldierForwardMoves / soldierMoves).toFixed(3))
        : 0,
      forwardPerGame: Number((soldierForwardMoves / n).toFixed(2)),
      riverCrossingsPerGame: Number((soldierRiverCrossings / n).toFixed(2)),
      terminalAdvanceMean: Number(mean(games.map((g) => g.terminalSoldierAdvanceMean)).toFixed(2)),
      terminalSoldiersEnemyHalfPerGame: Number(
        mean(games.map((g) => g.terminalSoldiersEnemyHalf)).toFixed(2),
      ),
    },
    meanSearchDepth: Number(meanDepth.toFixed(1)),
    meanSearchNodes: Math.round(meanNodes),
    _pctHelpers: { pct, wilson: undefined },
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
}

async function main(): Promise<void> {
  // Equal-strength by default (fixed depth). --nodes forces equal-compute, which
  // handicaps VET's search because its branching factor is larger.
  const hasNodes = process.argv.includes('--nodes');
  const limit = hasNodes ? `nodes ${arg('nodes', '100000')}` : `depth ${arg('depth', '12')}`;
  const cfg: RunConfig = {
    limit,
    openPlies: Number(arg('open', '6')),
    cap: Number(arg('cap', '400')),
    openEvalMax: Number(arg('open-eval-max', '250')),
  };
  const games = Number(arg('games', '40'));
  const workers = Number(arg('workers', '6'));
  const baseSeed = Number(arg('seed', '1'));
  const outDir = resolve(arg('out', resolve(REPO, '..', '..', 'scratchpad', 'soldier-study')));
  const conds = arg('conditions', 'base,vet').split(',') as ConditionName[];

  mkdirSync(outDir, { recursive: true });
  console.log(
    `soldier-study: games=${games}/cond limit="${cfg.limit}" open=${cfg.openPlies} workers=${workers} cap=${cfg.cap} openEvalMax=${cfg.openEvalMax}`,
  );
  console.log(`out: ${outDir}\n`);

  const summaries: Record<string, unknown>[] = [];
  for (const cond of conds) {
    const started = Number(process.hrtime.bigint() / 1_000_000n);
    const results = await runCondition(cond, games, workers, baseSeed, cfg);
    const elapsed = (Number(process.hrtime.bigint() / 1_000_000n) - started) / 1000;
    writeFileSync(
      resolve(outDir, `${cond}.jsonl`),
      `${results.map((g) => JSON.stringify(g)).join('\n')}\n`,
    );
    const s = summarize(cond, results);
    s._elapsedSec = Number(elapsed.toFixed(1));
    delete (s as Record<string, unknown>)._pctHelpers;
    summaries.push(s);
    console.log(`\n${cond.toUpperCase()}  (${elapsed.toFixed(1)}s)`);
    console.log(JSON.stringify(s, null, 2));
  }

  writeFileSync(
    resolve(outDir, 'summary.json'),
    JSON.stringify({ config: { ...cfg, games, workers, baseSeed }, summaries }, null, 2),
  );
  console.log(`\nwrote ${resolve(outDir, 'summary.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
