import { randomIdSegment } from '../common/random-id';
import type { DecisionOutcomeService } from './decision-outcome.service';

/**
 * Feature flag for the ADDITIVE capability-turn observability closure.
 *
 * The gap this closes: capability/tool-driven replies BYPASS the cognition
 * reply engine. In `thinkSyncImpl` the line
 *   `capabilityResult?.content || replyEngine.buildAssistantReply(...)`
 * short-circuits: when a composer capability (create_image / create_site /
 * search_web / refine_response) produces the reply, `buildAssistantReply` never
 * runs, so NONE of the reply engine's learning hooks fire for that turn —
 * no `recordDecision`, no bandit `choose`, no `closeOutcome`, no belief/surprise
 * update. Capability turns are therefore INVISIBLE to the Mind: the cognitive
 * substrate never sees that a capability produced the answer.
 *
 * When `KLOEL_CAPABILITY_TURN_LEARN` is `'true'`, ONE ADDITIVE side effect turns
 * on: the capability turn is also `recordDecision`-ed into `RAC_DecisionOutcome`
 * with `decisionType: 'capability_reply'` and `chosenAction` = the capability
 * name, so the turn becomes OBSERVABLE to the Mind (a closable decision row + the
 * matching bandit arm now exist for capability turns, exactly as plain chat turns
 * already have).
 *
 * CRITICAL — the reply itself is UNCHANGED. We do NOT alter which content is
 * returned: the `capabilityResult.content` path is preserved verbatim. This is
 * pure observability, not a decision change.
 *
 * DEFAULT OFF. With the flag OFF the code is byte-for-byte equivalent to today:
 * no recordDecision, no extra row — the capability short-circuit is untouched in
 * both states.
 *
 * Best-effort / fail-open: a learning-side failure is swallowed with a warn-log
 * so it can NEVER break the live reply path.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_CART_RECOVERY_LEARN`, `KLOEL_CHAT_STRATEGY_LEARN`) and reuses the
 * canonical `DecisionOutcomeService.recordDecision` producer (same one
 * `recordChatReplyDecision` uses for plain chat turns).
 *
 * @see backend/src/kloel/kloel-thinker.helpers.ts (the capability short-circuit)
 * @see backend/src/kloel/decision-outcome.service.ts
 * @see backend/src/kloel/kloel-reply-engine.decision-outcome.helpers.ts (chat-turn sibling)
 */
export function isCapabilityTurnLearnEnabled(): boolean {
  return process.env.KLOEL_CAPABILITY_TURN_LEARN === 'true';
}

/** Canonical decision type for capability-driven (bypass-the-reply-engine) turns. */
export const CAPABILITY_REPLY_DECISION_TYPE = 'capability_reply';

/** Minimal structural logger — decoupled from any concrete logger class. */
interface CapabilityTurnLogger {
  warn: (event: string, ctx?: Record<string, unknown>) => void;
}

/**
 * Build the per-turn outcomeKey for a capability decision. Mirrors
 * `buildChatOutcomeKey`'s shape but namespaced to `capability:` so capability
 * turns are greppable + never collide with the chat-reply key space.
 */
export function buildCapabilityOutcomeKey(workspaceId: string): string {
  return `capability:${workspaceId}:${Date.now()}:${randomIdSegment(6)}`;
}

/**
 * Record a capability-driven turn as a `capability_reply` decision into
 * `RAC_DecisionOutcome`, so capability turns are OBSERVABLE to the Mind.
 *
 * Gated by `isCapabilityTurnLearnEnabled()` — when OFF this is a no-op (no call),
 * preserving today's behavior byte-for-byte. Fire-and-forget: catches its own
 * errors and warn-logs; never throws into the live reply path.
 *
 * `chosenAction` is the capability name (e.g. 'search_web'); the baseline is the
 * reply-engine path the capability bypassed ('reply_engine'), so the bandit arm
 * pair (capability vs reply_engine) exists for later attribution.
 */
export function recordCapabilityTurnDecision(
  decisionOutcomeService: DecisionOutcomeService | undefined,
  logger: CapabilityTurnLogger,
  params: {
    workspaceId: string;
    capability: string;
    mode: string;
    messageLength: number;
    replyLength: number;
  },
): void {
  if (!isCapabilityTurnLearnEnabled() || !decisionOutcomeService) {
    return;
  }
  decisionOutcomeService
    .recordDecision({
      workspaceId: params.workspaceId,
      decisionType: CAPABILITY_REPLY_DECISION_TYPE,
      chosenAction: params.capability,
      baselineAction: 'reply_engine',
      outcomeKey: buildCapabilityOutcomeKey(params.workspaceId),
      expectedWindow: 1,
      contextSnapshot: {
        surface: params.mode,
        capability: params.capability,
        messageLength: params.messageLength,
        replyLength: params.replyLength,
      },
    })
    .catch((err: unknown) =>
      logger.warn('kloel_capability_turn_decision_skipped', {
        capability: params.capability,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}
