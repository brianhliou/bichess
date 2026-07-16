/**
 * Local self-test oracle: real Misty (live active engine) vs a retired Misty,
 * both served by an in-process engine-worker over the redacted protocol.
 *
 * This is the dogfood that must pass before we ever point a stranger's bot at
 * us: it exercises the whole arbiter + transport + engine-worker path with real
 * engines, and gives a built-in correctness check — the newer engine should win
 * the clear majority. If the retired engine wins, the flow is leaking or
 * handicapping the live side.
 *
 * Run (from apps/server):
 *   MISTBOARD_ENGINE_DIR=/abs/path/mistboard-engine \
 *   FOW_STOCKFISH=$(which stockfish) \
 *   BOTMATCH_GAMES=4 npx tsx src/bot-match/self-test-oracle.ts
 *
 * Env knobs: BOTMATCH_GAMES, BOTMATCH_BUDGET_MS, BOTMATCH_MAXPLIES,
 * BOTMATCH_LIVE_ENGINE, BOTMATCH_THREEP_ENGINE, BOTMATCH_PORT.
 */
import { variantForId } from '@mistboard/game';
import { buildEngineTurnRequest } from '../engine-protocol/build.js';
import { startEngineHttpService } from '../engine-service.js';
import type { EngineTimePolicy } from '../fow-engine-budget.js';
import {
  type EngineEndpoint,
  releaseEngineReservationAt,
  requestEngineReservationAt,
  requestEngineTurnAt,
} from '../internal-engine-client.js';
import { runBotMatchSeries } from './run-match.js';

const ENGINE_SECRET = 'oracle-secret';
const log = (msg: string) => {
  // eslint-disable-next-line no-console
  console.log(msg);
};

async function probeOneMove(
  endpoint: EngineEndpoint,
  engineId: string,
  watchdogMs: number,
): Promise<void> {
  const reservation = await requestEngineReservationAt(endpoint, { color: 'white', engineId });
  try {
    const state = variantForId('dark-chess').createInitialState('probe');
    const request = buildEngineTurnRequest({
      gameId: 'probe',
      engineId,
      engineSecret: ENGINE_SECRET,
      engineColor: 'white',
      state,
      events: [],
      ply: 0,
      cold: true,
    });
    const t0 = Date.now();
    const res = await requestEngineTurnAt(endpoint, request, watchdogMs, {
      computeBudgetMs: 800,
      reservationId: reservation.reservationId,
    });
    log(`  probe ${engineId}: ${res.move.from}${res.move.to} in ${Date.now() - t0}ms`);
  } finally {
    await releaseEngineReservationAt(endpoint, reservation.reservationId, 'probe-done').catch(
      () => {},
    );
  }
}

