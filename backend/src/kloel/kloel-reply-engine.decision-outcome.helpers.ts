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
import { type MindPredictorService } from './mind/inference/mind-predictor.service';
import { type MindGlobalPriorService } from './mind/memory/mind-global-prior.service';

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
 * Persist a MindPrediction for the chat-reply predictive-coding loop BEFORE the
 * reply is acted on. This is the missing producer that fed the previously-empty
 * RAC_MindPrediction table: predictReply writes a row with the canonical
 * `P(reply|template,hour,channel)` predicate, which resolveChatReplySurprise
 * later resolves + observes (moving the underlying belief's alpha/beta).
 *
 * Fire-and-forget: catches its own errors and warn-logs; never throws upstream.
 */
export function predictChatReply(
  mindPredictorService: MindPredictorService | undefined,
  logger: DecisionOutcomeLogger,
  params: {
    workspaceId: string;
    surface: string;
    channel?: string;
    horizonSec?: number;
  },
): void {
  if (!mindPredictorService) {
    return;
  }
  void mindPredictorService
    .predictReply(
      {
        workspaceId: params.workspaceId,
        subject: params.workspaceId,
        features: {
          template: params.surface,
          channel: params.channel ?? params.surface,
          hour: new Date().getHours(),
        },
      },
      params.horizonSec ?? 60,
    )
    .catch((err: unknown) =>
      logger.warn('kloel_reply_prediction_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}

/**
 * Close the chat-reply predictive-coding loop. Replaces the pure-math
 * computeChatSurprise side-effect: resolveReply runs findOpen + resolve +
 * observeBinary, so the open MindPrediction is resolved AND the underlying
 * MindBelief alpha/beta is updated from the real outcome. Logs surprise when it
 * exceeds the 0.3 threshold.
 *
 * Fire-and-forget: catches its own errors and warn-logs; never throws upstream.
 */
export function resolveChatReplySurprise(
  mindSurpriseService: MindSurpriseService | undefined,
  logger: DecisionOutcomeLogger,
  params: {
    workspaceId: string;
    observed: 0 | 1;
    surface: string;
  },
): void {
  if (!mindSurpriseService) {
    return;
  }
  void mindSurpriseService
    .resolveReply(params.workspaceId, params.workspaceId, params.observed)
    .then((surprise) => {
      if (surprise > 0.3) {
        logger.log?.({
          event: 'kloel_chat_surprise_detected',
          workspaceId: params.workspaceId,
          observed: params.observed,
          surpriseValue: surprise,
          surface: params.surface,
          source: 'prediction',
        });
      }
    })
    .catch((err: unknown) =>
      logger.warn('kloel_surprise_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}

/**
 * PI-k9 / PI-K12-C: compute chat surprise (predicted vs observed) and log when
 * it exceeds the 0.3 threshold.
 *
 * When `mindSignals?.prediction` is present, its `confidence` is used as the
 * predicted probability (closing the predictive-coding loop). Otherwise falls
 * back to the `replied_to_user` belief baseline.
 *
 * Uses a 30ms timeout on the belief lookup to avoid blocking the reply path;
 * failures are warn-logged and swallowed.
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
  mindSignals?: Record<string, unknown>,
): Promise<void> {
  if (!mindSurpriseService) {
    return;
  }

  try {
    let predicted: number;
    let source: 'prediction' | 'belief' = 'belief';

    // PI-K12-C: use mindSignals.prediction.confidence when available
    const predictionSignal = mindSignals?.prediction as
      | { expected?: string; confidence?: number }
      | undefined;
    if (
      predictionSignal !== undefined &&
      typeof predictionSignal.confidence === 'number' &&
      !Number.isNaN(predictionSignal.confidence)
    ) {
      predicted = predictionSignal.confidence;
      source = 'prediction';
    } else if (mindBeliefService) {
      const belief = await Promise.race([
        mindBeliefService.getOrInit(params.workspaceId, params.workspaceId, 'replied_to_user', {
          surface: params.surface,
          degraded: params.degraded,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SURPRISE_TIMEOUT')), 30),
        ),
      ]);
      predicted = belief.mean;
    } else {
      return;
    }

    const surprise = mindSurpriseService.computeSurprise(predicted, params.observed);

    if (surprise > 0.3) {
      logger.log?.({
        event: 'kloel_chat_surprise_detected',
        workspaceId: params.workspaceId,
        predicted,
        observed: params.observed,
        surpriseValue: surprise,
        surface: params.surface,
        source,
      });
    }
  } catch (err: unknown) {
    logger.warn('kloel_surprise_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Feed the chat-reply outcome back into the cross-workspace global prior. This
 * is the missing producer for the previously-empty RAC_MindGlobalPrior table on
 * the live chat-reply path: `MindPolicy.resolveOutcome` only fires on the
 * controller/event-processor paths, so the dashboard reply path needs to call
 * `recordObservation` directly to keep the `bandit-obs:chat_reply:engage`
 * cross-workspace row growing (samples +1 per reply).
 *
 * Mirrors the bandit arm that `DecisionOutcomeService.closeOutcome` records for
 * the same chat_reply decision (chosenAction `engage`), so the local bandit and
 * the cross-workspace prior learn from the same signal.
 *
 * Fire-and-forget: catches its own errors and warn-logs; never throws upstream.
 */
export function recordChatReplyGlobalPrior(
  mindGlobalPriorService: MindGlobalPriorService | undefined,
  logger: DecisionOutcomeLogger,
  params: {
    surface: string;
    observed: 0 | 1;
  },
): void {
  if (!mindGlobalPriorService) {
    return;
  }
  void mindGlobalPriorService
    .recordObservation(params.surface, 'chat_reply', 'engage', params.observed === 1)
    .catch((err: unknown) =>
      logger.warn('kloel_global_prior_observation_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
}
