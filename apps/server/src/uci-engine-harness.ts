// Shared UCI subprocess harness for the in-process PvE move providers.
//
// Every "Tier-B" engine (Fairy-Stockfish for the perfect-info xiangqi/crossroads
// variants, PikaJieQi for jieqi, the MistyBanqi / MistyJungle / MistyJungleFlip
// Rust binaries) drives a UCI subprocess with the SAME process lifecycle: a small
// per-process concurrency pool, a per-request `spawn` that writes a command block
// to stdin and scans stdout for `bestmove`, a hard timeout, and a SIGKILL cleanup.
// That lifecycle used to be copy-pasted verbatim across 8 files; it now lives here
// once. Binary-path resolution, tier tables, and command assembly stay per-engine
// (each speaks a slightly different UCI dialect).
//
// This is NOT the fog engine-worker path (python-pool / internal-engine-client /
// the Obscuro container engines) — those speak the redaction-shaped HTTP protocol
// and are unaffected.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Generic UCI subprocess core (shared by every in-process spawn engine) ─────

/**
 * Read a bounded integer from an env var: the parsed value clamped to [min, max],
 * or `fallback` when the var is unset / non-numeric.
 */
export function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export type UciEnginePoolConfig = {
  /** Env var overriding the max concurrent subprocesses (clamped 1..8). */
  maxProcessesEnvVar: string;
  /** Env var overriding the queue-wait timeout in ms (clamped 100..30_000). */
  queueTimeoutEnvVar: string;
  /** Default max concurrent subprocesses (default 2). */
  defaultMaxProcesses?: number;
  /** Default queue-wait timeout in ms (default 5_000). */
  defaultQueueTimeoutMs?: number;
  /** Error message when a waiter times out waiting for a slot. */
  queueTimeoutMessage: string;
};

type QueueEntry = {
  reject(err: Error): void;
  resolve(release: () => void): void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * A tiny per-process concurrency gate: at most N `spawn`ed engine subprocesses run
 * at once; the rest queue (FIFO) until a slot frees or the wait times out. Bounds
 * are re-read from the environment on every `acquire()`, matching the pre-extraction
 * behavior. The queue-wait timer is `.unref()`ed so a pending waiter never keeps the
 * process alive (repo hard rule on speculative timers).
 */
export class UciEnginePool {
  private active = 0;
  private readonly queue: QueueEntry[] = [];

  constructor(private readonly config: UciEnginePoolConfig) {}

  /** Take a slot, returning a release function. Call it exactly once when done. */
  acquire(): Promise<() => void> {
    if (this.active < this.maxProcesses()) {
      this.active += 1;
      return Promise.resolve(this.release);
    }
    return new Promise<() => void>((resolveSlot, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((entry) => entry.reject === reject);
        if (idx >= 0) this.queue.splice(idx, 1);
        reject(new Error(this.config.queueTimeoutMessage));
      }, this.queueTimeoutMs());
      timer.unref();
      this.queue.push({ reject, resolve: resolveSlot, timer });
    });
  }

  private readonly release = (): void => {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      this.active += 1;
      next.resolve(this.release);
    }
  };

  private maxProcesses(): number {
    return boundedEnvInt(
      this.config.maxProcessesEnvVar,
      this.config.defaultMaxProcesses ?? 2,
      1,
      8,
    );
  }

  private queueTimeoutMs(): number {
    return boundedEnvInt(
      this.config.queueTimeoutEnvVar,
      this.config.defaultQueueTimeoutMs ?? 5_000,
      100,
      30_000,
    );
  }
}

/**
 * Interpret one line of UCI engine output.
 * - `undefined` → not a `bestmove` line; keep scanning.
 * - a string → the bestmove in engine UCI.
 * - `null` → the engine reported no move (`bestmove (none)` / empty).
 */
export function parseBestmoveLine(line: string): string | null | undefined {
  if (!line.startsWith('bestmove')) return undefined;
  const move = line.split(/\s+/)[1];
  return move && move !== '(none)' ? move : null;
}

/** Parse an advertised UCI option name from `option name ... type ...`. */
export function parseUciOptionLine(line: string): string | undefined {
  const match = line.match(/^option name (.+?) type /);
  return match?.[1]?.trim() || undefined;
}

/** Return the option names configured by a UCI command block. */
export function configuredUciOptionNames(commands: readonly string[]): string[] {
  return commands.flatMap((command) => {
    const match = command.match(/^setoption name (.+?)(?: value .*)?$/);
    return match?.[1]?.trim() ? [match[1].trim()] : [];
  });
}

function validateConfiguredUciOptions(
  commands: readonly string[],
  advertisedOptions: ReadonlySet<string>,
): void {
  const unsupported = configuredUciOptionNames(commands).filter(
    (option) => !advertisedOptions.has(option),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `UCI engine does not advertise configured option(s): ${unsupported.join(', ')}`,
    );
  }
}

function uciProtocolError(line: string): string | null {
  return /^(?:No such option|Unknown option|Unknown command)\b/i.test(line) ? line : null;
}

