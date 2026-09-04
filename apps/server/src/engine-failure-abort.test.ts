import assert from 'node:assert/strict';
import test from 'node:test';
import { ENGINE_FAILURE_ABORTED_REASON, engineFailureAbort } from './engine-failure-abort.js';

// The three game-summary builders (variant-tenant/events.ts buildTenantGameSummary,
// dark-xiangqi-tenant.ts buildDarkXiangqiGameSummary, room-manager.ts
// buildGameSummary) all call this one function, so these pin the rule they share
// rather than any one builder's behavior.

test('engineFailureAbort: aborts when the engine seat lost by abandonment', () => {
  // The repro on #296: dxq_7ef3252b, Misty on black, "Abandonment - Red is
  // victorious", persisted as result red-wins / termination abandonment.
  assert.deepEqual(
    engineFailureAbort({ engineSeat: 'black', winner: 'red', reason: 'abandonment' }),
    { termination: 'engine-failure', abortedReason: ENGINE_FAILURE_ABORTED_REASON },
  );
});

test('engineFailureAbort: leaves a human abandonment against a bot alone', () => {
  // A human really can walk away from a PvE game, and the engine really wins.
  assert.equal(
    engineFailureAbort({ engineSeat: 'black', winner: 'black', reason: 'abandonment' }),
    undefined,
  );
});

test('engineFailureAbort: leaves human-vs-human abandonment alone', () => {
  assert.equal(
    engineFailureAbort({ engineSeat: null, winner: 'red', reason: 'abandonment' }),
    undefined,
  );
});

test('engineFailureAbort: never fires on a real result, whoever was playing', () => {
  for (const reason of [
    'checkmate',
    'resignation',
    'timeout',
    'general-captured',
    'king-captured',
    'stalemate',
    'repetition',
    'dead-position',
  ]) {
    assert.equal(
      engineFailureAbort({ engineSeat: 'black', winner: 'red', reason }),
      undefined,
      reason,
    );
  }
});

test('engineFailureAbort: does not fire on a draw', () => {
  // A draw has no loser, so nothing was forfeited.
  for (const winner of [null, undefined]) {
    assert.equal(
      engineFailureAbort({ engineSeat: 'black', winner, reason: 'abandonment' }),
      undefined,
    );
  }
});

test('engineFailureAbort: works for either seat colour', () => {
  assert.equal(
    engineFailureAbort({ engineSeat: 'white', winner: 'black', reason: 'abandonment' })
      ?.termination,
    'engine-failure',
  );
  assert.equal(
    engineFailureAbort({ engineSeat: 'red', winner: 'black', reason: 'abandonment' })?.termination,
    'engine-failure',
  );
});

test('engineFailureAbort: states a termination the games CHECK constraint accepts', () => {
  // Migration 114 is the live constraint and has carried 'engine-failure' since
  // 002, so this needs no migration. A value outside the constraint would
  // surface as a rolled-back transaction and a MISSING row, not a type error.
  assert.equal(
    engineFailureAbort({ engineSeat: 'black', winner: 'red', reason: 'abandonment' })?.termination,
    'engine-failure',
  );
});
