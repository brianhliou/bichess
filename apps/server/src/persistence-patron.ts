// Patron program persistence (078). Stripe is the source of truth; these
// helpers project Stripe webhook state into patron_subscriptions and keep the
// denormalized users.patron_since cache (which drives the cosmetic badge) in
// sync. Entitlement is ALWAYS derived here from status/is_lifetime, never
// asserted by the client.

import type pg from 'pg';
import { getPool, withTransaction } from './persistence-db.js';

export type PatronTransaction = pg.PoolClient;
type PatronDatabase = pg.Pool | PatronTransaction;

// A subscription/donation counts as "active patron" while lifetime, or while
// Stripe reports the subscription as active or trialing. past_due keeps the
// badge only until the period ends (Stripe retries dunning); a terminal
// canceled/unpaid clears it.
export const PATRON_ACTIVE_STATUSES: readonly string[] = ['active', 'trialing'];

export type PatronSubscriptionInput = {
  accountId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  tier: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  isLifetime: boolean;
};

// Record the account -> Stripe customer mapping so a returning donor reuses the
// same customer and can open the billing portal. Idempotent; only writes when
// the value actually changes.
export async function setStripeCustomerId(
  accountId: string,
  customerId: string,
  database: PatronDatabase = getPool(),
): Promise<void> {
  await database.query(
    `UPDATE users
       SET stripe_customer_id = $2, updated_at = now()
     WHERE id = $1 AND stripe_customer_id IS DISTINCT FROM $2`,
    [accountId, customerId],
  );
}

export async function getStripeCustomerId(accountId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
    [accountId],
  );
  return rows[0]?.stripe_customer_id ?? null;
}

// Resolve the account behind a Stripe customer. Webhooks that carry only a
// customer id (subscription.updated, invoice.*) map back to an account through
// the customer id we stored at checkout.
export async function findAccountIdByStripeCustomerId(
  customerId: string,
  database: PatronDatabase = getPool(),
): Promise<string | null> {
  const { rows } = await database.query<{ id: string }>(
    `SELECT id FROM users WHERE stripe_customer_id = $1 LIMIT 1`,
    [customerId],
  );
  return rows[0]?.id ?? null;
}

// Apply a Stripe event exactly once. The event ledger insert and every patron
// state write share one transaction: if processing throws, the claim rolls back
// too, so Stripe's retry can safely process the event instead of being mistaken
// for a completed duplicate.
export async function processStripeEvent(
  eventId: string,
  type: string,
  apply: (transaction: PatronTransaction) => Promise<void>,
): Promise<boolean> {
  return withTransaction(async (transaction) => {
    const { rowCount } = await transaction.query(
      `INSERT INTO stripe_events (event_id, type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, type],
    );
    if ((rowCount ?? 0) === 0) return false;
    await apply(transaction);
    return true;
  });
}

// Upsert a subscription/donation row from Stripe and recompute the account's
// patron_since in one transaction so the badge cache can never drift from the
// underlying rows. Recurring rows upsert by stripe_subscription_id; one-time /
// lifetime donations (no subscription id) insert a fresh row and rely on the
// webhook event ledger for dedup.
export async function applyPatronSubscription(
  input: PatronSubscriptionInput,
  transaction?: PatronTransaction,
): Promise<void> {
  const apply = async (client: PatronTransaction): Promise<void> => {
    if (input.stripeSubscriptionId) {
      await client.query(
        `INSERT INTO patron_subscriptions
           (account_id, provider, stripe_customer_id, stripe_subscription_id,
            status, tier, current_period_end, cancel_at_period_end, is_lifetime)
         VALUES ($1, 'stripe', $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (stripe_subscription_id) DO UPDATE SET
           status = EXCLUDED.status,
           tier = COALESCE(EXCLUDED.tier, patron_subscriptions.tier),
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           stripe_customer_id =
             COALESCE(EXCLUDED.stripe_customer_id, patron_subscriptions.stripe_customer_id),
           updated_at = now()`,
        [
          input.accountId,
          input.stripeCustomerId,
          input.stripeSubscriptionId,
          input.status,
          input.tier,
          input.currentPeriodEnd,
          input.cancelAtPeriodEnd,
          input.isLifetime,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO patron_subscriptions
           (account_id, provider, stripe_customer_id, stripe_subscription_id,
            status, tier, current_period_end, cancel_at_period_end, is_lifetime)
         VALUES ($1, 'stripe', $2, NULL, $3, $4, NULL, false, $5)`,
        [input.accountId, input.stripeCustomerId, input.status, input.tier, input.isLifetime],
      );
    }

    // Recompute users.patron_since from the account's current qualifying rows:
    // earliest created_at among rows that are lifetime or in an active status;
    // NULL when none qualify (badge drops). Only writes on change. In the same
    // transaction so the badge cache can never drift from the underlying rows.
    await client.query(
      `UPDATE users u
         SET patron_since = sub.since, updated_at = now()
       FROM (
         SELECT MIN(created_at) AS since
           FROM patron_subscriptions
          WHERE account_id = $1
            AND (is_lifetime = true OR status = ANY($2::text[]))
       ) sub
       WHERE u.id = $1 AND u.patron_since IS DISTINCT FROM sub.since`,
      [input.accountId, PATRON_ACTIVE_STATUSES],
    );
  };
  if (transaction) await apply(transaction);
  else await withTransaction(apply);
}