export type RunUciBestmoveArgs = {
  /** Absolute path to the engine binary. */
  bin: string;
  /** UCI command block written to stdin (joined by newlines, trailing newline added). */
  commands: readonly string[];
  /** Hard timeout in ms; on expiry the child is SIGKILLed and the promise rejects. */
  timeoutMs: number;
  /** Error message used when the move times out. */
  timeoutMessage: string;
  /** Extra env vars merged over the parent env for the spawned process (e.g. a seed). */
  env?: Readonly<Record<string, string>>;
};

/**
 * Spawn a UCI engine, send `commands`, and resolve with its `bestmove` (or `null`
 * when there is no move). The child is always SIGKILLed and the timeout cleared on
 * the first of: bestmove parsed, spawn error, or timeout — so no subprocess or
 * timer leaks. One process per call (stateless, robust); callers gate concurrency
 * through a `UciEnginePool`.
 */
export function runUciBestmove(args: RunUciBestmoveArgs): Promise<string | null> {
  const { bin, commands, timeoutMs, timeoutMessage, env } = args;
  return new Promise<string | null>((resolveMove, reject) => {
    const child = spawn(bin, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    let buf = '';
    let settled = false;
    const advertisedOptions = new Set<string>();

    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      run();
    };

    const timer = setTimeout(() => finish(() => reject(new Error(timeoutMessage))), timeoutMs);

    child.on('error', (err) => finish(() => reject(err)));
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let newline = buf.indexOf('\n');
      while (newline >= 0) {
        const line = buf.slice(0, newline).trim();
        buf = buf.slice(newline + 1);
        const option = parseUciOptionLine(line);
        if (option) advertisedOptions.add(option);
        const protocolError = uciProtocolError(line);
        if (protocolError) {
          finish(() => reject(new Error(`UCI engine rejected command: ${protocolError}`)));
          return;
        }
        const parsed = parseBestmoveLine(line);
        if (parsed !== undefined) {
          finish(() => {
            try {
              validateConfiguredUciOptions(commands, advertisedOptions);
              resolveMove(parsed);
            } catch (err) {
              reject(err);
            }
          });
          return;
        }
        newline = buf.indexOf('\n');
      }
    });

    child.stdin.write(`${commands.join('\n')}\n`);
  });
}

/**
 * Parse a UCI `info … score …` line into the fields postgame analysis needs.
 * Returns undefined for non-info or score-less lines (e.g. `info string …`). The
 * score is from the side-to-move POV, exactly as the engine reports it.
 */
export function parseInfoScore(
  line: string,
): { depth: number; cp: number | null; mate: number | null } | undefined {
  if (!line.startsWith('info ') || !line.includes(' score ')) return undefined;
  const tokens = line.split(/\s+/);
  let depth = 0;
  let cp: number | null = null;
  let mate: number | null = null;
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === 'depth') depth = Number(tokens[i + 1]);
    else if (tokens[i] === 'score') {
      if (tokens[i + 1] === 'cp') cp = Number(tokens[i + 2]);
      else if (tokens[i + 1] === 'mate') mate = Number(tokens[i + 2]);
    }
  }
  return { depth, cp, mate };
}

export type UciEval = {
  /** Best move in engine UCI, or null when the engine reports none. */
  best: string | null;
  /** Centipawns (side-to-move POV); null when a mate score is present. */
  cp: number | null;
  /** Signed moves-to-mate (side-to-move POV); null otherwise. */
  mate: number | null;
  /** Depth of the last scored line seen before bestmove. */
  depth: number;
};

/**
 * Like runUciBestmove, but also keeps the last `info … score` line so the caller
 * gets the position's evaluation (for postgame analysis), not just the move. Same
 * spawn / hard-timeout / SIGKILL-cleanup contract.
 */
export function runUciEval(args: RunUciBestmoveArgs): Promise<UciEval> {
  const { bin, commands, timeoutMs, timeoutMessage } = args;
  return new Promise<UciEval>((resolveEval, reject) => {
    const child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let settled = false;
    let latest: { depth: number; cp: number | null; mate: number | null } | null = null;
    const advertisedOptions = new Set<string>();

    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      run();
    };

    const timer = setTimeout(() => finish(() => reject(new Error(timeoutMessage))), timeoutMs);

    child.on('error', (err) => finish(() => reject(err)));
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let newline = buf.indexOf('\n');
      while (newline >= 0) {
        const line = buf.slice(0, newline).trim();
        buf = buf.slice(newline + 1);
        const option = parseUciOptionLine(line);
        if (option) advertisedOptions.add(option);
        const protocolError = uciProtocolError(line);
        if (protocolError) {
          finish(() => reject(new Error(`UCI engine rejected command: ${protocolError}`)));
          return;
        }
        const score = parseInfoScore(line);
        if (score) latest = score;
        const move = parseBestmoveLine(line);
        if (move !== undefined) {
          finish(() => {
            try {
              validateConfiguredUciOptions(commands, advertisedOptions);
              resolveEval({
                best: move,
                cp: latest?.cp ?? null,
                mate: latest?.mate ?? null,
                depth: latest?.depth ?? 0,
              });
            } catch (err) {
              reject(err);
            }
          });
          return;
        }
        newline = buf.indexOf('\n');
      }
    });

    child.stdin.write(`${commands.join('\n')}\n`);
  });
}

