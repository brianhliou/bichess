/**
 * Dark Xiangqi engine-decision artifacts: the read side.
 *
 * The rule this file pins is that an id naming no dark-xiangqi game is a 404,
 * NOT an empty artifact list. The xiangqi route answers `{artifacts: []}` for
 * any id at all, including a `dxq_` id and outright garbage, which silently
 * converts "wrong route" and "no such game" into "this engine recorded
 * nothing" — and that is precisely how a missing-instrumentation problem got
 * investigated as an engine problem.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_XIANGQI_SPEC_ID } from '@mistboard/game';
import type { GameDebugArtifactPayload, RecentEveGameRecord } from '../persistence.js';
import { LIVE_ENGINE_DECISION_ARTIFACT_TYPE } from '../persistence-game-lifecycle.js';
import {
  type DarkXiangqiArtifactsPersistence,
  darkXiangqiArtifactsForApi,
} from './dark-xiangqi-games.js';

const ROOM_ID = 'dxq_artifacts';

function gameRecord(overrides: Partial<RecentEveGameRecord> = {}): RecentEveGameRecord {
  return {
    roomId: ROOM_ID,
    variant: DARK_XIANGQI_SPEC_ID,
    mode: 'pve',
    result: 'black-wins',
    termination: 'resignation',
    plyCount: 2,
    startedAt: new Date(1),
    endedAt: new Date(5),
    whiteName: null,
    blackName: null,
    participants: [],
    ...overrides,
  } as RecentEveGameRecord;
}

function artifact(ply: number): GameDebugArtifactPayload {
  return {
    id: 100 + ply,
    gameId: ROOM_ID,
    ply,
    engineColor: null,
    artifactType: LIVE_ENGINE_DECISION_ARTIFACT_TYPE,
    payload: { ply, diagnostics: { beliefSize: 12 } },
    createdAt: new Date(10 + ply),
  } as GameDebugArtifactPayload;
}

function deps(
  over: Partial<DarkXiangqiArtifactsPersistence> = {},
): DarkXiangqiArtifactsPersistence {
  return {
    isPersistenceEnabled: () => true,
    getGameSummary: async () => gameRecord(),
    listArtifacts: async () => [artifact(0), artifact(2)],
    ...over,
  };
}

test('artifacts: a finished dxq game returns its queued decisions', async () => {
  const payload = await darkXiangqiArtifactsForApi(ROOM_ID, deps());
  assert.ok(payload, 'a real dxq game must not 404');
  assert.equal(payload.artifacts.length, 2);
  assert.deepEqual(
    payload.artifacts.map((a) => a.ply),
    [0, 2],
  );
  assert.equal(payload.artifacts[0]?.artifactType, LIVE_ENGINE_DECISION_ARTIFACT_TYPE);
  // createdAt is serialized for the wire, not left as a Date.
  assert.equal(typeof payload.artifacts[0]?.createdAt, 'string');
});

test('artifacts: an unknown room id is a 404, not an empty list', async () => {
  const payload = await darkXiangqiArtifactsForApi(
    'dxq_totally-bogus-room',
    deps({ getGameSummary: async () => null }),
  );
  assert.equal(payload, null);
});

test('artifacts: a game of another variant is a 404, not an empty list', async () => {
  // The exact confusion this guards: asking the dxq route for a xiangqi game.
  const payload = await darkXiangqiArtifactsForApi(
    'xq_some_game',
    deps({ getGameSummary: async () => gameRecord({ variant: 'xiangqi' }) }),
  );
  assert.equal(payload, null);
});

test('artifacts: no persistence is a 404 rather than a false empty', async () => {
  const payload = await darkXiangqiArtifactsForApi(
    ROOM_ID,
    deps({
      isPersistenceEnabled: () => false,
      getGameSummary: async () => {
        throw new Error('persistence must not be queried when disabled');
      },
    }),
  );
  assert.equal(payload, null);
});
