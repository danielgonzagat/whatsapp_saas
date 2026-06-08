/**
 * P0-C: cognition learning-loop envelope for the STREAMING `think()` path.
 *
 * The streaming primary path (`KloelThinkerService.think`) historically never
 * closed the predictive-coding / decision-outcome loop, which is why
 * RAC_MindPrediction / RAC_MindBanditArm / RAC_DecisionOutcome read 0 rows in
 * production and RAC_MindBelief stayed pinned at its seed priors. The SYNC path
 * (`KloelReplyEngineService.buildAssistantReply`) already closes the loop.
 *
 * This module mirrors that PROVEN envelope for the streaming path WITHOUT
 * re-implementing any bandit/predictor/outcome logic: it calls the exact same
 * fire-and-forget helper functions the sync path uses
 * (`recordChatReplyDecision`, `predictChatReply`, `closeChatReplyOutcome`,
 * `applyReplyEnginePostReply`).
 *
 * It is gated behind {@link isThinkLoopEnabled} (env `KLOEL_THINK_LOOP_ENABLED`,
 * DEFAULT ON). When explicitly disabled (`KLOEL_THINK_LOOP_ENABLED=false`) the
 * caller skips this module entirely — `think()` is byte-for-byte the legacy
 * behavior (no new awaits, no new DB writes, no added latency on the stream
 * critical path). When ON (the default), every call below remains
 * fire-and-forget and try/catch-wrapped, so the loop can never block or crash
 * the user-facing SSE stream.
 *
 * Every call here is fire-and-forget at the helper boundary (the helpers catch
 * their own errors and warn-log), and the orchestration below additionally
 * wraps each entry point in try/catch so a loop failure can NEVER crash the
 * user-facing SSE stream — it logs and degrades gracefully, exactly mirroring
 * how the sync path tolerates loop failures.
 */
