import type { StructuredLogger } from '../logging/structured-logger';
import type { DecisionOutcomeService } from './decision-outcome.service';
import type { MindBeliefService } from './mind/inference/mind-belief.service';
import type { MindSurpriseService } from './mind/inference/mind-surprise.service';
import type { MindEventProcessorService } from './mind/runtime/mind-event-processor.service';
import type { ValenceTaggerService } from './mind/valence-tagger.service';
import {
  closeChatReplyOutcome,
  observeRepliedToUserBelief,
  computeChatSurprise,
} from './kloel-reply-engine.decision-outcome.helpers';

export interface ReplyEngineDegradedDeps {
  readonly decisionOutcomeService: DecisionOutcomeService | undefined;
  readonly mindBeliefService: MindBeliefService | undefined;
  readonly mindSurpriseService: MindSurpriseService | undefined;
  readonly mindEventProcessorService: MindEventProcessorService | undefined;
  readonly valenceTagger: ValenceTaggerService | undefined;
  readonly logger: StructuredLogger;
  readonly _lastCognitiveState: { mindSignals?: unknown } | null | undefined;
}

/**
 * Apply post-reply cognitive side effects after successful LLM reply:
 * belief observe + surprise compute + valence tag + event-processor side-effect.
 */
export function applyReplyEnginePostReply(
  deps: ReplyEngineDegradedDeps,
  workspaceId: string,
  replyOutcome: 0 | 1,
): void {
  observeRepliedToUserBelief(deps.mindBeliefService, deps.logger, {
    workspaceId,
    surface: 'dashboard',
    observed: replyOutcome,
  });
  void computeChatSurprise(
    deps.mindSurpriseService,
    deps.mindBeliefService,
    deps.logger,
    { workspaceId, observed: replyOutcome, surface: 'dashboard', degraded: replyOutcome === 0 },
    deps._lastCognitiveState?.mindSignals as Record<string, unknown> | undefined,
  );
  const success = replyOutcome === 1;
  const degraded = replyOutcome === 0;
  try {
    deps.valenceTagger?.tag({
      eventName: 'chat.replied',
      workspaceId,
      payload: { surface: 'dashboard', success, degraded },
    });
  } catch (err: unknown) {
    deps.logger.warn('kloel_valence_tagger_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
  void (async () => {
    try {
      await deps.mindEventProcessorService?.process({
        workspaceId,
        kind: 'chat.replied',
        subject: `workspace:${workspaceId}`,
        occurredAt: new Date(),
        payload: { surface: 'dashboard', success, degraded },
      });
    } catch (err: unknown) {
      deps.logger.warn('kloel_mind_event_processor_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

/**
 * Apply the canonical degraded-path side effects when no LLM client is
 * available: belief observe + surprise compute + outcome close + valence tag
 * + event-processor side-effect.
 */
export function applyReplyEngineDegradedPath(
  deps: ReplyEngineDegradedDeps,
  workspaceId: string | undefined,
  outcomeKey: string | null,
  outcomeName: string,
): void {
  if (workspaceId) {
    observeRepliedToUserBelief(deps.mindBeliefService, deps.logger, {
      workspaceId,
      surface: 'dashboard',
      observed: 0,
    });
    void computeChatSurprise(
      deps.mindSurpriseService,
      deps.mindBeliefService,
      deps.logger,
      { workspaceId, observed: 0, surface: 'dashboard', degraded: true },
      deps._lastCognitiveState?.mindSignals as Record<string, unknown> | undefined,
    );
  }
  closeChatReplyOutcome(deps.decisionOutcomeService, deps.logger, {
    outcomeKey,
    outcomeName,
    wonVsBaseline: false,
  });
  try {
    if (workspaceId) {
      deps.valenceTagger?.tag({
        eventName: 'chat.replied',
        workspaceId,
        payload: { surface: 'dashboard', success: false, degraded: true },
      });
    }
  } catch (err: unknown) {
    deps.logger.warn('kloel_valence_tagger_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
  if (workspaceId) {
    void (async () => {
      try {
        await deps.mindEventProcessorService?.process({
          workspaceId,
          kind: 'chat.replied',
          subject: `workspace:${workspaceId}`,
          occurredAt: new Date(),
          payload: { surface: 'dashboard', success: false, degraded: true },
        });
      } catch (err: unknown) {
        deps.logger.warn('kloel_mind_event_processor_skipped', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }
}
