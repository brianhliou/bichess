/**
 * Fortress Xiangqi PvE: the SUCCESS path records what the engine did.
 *
 * Same gap as banqi's, with one extra thing worth pinning: this loop has an
 * immediate-loss guard that can substitute a different move for the engine's, so
 * the artifact has to carry BOTH — the move played and the move the engine
 * actually wanted. Recording only the played move makes a guard replacement look
 * like the engine's own choice, and then the engine gets blamed for it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialFortressXiangqiState,
  type FortressXiangqiGameState,
  getFortressXiangqiLegalMoves,
} from '@mistboard/game';
import { LIVE_ENGINE_DECISION_ARTIFACT_TYPE } from './persistence-game-lifecycle.js';
import {
  type FortressXiangqiEngineMoveProvider,
  fortressXiangqiMoveToUci,
  playFortressXiangqiEngineMoveIfReady,
} from './server-fortress-xiangqi-engine.js';

const ROOM_ID = 'fx_decisions';
const ENGINE_ID = 'fairy-stockfish-fortress-xiangqi-level-8';

type Appended = { type: string };

function fixture(state: FortressXiangqiGameState) {
  const appended: Appended[] = [];
  const room = {
    id: ROOM_ID,
    events: [],
    projection: {
      state,
      seats: { red: ENGINE_ID, black: 'human-client' },
      clock: null,
    },
  };
  const ctx = {
    appendEvent: async (_room: unknown, event: Appended) => {
      assert.ok(
        (room as { pendingDebugArtifacts?: unknown[] }).pendingDebugArtifacts?.length,
        'the decision must be queued BEFORE the event is appended',
      );
      appended.push(event);
      return appended.length;
    },
    broadcastEventAppended: () => {},
  };
  return { room, ctx, appended };
}

test('fortress: an accepted engine move queues a decision with the budget and the search', async () => {
  const state = createInitialFortressXiangqiState(ROOM_ID);
  const { room, ctx, appended } = fixture(state);
  const move = getFortressXiangqiLegalMoves(state)[0]!;
  const uci = fortressXiangqiMoveToUci(move);
  const provider: FortressXiangqiEngineMoveProvider = async () => ({
    best: uci,
    cp: 21,
    mate: null,
    depth: 22,
    nodes: 803_512,
    timeMs: 2_410,
    pv: [uci],
  });

  await playFortressXiangqiEngineMoveIfReady(ctx as never, room as never, provider);

  assert.deepEqual(
    appended.map((e) => e.type),
    ['move-played'],
  );
  const queued = (room as { pendingDebugArtifacts?: Array<Record<string, unknown>> })
    .pendingDebugArtifacts;
  assert.equal(queued?.length, 1, 'the success path must record a decision');
  assert.equal(queued![0]!.artifactType, LIVE_ENGINE_DECISION_ARTIFACT_TYPE);

  const payload = queued![0]!.payload as Record<string, unknown>;
  assert.equal(payload.variant, 'fortress-xiangqi');
  assert.equal(payload.engine_id, ENGINE_ID);
  assert.equal(payload.engine_seat, 'red');
  assert.equal(payload.ply, 0);
  assert.equal(payload.move, uci);
  assert.equal(payload.engine_move, uci);
  assert.equal(payload.guard_replaced, false);
  assert.equal(payload.failed_closed, false);
  // Nodes reached against nodes configured, and time spent against the ceiling
  // the server handed down: the under-utilisation question, answerable offline.
  assert.equal(payload.movetime_ms, 6_000, 'untimed game gets the tier ceiling');
  assert.equal(payload.tier_nodes, 800_000);
  assert.equal(payload.tier_skill, 20);
  assert.deepEqual(payload.search, {
    depth: 22,
    nodes: 803_512,
    time_ms: 2_410,
    cp: 21,
    mate: null,
    pv: [uci],
  });
});

test('fortress: a rejected-then-accepted move records both attempts', async () => {
  const state = createInitialFortressXiangqiState(ROOM_ID);
  const { room, ctx } = fixture(state);
  const uci = fortressXiangqiMoveToUci(getFortressXiangqiLegalMoves(state)[0]!);
  let call = 0;
  const provider: FortressXiangqiEngineMoveProvider = async () => {
    call += 1;
    // First output is well-formed but not in the kernel's legal set; the guard's
    // retry loop asks again. Both attempts belong in the record.
    return { best: call === 1 ? 'a1a1' : uci, cp: 0, mate: null, depth: 3 };
  };

  await playFortressXiangqiEngineMoveIfReady(ctx as never, room as never, provider);

  const payload = (room as { pendingDebugArtifacts?: Array<{ payload: Record<string, unknown> }> })
    .pendingDebugArtifacts?.[0]?.payload;
  assert.ok(payload);
  assert.equal(payload.attempts, 2);
  assert.equal(payload.move, uci);
  assert.equal(payload.unreachable, false, 'the engine answered; it just answered badly once');
  assert.match(String(payload.attempts_detail), /a1a1/);
});