async function main(): Promise<void> {
  const token = 'local-oracle-token';
  const port = Number(process.env.BOTMATCH_PORT ?? 7801);
  const games = Number(process.env.BOTMATCH_GAMES ?? 2);
  const budgetMs = Number(process.env.BOTMATCH_BUDGET_MS ?? 700);
  const maxPlies = Number(process.env.BOTMATCH_MAXPLIES ?? 120);
  const liveEngine = process.env.BOTMATCH_LIVE_ENGINE ?? 'python-v2-v1.5';
  const threepEngine = process.env.BOTMATCH_THREEP_ENGINE ?? 'python-v2-v1.1';
  const watchdogMs = 120_000; // generous: covers cold torch/weights load on first move
  // A real clock is REQUIRED for the engine to actually search: untimed sends
  // clock.remaining_ms = null, which the engine treats as an emergency and
  // returns an instant deadline-guard move (no search). BOTMATCH_TC like "180+2"
  // or "30+1" gives a real clock and the live per-move budget rule.
  // Default to a REAL 3+2 clock. Below a multi-second budget the engine falls
  // back to instant deadline-guard moves (no search) and plays nothing like its
  // live strength — verified 2026-07-11: at 700ms-3.5s every move was an instant
  // guard; at 3+2 (12s) it ran ~2.3M search iters/move. Pass BOTMATCH_TC=none to
  // force untimed (only for plumbing checks, never for a strength read).
  const tcRaw = process.env.BOTMATCH_TC ?? '180+2';
  const tcMatch = tcRaw.match(/^(\d+)\+(\d+)$/);
  const timeControl = tcMatch
    ? { initialMs: Number(tcMatch[1]) * 1000, incrementMs: Number(tcMatch[2]) * 1000 }
    : null;
  // 'self-managed' (default): engine's ceiling = its whole clock; arbiter flags on
  // total clock. 'live-cap': reproduce live PvE's tight per-move cap exactly.
  const timePolicy: EngineTimePolicy =
    process.env.BOTMATCH_POLICY === 'live-cap' ? 'live-cap' : 'self-managed';

  process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN ??= token;

  log(`starting engine-worker on 127.0.0.1:${port} ...`);
  const service = await startEngineHttpService({ port, token, host: '127.0.0.1', poolSize: 2 });
  const endpoint: EngineEndpoint = { baseUrl: `http://127.0.0.1:${service.port}`, token };

  try {
    log('probing both engines (cold start loads torch + weights)...');
    await probeOneMove(endpoint, liveEngine, watchdogMs);
    await probeOneMove(endpoint, threepEngine, watchdogMs);

    const timeLabel = timeControl
      ? `${timeControl.initialMs / 1000}+${timeControl.incrementMs / 1000} (real clock)`
      : `untimed ${budgetMs}ms/move (WARNING: engine may not search)`;
    log(
      `\nrunning ${games} games: ${liveEngine} (live) vs ${threepEngine} (3P), ${timeLabel}, policy=${timePolicy}\n`,
    );
    let searchMoves = 0;
    let guardMoves = 0;
    const report = await runBotMatchSeries({
      a: { label: liveEngine, engineId: liveEngine, endpoint },
      b: { label: threepEngine, engineId: threepEngine, endpoint },
      games,
      engineSecret: ENGINE_SECRET,
      timeControl,
      timePolicy,
      untimedBudgetMs: budgetMs,
      untimedWatchdogMs: watchdogMs,
      maxPlies,
      manageReservations: true,
      gameIdPrefix: 'oracle',
      onMove: (info) => {
        if (info.diagnostics?.decisionSource === 'deadline-guard') guardMoves += 1;
        else searchMoves += 1;
      },
      onGameEnd: (i, r, whiteLabel, blackLabel) => {
        const winner =
          r.winner === 'white' ? whiteLabel : r.winner === 'black' ? blackLabel : 'draw';
        log(
          `  game ${i + 1}/${games}: ${whiteLabel}(W) vs ${blackLabel}(B) -> ${winner} [${r.outcome}, ${r.plyCount} plies]`,
        );
      },
    });

    const liveWins = report.wins[liveEngine] ?? 0;
    const threepWins = report.wins[threepEngine] ?? 0;
    log('\n==== oracle result ====');
    log(`${liveEngine} (live): ${liveWins}`);
    log(`${threepEngine} (3P):  ${threepWins}`);
    log(
      `draws: ${report.draws}  forfeits: ${report.forfeits}  clock-losses: ${report.clockLosses}`,
    );
    const totalMoves = searchMoves + guardMoves;
    const guardPct = totalMoves > 0 ? Math.round((guardMoves / totalMoves) * 100) : 0;
    log(`search moves: ${searchMoves}  instant-guard moves: ${guardMoves} (${guardPct}%)`);
    if (guardPct > 40) {
      log(
        `WARNING: ${guardPct}% of moves were instant deadline-guard (no search). The engine is ` +
          `NOT playing at strength — the compute budget is too low. Use a real clock (3+2); ` +
          `this result is meaningless as a strength read.`,
      );
    }
    log(
      liveWins >= threepWins
        ? `PASS shape: live >= 3P (${liveWins} >= ${threepWins}). Flow is not handicapping the live side.`
        : `INVESTIGATE: 3P beat live (${threepWins} > ${liveWins}) — possible leak/handicap or too few games.`,
    );
  } finally {
    await service.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
