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

export interface OnboardingCognitiveDeps {
  readonly decisionOutcomeService: DecisionOutcomeService | undefined;
  readonly mindBeliefService: MindBeliefService | undefined;
  readonly mindSurpriseService: MindSurpriseService | undefined;
  readonly mindEventProcessorService: MindEventProcessorService | undefined;
  readonly valenceTagger: ValenceTaggerService | undefined;
  readonly logger: StructuredLogger;
}

export interface OnboardingSuccessParams {
  readonly workspaceId: string;
  readonly outcomeKey: string | null | undefined;
  readonly successOutcomeName: string;
  readonly degradedReason: string | undefined;
}

export interface OnboardingFailureParams {
  readonly workspaceId: string;
  readonly outcomeKey: string | null | undefined;
}

export function applyOnboardingSuccessHooks(
  deps: OnboardingCognitiveDeps,
  params: OnboardingSuccessParams,
): void {
  closeChatReplyOutcome(deps.decisionOutcomeService, deps.logger, {
    outcomeKey: params.outcomeKey ?? null,
    outcomeName: params.successOutcomeName,
    wonVsBaseline: !params.degradedReason,
  });
  observeRepliedToUserBelief(deps.mindBeliefService, deps.logger, {
    workspaceId: params.workspaceId,
    surface: 'onboarding',
    observed: 1,
    degraded: false,
  });
  void computeChatSurprise(deps.mindSurpriseService, deps.mindBeliefService, deps.logger, {
    workspaceId: params.workspaceId,
    observed: 1,
    surface: 'onboarding',
    degraded: false,
  });
  emitOnboardingSideEffects(deps, params.workspaceId, true, !!params.degradedReason);
}

export function applyOnboardingFailureHooks(
  deps: OnboardingCognitiveDeps,
  params: OnboardingFailureParams,
): void {
  observeRepliedToUserBelief(deps.mindBeliefService, deps.logger, {
    workspaceId: params.workspaceId,
    surface: 'onboarding',
    observed: 0,
    degraded: true,
  });
  void computeChatSurprise(deps.mindSurpriseService, deps.mindBeliefService, deps.logger, {
    workspaceId: params.workspaceId,
    observed: 0,
    surface: 'onboarding',
    degraded: true,
  });
  emitOnboardingSideEffects(deps, params.workspaceId, false, true);
}

function emitOnboardingSideEffects(
  deps: OnboardingCognitiveDeps,
  workspaceId: string,
  success: boolean,
  degraded: boolean,
): void {
  try {
    deps.valenceTagger?.tag({
      eventName: 'chat.replied',
      workspaceId,
      payload: { surface: 'onboarding', success, degraded },
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
        payload: { surface: 'onboarding', success, degraded },
      });
    } catch (err: unknown) {
      deps.logger.warn('kloel_mind_event_processor_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
