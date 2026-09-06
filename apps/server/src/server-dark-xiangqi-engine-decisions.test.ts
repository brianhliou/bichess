/**
 * Dark Xiangqi engine-decision artifacts: the write side.
 *
 * Dark Xiangqi was the only PvE surface that queued NO artifacts, so answering
 * "why did the bot play that" meant reconstructing per-ply timings from Railway
 * logs. The queue itself is shared (variant-tenant/engine-decisions.ts) and its
 * cap/ply behaviour is pinned there; what this file pins is the dxq-specific
 * contract — the seat travels in the payload, and the free-form engine
 * `diagnostics` block is stored verbatim.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_ENGINE_DECISION_ARTIFACT_TYPE } from './persistence-game-lifecycle.js';
import { queueEngineDecision } from './variant-tenant/engine-decisions.js';

type QueueRoom = Parameters<typeof queueEngineDecision>[0];

function room(id = 'dxq_queue'): QueueRoom {
  return { id } as QueueRoom;
}

test('engine decisions: a queued decision carries ply, type and the payload', () => {
  const r = room();
  queueEngineDecision(r, { ply: 7, move: 'h4i4', diagnostics: { beliefSize: 440 } });

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
