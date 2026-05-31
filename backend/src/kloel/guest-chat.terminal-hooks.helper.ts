import type { StructuredLogger } from '../logging/structured-logger';
import type { DecisionOutcomeService } from './decision-outcome.service';
import type { MindBeliefService } from './mind/inference/mind-belief.service';
import type { MindSurpriseService } from './mind/inference/mind-surprise.service';
import type { MindObservabilityService } from './mind/observability/mind-observability.service';
import {
  closeChatReplyOutcome,
  observeRepliedToUserBelief,
  computeChatSurprise,
  resolveChatReplySurprise,
} from './kloel-reply-engine.decision-outcome.helpers';

export interface GuestChatTerminalDeps {
  readonly decisionOutcomeService: DecisionOutcomeService | undefined;
  readonly mindBeliefService: MindBeliefService | undefined;
  readonly mindSurpriseService: MindSurpriseService | undefined;
  readonly mindObservability: MindObservabilityService | undefined;
  readonly logger: StructuredLogger;
  readonly opsAlert: { alertOnCriticalError?: (err: unknown, source: string) => void } | undefined;
  readonly _lastCognitiveState: { mindSignals?: unknown } | null | undefined;
}

export interface GuestChatTerminalParams {
  readonly outcomeKey: string | null;
  readonly success: boolean;
  readonly workspaceId: string;
  readonly surface: 'guest' | 'admin' | 'whatsapp';
  readonly startedAt: number;
}

/**
 * Apply the canonical post-chat cognitive hook sequence:
 * closeChatReplyOutcome → observeRepliedToUserBelief → computeChatSurprise →
 * observeReplyFireAndForget. Fire-and-forget; never throws.
 */
export function applyChatTerminalHooks(
  deps: GuestChatTerminalDeps,
  params: GuestChatTerminalParams,
  error?: unknown,
): void {
  const observed: 0 | 1 = params.success ? 1 : 0;
  closeChatReplyOutcome(deps.decisionOutcomeService, deps.logger, {
    outcomeKey: params.outcomeKey,
    outcomeName: error ? 'chat.error' : 'chat.replied',
    wonVsBaseline: params.success,
  });
  observeRepliedToUserBelief(deps.mindBeliefService, deps.logger, {
    workspaceId: params.workspaceId,
    surface: params.surface,
    observed,
  });
  void computeChatSurprise(
    deps.mindSurpriseService,
    deps.mindBeliefService,
    deps.logger,
    {
      workspaceId: params.workspaceId,
      observed,
      surface: params.surface,
      degraded: !params.success,
    },
    deps._lastCognitiveState?.mindSignals as Record<string, unknown> | undefined,
  );
  // w4-guestchat-loop: close the predictive-coding loop on the LIVE guest surface.
  // resolveChatReplySurprise resolves the open `P(reply|...)` MindPrediction that
  // GuestChatService.predictChatReply persists at decision time (findOpen +
  // resolve + observeBinary), moving the underlying MindBelief alpha/beta off the
  // 1/1 prior. computeChatSurprise above stays the additive diagnostic read; this
  // is the real DB resolution that closes predict→surprise→belief on guest.
  // Mirrors KloelReplyEngineService.applyReplyEnginePostReply.
  resolveChatReplySurprise(deps.mindSurpriseService, deps.logger, {
    workspaceId: params.workspaceId,
    observed,
    surface: params.surface,
  });
  if (deps.mindObservability) {
    try {
      deps.mindObservability.observeReply(params.workspaceId, {
        surface: params.surface,
        durationMs: Date.now() - params.startedAt,
        success: params.success,
      });
    } catch {
      // fire-and-forget
    }
  }
  if (error && deps.opsAlert?.alertOnCriticalError) {
    void deps.opsAlert.alertOnCriticalError(error, `GuestChatService.${params.surface}`);
  }
}
