import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEngineDecisionRecord,
  type EngineMoveAttempt,
  engineFailClosedAlert,
  engineNeverResponded,
  resolveValidatedEngineMove,
} from './engine-move-guard.js';

// validate treats a fixed legal set as the source of truth (mirrors every engine).
const validateAgainst =
  (legal: readonly string[]) =>
  (uci: string): string | null =>
    legal.includes(uci) ? uci : null;

test('resolveValidatedEngineMove returns the move on first-attempt success', async () => {
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 2,
    requestMove: async () => 'a1a2',
    validate: validateAgainst(['a1a2', 'b1b2']),
    stillOnTurn: () => true,
    onReject: () => {},
  });
  assert.equal(r.chosen, 'a1a2');
  assert.equal(r.attempts.length, 1);
  assert.equal(r.aborted, false);
});

test('resolveValidatedEngineMove retries a rejected output then succeeds', async () => {
  let call = 0;
  const rejects: string[] = [];
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 2,
    requestMove: async () => (call++ === 0 ? 'zz9z' : 'a1a2'), // illegal, then legal
    validate: validateAgainst(['a1a2']),
    stillOnTurn: () => true,
    onReject: ({ reason }) => rejects.push(reason),
  });
  assert.equal(r.chosen, 'a1a2');
  assert.equal(r.attempts.length, 2);
  assert.deepEqual(rejects, ['illegal-move']);
});

test('resolveValidatedEngineMove returns null after exhausting retries (fail closed)', async () => {
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 2,
    requestMove: async () => 'zz9z', // always illegal
    validate: validateAgainst(['a1a2']),
    stillOnTurn: () => true,
    onReject: () => {},
  });
  assert.equal(r.chosen, null);
  assert.equal(r.attempts.length, 2);
  assert.equal(
    r.attempts.every((a) => a.reason === 'illegal-move'),
    true,
  );
});

test('resolveValidatedEngineMove classifies a thrown provider as request-failed', async () => {
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 1,
    requestMove: async () => {
      throw new Error('fsf crashed');
    },
    validate: validateAgainst(['a1a2']),
    stillOnTurn: () => true,
    onReject: () => {},
  });
  assert.equal(r.chosen, null);
  assert.equal(r.attempts[0]?.reason, 'request-failed');
  assert.equal(r.attempts[0]?.error, 'fsf crashed');
});

test('resolveValidatedEngineMove aborts without calling the provider when off-turn', async () => {
  let calls = 0;
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 2,
    requestMove: async () => {
      calls += 1;
      return 'a1a2';
    },
    validate: validateAgainst(['a1a2']),
    stillOnTurn: () => false,
    onReject: () => {},
  });
  assert.equal(r.aborted, true);
  assert.equal(r.chosen, null);
  assert.equal(calls, 0);
});

test('buildEngineDecisionRecord captures a complete, replayable record', () => {
  const attempts: EngineMoveAttempt[] = [
    { attempt: 1, uci: 'zz9z', error: null, reason: 'illegal-move' },
    { attempt: 2, uci: null, error: 'timeout', reason: 'request-failed' },
  ];
  const rec = buildEngineDecisionRecord({
    variant: 'mini-xiangqi',
    roomId: 'room1',
    engineId: 'eng1',
    engineVersion: '0.1.0',
    movetimeMs: 800,
    tier: { skill: 8, nodes: 60000, movetimeMs: 800 },
    ply: 1,
    toMove: 'black',
    inCheck: false,
    history: ['a1a2'],
    legalUci: ['b1b2', 'c1c2'],
    attempts,
  });
  assert.equal(rec.variant, 'mini-xiangqi');
  assert.equal(rec.history, 'a1a2');
  assert.equal(rec.legal_moves, 'b1b2 c1c2');
  assert.equal(rec.legal_count, 2);
  assert.equal(rec.attempts, 2);
  assert.equal(rec.reject_reason, 'request-failed');
  assert.equal(rec.last_output, 'timeout');
  assert.equal(rec.tier_skill, 8);
  assert.ok(rec.attempts_detail.includes('1:zz9z:illegal-move'));
});

// ── An engine that never answered is a different incident from a bad move ─────

test('engineNeverResponded separates infrastructure failure from a rejected move', () => {
  assert.equal(
    engineNeverResponded([
      { attempt: 1, uci: null, error: 'move timed out', reason: 'request-failed' },
      { attempt: 2, uci: null, error: 'move timed out', reason: 'request-failed' },
    ]),
    true,
  );
  // One real (illegal) answer means the engine WAS reachable.
  assert.equal(
    engineNeverResponded([
      { attempt: 1, uci: 'zz9z', error: null, reason: 'illegal-move' },
      { attempt: 2, uci: null, error: 'move timed out', reason: 'request-failed' },
    ]),
    false,
  );
  assert.equal(engineNeverResponded([]), false);
});

const unreachableRecord = (): ReturnType<typeof buildEngineDecisionRecord> =>
  buildEngineDecisionRecord({
    variant: 'jieqi',
    roomId: 'jq_room',
    engineId: 'pikafish-jieqi-strongest',
    engineVersion: '0.3.0',
    movetimeMs: 4_000,
    tier: { movetimeMs: 4_000 },
    ply: 12,
    toMove: 'red',
    inCheck: false,
    fen: 'window-fen',
    history: ['h2e2', 'h9g7', 'b0c2', 'b9c7', 'd5c6', 'g5g7'],
    engineWindow: ['d5c6', 'g5g7'],
    legalUci: ['a0a1', 'b0c2'],
    attempts: [
      { attempt: 1, uci: null, error: 'pikafish-jieqi move timed out', reason: 'request-failed' },
      { attempt: 2, uci: null, error: 'pikafish-jieqi move timed out', reason: 'request-failed' },
    ],
  });

test('the decision record keeps the game apart from the engine replay window', () => {
  const rec = unreachableRecord();
  // The bug this encodes: `ply`/`history` used to be the WINDOW, so a twelve-ply
  // game paged as `ply: 2, history: "d5c6 g5g7"`.
  assert.equal(rec.ply, 12);
  assert.equal(rec.history, 'h2e2 h9g7 b0c2 b9c7 d5c6 g5g7');
  assert.equal(rec.engine_window, 'd5c6 g5g7');
  assert.equal(rec.unreachable, true);
});

test('an unreachable engine pages under its own alert_kind', () => {
  const alert = engineFailClosedAlert(unreachableRecord());
  assert.equal(alert.alert_kind, 'engine_unreachable');
  assert.equal(alert.ply, 12);
  assert.equal(alert.engine_window, 'd5c6 g5g7');
  // `kind` was the old spelling and is what bucketed these as generic engine alerts.
  assert.equal(alert.kind, undefined);
});

test('a kernel-rejected move still pages as engine_failed_closed', () => {
  const rec = buildEngineDecisionRecord({
    variant: 'banqi',
    roomId: 'bq_room',
    engineId: 'misty-banqi',
    engineVersion: '0.1.0',
    movetimeMs: 800,
    tier: { nodes: 60_000, movetimeMs: 800 },
    ply: 3,
    toMove: 'red',
    inCheck: false,
    history: ['a1a2', 'b1b2', 'c1c2'],
    legalUci: ['d1d2'],
    attempts: [
      { attempt: 1, uci: 'zz9z', error: null, reason: 'illegal-move' },
      { attempt: 2, uci: 'zz9z', error: null, reason: 'illegal-move' },
    ],
  });
  assert.equal(rec.unreachable, false);
  assert.equal(rec.engine_window, null);
  assert.equal(engineFailClosedAlert(rec).alert_kind, 'engine_failed_closed');
});
