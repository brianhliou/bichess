import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alertKindOf,
  alertThrottleKey,
  engineAlertEmailSubject,
  engineAlertEmailText,
} from './engine-alert-email.js';
import {
  buildSyntheticEngineAlert,
  parseEngineAlertEmailCliArgs,
} from './engine-alert-email-cli.js';

test('engine alert email subject identifies severity and service', () => {
  assert.equal(
    engineAlertEmailSubject(
      {
        severity: 'critical',
        engine_turn_timeouts_tick: 1,
      },
      'engine-worker',
    ),
    '[Mistboard] CRITICAL engine alert (engine-worker)',
  );
});

test('engine alert email text includes alert fields without secrets', () => {
  const text = engineAlertEmailText(
    {
      severity: 'critical',
      engine_fallbacks_tick: 2,
      engine_turn_timeouts_tick: 1,
    },
    new Date('2026-05-26T12:00:00.000Z'),
    'web',
  );

  assert.match(text, /Severity: critical/);
  assert.match(text, /Service: web/);
  assert.match(text, /Time: 2026-05-26T12:00:00.000Z/);
  assert.match(text, /- engine_fallbacks_tick: 2/);
  assert.match(text, /- engine_turn_timeouts_tick: 1/);
  assert.doesNotMatch(text, /RESEND_API_KEY/);
});

test('engine alert CLI builds a dry-run synthetic payload by default', () => {
  const parsed = parseEngineAlertEmailCliArgs(
    [
      '--severity',
      'warning',
      '--service',
      'engine-worker',
      '--field',
      'engine_reservation_busy_tick=2',
      '--field=note=capacity smoke',
      '--now',
      '2026-05-26T12:00:00.000Z',
    ],
    Date.parse('2026-05-26T00:00:00.000Z'),
  );

  assert.equal(parsed.help, false);
  if (parsed.help) assert.fail('expected parsed CLI options');
  assert.equal(parsed.options.send, false);
  assert.equal(parsed.options.serviceName, 'engine-worker');
  assert.equal(parsed.options.nowMs, Date.parse('2026-05-26T12:00:00.000Z'));
  assert.deepEqual(buildSyntheticEngineAlert(parsed.options), {
    engine_reservation_busy_tick: 2,
    note: 'capacity smoke',
    synthetic: 1,
    source: 'ops:test-engine-alert',
    severity: 'warning',
  });
});

test('engine alert CLI requires severity to use the severity option', () => {
  assert.throws(
    () => parseEngineAlertEmailCliArgs(['--field', 'severity=critical']),
    /Use --severity/,
  );
});

// ── Throttling must not collapse separate incidents ──────────────────────────

test('the throttle buckets per room, so distinct games page separately', () => {
  const base = { severity: 'critical', alert_kind: 'engine_unreachable' } as const;
  // The 2026-09-02 failure mode: six different jieqi rooms shared one bucket, so
  // the operator was paged about one of them and never heard about the other five.
  assert.notEqual(
    alertThrottleKey({ ...base, room_id: 'jq_one' }),
    alertThrottleKey({ ...base, room_id: 'jq_two' }),
  );
  // The same room retrying is what the throttle is actually for.
  assert.equal(
    alertThrottleKey({ ...base, room_id: 'jq_one' }),
    alertThrottleKey({ ...base, room_id: 'jq_one', ply: 14 }),
  );
  // Different kinds never mask each other.
  assert.notEqual(
    alertThrottleKey({ ...base, room_id: 'jq_one' }),
    alertThrottleKey({
      severity: 'critical',
      alert_kind: 'engine_seat_forfeited',
      room_id: 'jq_one',
    }),
  );
});

test('alertKindOf falls back to a payload that spells the kind `kind`', () => {
  assert.equal(
    alertKindOf({ severity: 'critical', alert_kind: 'engine_unreachable' }),
    'engine_unreachable',
  );
  assert.equal(
    alertKindOf({ severity: 'critical', kind: 'engine_failed_closed' }),
    'engine_failed_closed',
  );
  assert.equal(alertKindOf({ severity: 'warning', engine_fallbacks_tick: 2 }), 'engine');
});

test('the suggested log search names a kind the server actually logs', () => {
  const text = engineAlertEmailText(
    {
      severity: 'critical',
      alert_kind: 'engine_unreachable',
      variant: 'jieqi',
      room_id: 'jq_66ae08e2',
    },
    new Date('2026-09-02T02:50:07.610Z'),
    'web',
  );
  assert.match(text, /kind="engine_unreachable" room_id="jq_66ae08e2"/);
  // `kind="engine_alert"` matched nothing in production logs.
  assert.doesNotMatch(text, /engine_alert/);
  assert.match(
    engineAlertEmailSubject({ severity: 'critical', alert_kind: 'engine_unreachable' }, 'web'),
    /CRITICAL engine_unreachable alert \(web\)/,
  );
});
