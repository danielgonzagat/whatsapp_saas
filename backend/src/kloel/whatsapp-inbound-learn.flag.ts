import { randomIdSegment } from '../common/random-id';
import { isAdequateReplyForBandit } from './kloel-reply-engine.bandit.helpers';
import type { DecisionOutcomeService } from './decision-outcome.service';

/**
 * Feature flag for the ADDITIVE WhatsApp-inbound win-loop closure.
 *
 * The gap this closes: the production WhatsApp inbound path
 * (`kloel.service.ts:processWhatsAppMessage` →
 * `KloelLeadProcessorService.processWhatsAppMessage`) generates a reply on its
 * OWN OpenAI client and NEVER records a decision/outcome. It is therefore
 * OUTSIDE the bandit/learning loop that the canonical chat path already joins
 * via `recordChatReplyDecision` / `closeChatReplyOutcome` (decisionType
 * `chat_reply`). `WhatsAppMindCoordinator` only ever called
 * `decisionOutcome.recordEvent` (a passive log) — never `recordDecision` /
 * `closeOutcome`. The loop estado→ação→consequência→APRENDIZADO was OPEN for
 * WhatsApp inbound replies.
 *
 * When this flag is `'true'`, ONE ADDITIVE side effect turns on at the WhatsApp
 * reply seam: once a reply has been produced (autopilot agent reply OR the
 * lead-processor LLM reply), a `whatsapp_reply` decision is `recordDecision`-ed
 * into `RAC_DecisionOutcome` (chosenAction `engage` / baseline `silence`, so the
 * matching bandit arms get registered) and immediately `closeOutcome`-d with
 * `wonVsBaseline = isAdequateReplyForBandit(reply)` — the SAME length-adequacy
 * signal the canonical chat path uses. WhatsApp inbound thus joins the same
 * learning loop.
 *
 * A bandit that starts LEARNING from WhatsApp replies changes future decisions,
 * so the whole closure is gated. DEFAULT OFF. With the flag OFF the code is
 * byte-for-byte equivalent to today: no recordDecision, no closeOutcome — the
 * reply generation itself is untouched in both states.
 *
 * Best-effort / fail-open: every call is fire-and-forget and swallows its own
 * error, so a learning-side failure can NEVER break a live WhatsApp reply.
 * Idempotency: `closeOutcome`'s `updateMany` only fills rows whose `outcomeAt`
 * is still null, and the `outcomeKey` is unique-per-reply.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_CHAT_STRATEGY_LEARN`, `KLOEL_CART_RECOVERY_LEARN`).
 *
 * @see backend/src/kloel/kloel-lead-processor.service.ts (the WhatsApp reply seam)
 * @see backend/src/kloel/decision-outcome.service.ts (recordDecision / closeOutcome)
 * @see backend/src/kloel/kloel-reply-engine.decision-outcome.helpers.ts (the chat_reply sibling)
 */
export function isWhatsAppInboundLearnEnabled(): boolean {
  return process.env.KLOEL_WHATSAPP_INBOUND_LEARN === 'true';
}

/** Canonical decision type for WhatsApp inbound replies. */
export const WHATSAPP_REPLY_DECISION_TYPE = 'whatsapp_reply';

interface WhatsAppLearnLogger {
  warn: (event: string, ctx?: Record<string, unknown>) => void;
}

/**
 * Close the WhatsApp-inbound learning loop for a single produced reply.
 *
 * Records a `whatsapp_reply` decision (chosenAction `engage` / baseline
 * `silence`) and immediately closes it with the reply-adequacy reward — the same
 * signal the chat path uses (`isAdequateReplyForBandit`). Fire-and-forget and
 * fail-open: a learning failure never reaches the live reply path.
 *
 * No-op when the gate is OFF, the service is unavailable, or there is no
 * workspace/reply — so an OFF gate is byte-identical to today (no DB writes).
 */
export function recordWhatsAppInboundOutcome(
  decisionOutcomeService: DecisionOutcomeService | undefined,
  logger: WhatsAppLearnLogger,
  params: { workspaceId: string; reply: string; surface?: string },
): void {
  if (
    !isWhatsAppInboundLearnEnabled() ||
    !decisionOutcomeService ||
    !params.workspaceId ||
    !params.reply
  ) {
    return;
  }
  const outcomeKey = `whatsapp:${params.workspaceId}:${Date.now()}:${randomIdSegment(6)}`;
  const won = isAdequateReplyForBandit(params.reply);
  void (async () => {
    try {
      await decisionOutcomeService.recordDecision({
        workspaceId: params.workspaceId,
        decisionType: WHATSAPP_REPLY_DECISION_TYPE,
        chosenAction: 'engage',
        baselineAction: 'silence',
        outcomeKey,
        expectedWindow: 1,
        contextSnapshot: {
          surface: params.surface ?? 'whatsapp-inbound',
          channel: 'whatsapp',
          messageLength: params.reply.length,
        },
      });
      await decisionOutcomeService.closeOutcome({
        outcomeKey,
        outcomeName: won ? 'whatsapp.reply_adequate' : 'whatsapp.reply_inadequate',
        wonVsBaseline: won,
      });
    } catch (err: unknown) {
      logger.warn('kloel_whatsapp_inbound_learn_skipped', {
        workspaceId: params.workspaceId,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  })();
}
