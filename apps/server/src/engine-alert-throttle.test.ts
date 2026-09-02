/**
 * Throttle behaviour for engine alert emails.
 *
 * Lives in its own file because `engine-alert-email.ts` and `send-email.ts` read
 * their config at module load: the env has to be set before the first import, and
 * node's test runner gives each file its own process.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.RESEND_API_KEY = 'test-key-not-a-secret';
process.env.MISTBOARD_ALERT_EMAIL_FROM = 'ops@example.test';
process.env.MISTBOARD_ALERT_EMAIL_TO = 'oncall@example.test';
process.env.MISTBOARD_ALERT_EMAIL_MIN_INTERVAL_MS = '600000';

const { sendEngineAlertNotification } = await import('./engine-alert-email.js');

function captureSends(): { bodies: string[]; fetchImpl: typeof fetch } {
  const bodies: string[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''));
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  return { bodies, fetchImpl };
}

const failure = (roomId: string) =>
  ({
    severity: 'critical',
    alert_kind: 'engine_unreachable',
    variant: 'jieqi',
    room_id: roomId,
  }) as const;

test('six failing rooms inside the window page six times, not once', async () => {
  const { bodies, fetchImpl } = captureSends();
  const t0 = Date.parse('2026-09-02T02:50:00.000Z');
  for (let i = 0; i < 6; i += 1) {
    const result = await sendEngineAlertNotification(failure(`jq_room_${i}`), {
      fetchImpl,
      // All six inside one 10-minute window, as they were in production.
      nowMs: t0 + i * 30_000,
    });
    assert.equal(result.status, 'sent');
  }
  assert.equal(bodies.length, 6);
  for (let i = 0; i < 6; i += 1) assert.ok(bodies[i]?.includes(`jq_room_${i}`));
});

test('one room retrying is still throttled, and the next email carries the count', async () => {
  const { bodies, fetchImpl } = captureSends();
  const t0 = Date.parse('2026-09-02T03:10:00.000Z');
  const room = 'jq_flapping';

  assert.equal(
    (await sendEngineAlertNotification(failure(room), { fetchImpl, nowMs: t0 })).status,
    'sent',
  );
  for (let i = 1; i <= 4; i += 1) {
    const result = await sendEngineAlertNotification(failure(room), {
      fetchImpl,
      nowMs: t0 + i * 10_000,
    });
    assert.deepEqual(result, { status: 'throttled', suppressed: i });
  }
  assert.equal(bodies.length, 1, 'the burst sent exactly one email');

  // Past the window: the next email must admit what it stood in for.
  const after = await sendEngineAlertNotification(failure(room), {
    fetchImpl,
    nowMs: t0 + 700_000,
  });
  assert.equal(after.status, 'sent');
  assert.equal(bodies.length, 2);
  assert.match(String(bodies[1]), /suppressed_since_last_email: 4/);
});