import type { StructuredLogger } from '../logging/structured-logger';
import type { DecisionOutcomeService } from './decision-outcome.service';
import type { MindBeliefService } from './mind/inference/mind-belief.service';
import type { MindSurpriseService } from './mind/inference/mind-surprise.service';
import type { MindEventProcessorService } from './mind/runtime/mind-event-processor.service';
import type { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import type { MindPredictorService } from './mind/inference/mind-predictor.service';
import type { ValenceTaggerService } from './mind/valence-tagger.service';
import {
  buildChatOutcomeKey,
  recordChatReplyDecision,
  predictChatReply,
  closeChatReplyOutcome,
} from './kloel-reply-engine.decision-outcome.helpers';
import { applyReplyEnginePostReply } from './kloel-reply-engine.degraded-path.helper';

/** Surface label kept identical to the sync path so the learned rows unify. */
const THINK_LOOP_SURFACE = 'dashboard';

/**
 * The exact set of optional cognition services the loop needs — the SAME ones
 * the reply engine injects. All optional: when a service is absent the reused
 * helpers short-circuit (fire-and-forget), so the loop degrades to a no-op.
 */
export interface ThinkLoopServices {
  readonly decisionOutcomeService: DecisionOutcomeService | undefined;
  readonly mindBeliefService: MindBeliefService | undefined;
  readonly mindSurpriseService: MindSurpriseService | undefined;
  readonly mindEventProcessorService: MindEventProcessorService | undefined;
  readonly mindGlobalPriorService: MindGlobalPriorService | undefined;
  readonly mindPredictorService: MindPredictorService | undefined;
  readonly valenceTagger: ValenceTaggerService | undefined;
}

/** Opaque handle returned by {@link openThinkLoop} and consumed at close time. */
export interface ThinkLoopHandle {
  readonly workspaceId: string;
  readonly outcomeKey: string;
  readonly messageLength: number;
}

/**
 * Feature flag for the streaming-path cognition loop. DEFAULT ON — the loop
 * fires unless `KLOEL_THINK_LOOP_ENABLED` is explicitly set to `'false'` (case
 * insensitive). This is a deliberate prod-default flip: the loop is the only
 * path that closes the predictive-coding / decision-outcome cycle on the
 * primary streaming `think()`, so leaving it OFF kept RAC_MindPrediction /
 * RAC_MindBanditArm / RAC_DecisionOutcome at 0 rows in production. Every call
 * downstream is fire-and-forget and try/catch-wrapped, so an ON default adds no
 * blocking await and can never crash the SSE stream; operators can still hard
 * off via `KLOEL_THINK_LOOP_ENABLED=false`. Uses the inverse of the repo's
 * `=== 'true'` idiom precisely because the safe default here is ON.
 */
export function isThinkLoopEnabled(): boolean {
  return (process.env.KLOEL_THINK_LOOP_ENABLED ?? 'true').toLowerCase() !== 'false';
}

/**
 * Open the learning loop at stream start: record the chat_reply decision AND
 * persist the predictive-coding prediction — the exact pair the sync path runs
 * via `recordChatReplyDecision` (in buildAssistantReply) + `predictChatReply`
 * (in buildAssistantReplyImpl) BEFORE the LLM is invoked.
 *
 * Returns a handle to close the loop after the reply finalizes, or `null` when
 * the loop is disabled / there is no workspace (nothing to learn against).
 *
 * Synchronous + fire-and-forget: never awaits, never throws — a thrown error is
 * caught and warn-logged so the SSE stream is unaffected.
 */
export function openThinkLoop(
  services: ThinkLoopServices,
  logger: StructuredLogger,
  params: { workspaceId: string | undefined; messageLength: number },
): ThinkLoopHandle | null {
  if (!isThinkLoopEnabled() || !params.workspaceId) {
    return null;
  }
  const { workspaceId } = params;
  const outcomeKey = buildChatOutcomeKey(workspaceId);
  if (!outcomeKey) {
    return null;
  }
  try {
    recordChatReplyDecision(services.decisionOutcomeService, logger, {
      workspaceId,
      outcomeKey,
      surface: THINK_LOOP_SURFACE,
      messageLength: params.messageLength,
    });
    predictChatReply(services.mindPredictorService, logger, {
      workspaceId,
      surface: THINK_LOOP_SURFACE,
    });
  } catch (err: unknown) {
    logger.warn('kloel_think_loop_open_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
  return { workspaceId, outcomeKey, messageLength: params.messageLength };
}

/**
 * Close the learning loop after the streaming reply has been finalized. Mirrors
 * the sync path's success arm: `closeChatReplyOutcome('chat.replied', won)` +
 * `applyReplyEnginePostReply` (belief observe + resolveChatReplySurprise +
 * recordChatReplyGlobalPrior + valence tag + event-processor side-effect).
 *
 * `replyOutcome` is 1 for a real reply, 0 for the degraded/empty fallback —
 * identical to the sync path's `assistantMessage.length > 0 ? 1 : 0`.
 *
 * Synchronous + fire-and-forget: never awaits, never throws.
 */
export function closeThinkLoopSuccess(
  services: ThinkLoopServices,
  logger: StructuredLogger,
  handle: ThinkLoopHandle | null,
  replyOutcome: 0 | 1,
): void {
  if (!handle) {
    return;
  }
  try {
    closeChatReplyOutcome(services.decisionOutcomeService, logger, {
      outcomeKey: handle.outcomeKey,
      outcomeName: replyOutcome === 1 ? 'chat.replied' : 'chat.degraded',
      wonVsBaseline: replyOutcome === 1,
    });
    applyReplyEnginePostReply(
      {
        decisionOutcomeService: services.decisionOutcomeService,
        mindBeliefService: services.mindBeliefService,
        mindSurpriseService: services.mindSurpriseService,
        mindEventProcessorService: services.mindEventProcessorService,
        mindPredictorService: services.mindPredictorService,
        mindGlobalPriorService: services.mindGlobalPriorService,
        valenceTagger: services.valenceTagger,
        logger,
        // The streaming path does not expose the reply engine's private
        // `_lastCognitiveState`; passing undefined makes computeChatSurprise
        // fall back to the `replied_to_user` belief baseline (fail-open),
        // exactly as the sync degraded path does. The DB-resolving
        // resolveChatReplySurprise call inside applyReplyEnginePostReply still
        // closes the open MindPrediction and moves the belief alpha/beta.
        _lastCognitiveState: undefined,
      },
      handle.workspaceId,
      replyOutcome,
    );
  } catch (err: unknown) {
    logger.warn('kloel_think_loop_close_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Close the learning loop when the streaming reply FAILED (threw before/at
 * finalize). Mirrors the sync path's catch arm: `closeChatReplyOutcome(
 * 'chat.error', won=false)`. We do NOT run applyReplyEnginePostReply here — the
 * sync path's post-reply observation only runs on the success arm.
 *
 * Synchronous + fire-and-forget: never awaits, never throws.
 */
export function closeThinkLoopError(
  services: ThinkLoopServices,
  logger: StructuredLogger,
  handle: ThinkLoopHandle | null,
): void {
  if (!handle) {
    return;
  }
  try {
    closeChatReplyOutcome(services.decisionOutcomeService, logger, {
      outcomeKey: handle.outcomeKey,
      outcomeName: 'chat.error',
      wonVsBaseline: false,
    });
  } catch (err: unknown) {
    logger.warn('kloel_think_loop_close_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
