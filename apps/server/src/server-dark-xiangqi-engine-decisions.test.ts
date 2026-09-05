/**
 * Dark Xiangqi engine-decision artifacts: the write side.
 *
 * Dark Xiangqi was the only PvE surface that queued NO artifacts, so answering
 * "why did the bot play that" meant reconstructing per-ply timings from Railway
 * logs. These pin the queue's shape and its cap.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_ENGINE_DECISION_ARTIFACT_TYPE } from './persistence-game-lifecycle.js';
import { queueDarkXiangqiEngineDecision } from './server-dark-xiangqi-engine.js';

type QueueRoom = Parameters<typeof queueDarkXiangqiEngineDecision>[0];

function room(id = 'dxq_queue'): QueueRoom {
  return { id } as QueueRoom;
}

test('engine decisions: a queued decision carries ply, type and the payload', () => {
  const r = room();
  queueDarkXiangqiEngineDecision(r, { ply: 7, move: 'h4i4', diagnostics: { beliefSize: 440 } });

  assert.equal(r.pendingDebugArtifacts?.length, 1);
  const queued = r.pendingDebugArtifacts?.[0];
  assert.equal(queued?.gameId, 'dxq_queue');
  assert.equal(queued?.ply, 7);
  assert.equal(queued?.artifactType, LIVE_ENGINE_DECISION_ARTIFACT_TYPE);
  // A dxq seat is red/black, but engineColor is typed to chess colours, so the
  // seat rides in the payload and the column stays null.
  assert.equal(queued?.engineColor, null);
  assert.deepEqual(queued?.payload, {
    ply: 7,
    move: 'h4i4',
    diagnostics: { beliefSize: 440 },
  });
});

test('engine decisions: a non-numeric ply degrades to null rather than throwing', () => {
  const r = room();
  queueDarkXiangqiEngineDecision(r, { move: 'h4i4' });
  assert.equal(r.pendingDebugArtifacts?.[0]?.ply, null);
});

test('engine decisions: the queue is capped, keeping the oldest', () => {
  const r = room();
  for (let ply = 0; ply < 450; ply += 1) {
    queueDarkXiangqiEngineDecision(r, { ply });
  }
  assert.equal(r.pendingDebugArtifacts?.length, 400, 'queue is capped');
  assert.equal(r.pendingDebugArtifacts?.[0]?.ply, 0, 'oldest decisions are the ones kept');
  assert.equal(r.pendingDebugArtifacts?.[399]?.ply, 399);
});
