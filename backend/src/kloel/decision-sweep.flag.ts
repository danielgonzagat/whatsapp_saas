/**
 * Feature flag for the ADDITIVE chat_reply TIMEOUT-LOSS sweep.
 *
 * `DecisionOutcomeService.sweepExpired` is the timeout-loss learner: for every
 * `RAC_DecisionOutcome` row that opened a decision (e.g. a `chat_reply`
 * engage/silence choice) but NEVER received a consequence within its window, it
 * records `outcome=0` (a LOSS for the chosen arm: `inbound.silent_24h`) and
 * feeds that negative signal to the contextual bandit via `recordOutcome`.
 *
 * Today that method has NO non-spec caller in production. `mind.service.ts`
 * ticks call the DIFFERENT `surprise.sweepExpired` / `policy.sweepExpiredOutcomes`
 * surfaces — never this one — so the chat-reply timeout-loss learning loop
 * (estado → ação → (silêncio) → APRENDIZADO) is OPEN: decisions that time out
 * silently are never recorded as losses and the bandit never learns from them.
 *
 * When this flag is `'true'`, the `DecisionSweepScheduler` @Cron enumerates
 * workspaces with at least one OPEN decision (`outcomeAt: null`) and calls
 * `DecisionOutcomeService.sweepExpired(workspaceId, 24)` per workspace,
 * recording the timeout-loss + closing the bandit loop.
 *
 * A bandit that starts LEARNING from timeouts changes future decisions, so the
 * whole sweep is gated. DEFAULT OFF. With the flag OFF the scheduler is a pure
 * early-return no-op — byte-for-byte equivalent to today (no enumeration query,
 * no sweep, no bandit write). The `sweepExpired` method itself is UNCHANGED in
 * both states; this only wires the missing periodic caller behind the flag.
 *
 * Idempotency: `sweepExpired`'s `updateMany` only fills rows whose `outcomeAt`
 * is still null, so a decision is swept at most once even across overlapping
 * cron passes.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_CART_RECOVERY_LEARN`, `KLOEL_DECISION_LEDGER_DUALWRITE`).
 *
 * @see backend/src/kloel/decision-sweep.scheduler.ts
 * @see backend/src/kloel/decision-outcome.service.ts
 */
export function isDecisionSweepEnabled(): boolean {
  return process.env.KLOEL_DECISION_SWEEP_ENABLED === 'true';
}

/**
 * Max age (hours) a decision may stay open before the sweep records it as a
 * timeout-loss. 24h matches the `inbound.silent_24h` outcome name that
 * `sweepExpired` stamps onto expired rows.
 */
export const DECISION_SWEEP_MAX_AGE_HOURS = 24;
