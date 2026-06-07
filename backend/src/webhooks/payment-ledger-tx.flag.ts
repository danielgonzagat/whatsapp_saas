/**
 * Feature flag for ATOMIC sale/payment-ledger co-writes in the Stripe webhook
 * handlers.
 *
 * Today the co-located sale-status writes on a single Stripe payment event are
 * issued as SEPARATE, non-transactional statements, and the sale-ledger write
 * is wrapped in a silent `.catch(() => undefined)`:
 *   - `checkout.session.completed` → `Payment.updateMany` (RECEIVED) THEN
 *     `KloelSale.updateMany` (paid) as two independent writes
 *     (`payment-webhook-stripe.handlers2.helpers.ts`).
 *   - `payment_intent.succeeded` → `CheckoutPayment.updateMany` (APPROVED) +
 *     `KloelSale.updateMany` (paid) in a `$transaction` whose failure is
 *     SWALLOWED, so a half-applied financial write returns 200-OK and Stripe
 *     never retries (`payment-webhook-stripe.handlers2.ts`).
 *
 * When this flag is `'true'` the co-located writes for a single event are
 * folded into ONE `prisma.$transaction(..., FINANCIAL_TRANSACTION_OPTIONS)`
 * and a transaction failure is allowed to SURFACE (re-thrown) so the existing
 * outer `financialAlert` + Stripe-retry path runs instead of the silent
 * no-op. Idempotency is unchanged — the Redis NX guard and the
 * `WebhookEvent` unique row still gate replays, and the `markWebhookProcessed`
 * marker write stays OUTSIDE the financial transaction.
 *
 * DEFAULT OFF. With the flag unset / not `'true'`, every handler takes the
 * legacy path: two separate writes + the silent `.catch(() => undefined)`
 * fallbacks, byte-identical to today's behaviour. No schema change, no column
 * change — pure code wrapping gated on this env var.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_SALE_LEDGER_RECONCILE`, `KLOEL_TRANSPORT_CANONICAL_DELEGATE`).
 *
 * @see backend/src/webhooks/payment-webhook-stripe.handlers2.ts
 * @see backend/src/webhooks/payment-webhook-stripe.handlers2.helpers.ts
 */
export function isPaymentLedgerTxEnabled(): boolean {
  return process.env.KLOEL_PAYMENT_LEDGER_TX === 'true';
}
