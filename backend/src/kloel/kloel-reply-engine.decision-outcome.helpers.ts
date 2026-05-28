/**
 * PI-k8 / PI-k9 helpers extracted from kloel-reply-engine.service.ts to keep
 * the service under the architecture gate's max_touched LOC ceiling.
 *
 * All helpers are fire-and-forget — they catch their own errors and emit a
 * structured warn() through the supplied logger. They never throw upstream.
 */
import { randomIdSegment } from '../common/random-id';
import type { DecisionOutcomeService } from './decision-outcome.service';
import type { MindBeliefService } from './mind/inference/mind-belief.service';
import type { MindSurpriseService } from './mind/inference/mind-surprise.service';

interface DecisionOutcomeLogger {
  warn: (event: string, ctx?: Record<string, unknown>) => void;
  log?: (payload: Record<string, unknown>) => void;
}

/** Build the per-reply outcomeKey used by recordDecision + closeOutcome. */
export function buildChatOutcomeKey(workspaceId: string | undefined | null): string | null {
  if (!workspaceId) {
    return null;
  }
  return `chat:${workspaceId}:${Date.now()}:${randomIdSegment(6)}`;
}

/** PI-k8: record a chat_reply decision outcome (fire-and-forget). */
export function recordChatReplyDecision(
  decisionOutcomeService: DecisionOutcomeService | undefined,
  logger: DecisionOutcomeLogger,
  params: {
    workspaceId: string;
    outcomeKey: string;
    surface: string;
    messageLength: number;
  },
): void {
  decisionOutcomeService
    ?.recordDecision({
      workspaceId: params.workspaceId,
      decisionType: 'chat_reply',
      chosenAction: 'engage',
      baselineAction: 'silence',
      outcomeKey: params.outcomeKey,
      expectedWindow: 1,
      contextSnapshot: {
        surface: params.surface,
        messageLength: params.messageLength,
      },
    })
    .catch((err: unknown) =>
      logger.warn('kloel_decision_record_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}

/** PI-k8: close a chat_reply outcome (fire-and-forget). */
export function closeChatReplyOutcome(
  decisionOutcomeService: DecisionOutcomeService | undefined,
  logger: DecisionOutcomeLogger,
  params: {
    outcomeKey: string | null;
    outcomeName: string;
    wonVsBaseline: boolean;
  },
): void {
  if (!params.outcomeKey) {
    return;
  }
  decisionOutcomeService
    ?.closeOutcome({
      outcomeKey: params.outcomeKey,
      outcomeName: params.outcomeName,
      wonVsBaseline: params.wonVsBaseline,
    })
    .catch((err: unknown) =>
      logger.warn('kloel_decision_close_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}

/** Observe the 'replied_to_user' binary belief (fire-and-forget). */
export function observeRepliedToUserBelief(
  mindBeliefService: MindBeliefService | undefined,
  logger: DecisionOutcomeLogger,
  params: {
    workspaceId: string;
    surface: string;
    observed: 0 | 1;
    degraded?: boolean;
  },
): void {
  const context: Record<string, unknown> = { surface: params.surface };
  if (params.degraded !== undefined) {
    context.degraded = params.degraded;
  }
  mindBeliefService
    ?.observeBinary(
      params.workspaceId,
      params.workspaceId,
      'replied_to_user',
      context,
      params.observed,
    )
    .catch((err: unknown) =>
      logger.warn('kloel_belief_observation_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}

/**
 * PI-k9: compute chat surprise (predicted vs observed) and log when it exceeds
 * the 0.3 threshold. Uses a 30ms timeout on the belief lookup to avoid blocking
 * the reply path; failures are warn-logged and swallowed.
 */
export async function computeChatSurprise(
  mindSurpriseService: MindSurpriseService | undefined,
  mindBeliefService: MindBeliefService | undefined,
  logger: DecisionOutcomeLogger,
  params: {
    workspaceId: string;
    observed: 0 | 1;
    surface: string;
    degraded: boolean;
  },
): Promise<void> {
  if (!mindSurpriseService || !mindBeliefService) {
    return;
  }

  try {
    const belief = await Promise.race([
      mindBeliefService.getOrInit(params.workspaceId, params.workspaceId, 'replied_to_user', {
        surface: params.surface,
        degraded: params.degraded,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SURPRISE_TIMEOUT')), 30),
      ),
    ]);

    const predicted = belief.mean;
    const surprise = mindSurpriseService.computeSurprise(predicted, params.observed);

    if (surprise > 0.3) {
      logger.log?.({
        event: 'kloel_chat_surprise_detected',
        workspaceId: params.workspaceId,
        predicted,
        observed: params.observed,
        surpriseValue: surprise,
        surface: params.surface,
      });
    }
  } catch (err: unknown) {
    logger.warn('kloel_surprise_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
