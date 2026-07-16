import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type Color,
  type EngineTurnRequest,
  type GameEvent,
  type Move,
  type PieceLetter,
  replayGameEvents,
  type SquareIndex,
  variantForId,
} from '@mistboard/game';
import { squareIndex } from '../engine-protocol/build.js';
import {
  type ArbiterConfig,
  type ArbiterMoveProvider,
  movesEqual,
  runArbiterGame,
} from './arbiter.js';

const SECRET = 'test-engine-secret';
const STARTED_AT = 1_000_000;

// ---- deterministic fake engines (all receive ONLY the redacted request) ----

function latestObs(req: EngineTurnRequest) {
  const t = req.observationTranscript;
  if (t && t.length > 0) return t[t.length - 1]!;
  if (req.latestObservationDelta) return req.latestObservationDelta;
  throw new Error('request carried no observation');
}

const PIECE_VALUE: Partial<Record<PieceLetter, number>> = { K: 100, Q: 9, R: 5, B: 3, N: 3, P: 1 };

/** Always plays legalMoves[0]. A fixed, weak policy. */
function firstLegal(thinkTimeMs = 1): ArbiterMoveProvider {
  return async (req) => ({ move: req.legalMoves[0]!, thinkTimeMs });
}

/** Prefers capturing the most valuable visible opponent piece (king first). Stronger than firstLegal. */
function greedyCapture(thinkTimeMs = 1): ArbiterMoveProvider {
  return async (req) => {
    const obs = latestObs(req);
    const opp: Color = req.color === 'white' ? 'black' : 'white';
    const visible = new Map<SquareIndex, { type: PieceLetter; color: Color }>();
    for (const [idx, piece] of obs.visible_pieces) visible.set(idx, piece);
    let best = req.legalMoves[0]!;
    let bestScore = -1;
    for (const m of req.legalMoves) {
      const target = visible.get(squareIndex(m.to));
      const score = target && target.color === opp ? (PIECE_VALUE[target.type] ?? 1) : 0;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return { move: best, thinkTimeMs };
  };
}

/** Never captures a visible opponent piece (keeps games going). */
function pacifist(thinkTimeMs = 1): ArbiterMoveProvider {
  return async (req) => {
    const obs = latestObs(req);
    const opp: Color = req.color === 'white' ? 'black' : 'white';
    const oppSquares = new Set(
      obs.visible_pieces.filter(([, p]) => p.color === opp).map(([idx]) => idx),
    );
    const quiet = req.legalMoves.find((m) => !oppSquares.has(squareIndex(m.to)));
    return { move: quiet ?? req.legalMoves[0]!, thinkTimeMs };
  };
}

/** Returns a move that is never legal (from === to). */
function illegalMove(): ArbiterMoveProvider {
  return async () => ({ move: { from: 'a1', to: 'a1' } as Move, thinkTimeMs: 1 });
}

/** Throws — simulates a dead / broken bot endpoint. */
function throwing(): ArbiterMoveProvider {
  return async () => {
    throw new Error('boom');
  };
}

/** Plays a legal move but claims to have spent `thinkTimeMs` — used to trip the clock. */
function slowFlag(thinkTimeMs: number): ArbiterMoveProvider {
  return async (req) => ({ move: req.legalMoves[0]!, thinkTimeMs });
}

/** Wraps a provider to record every request it is handed. */
function recording(inner: ArbiterMoveProvider): {
  provider: ArbiterMoveProvider;
  requests: EngineTurnRequest[];
} {
  const requests: EngineTurnRequest[] = [];
  const provider: ArbiterMoveProvider = async (req, ctx) => {
    requests.push(req);
    return inner(req, ctx);
  };
  return { provider, requests };
}

function baseConfig(overrides: Partial<ArbiterConfig> = {}): ArbiterConfig {
  return {
    gameId: 'test-game',
    engineSecret: SECRET,
    startedAtMs: STARTED_AT,
    white: { engineId: 'white-engine', provider: firstLegal() },
    black: { engineId: 'black-engine', provider: firstLegal() },
    ...overrides,
  };
}

// ---- tests ----

test('plays a full untimed game to a valid terminal outcome', async () => {
  const result = await runArbiterGame(
    baseConfig({
      white: { engineId: 'w', provider: greedyCapture() },
      black: { engineId: 'b', provider: pacifist() },
    }),
  );
  assert.ok(
    ['king-captured', 'draw', 'no-legal-moves', 'truncated'].includes(result.outcome),
    `unexpected outcome ${result.outcome}`,
  );
  assert.ok(result.plyCount <= 200);
  // Final replayed state agrees with the reported winner.
  const finalState = replayGameEvents(result.events).state;
  if (result.outcome === 'king-captured') {
    assert.equal(finalState.status.type, 'finished');
    assert.equal(result.winner !== null, true);
  }
});

test('move-played events strictly alternate white, black, white, ...', async () => {
  const result = await runArbiterGame(
    baseConfig({ white: { engineId: 'w', provider: greedyCapture() } }),
  );
  const colors = result.events
    .filter((e): e is Extract<GameEvent, { type: 'move-played' }> => e.type === 'move-played')
    .map((e) => e.color);
  for (let i = 0; i < colors.length; i++) {
    assert.equal(colors[i], i % 2 === 0 ? 'white' : 'black', `ply ${i} wrong mover`);
  }
});

test('same config is fully deterministic across repeated runs', async () => {
  const cfg = baseConfig({
    white: { engineId: 'w', provider: greedyCapture() },
    black: { engineId: 'b', provider: firstLegal() },
  });
  const a = await runArbiterGame(cfg);
  const b = await runArbiterGame(cfg);
  assert.equal(a.winner, b.winner);
  assert.equal(a.outcome, b.outcome);
  assert.equal(a.plyCount, b.plyCount);
  assert.deepEqual(a.events, b.events);
});

test('stronger policy does at least as well as the weaker one (deterministic oracle)', async () => {
  let greedyWins = 0;
  let firstWins = 0;
  let decisive = 0;
  for (const greedyColor of ['white', 'black'] as const) {
    const result = await runArbiterGame(
      baseConfig({
        gameId: `oracle-${greedyColor}`,
        white: {
          engineId: 'w',
          provider: greedyColor === 'white' ? greedyCapture() : firstLegal(),
        },
        black: {
          engineId: 'b',
          provider: greedyColor === 'black' ? greedyCapture() : firstLegal(),
        },
      }),
    );
    if (result.winner === greedyColor) greedyWins++;
    else if (result.winner && result.winner !== greedyColor) firstWins++;
    if (result.winner !== null) decisive++;
  }
  // The stronger side must never do WORSE than the weaker side. If this flips,
  // the harness is leaking to / handicapping a side — the exact failure the
  // real v1.5-vs-v1.1 oracle is meant to catch.
  assert.ok(greedyWins >= firstWins, `greedy ${greedyWins} < first ${firstWins}`);
  assert.ok(decisive >= 1, 'expected at least one decisive game');
});

test('illegal move forfeits the game for the offending seat', async () => {
  const result = await runArbiterGame(
    baseConfig({ white: { engineId: 'w', provider: illegalMove() } }),
  );
  assert.equal(result.outcome, 'illegal-move-forfeit');
  assert.equal(result.forfeitedBy, 'white');
  assert.equal(result.winner, 'black');
  assert.equal(result.plyCount, 0);
});

test('a throwing / dead endpoint forfeits, does not crash the arbiter', async () => {
  const result = await runArbiterGame(
    baseConfig({ black: { engineId: 'b', provider: throwing() } }),
  );
  assert.equal(result.outcome, 'provider-error-forfeit');
  assert.equal(result.forfeitedBy, 'black');
  assert.equal(result.winner, 'white');
  assert.match(result.detail ?? '', /boom/);
});

test('a seat that overspends its clock loses on time', async () => {
  const result = await runArbiterGame(
    baseConfig({
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      white: { engineId: 'w', provider: slowFlag(999_999) },
    }),
  );
  assert.equal(result.outcome, 'clock-expired');
  assert.equal(result.forfeitedBy, 'white');
  assert.equal(result.winner, 'black');
  assert.equal(result.events[result.events.length - 1]?.type, 'clock-expired');
});

test('a game that reaches maxPlies without a capture truncates as a draw', async () => {
  const result = await runArbiterGame(
    baseConfig({
      maxPlies: 4,
      white: { engineId: 'w', provider: pacifist() },
      black: { engineId: 'b', provider: pacifist() },
    }),
  );
  assert.equal(result.outcome, 'truncated');
  assert.equal(result.winner, null);
  assert.equal(result.plyCount, 4);
});

test('SAFETY: the request never leaks opponent hidden pieces (fog redaction at the boundary)', async () => {
  const whiteRec = recording(greedyCapture());
  const blackRec = recording(pacifist());
  const result = await runArbiterGame(
    baseConfig({
      white: { engineId: 'w', provider: whiteRec.provider },
      black: { engineId: 'b', provider: blackRec.provider },
    }),
  );

  const rules = variantForId('dark-chess');
  const baseEvents = result.events.filter((e) => e.type !== 'move-played');
  const moveEvents = result.events.filter(
    (e): e is Extract<GameEvent, { type: 'move-played' }> => e.type === 'move-played',
  );

  let sawHiddenOpponent = false;

  for (const [color, rec] of [['white', whiteRec] as const, ['black', blackRec] as const]) {
    for (const req of rec.requests) {
      // Reconstruct canonical truth just before this request's ply.
      const stateBefore = replayGameEvents([...baseEvents, ...moveEvents.slice(0, req.ply)]).state;

      const trueVisible = new Set(
        rules.getPlayerView(stateBefore, color).visibleSquares.map((sq) => squareIndex(sq)),
      );
      const reqVisible = maskToIndexSet(latestObs(req).visibility_mask);

      // The request's visibility mask must EXACTLY equal the perspective's true
      // visible squares — no more (leak), no fewer (would break legal play).
      assert.deepEqual(
        [...reqVisible].sort((a, b) => a - b),
        [...trueVisible].sort((a, b) => a - b),
        `${color} visibility mismatch at ply ${req.ply}`,
      );

      // Every piece the request reveals must sit on a truly-visible square.
      for (const [idx] of latestObs(req).visible_pieces) {
        assert.ok(trueVisible.has(idx), `${color} shown a piece on hidden square ${idx}`);
      }

      // Confirm the test is non-vacuous: at some ply the opponent really does
      // have a piece the perspective cannot see, and it is absent from the req.
      const opp: Color = color === 'white' ? 'black' : 'white';
      for (const [sq, piece] of Object.entries(stateBefore.board) as Array<
        [string, { color: Color } | null]
      >) {
        if (piece && piece.color === opp && !trueVisible.has(squareIndex(sq as never))) {
          sawHiddenOpponent = true;
          const shown = latestObs(req).visible_pieces.some(([i]) => i === squareIndex(sq as never));
          assert.equal(shown, false, `leaked hidden ${opp} piece at ${sq} to ${color}`);
        }
      }
    }
  }
  assert.ok(sawHiddenOpponent, 'test vacuous: no hidden opponent piece ever occurred');
  assert.ok(result.plyCount > 0);
});

test('SAFETY: only whitelisted protocol fields are ever sent to a provider', async () => {
  const rec = recording(greedyCapture());
  await runArbiterGame(baseConfig({ white: { engineId: 'w', provider: rec.provider } }));

  const allowed = new Set([
    'protocolVersion',
    'gameId',
    'engineId',
    'gameSpecId',
    'sessionId',
    'color',
    'ply',
    'engineSeed',
    'clock',
    'legalMoves',
    'observationTranscript',
    'latestObservationDelta',
  ]);
  const forbidden = [
    'state',
    'events',
    'board',
    'engineSecret',
    'seed',
    'masterSeed',
    'positionCounts',
  ];

  assert.ok(rec.requests.length > 0);
  for (const req of rec.requests) {
    for (const key of Object.keys(req)) {
      assert.ok(allowed.has(key), `request leaked non-protocol field: ${key}`);
    }
    for (const key of forbidden) {
      assert.ok(!(key in req), `request carried forbidden field: ${key}`);
    }
  }
});

test('movesEqual treats promotion as part of identity', () => {
  assert.equal(movesEqual({ from: 'e7', to: 'e8' }, { from: 'e7', to: 'e8' }), true);
  assert.equal(
    movesEqual({ from: 'e7', to: 'e8', promotion: 'queen' }, { from: 'e7', to: 'e8' }),
    false,
  );
  assert.equal(
    movesEqual(
      { from: 'e7', to: 'e8', promotion: 'queen' },
      { from: 'e7', to: 'e8', promotion: 'queen' },
    ),
    true,
  );
});

function maskToIndexSet(hex: string): Set<number> {
  const mask = BigInt(hex);
  const set = new Set<number>();
  for (let i = 0; i < 64; i++) {
    if (((mask >> BigInt(i)) & 1n) === 1n) set.add(i);
  }
  return set;
}
