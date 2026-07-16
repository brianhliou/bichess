/**
 * Bot-match series runner + CLI.
 *
 * Plays N games between two engines reached over HTTP (the redacted protocol),
 * alternating colors each game for fairness, and reports a win/draw/forfeit
 * tally. This is the harness for the local self-test (live Misty v1.5 vs
 * stand-in Misty v1.1) and, by swapping one endpoint, the real external match.
 *
 * Bot-match games are EXPENSIVE to produce (minutes of real engine search) and
 * trivial to store, so every series persists each finished game's event log to
 * disk by default, INCREMENTALLY — the moment that game completes, not at the
 * end. An external kill or crash then loses at most the single in-flight game;
 * everything already finished is already on disk and replayable. Pass
 * `persistDir: null` to opt a caller out (e.g. a hermetic unit test).
 *
 * CLI:
 *   tsx src/bot-match/run-match.ts \
 *     --live-url  http://127.0.0.1:7801 --live-token  A --live-engine  python-v2-v1.5 \
 *     --threep-url http://127.0.0.1:7802 --threep-token B --threep-engine python-v2-v1.1 \
 *     --games 20 --time-control 180+2 --max-plies 200
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEngineTimeControl } from '../engine-time-policy.js';
import type { EngineTimePolicy } from '../fow-engine-budget.js';
import {
  type EngineEndpoint,
  releaseEngineReservationAt,
  requestEngineReservationAt,
} from '../internal-engine-client.js';
import { type ArbiterResult, runArbiterGame } from './arbiter.js';
import { assertSafeExternalEndpoint } from './endpoint-guard.js';
import { httpMoveProvider, httpObserveSink } from './http-move-provider.js';

export type SeriesEngine = {
  label: string;
  engineId: string;
  endpoint: EngineEndpoint;
  /**
   * True for an UNTRUSTED third-party endpoint (not our own worker). External
   * endpoints are SSRF-checked before the series (https + public IP only) and
   * their response `diagnostics` are dropped. Our own worker / self-test seats
   * leave this false.
   */
  external?: boolean;
};

export type SeriesConfig = {
  a: SeriesEngine;
  b: SeriesEngine;
  games: number;
  engineSecret: string;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  /** Per-move budget policy (see fow-engine-budget.ts). Defaults to arbiter's 'self-managed'. */
  timePolicy?: EngineTimePolicy;
  maxPlies?: number;
  /** Per-move think budget when untimed (ms). */
  untimedBudgetMs?: number;
  /** Hard per-move deadline when untimed (ms) — widen for cold engine starts. */
  untimedWatchdogMs?: number;
  gameIdPrefix?: string;
  startedAtMs?: number;
  /**
   * Where to write per-game replay JSONL + an index.json.
   *   - undefined (default): a fresh dir under `botmatch-runs/` (or
   *     $BOTMATCH_RUNS_DIR) — persistence is ON by default so an expensive run
   *     can never silently produce nothing.
   *   - a string: write there.
   *   - null: disable persistence (hermetic tests).
   */
  persistDir?: string | null;
  /** Sub-directory label under the default runs root (defaults to `<prefix>-<stamp>`). */
  runLabel?: string;
  /**
   * Skip the SSRF guard on `external` endpoints. ONLY for local testing against
   * a private/loopback endpoint (e.g. a reference bot on 127.0.0.1). Never set
   * this when pointing at a real third party.
   */
  allowInsecureEndpoints?: boolean;
  /**
   * Acquire an engine-worker reservation per seat per game (required by the
   * real engine-worker; not needed for the reference bot). Released after each
   * game so only two seats are ever live at once.
   */
  manageReservations?: boolean;
  onGameEnd?: (
    index: number,
    result: ArbiterResult,
    whiteLabel: string,
    blackLabel: string,
  ) => void;
  /** Per-move observer (forwarded to the arbiter) — e.g. to tally decision sources. */
  onMove?: (info: {
    ply: number;
    color: 'white' | 'black';
    engineId: string;
    thinkTimeMs: number;
    diagnostics?: Record<string, unknown>;
  }) => void;
};

