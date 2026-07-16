import {
  applyPatronSubscription,
  createUser,
  type PatronSubscriptionInput,
  processStripeEvent,
} from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('patron', () => {
  test('Stripe event claim and patron lifecycle update commit atomically', async () => {
    const now = new Date('2026-07-12T00:00:00.000Z');
    await createUser({
      id: 'patron_user',
      email: 'patron@example.com',
      emailVerifiedAt: now,
      handle: 'patron-player',
      displayName: 'Patron Player',
      now,
    });

    const active = patronInput('active');
    let applications = 0;
    const first = await processStripeEvent(
      'evt_patron_active',
      'customer.subscription.created',
      async (transaction) => {
        applications += 1;
        await applyPatronSubscription(active, transaction);
      },
    );
    assert.equal(first, true);

    const duplicate = await processStripeEvent(
      'evt_patron_active',
      'customer.subscription.created',
      async () => {
        applications += 1;
      },
    );
    assert.equal(duplicate, false);
    assert.equal(applications, 1);

    let state = await patronState();
    assert.equal(state.eventCount, 1);
    assert.equal(state.status, 'active');
    assert.ok(state.patronSince);

    await assert.rejects(
      processStripeEvent(
        'evt_patron_canceled',
        'customer.subscription.deleted',
        async (transaction) => {
          await applyPatronSubscription(patronInput('canceled'), transaction);
          throw new Error('simulated failure after patron update');
        },
      ),
      /simulated failure/,
    );

    state = await patronState();
    assert.equal(state.eventCount, 1, 'failed event claim rolls back');
    assert.equal(state.status, 'active', 'failed patron update rolls back');
    assert.ok(state.patronSince);

    const retry = await processStripeEvent(
      'evt_patron_canceled',
      'customer.subscription.deleted',
      (transaction) => applyPatronSubscription(patronInput('canceled'), transaction),
    );
    assert.equal(retry, true);

    state = await patronState();
    assert.equal(state.eventCount, 2);
    assert.equal(state.status, 'canceled');
    assert.equal(state.patronSince, null);
  });
});

function patronInput(status: string): PatronSubscriptionInput {
  return {
    accountId: 'patron_user',
    stripeCustomerId: 'cus_patron',
    stripeSubscriptionId: 'sub_patron',
    status,
    tier: 'monthly_5',
    currentPeriodEnd: new Date('2026-08-12T00:00:00.000Z'),
    cancelAtPeriodEnd: status === 'canceled',
    isLifetime: false,
  };
}

async function patronState(): Promise<{
  eventCount: number;
  patronSince: Date | null;
  status: string | null;
}> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const events = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM stripe_events',
    );
    const subscriptions = await client.query<{ status: string }>(
      'SELECT status FROM patron_subscriptions WHERE stripe_subscription_id = $1',
      ['sub_patron'],
    );
    const users = await client.query<{ patron_since: Date | null }>(
      'SELECT patron_since FROM users WHERE id = $1',
      ['patron_user'],
    );
    return {
      eventCount: Number(events.rows[0]?.count ?? 0),
      patronSince: users.rows[0]?.patron_since ?? null,
      status: subscriptions.rows[0]?.status ?? null,
    };
  } finally {
    await client.end();
  }
}
