import assert from 'node:assert/strict';
import test from 'node:test';
import type { EngineObservationPush } from '@mistboard/game';
import { type ArbiterMoveProvider, runArbiterGame } from './arbiter.js';
import { startReferenceBotServer } from './reference-bot-server.js';

const firstLegal: ArbiterMoveProvider = async (request) => ({
  move: request.legalMoves[0]!,
  thinkTimeMs: 1,
});

test('arbiter pushes an own_move observation to the mover after every move', async () => {
  const pushes: EngineObservationPush[] = [];
  const record = async (push: EngineObservationPush): Promise<void> => {
    pushes.push(push);
  };
  const result = await runArbiterGame({
    gameId: 'obs-test',
    engineSecret: 'sec',
    variant: 'dark-chess',
    timeControl: null,
    maxPlies: 8,
    white: { engineId: 'w', provider: firstLegal, observe: record },
    black: { engineId: 'b', provider: firstLegal, observe: record },
  });

  assert.equal(pushes.length, result.plyCount, 'exactly one push per applied move');
  assert.ok(pushes.length >= 2, 'game produced multiple moves');
  for (const push of pushes) {
    assert.equal(push.observation.kind, 'own_move', 'push carries the OWN-move observation');
    assert.equal(push.ply, push.observation.ply, 'push ply matches observation ply');
    assert.ok(push.observation.visibility_mask.startsWith('0x'), 'carries post-move visibility');
    assert.ok(push.observation.own_move, 'own_move observation includes the move');
  }
  // The mover alternates, and the push goes to the side that just moved.
  assert.equal(pushes[0]?.color, 'white');
  assert.equal(pushes[1]?.color, 'black');
});

test('a failing observe push never affects the game (best-effort)', async () => {
  const throwing = async (): Promise<void> => {
    throw new Error('observe endpoint down');
  };
  const result = await runArbiterGame({
    gameId: 'obs-fail',
    engineSecret: 'sec',
    variant: 'dark-chess',
    timeControl: null,
    maxPlies: 8,
    white: { engineId: 'w', provider: firstLegal, observe: throwing },
    black: { engineId: 'b', provider: firstLegal, observe: throwing },
  });
  assert.ok(
    ['king-captured', 'draw', 'truncated', 'no-legal-moves'].includes(result.outcome),
    `game completed normally, got ${result.outcome}`,
  );
  assert.equal(result.forfeitedBy, undefined, 'a failed push does not forfeit');
});

test('reference bot acks an observation push and forwards it to onObserve', async () => {
  const seen: EngineObservationPush[] = [];
  const bot = await startReferenceBotServer({
    port: 0,
    token: 'tok',
    onObserve: (push) => seen.push(push),
  });
  const push: EngineObservationPush = {
    protocolVersion: '1',
    gameId: 'g',
    engineId: 'e',
    sessionId: 's',
    color: 'white',
    ply: 1,
    observation: {
      ply: 1,
      kind: 'own_move',
      own_move: { from: 'e2', to: 'e4' },
      visibility_mask: '0x0',
      visible_pieces: [],
      own_capture_square: null,
      opp_capture_landing_square: null,
      game_over: null,
    },
  };
  try {
    const ok = await fetch(`${bot.url}/internal/engine/observe`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: JSON.stringify(push),
    });
    assert.equal(ok.status, 200);
    const ack = (await ok.json()) as { received: boolean; gameId: string };
    assert.equal(ack.received, true);
    assert.equal(ack.gameId, 'g');
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.observation.kind, 'own_move');

    // Wrong token is rejected on the observe route too.
    const bad = await fetch(`${bot.url}/internal/engine/observe`, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
      body: JSON.stringify(push),
    });
    assert.equal(bad.status, 401);
    await bad.text();
  } finally {
    await bot.close();
  }
});
