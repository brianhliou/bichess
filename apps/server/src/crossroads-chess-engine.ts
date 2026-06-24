// Fairy-Stockfish move provider for perfect-information Crossroads Chess.
//
// FSF plays the variant natively (loaded from crossroads-chess.ini), so it is a free,
// strong opponent for the open mode. Per the AI-serving decision this lives
// server-side behind a small move provider — NOT the Obscuro engine-worker (the
// fog engine), which speaks a different, redaction-shaped protocol. For now it
// spawns one FSF process per request (stateless, robust; FSF starts in ~100ms),
// which is plenty for turn-based local play. Promote to a persistent process or
// its own service only under real load (the task-#92 trigger).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VARIANT = 'dualchess';
export const CROSSROADS_CHESS_DEFAULT_ENGINE_ID = 'fairy-stockfish-crossroads-strong';
// Engine BUILD version recorded per PvE game (subject_id encodes only the tier). The shipped
// engine is Fairy-Stockfish 14 for the Crossroads variant; bump on any engine/config change.
export const CROSSROADS_CHESS_ENGINE_VERSION = '0.1.0';

export type CrossroadsChessEngineTier = {
  id: string;
  name: string;
  movetimeMs: number;
  skill: number;
};

const CROSSROADS_CHESS_ENGINE_TIERS = [
  {
    id: 'fairy-stockfish-crossroads-amateur',
    name: 'Fairy Stockfish - Amateur',
    skill: 2,
    movetimeMs: 150,
  },
  {
    id: CROSSROADS_CHESS_DEFAULT_ENGINE_ID,
    name: 'Fairy Stockfish - Strong',
    skill: 8,
    movetimeMs: 300,
  },
  {
    id: 'fairy-stockfish-crossroads-very-strong',
    name: 'Fairy Stockfish - Strongest',
    skill: 20,
    movetimeMs: 2000,
  },
] as const satisfies readonly CrossroadsChessEngineTier[];

export const CROSSROADS_CHESS_PLAYABLE_ENGINES: readonly CrossroadsChessEngineTier[] =
  CROSSROADS_CHESS_ENGINE_TIERS;

const CROSSROADS_CHESS_ENGINE_BY_ID: ReadonlyMap<string, CrossroadsChessEngineTier> = new Map(
  CROSSROADS_CHESS_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);
const DEFAULT_MAX_CONCURRENT_FSF = 2;
const DEFAULT_FSF_QUEUE_TIMEOUT_MS = 5_000;

let activeFsfProcesses = 0;
const fsfQueue: Array<{
  reject(err: Error): void;
  resolve(): void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

// Resolve the FSF binary: explicit env override, else the known dev location.
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

// crossroads-chess.ini lives in src/; tsc does not copy it to dist/, so look in both
// the tsx-dev (src) and built (dist -> ../src) locations.
export function crossroadsChessVariantIniPath(): string {
  const candidates = [
    resolve(HERE, 'crossroads-chess.ini'),
    resolve(HERE, '..', 'src', 'crossroads-chess.ini'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`crossroads-chess.ini not found (looked in ${candidates.join(', ')})`);
}

/**
 * Ask Fairy-Stockfish for a move given the UCI move history from the start
 * position. Returns the UCI move (e.g. "d2d3", "a7a8q") or null if there is no
 * move (game already over). Callers MUST pre-validate each move string — it is
 * written to the engine's stdin.
 */
export type CrossroadsChessEngineOptions = { movetimeMs?: number; skill?: number };

export function crossroadsChessEngineTierFor(
  engineId: string | undefined,
): CrossroadsChessEngineTier | null {
  if (!engineId) return null;
  return CROSSROADS_CHESS_ENGINE_BY_ID.get(engineId) ?? null;
}

export function crossroadsChessEngineDisplayName(engineId: string): string {
  return crossroadsChessEngineTierFor(engineId)?.name ?? engineId;
}

export function isCrossroadsChessEngineClientId(clientId: string | undefined): boolean {
  return crossroadsChessEngineTierFor(clientId) !== null;
}

export function crossroadsChessEngineVersion(clientId: string | undefined): string | null {
  return isCrossroadsChessEngineClientId(clientId) ? CROSSROADS_CHESS_ENGINE_VERSION : null;
}

export async function crossroadsChessLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = crossroadsChessEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Crossroads Chess engine: ${engineId}`);
  const release = await acquireFsfSlot();
  try {
    return await crossroadsChessEngineMove(moves, {
      skill: tier.skill,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
    });
  } finally {
    release();
  }
}

export function crossroadsChessEngineMove(
  moves: string[],
  opts: CrossroadsChessEngineOptions = {},
): Promise<string | null> {
  const fsf = fairyStockfishPath();
  const ini = crossroadsChessVariantIniPath();
  const movetimeMs = opts.movetimeMs ?? 500;
  // Fairy-Stockfish Skill Level: 0 (weakest) .. 20 (full strength).
  const skill = opts.skill === undefined ? null : Math.max(0, Math.min(20, Math.floor(opts.skill)));

  return new Promise<string | null>((resolveMove, reject) => {
    const child = spawn(fsf, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let settled = false;

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

    const timer = setTimeout(
      () => finish(() => reject(new Error('fsf move timed out'))),
      movetimeMs + 4000,
    );

    child.on('error', (err) => finish(() => reject(err)));
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let newline = buf.indexOf('\n');
      while (newline >= 0) {
        const line = buf.slice(0, newline).trim();
        buf = buf.slice(newline + 1);
        if (line.startsWith('bestmove')) {
          const move = line.split(/\s+/)[1];
          finish(() => resolveMove(move && move !== '(none)' ? move : null));
          return;
        }
        newline = buf.indexOf('\n');
      }
    });

    const position =
      moves.length > 0 ? `position startpos moves ${moves.join(' ')}` : 'position startpos';
    const commands = [
      'uci',
      `setoption name VariantPath value ${ini}`,
      `setoption name UCI_Variant value ${VARIANT}`,
      ...(skill === null ? [] : [`setoption name Skill Level value ${skill}`]),
      'ucinewgame',
      'isready',
      position,
      `go movetime ${movetimeMs}`,
    ];
    child.stdin.write(`${commands.join('\n')}\n`);
  });
}

function acquireFsfSlot(): Promise<() => void> {
  if (activeFsfProcesses < maxConcurrentFsfProcesses()) {
    activeFsfProcesses += 1;
    return Promise.resolve(releaseFsfSlot);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = fsfQueue.findIndex((entry) => entry.reject === reject);
      if (idx >= 0) fsfQueue.splice(idx, 1);
      reject(new Error('fsf concurrency queue timed out'));
    }, fsfQueueTimeoutMs());
    timer.unref();
    fsfQueue.push({
      reject,
      resolve: () => {
        clearTimeout(timer);
        activeFsfProcesses += 1;
        resolve(releaseFsfSlot);
      },
      timer,
    });
  });
}

function releaseFsfSlot(): void {
  activeFsfProcesses = Math.max(0, activeFsfProcesses - 1);
  const next = fsfQueue.shift();
  if (next) next.resolve();
}

function maxConcurrentFsfProcesses(): number {
  return boundedEnvInt('MISTBOARD_CROSSROADS_FSF_MAX_PROCESSES', DEFAULT_MAX_CONCURRENT_FSF, 1, 8);
}

function fsfQueueTimeoutMs(): number {
  return boundedEnvInt(
    'MISTBOARD_CROSSROADS_FSF_QUEUE_TIMEOUT_MS',
    DEFAULT_FSF_QUEUE_TIMEOUT_MS,
    100,
    30_000,
  );
}

function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