// ── Fairy-Stockfish layer (the perfect-info xiangqi + crossroads providers) ───

// Resolve the FSF binary: explicit env override, else the known dev location, else
// the Railway/railpack + system install locations. Throws (never silently falls
// back to a first-legal move) when nothing resolves.
export function fairyStockfishPath(): string {
  const explicit = process.env.MISTBOARD_FSF_PATH;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(`MISTBOARD_FSF_PATH points at ${resolved} but the binary does not exist`);
    }
    return resolved;
  }
  const home = process.env.HOME;
  if (home) {
    const dev = resolve(home, 'projects', 'tools', 'fairy-stockfish', 'src', 'stockfish');
    if (existsSync(dev)) return dev;
  }
  for (const candidate of [
    resolve(process.cwd(), 'bin', 'fairy-stockfish'),
    // Railway/railpack install location — resolved regardless of cwd so the
    // engine never silently falls back to a first-legal move in prod.
    '/app/bin/fairy-stockfish',
    '/usr/local/bin/fairy-stockfish',
    '/usr/bin/fairy-stockfish',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Fairy-Stockfish binary not found. Set MISTBOARD_FSF_PATH.');
}

// Custom variant .ini files live in src/; tsc does not copy them to dist/, so look
// in both the tsx-dev (src) and built (dist -> ../src) locations. Callers that use a
// built-in FSF variant (e.g. `minixiangqi`) pass no ini path at all.
export function resolveFsfVariantIniPath(filename: string): string {
  const candidates = [resolve(HERE, filename), resolve(HERE, '..', 'src', filename)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`${filename} not found (looked in ${candidates.join(', ')})`);
}

export type FairyStockfishMoveRequest = {
  /** UCI move history from the start position (`position startpos moves ...`). */
  moves: readonly string[];
  /** UCI_Variant name (built-in like `minixiangqi`, or custom from `iniPath`). */
  variant: string;
  /** Custom variants.ini path (VariantPath); omit for built-in variants. */
  iniPath?: string;
  /** Skill Level -20..20 (clamped); omit for full strength. */
  skill?: number;
  /** Search depth cap for `go`; used with Skill Level by Lichess/PlayStrategy. */
  depth?: number;
  /** Node budget for `go`; omit to bound by movetime only. */
  nodes?: number;
  /** Movetime cap in ms for `go`; also sets the hard timeout (movetime + 4000). */
  movetimeMs: number;
};

/**
 * Assemble the FSF UCI command block for one move request. Pure (no spawn), so the
 * option ordering / go-limit wiring is unit-testable. `skill`/`nodes` are clamped
 * exactly as the per-variant providers did before extraction.
 */
export function buildFairyStockfishCommands(req: FairyStockfishMoveRequest): string[] {
  const skill = req.skill === undefined ? null : Math.max(-20, Math.min(20, Math.floor(req.skill)));
  const nodes = req.nodes === undefined ? null : Math.max(1, Math.floor(req.nodes));
  const depth = req.depth === undefined ? null : Math.max(1, Math.floor(req.depth));
  const position =
    req.moves.length > 0 ? `position startpos moves ${req.moves.join(' ')}` : 'position startpos';
  // `go [nodes N] movetime M` stops at whichever limit is reached first: nodes pin
  // strength CPU-independently, movetime guards wall-clock on a slow vCPU.
  const goLimits = [
    ...(nodes === null ? [] : [`nodes ${nodes}`]),
    ...(depth === null ? [] : [`depth ${depth}`]),
    `movetime ${req.movetimeMs}`,
  ].join(' ');
  return [
    'uci',
    ...(req.iniPath ? [`setoption name VariantPath value ${req.iniPath}`] : []),
    `setoption name UCI_Variant value ${req.variant}`,
    ...(skill === null ? [] : [`setoption name Skill Level value ${skill}`]),
    'ucinewgame',
    'isready',
    position,
    `go ${goLimits}`,
  ];
}

/**
 * Ask Fairy-Stockfish for a move. Resolves the binary, assembles the command block,
 * and runs it through the shared subprocess harness. Returns the UCI move or null
 * (no move / game over). Callers MUST pre-validate each move string in `moves` — it
 * is written to the engine's stdin.
 */
export function fairyStockfishBestmove(req: FairyStockfishMoveRequest): Promise<string | null> {
  return runUciBestmove({
    bin: fairyStockfishPath(),
    commands: buildFairyStockfishCommands(req),
    timeoutMs: req.movetimeMs + 4000,
    timeoutMessage: 'fsf move timed out',
  });
}
