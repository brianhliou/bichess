/**
 * Fog-of-war chess analysis — the engine-worker-side job execution.
 *
 * Spawns the misty engine repo's `scripts/analyze_job.py` (publication JSON
 * on stdin, one `misty-analysis/1` document on stdout). Runs ONLY where the
 * engine repo is provisioned (the engine-worker deployment); the web side
 * reaches it through POST /internal/engine/analyze.
 *
 * Serialization: one analysis job at a time (module-level limiter) so a
 * long analysis can never starve live-move compute of more than one
 * process worth of CPU.
 */

import { spawn } from 'node:child_process';
import { engineDir, enginePython, engineScript, resolveStockfishPath } from './engine-paths.js';
import { logger } from './obs.js';

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_STDOUT_BYTES = 64 * 1024 * 1024;

export type DarkChessAnalysisJobOptions = {
  sfDepth?: number;
  iterations?: number;
  iSample?: number;
  timeBudgetSeconds?: number;
  seat?: 'white' | 'black' | 'both';
  /** Per-ply belief solve. Default on; false passes --no-search (grading only). */
  search?: boolean;
  timeoutMs?: number;
};

let inflight: Promise<unknown> = Promise.resolve();

/** Queue-of-one: chain jobs so at most one analysis subprocess runs. */
export function runDarkChessAnalysisJob(
  publication: unknown,
  options: DarkChessAnalysisJobOptions = {},
): Promise<unknown> {
  const next = inflight.then(
    () => spawnAnalysisJob(publication, options),
    () => spawnAnalysisJob(publication, options),
  );
  inflight = next.catch(() => undefined);
  return next;
}

function spawnAnalysisJob(
  publication: unknown,
  options: DarkChessAnalysisJobOptions,
): Promise<unknown> {
  const args = [engineScript('analyze_job.py')];
  if (options.sfDepth != null) args.push('--sf-depth', String(options.sfDepth));
  if (options.iterations != null) args.push('--iterations', String(options.iterations));
  if (options.iSample != null) args.push('--i-sample', String(options.iSample));
  if (options.timeBudgetSeconds != null)
    args.push('--time-budget', String(options.timeBudgetSeconds));
  if (options.seat) args.push('--seat', options.seat);
  if (options.search === false) args.push('--no-search');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    // Same child setup as the live pool (python-pool.ts). The analyzer's grader
    // resolves Stockfish via FOW_STOCKFISH or PATH, and apt installs the binary
    // at /usr/games/stockfish which is NOT on the container PATH — the live
    // engine forfeited move 1 that way once, and the first production analysis
    // died the same way. cwd matches too, so relative lookups behave alike.
    const stockfishPath = resolveStockfishPath();
    const child = spawn(enginePython(), args, {
      cwd: engineDir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(stockfishPath ? { FOW_STOCKFISH: stockfishPath } : {}),
      },
    });
    let stdout = '';
    let stderrTail = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`analysis job timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > MAX_STDOUT_BYTES) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error('analysis job output exceeded limit'));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const elapsedMs = Date.now() - startedAt;
      if (code !== 0) {
        logger.error(
          { kind: 'dark_chess_analysis_job_failed', code, elapsedMs, stderrTail },
          'dark chess analysis job failed',
        );
        reject(new Error(`analysis job exited ${code}`));
        return;
      }
      try {
        const doc: unknown = JSON.parse(stdout);
        logger.info(
          { kind: 'dark_chess_analysis_job_done', elapsedMs },
          'dark chess analysis job done',
        );
        resolve(doc);
      } catch {
        reject(new Error('analysis job emitted invalid JSON'));
      }
    });

    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(publication));
  });
}