export type SeriesReport = {
  games: number;
  wins: Record<string, number>;
  draws: number;
  forfeits: number;
  clockLosses: number;
  results: ArbiterResult[];
  /** Directory the game artifacts were written to (null if persistence disabled). */
  persistDir: string | null;
  /** One entry per successfully persisted game, in play order. */
  artifacts: { gameId: string; file: string }[];
  /** Non-fatal persistence failures (a write error never aborts the series). */
  persistErrors: string[];
};

const FORFEIT_OUTCOMES = new Set(['illegal-move-forfeit', 'provider-error-forfeit']);

// ---- durable artifacts (persist-by-default) ----

export type SeriesIndexEntry = {
  gameId: string;
  file: string;
  variant: string;
  winner: 'white' | 'black' | null;
  outcome: string;
  plyCount: number;
  whiteEngineId: string;
  blackEngineId: string;
  forfeitedBy?: 'white' | 'black';
};

/** Strip an id down to what the `?replay=<id>` viewer accepts as a filename. */
export function replaySafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

function defaultRunsRoot(): string {
  const fromEnv = process.env.BOTMATCH_RUNS_DIR?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : resolve(process.cwd(), 'botmatch-runs');
}

/** Resolve the directory a series writes its game artifacts to (null = disabled). */
export function resolveSeriesRunDir(
  cfg: Pick<SeriesConfig, 'persistDir' | 'gameIdPrefix' | 'runLabel'>,
  stamp: number,
): string | null {
  if (cfg.persistDir === null) return null;
  if (typeof cfg.persistDir === 'string') return cfg.persistDir;
  const label = cfg.runLabel ?? `${cfg.gameIdPrefix ?? 'botmatch'}-${stamp}`;
  return resolve(defaultRunsRoot(), label);
}

/**
 * Write one finished game's events as replay-viewer JSONL (one event per line).
 * The filename is `<replaySafeId(gameId)>.jsonl`, so the file can be dropped
 * straight into `apps/web/public/replay-samples/` and opened with `?replay=`.
 */
export function writeSeriesGameArtifact(dir: string, result: ArbiterResult): string {
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${replaySafeId(result.gameId)}.jsonl`);
  writeFileSync(file, `${result.events.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return file;
}

export function writeSeriesIndex(
  dir: string,
  meta: Record<string, unknown>,
  entries: SeriesIndexEntry[],
): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, 'index.json'),
    `${JSON.stringify({ ...meta, games: entries }, null, 2)}\n`,
  );
}

function indexEntryFor(result: ArbiterResult, file: string): SeriesIndexEntry {
  return {
    gameId: result.gameId,
    file,
    variant: result.variant,
    winner: result.winner,
    outcome: result.outcome,
    plyCount: result.plyCount,
    whiteEngineId: result.whiteEngineId,
    blackEngineId: result.blackEngineId,
    ...(result.forfeitedBy ? { forfeitedBy: result.forfeitedBy } : {}),
  };
}

