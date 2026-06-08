import type { DecisionOutcomeService } from './decision-outcome.service';

/**
 * Feature flag for the ADDITIVE commerce → chat-decision correlation closure.
 *
 * The gap this closes: `CommerceOutcomeLearnerService.maybeCloseDecision`
 * (mind/coordination/commerce-outcome-learner.service.ts) is ALREADY able to
 * close an OPEN decision when a terminal commerce event carries the decision's
 * outcomeKey as its `correlationId` / `payload.outcomeKey`. The CONSUMER is
 * complete. What is missing is the PRODUCER link: no chat decision's outcomeKey
 * is ever threaded onto a real sale, so a chat decision is essentially never
 * closed by a real purchase — the estado→ação→consequência→APRENDIZADO loop
 * from "Kloel engaged this lead in chat" → "the lead bought" is OPEN.
 *
 * The chat-reply outcomeKey (`buildChatOutcomeKey`) is ephemeral: it is opened
 * and closed inside a single reply (`chat.replied`), so it cannot survive to a
 * later sale, and threading it end-to-end through `createOrder` → order
 * metadata → the payment lifecycle → the `commerce.payment.approved`
 * correlationId would cross-cut the financial / idempotency-sensitive path
 * (forbidden for this cognition-core change). Instead this flag closes the loop
 * on the ONE seam where a durable chat↔sale join already exists: the WhatsApp
 * lead-processor path, where a chat reply and a future sale share a stable
 * `leadId` (the lead's payment carries `contactId: leadId`, which becomes the
 * paid order's `capturedLeadId`).
 *
 * When this flag is `'true'`, two ADDITIVE side effects turn on:
 *   1. Decision time (`KloelLeadProcessorService.processWhatsAppMessage`): once a
 *      reply has been produced for a lead, a dedicated `commerce_decision_link`
 *      decision is `recordDecision`-ed into `RAC_DecisionOutcome` keyed by a
 *      DETERMINISTIC, lead-stable outcomeKey
 *      (`buildCommerceDecisionLinkKey(workspaceId, leadId)`). Unlike the
 *      ephemeral `chat_reply` decision this row is left OPEN, waiting for a sale.
 *   2. Payment-approved (`CheckoutPostPaymentEffectsService.markLeadConverted`):
 *      when the paid order carries a `capturedLeadId`, the SAME deterministic key
 *      is recomputed and `DecisionOutcomeService.closeOutcome(..., wonVsBaseline:
 *      true)` fires once, so a real purchase closes the originating chat decision
 *      as a WIN and the bandit learns "engaging this lead in chat led to a sale".
 *
 * A bandit that starts LEARNING from chat→sale conversions changes future
 * decisions, so the whole closure is gated. DEFAULT OFF. With the flag OFF the
 * code is byte-for-byte equivalent to today: no recordDecision, no closeOutcome —
 * the reply generation and the payment path are untouched in both states.
 *
 * Best-effort / fail-open: every call is fire-and-forget and swallows its own
 * error, so a learning-side failure can NEVER break a live reply or the payment
 * path. Idempotency: `closeOutcome`'s `updateMany` only fills rows whose
 * `outcomeAt` is still null, so a payment-webhook retry closes at most once; a
 * lead that chats N times before buying leaves N open rows, all of which one sale
 * closes together (append-only, no double-charge of the learning signal because
 * the bandit reward is per closed row).
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_WHATSAPP_INBOUND_LEARN`, `KLOEL_CART_RECOVERY_LEARN`,
 * `KLOEL_CHAT_STRATEGY_LEARN`).
 *
 * @see backend/src/kloel/kloel-lead-processor.service.ts (the chat decision seam)
 * @see backend/src/checkout/checkout-post-payment-effects.service.ts (the sale closer)
 * @see backend/src/kloel/mind/coordination/commerce-outcome-learner.service.ts (the ready consumer)
 * @see backend/src/kloel/decision-outcome.service.ts (recordDecision / closeOutcome)
 */
export function isCommerceDecisionLinkEnabled(): boolean {
  return process.env.KLOEL_COMMERCE_DECISION_LINK === 'true';
}

