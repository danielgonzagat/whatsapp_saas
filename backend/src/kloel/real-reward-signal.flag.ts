import type { DecisionOutcomeService } from './decision-outcome.service';

/**
 * Feature flag for the REAL delayed-outcome chat_reply reward signal.
 *
 * The gap this closes: the `chat_reply` decision (`recordChatReplyDecision`) is
 * opened at the start of every reply and then IMMEDIATELY closed as a WIN
 * (`closeChatReplyOutcome(..., wonVsBaseline: true)`) the moment the model
 * produces ANY successful reply (kloel-reply-engine.service.ts). That makes the
 * reward DEGENERATE: every adequate reply is a win, so the contextual bandit
 * learns from an always-win signal that carries no information about whether the
 * reply actually WORKED. The estado -> ação -> consequência -> APRENDIZADO loop
 * is short-circuited at "ação" — the consequência is never observed.
 *
 * When this flag is `'true'`, the reward becomes a DELAYED REAL signal wired to
 * the consequence infrastructure that already exists in this session:
 *
 *   1. On a successful reply the `chat_reply` decision is LEFT OPEN instead of
 *      being closed as a win. The reply path is otherwise untouched — the same
 *      bandit arms (reply_style, chat_strategy) still learn from the immediate
 *      adequacy proxy; only the `chat_reply` DECISION's terminal reward is
 *      deferred.
 *   2. WON — conversation continues: at the START of the NEXT reply for the same
 *      workspace, any still-OPEN `chat_reply` decision is closed as
 *      `chat.continued` with `wonVsBaseline: true`. A new inbound message that
 *      Kloel is replying to IS the real consequence "the prior reply kept the
 *      conversation alive". Reuses `DecisionOutcomeService.closeOpenChatReplies`,
 *      which feeds the win back through the same bandit `recordOutcome` path.
 *   3. WON — a sale is attributed: handled INDEPENDENTLY by the already-shipped
 *      `KLOEL_COMMERCE_DECISION_LINK` path (a durable `commerce_decision_link`
 *      decision keyed by `(workspaceId, leadId)` is closed as a win by the
 *      payment webhook). This flag does NOT duplicate that — it complements it
 *      on the chat-engagement axis.
 *   4. LOST — timeout into silence: handled by the already-shipped
 *      `KLOEL_DECISION_SWEEP_ENABLED` path. `DecisionOutcomeService.sweepExpired`
 *      closes any `chat_reply` row that stays OPEN past the 24h window as
 *      `inbound.silent_24h` with `wonVsBaseline: false`, feeding the LOSS to the
 *      bandit. Leaving the decision open (this flag) is precisely what lets that
 *      sweep observe the silence — the two flags compose.
 *
 * A bandit that starts LEARNING from real engagement instead of reply-adequacy
 * changes future decisions, so the whole closure is gated. DEFAULT OFF. With the
 * flag OFF the reply path is byte-for-byte equivalent to today: the success arm
 * still calls `closeChatReplyOutcome(..., wonVsBaseline: true)` immediately and
 * no prior-open `chat_reply` is touched.
 *
 * Best-effort / fail-open: the continuation-close is fire-and-forget and swallows
 * its own error, so a learning-side failure can NEVER break a live reply.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_DECISION_SWEEP_ENABLED`, `KLOEL_COMMERCE_DECISION_LINK`,
 * `KLOEL_CHAT_STRATEGY_LEARN`).
 *
 * @see backend/src/kloel/kloel-reply-engine.service.ts (the win-close seam)
 * @see backend/src/kloel/decision-outcome.service.ts (closeOpenChatReplies / sweepExpired)
 * @see backend/src/kloel/decision-sweep.flag.ts (the timeout-loss path)
 * @see backend/src/kloel/commerce-decision-link.flag.ts (the sale-win path)
 */
export function isRealRewardSignalEnabled(): boolean {
  return process.env.KLOEL_REAL_REWARD_SIGNAL === 'true';
}

interface RealRewardSignalLogger {
  warn: (event: string, ctx?: Record<string, unknown>) => void;
}

/**
 * WON — conversation continued: close any still-OPEN `chat_reply` decision for
 * this workspace as a real WIN. Called at the START of the next reply, so the
 * fact that a new inbound message is being answered IS the observed consequence
 * that the prior reply kept the conversation alive.
 *
 * Fire-and-forget and fail-open: a learning failure never reaches the live reply
 * path. No-op when the gate is OFF, the service is unavailable, or the workspace
 * id is missing — so an OFF gate is byte-identical to today (no DB writes).
 */
export function closeOpenChatRepliesAsContinued(
  decisionOutcomeService: DecisionOutcomeService | undefined,
  logger: RealRewardSignalLogger,
  params: { workspaceId: string | undefined | null },
): void {
  if (!isRealRewardSignalEnabled() || !decisionOutcomeService || !params.workspaceId) {
    return;
  }
  const workspaceId = params.workspaceId;
  void decisionOutcomeService
    .closeOpenChatReplies(workspaceId, {
      outcomeName: 'chat.continued',
      wonVsBaseline: true,
    })
    .catch((err: unknown) =>
      logger.warn('kloel_real_reward_continue_close_skipped', {
        workspaceId,
        reason: err instanceof Error ? err.message : 'unknown error',
      }),
    );
}
