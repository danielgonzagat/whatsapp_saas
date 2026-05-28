/**
 * Helpers extracted from conversational-onboarding.service.ts to keep the
 * service file under the architecture gate's max_touched LOC ceiling.
 *
 * Centralizes:
 *   - buildOnboardingMindSignalsDeps: conditional mind-signals deps spread
 *     (matches kloel-reply-engine.service for parity);
 *   - emitOnboardingCognitionDecision: PI-k6 spine.emit fire-and-forget for
 *     the cognition.decision_made event.
 *
 * All emissions are fire-and-forget — failures warn-log and never throw.
 */
import type { BuildMindSignalsDeps } from './mind/build-mind-signals.helper';
import type { SpineEmitterService } from './spine/spine-emitter.service';
import type { AttentionService } from './mind/attention.service';
import type { ValenceAggregatorService } from './mind/valence-aggregator.service';
import type { MindBeliefService } from './mind/inference/mind-belief.service';
import type { MindConceptService } from './mind/memory/mind-concepts.service';
import type { SelfHealthService } from './self-awareness/self-health.service';
import type { SelfGapsService } from './self-awareness/self-gaps.service';
import type { RiskClassService } from './risk-class/risk-class.service';

interface OnboardingHelperLogger {
  warn: (event: string, ctx?: Record<string, unknown>) => void;
}

interface OnboardingMindServices {
  attentionService?: AttentionService;
  valenceAggregatorService?: ValenceAggregatorService;
  mindBeliefService?: MindBeliefService;
  mindConceptService?: MindConceptService;
  selfHealthService?: SelfHealthService;
  selfGapsService?: SelfGapsService;
  riskClassService?: RiskClassService;
  mindVerbalizerService?: { narrate?: (workspaceId: string) => Promise<string> };
}

/**
 * Build a BuildMindSignalsDeps spread that includes only services that are
 * defined — mirrors the same shape used in kloel-reply-engine.service.
 */
export function buildOnboardingMindSignalsDeps(
  prisma: BuildMindSignalsDeps['prisma'],
  logger: { warn: (...args: unknown[]) => void },
  services: OnboardingMindServices,
): BuildMindSignalsDeps {
  return {
    prisma,
    logger,
    ...(services.attentionService !== undefined
      ? { attentionService: services.attentionService }
      : {}),
    ...(services.valenceAggregatorService !== undefined
      ? { valenceAggregatorService: services.valenceAggregatorService }
      : {}),
    ...(services.mindBeliefService !== undefined
      ? { mindBeliefService: services.mindBeliefService }
      : {}),
    ...(services.mindConceptService !== undefined
      ? { mindConceptService: services.mindConceptService }
      : {}),
    ...(services.selfHealthService !== undefined
      ? { selfHealthService: services.selfHealthService }
      : {}),
    ...(services.selfGapsService !== undefined
      ? { selfGapsService: services.selfGapsService }
      : {}),
    ...(services.riskClassService !== undefined
      ? { riskClassService: services.riskClassService }
      : {}),
    ...(services.mindVerbalizerService !== undefined
      ? { mindVerbalizerService: services.mindVerbalizerService }
      : {}),
  };
}

/**
 * PI-k6: emit cognition.decision_made after the primary onboarding completion.
 * Wrapped in an async IIFE so the caller can fire-and-forget via void.
 *
 * When the spine is not injected, a single warn is logged with
 * reason='spine_not_injected'. When the spine throws, the failure is logged
 * with reason=<error message>.
 */
export function emitOnboardingCognitionDecision(
  spine: SpineEmitterService | undefined,
  logger: OnboardingHelperLogger,
  params: {
    workspaceId: string;
    toolCallsCount: number;
    completionStartMs: number;
    modelUsed: string;
  },
): void {
  void (async () => {
    if (!spine) {
      logger.warn('kloel_cognition_event_skipped', { reason: 'spine_not_injected' });
      return;
    }
    try {
      await spine.emit({
        eventName: 'cognition.decision_made',
        workspaceId: params.workspaceId,
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'conversational-onboarding',
          processorVersion: '1.0.0',
          schemaVersion: '1.0.0',
        },
        payload: {
          surface: 'onboarding',
          toolCallsCount: params.toolCallsCount,
          fallbackReason: null,
          durationMs: Date.now() - params.completionStartMs,
          modelUsed: params.modelUsed,
        },
      });
    } catch (err: unknown) {
      logger.warn('kloel_cognition_event_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
