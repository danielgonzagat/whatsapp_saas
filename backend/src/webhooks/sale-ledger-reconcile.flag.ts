/**
 * Feature flag for the ADDITIVE sale/payment-ledger reconciliation back-fill.
 *
 * The Kloel sale-settlement surface keeps FOUR parallel ledgers that are
 * written by DIFFERENT webhook events and DIFFERENT transactions, so they can
 * diverge under partial failure:
 *   - `Payment`         — provider-level receipt (Stripe `checkout.session.*`,
 *                         MercadoPago) → `RECEIVED`/`APPROVED`;
 *   - `KloelSale`       — chat/analytics sale ledger → `paid`;
 *   - `CheckoutOrder`   — de-facto canonical GMV ledger (dashboards) → `PAID`;
 *   - `CheckoutPayment` — checkout-flow payment row → `APPROVED`.
 *
 * The DETECTION half of the reconciler (find rows where a terminal-paid
 * `Payment` exists but the joined `KloelSale`/`CheckoutOrder` is still
 * `pending`/non-`PAID`) is ALWAYS safe — it is read-only and writes nothing.
 *
 * This flag gates ONLY the *active* half: when set to `'true'`, the reconciler
 * is additionally permitted to FLIP a diverged `KloelSale`/`CheckoutOrder` to
 * its paid terminal state (back-fill), driven off the proven `Payment` receipt.
 *
 * DEFAULT OFF. With the flag unset / not `'true'`, the reconciler performs
 * ZERO writes — the flag-OFF path is byte-identical to today's behaviour, which
 * never reconciles these ledgers at all. No live payment-capture or
 * webhook-idempotency path consumes this flag.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_DECISION_LEDGER_DUALWRITE`, `KLOEL_TRANSPORT_CANONICAL_DELEGATE`).
 *
 * @see backend/src/webhooks/sale-ledger-reconcile.helpers.ts
 */
export function isSaleLedgerReconcileEnabled(): boolean {
  return process.env.KLOEL_SALE_LEDGER_RECONCILE === 'true';
}
