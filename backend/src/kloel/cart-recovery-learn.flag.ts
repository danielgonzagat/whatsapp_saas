/**
 * Feature flag for the ADDITIVE cart-recovery win-loop closure.
 *
 * The cart-recovery decision path (`resolveCartRecoveryDecision`) opens a
 * `cart_recovery` decision via `MindPolicyService.choose` (and registers a
 * contextual bandit arm) but the WIN was never recorded: when a recovered order
 * is later PAID, no `closeOutcome` fired, so the recovery bandit/policy never
 * learned from real conversions. The loop estado→ação→consequência→APRENDIZADO
 * was OPEN for cart recovery.
 *
 * When this flag is `'true'`, two ADDITIVE side effects turn on:
 *   1. Decision time (`CartRecoveryService.checkAbandonedCarts`): the chosen
 *      `cart_recovery` decision is also `recordDecision`-ed into
 *      `RAC_DecisionOutcome` (so a closable row + the bandit arms exist) and the
 *      decision's `outcomeKey` is persisted on the order metadata
 *      (`cartRecoveryOutcomeKey`).
 *   2. Payment-approved (`CheckoutPostPaymentEffectsService.markLeadConverted`):
 *      when the paid order carries `cartRecoveryOutcomeKey`, a flag-gated
 *      `DecisionOutcomeService.closeOutcome(outcomeKey, wonVsBaseline: true)`
 *      fires once, feeding the win back into the bandit via `recordOutcome`.
 *
 * A bandit that starts LEARNING changes future decisions, so the whole loop is
 * gated. DEFAULT OFF. With the flag OFF the code is byte-for-byte equivalent to
 * today: no recordDecision, no extra metadata key, no closeOutcome — the
 * choose/selectArm decision logic itself is untouched in both states.
 *
 * Idempotency: `closeOutcome`'s `updateMany` only fills rows whose `outcomeAt`
 * is still null, so the win is recorded at most once per order even across
 * payment-webhook retries.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_DECISION_LEDGER_DUALWRITE`).
 *
 * @see backend/src/kloel/cart-recovery.service.ts
 * @see backend/src/checkout/checkout-post-payment-effects.service.ts
 * @see backend/src/kloel/decision-outcome.service.ts
 */
export function isCartRecoveryLearnEnabled(): boolean {
  return process.env.KLOEL_CART_RECOVERY_LEARN === 'true';
}
