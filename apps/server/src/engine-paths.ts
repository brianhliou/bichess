/**
 * Single source of truth for resolving the private mistboard-engine repo's
 * paths from the public Mistboard server.
 *
 * The engine lives in a separate (private) repo since 2026-05-25 (privatization
 * Phase 5). The server spawns engine workers from there but doesn't reference
 * engine internals. The contract between them is the EngineTurnRequest /
 * EngineTurnResponse protocol defined in `packages/game/src/engine-protocol.ts`.
 *
 * Resolution order for the engine directory:
 *
 *   1. `MISTBOARD_ENGINE_DIR` env var (absolute path) — production / explicit
 *      override.
 *   2. `../mistboard-engine` relative to the public repo root — local dev
 *      sibling layout.
 *
 * Production (Railway) sets MISTBOARD_ENGINE_DIR to the submodule checkout
 * path so deploys are reproducible against a pinned engine SHA. Local dev
 * works without env vars when the repo is cloned next to mistboard.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function publicRepoRoot(): string {
  return PUBLIC_REPO_ROOT;
}

/**
 * Resolve the private engine repo root. Throws if the directory doesn't
 * exist — fail loud rather than silently fall back to a broken default,
 * since every engine spawn depends on this.
 */
export function engineDir(): string {
  const explicit = process.env.MISTBOARD_ENGINE_DIR;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(
        `MISTBOARD_ENGINE_DIR points at ${resolved} but the directory does not exist`,
      );
    }
    return resolved;
  }
  const sibling = resolve(PUBLIC_REPO_ROOT, '..', 'mistboard-engine');
  if (existsSync(sibling)) return sibling;
  throw new Error(
    `mistboard-engine not found. Set MISTBOARD_ENGINE_DIR or clone the private ` +
      `engine repo as a sibling of ${PUBLIC_REPO_ROOT} (tried: ${sibling}).`,
  );
}

/** Path to a script inside the engine's `scripts/` directory. */
export function engineScript(name: string): string {
  return resolve(engineDir(), 'scripts', name);
}

/**
 * Default Python interpreter for engine subprocesses. Honors
 * `PYTHON_ENGINE_PYTHON` first, then the engine repo's `.venv/bin/python`,
 * then falls back to `python3` on PATH.
 */
export function enginePython(): string {
  const explicit = process.env.PYTHON_ENGINE_PYTHON;
  if (explicit) return explicit;
  const venvPython = resolve(engineDir(), '.venv', 'bin', 'python');
  return existsSync(venvPython) ? venvPython : 'python3';
}

/**
 * Path inside the engine's `feedback/` directory — local-only research data
 * (gitignored in the engine repo). Used by the server's debug annotation
 * routes.
 */
export function engineFeedbackPath(...parts: string[]): string {
  return resolve(engineDir(), 'feedback', ...parts);
}

/**
 * Where Stockfish lives in this environment. apt installs it at
 * /usr/games/stockfish, which is NOT on the container PATH, so anything that
 * resolves the binary by PATH alone fails in prod — the live engine forfeited
 * move 1 that way once (room 81e7b246), and the fog analyzer failed its first
 * production run the same way.
 *
 * One definition on purpose: this was copied into python-pool and engine-runner,
 * and a third copy was about to be written for the analysis spawn. Any caller
 * spawning engine Python must export the result as FOW_STOCKFISH.
 */
export function defaultStockfishPath(): string | undefined {
  for (const candidate of [
    '/usr/games/stockfish',
    '/usr/bin/stockfish',
    '/opt/homebrew/bin/stockfish',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** The resolved Stockfish path, honouring the env overrides the live pool uses. */
export function resolveStockfishPath(): string | undefined {
  return (
    process.env.PYTHON_ENGINE_STOCKFISH_PATH ?? process.env.STOCKFISH_PATH ?? defaultStockfishPath()
  );
}