export async function runBotMatchSeries(cfg: SeriesConfig): Promise<SeriesReport> {
  const report: SeriesReport = {
    games: 0,
    wins: { [cfg.a.label]: 0, [cfg.b.label]: 0 },
    draws: 0,
    forfeits: 0,
    clockLosses: 0,
    results: [],
    persistDir: null,
    artifacts: [],
    persistErrors: [],
  };
  const prefix = cfg.gameIdPrefix ?? 'botmatch';

  // SSRF guard: before pointing the arbiter at any UNTRUSTED endpoint, require
  // https + a public address. Overridable only for local testing.
  if (!cfg.allowInsecureEndpoints) {
    for (const engine of [cfg.a, cfg.b]) {
      if (engine.external) await assertSafeExternalEndpoint(engine.endpoint.baseUrl);
    }
  }

  const runStamp = cfg.startedAtMs ?? Date.now();
  const runDir = resolveSeriesRunDir(cfg, runStamp);
  report.persistDir = runDir;
  const indexMeta: Record<string, unknown> = {
    engineA: { label: cfg.a.label, engineId: cfg.a.engineId },
    engineB: { label: cfg.b.label, engineId: cfg.b.engineId },
    plannedGames: cfg.games,
    timeControl: cfg.timeControl ?? null,
    timePolicy: cfg.timePolicy ?? 'self-managed',
    runStamp,
  };
  const indexEntries: SeriesIndexEntry[] = [];

  for (let i = 0; i < cfg.games; i++) {
    // Alternate colors so each engine plays white and black equally.
    const white = i % 2 === 0 ? cfg.a : cfg.b;
    const black = i % 2 === 0 ? cfg.b : cfg.a;

    let whiteReservation: string | undefined;
    let blackReservation: string | undefined;
    if (cfg.manageReservations) {
      whiteReservation = (
        await requestEngineReservationAt(white.endpoint, {
          color: 'white',
          engineId: white.engineId,
        })
      ).reservationId;
      blackReservation = (
        await requestEngineReservationAt(black.endpoint, {
          color: 'black',
          engineId: black.engineId,
        })
      ).reservationId;
    }

    let result: ArbiterResult;
    try {
      result = await runArbiterGame({
        gameId: `${prefix}-${i}`,
        engineSecret: cfg.engineSecret,
        timeControl: cfg.timeControl ?? null,
        timePolicy: cfg.timePolicy,
        maxPlies: cfg.maxPlies,
        untimedBudgetMs: cfg.untimedBudgetMs,
        untimedWatchdogMs: cfg.untimedWatchdogMs,
        startedAtMs: cfg.startedAtMs,
        white: {
          engineId: white.engineId,
          provider: httpMoveProvider(white.endpoint, {
            reservationId: whiteReservation,
            trustDiagnostics: !white.external,
          }),
          observe: httpObserveSink(white.endpoint),
        },
        black: {
          engineId: black.engineId,
          provider: httpMoveProvider(black.endpoint, {
            reservationId: blackReservation,
            trustDiagnostics: !black.external,
          }),
          observe: httpObserveSink(black.endpoint),
        },
        onMove: cfg.onMove
          ? (info) =>
              cfg.onMove?.({
                ply: info.ply,
                color: info.color,
                engineId: info.engineId,
                thinkTimeMs: info.thinkTimeMs,
                diagnostics: info.diagnostics as Record<string, unknown> | undefined,
              })
          : undefined,
      });
    } finally {
      if (whiteReservation) {
        await releaseEngineReservationAt(white.endpoint, whiteReservation, 'game-ended').catch(
          () => {},
        );
      }
      if (blackReservation) {
        await releaseEngineReservationAt(black.endpoint, blackReservation, 'game-ended').catch(
          () => {},
        );
      }
    }

    report.games += 1;
    report.results.push(result);
    if (result.winner === 'white') report.wins[white.label] = (report.wins[white.label] ?? 0) + 1;
    else if (result.winner === 'black')
      report.wins[black.label] = (report.wins[black.label] ?? 0) + 1;
    else report.draws += 1;
    if (FORFEIT_OUTCOMES.has(result.outcome)) report.forfeits += 1;
    if (result.outcome === 'clock-expired') report.clockLosses += 1;

    // Persist THIS game before touching the next one. A write failure is
    // non-fatal — the expensive compute is already done; we don't abort the
    // rest of the series over a disk hiccup.
    if (runDir) {
      try {
        const file = writeSeriesGameArtifact(runDir, result);
        report.artifacts.push({ gameId: result.gameId, file });
        indexEntries.push(indexEntryFor(result, file));
        writeSeriesIndex(runDir, indexMeta, indexEntries);
      } catch (err) {
        report.persistErrors.push(
          `${result.gameId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    cfg.onGameEnd?.(i, result, white.label, black.label);
  }
  return report;
}

// ---- CLI ----

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const req = (flag: string): string => {
    const v = argOf(args, flag);
    if (v === undefined) throw new Error(`missing required flag ${flag}`);
    return v;
  };

  const engineSecret = process.env.MISTBOARD_ENGINE_SECRET ?? argOf(args, '--engine-secret');
  if (!engineSecret) {
    throw new Error(
      'set MISTBOARD_ENGINE_SECRET (recommended: the prod value for live-identical play) or pass --engine-secret',
    );
  }

  const tc = parseEngineTimeControl(argOf(args, '--time-control') ?? 'none');
  const timeControl =
    tc.kind === 'standard'
      ? {
          initialMs: Math.round(tc.initial_seconds * 1000),
          incrementMs: Math.round(tc.increment_seconds * 1000),
        }
      : null;

  const a: SeriesEngine = {
    label: req('--live-engine'),
    engineId: req('--live-engine'),
    endpoint: { baseUrl: req('--live-url'), token: req('--live-token') },
  };
  const b: SeriesEngine = {
    label: req('--threep-engine'),
    engineId: req('--threep-engine'),
    endpoint: { baseUrl: req('--threep-url'), token: req('--threep-token') },
    // The third-party seat is untrusted: SSRF-checked + diagnostics dropped.
    external: true,
  };
  const games = Number(argOf(args, '--games') ?? 10);
  const maxPlies = Number(argOf(args, '--max-plies') ?? 200);
  const timePolicy: EngineTimePolicy =
    argOf(args, '--time-policy') === 'live-cap' ? 'live-cap' : 'self-managed';
  // Persistence is on by default; --no-persist opts out, --persist-dir overrides.
  const persistDir = args.includes('--no-persist') ? null : argOf(args, '--persist-dir');
  // Local-testing escape hatch for the SSRF guard (e.g. a reference bot on
  // 127.0.0.1). Never pass this against a real third party.
  const allowInsecureEndpoints = args.includes('--allow-insecure-endpoint');

  // eslint-disable-next-line no-console
  const log = (msg: string) => console.log(msg);
  log(
    `bot-match: ${a.label} vs ${b.label}, ${games} games, tc=${timeControl ? `${timeControl.initialMs / 1000}+${timeControl.incrementMs / 1000}` : 'none'}`,
  );

  const report = await runBotMatchSeries({
    a,
    b,
    games,
    engineSecret,
    timeControl,
    timePolicy,
    maxPlies,
    persistDir,
    allowInsecureEndpoints,
    manageReservations: true,
    onGameEnd: (i, r, whiteLabel, blackLabel) => {
      const winnerLabel =
        r.winner === 'white' ? whiteLabel : r.winner === 'black' ? blackLabel : 'draw';
      log(
        `  game ${i + 1}/${games}: ${whiteLabel}(W) vs ${blackLabel}(B) -> ${winnerLabel} [${r.outcome}, ${r.plyCount} plies]`,
      );
    },
  });

  log('');
  log('==== result ====');
  log(`${a.label}: ${report.wins[a.label] ?? 0} wins`);
  log(`${b.label}: ${report.wins[b.label] ?? 0} wins`);
  log(`draws: ${report.draws}  forfeits: ${report.forfeits}  clock-losses: ${report.clockLosses}`);
  const aWins = report.wins[a.label] ?? 0;
  const bWins = report.wins[b.label] ?? 0;
  const decided = aWins + bWins;
  if (decided > 0) {
    log(
      `${a.label} score: ${((aWins / report.games) * 100).toFixed(1)}%  (expected: stronger engine >> 50%)`,
    );
  }

  if (report.persistDir) {
    log('');
    log(`saved ${report.artifacts.length} game(s) to ${report.persistDir}`);
    log(
      'view any game: copy its .jsonl into apps/web/public/replay-samples/ then open /?replay=<id>',
    );
  }
  if (report.persistErrors.length > 0) {
    log(`persist errors (${report.persistErrors.length}): ${report.persistErrors.join('; ')}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