/** Canonical decision type for the chat→commerce correlation link. */
export const COMMERCE_DECISION_LINK_TYPE = 'commerce_decision_link';

/**
 * Build the DETERMINISTIC, lead-stable outcomeKey that joins a chat decision to a
 * later sale. Both ends (the chat producer and the payment-approved closer)
 * recompute the same key from `(workspaceId, leadId)`, so the sale can resolve
 * the originating chat decision without any extra plumbing through the financial
 * path. Returns `null` when either id is missing so callers no-op cleanly.
 */
export function buildCommerceDecisionLinkKey(
  workspaceId: string | undefined | null,
  leadId: string | undefined | null,
): string | null {
  if (!workspaceId || !leadId) {
    return null;
  }
  return `commerce-link:${workspaceId}:${leadId}`;
}

interface CommerceDecisionLinkLogger {
  warn: (event: string, ctx?: Record<string, unknown>) => void;
}

/**
 * PRODUCER: open a `commerce_decision_link` decision for a chat-engaged lead.
 *
 * Records (and leaves OPEN) a decision keyed by the deterministic lead-stable
 * outcomeKey so a future sale for that lead can close it as a WIN. Fire-and-forget
 * and fail-open: a learning failure never reaches the live reply path.
 *
 * No-op when the gate is OFF, the service is unavailable, or the
 * workspace/lead id is missing — so an OFF gate is byte-identical to today (no
 * DB writes).
 */
export function recordCommerceDecisionLink(
  decisionOutcomeService: DecisionOutcomeService | undefined,
  logger: CommerceDecisionLinkLogger,
  params: { workspaceId: string; leadId: string; surface?: string },
): void {
  if (!isCommerceDecisionLinkEnabled() || !decisionOutcomeService) {
    return;
  }
  const outcomeKey = buildCommerceDecisionLinkKey(params.workspaceId, params.leadId);
  if (!outcomeKey) {
    return;
  }
  void decisionOutcomeService
    .recordDecision({
      workspaceId: params.workspaceId,
      decisionType: COMMERCE_DECISION_LINK_TYPE,
      chosenAction: 'engage',
      baselineAction: 'silence',
      outcomeKey,
      // The window is open-ended (a sale can land hours/days later); 1 is the
      // canonical expectedWindow used by the sibling chat/whatsapp decisions.
      expectedWindow: 1,
      contextSnapshot: {
        surface: params.surface ?? 'whatsapp-lead-processor',
        channel: 'whatsapp',
        leadId: params.leadId,
      },
    })
    .catch((err: unknown) =>
      logger.warn('kloel_commerce_decision_link_record_skipped', {
        workspaceId: params.workspaceId,
        leadId: params.leadId,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}

/**
 * CLOSER: resolve the originating chat decision as a WIN when a lead's order is
 * paid. Recomputes the same deterministic key from `(workspaceId,
 * capturedLeadId)` and closes the OPEN `commerce_decision_link` row(s).
 * Fire-and-forget and fail-open; idempotent via `closeOutcome`'s
 * `outcomeAt: null` filter.
 *
 * No-op when the gate is OFF, the service is unavailable, or the
 * workspace/lead id is missing.
 */
export function closeCommerceDecisionLink(
  decisionOutcomeService: DecisionOutcomeService | undefined,
  logger: CommerceDecisionLinkLogger,
  params: { workspaceId: string; capturedLeadId: string | null | undefined; outcomeName?: string },
): void {
  if (!isCommerceDecisionLinkEnabled() || !decisionOutcomeService) {
    return;
  }
  const outcomeKey = buildCommerceDecisionLinkKey(params.workspaceId, params.capturedLeadId);
  if (!outcomeKey) {
    return;
  }
  void decisionOutcomeService
    .closeOutcome({
      outcomeKey,
      outcomeName: params.outcomeName ?? 'commerce.payment.approved',
      wonVsBaseline: true,
    })
    .catch((err: unknown) =>
      logger.warn('kloel_commerce_decision_link_close_skipped', {
        workspaceId: params.workspaceId,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}
