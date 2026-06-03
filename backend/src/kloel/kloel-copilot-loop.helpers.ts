/**
 * One-Mind unification: cognition learning-loop envelope for the COPILOT reply
 * surface (`CopilotService.suggest`).
 *
 * The Copilot service was a fully isolated cognition island — it called OpenAI
 * directly and never closed the predictive-coding / decision-outcome loop, so
 * its turns never reached RAC_MindPrediction / RAC_DecisionOutcome /
 * RAC_MindBelief / RAC_MindGlobalPrior.
 *
 * This module mirrors the PROVEN streaming-path envelope
 * (`kloel-thinker-think-loop.helpers.ts`, P0-C) WITHOUT re-implementing any
 * bandit / predictor / outcome logic: it composes the exact same fire-and-forget
 * helper functions the sync reply engine and the think loop use
 * (`recordChatReplyDecision`, `predictChatReply`, `closeChatReplyOutcome`,
 * `observeRepliedToUserBelief`, `resolveChatReplySurprise`,
 * `recordChatReplyGlobalPrior`). The only difference from the think loop is a
 * distinct surface discriminator — {@link COPILOT_LOOP_SURFACE} = `'copilot'` —
 * so the learned rows are attributable to the Copilot surface.
 *
 * It is gated behind {@link isCopilotLoopEnabled} (env
 * `KLOEL_COPILOT_LOOP_ENABLED`, DEFAULT OFF). When OFF the caller's
 * {@link openCopilotLoop} short-circuits to `null` before any service is
 * touched — `suggest()` is byte-for-byte the current behavior (no new awaits, no
 * new DB writes, no added latency on the reply critical path).
 *
 * Every call here is fire-and-forget at the helper boundary (the reused helpers
 * catch their own errors and warn-log), and each entry point is additionally
 * wrapped in try/catch so a loop failure can NEVER break the user-facing Copilot
 * answer — it logs and degrades to a no-op.
 */
import {
  buildChatOutcomeKey,
  recordChatReplyDecision,
  predictChatReply,
  closeChatReplyOutcome,
  observeRepliedToUserBelief,
  resolveChatReplySurprise,
  recordChatReplyGlobalPrior,
} from './kloel-reply-engine.decision-outcome.helpers';
import type { DecisionOutcomeService } from './decision-outcome.service';
import type { MindBeliefService } from './mind/inference/mind-belief.service';
import type { MindSurpriseService } from './mind/inference/mind-surprise.service';
import type { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import type { MindPredictorService } from './mind/inference/mind-predictor.service';
import { isCopilotLoopEnabled } from './kloel-copilot-loop.flag';

/**
 * Structural logger contract — identical to the reused helpers' own contract.
 * A `StructuredLogger` satisfies it; a plain NestJS `Logger` does not (its
 * `warn`/`log` second arg is `context?: string`, not a `Record`).
 */
export interface CopilotLoopLogger {
  warn: (event: string, ctx?: Record<string, unknown>) => void;
  log?: (payload: Record<string, unknown>) => void;
}

/**
 * Distinct surface discriminator so the learned rows are attributable to the
 * Copilot surface (the sync/think paths use `'dashboard'`).
 */
export const COPILOT_LOOP_SURFACE = 'copilot';

/**
 * The exact set of optional cognition services the loop needs — the SAME ones
 * the reply engine / think loop inject. All optional: when a service is absent
 * the reused helpers short-circuit (fire-and-forget), so the loop degrades to a
 * no-op.
 */
export interface CopilotLoopServices {
  readonly decisionOutcomeService: DecisionOutcomeService | undefined;
  readonly mindBeliefService: MindBeliefService | undefined;
  readonly mindSurpriseService: MindSurpriseService | undefined;
  readonly mindGlobalPriorService: MindGlobalPriorService | undefined;
  readonly mindPredictorService: MindPredictorService | undefined;
}

/** Opaque handle returned by {@link openCopilotLoop} and consumed at close. */
export interface CopilotLoopHandle {
  readonly workspaceId: string;
  readonly outcomeKey: string;
  readonly messageLength: number;
}

/**
 * Open the learning loop BEFORE the Copilot LLM call: record the chat_reply
 * decision AND persist the predictive-coding prediction — the exact pair the
 * sync/think paths run via `recordChatReplyDecision` + `predictChatReply` ahead
 * of the LLM invocation.
 *
 * Returns a handle to close the loop after the reply, or `null` when the loop is
 * disabled (flag OFF) or there is no workspace (nothing to learn against).
 *
 * Synchronous + fire-and-forget: never awaits, never throws — a thrown error is
 * caught and warn-logged so the Copilot answer is unaffected.
 */
export function openCopilotLoop(
  services: CopilotLoopServices,
  logger: CopilotLoopLogger,
  params: { workspaceId: string | undefined; messageLength: number },
): CopilotLoopHandle | null {
  if (!isCopilotLoopEnabled() || !params.workspaceId) {
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
      surface: COPILOT_LOOP_SURFACE,
      messageLength: params.messageLength,
    });
    predictChatReply(services.mindPredictorService, logger, {
      workspaceId,
      surface: COPILOT_LOOP_SURFACE,
    });
  } catch (err: unknown) {
    logger.warn('kloel_copilot_loop_open_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
  return { workspaceId, outcomeKey, messageLength: params.messageLength };
}

/**
 * Close the learning loop after a successful Copilot reply. Mirrors the sync
 * path's success arm under the `'copilot'` surface: `closeChatReplyOutcome` +
 * belief observe + `resolveChatReplySurprise` (resolves the open MindPrediction
 * and moves the belief alpha/beta) + cross-workspace global prior.
 *
 * `replyOutcome` is 1 for a real suggestion, 0 for the degraded/fallback text —
 * identical to the sync path's `assistantMessage.length > 0 ? 1 : 0`.
 *
 * Synchronous + fire-and-forget: never awaits, never throws.
 */
export function closeCopilotLoopSuccess(
  services: CopilotLoopServices,
  logger: CopilotLoopLogger,
  handle: CopilotLoopHandle | null,
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
    observeRepliedToUserBelief(services.mindBeliefService, logger, {
      workspaceId: handle.workspaceId,
      surface: COPILOT_LOOP_SURFACE,
      observed: replyOutcome,
    });
    resolveChatReplySurprise(services.mindSurpriseService, logger, {
      workspaceId: handle.workspaceId,
      observed: replyOutcome,
      surface: COPILOT_LOOP_SURFACE,
    });
    recordChatReplyGlobalPrior(services.mindGlobalPriorService, logger, {
      surface: COPILOT_LOOP_SURFACE,
      observed: replyOutcome,
    });
  } catch (err: unknown) {
    logger.warn('kloel_copilot_loop_close_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Close the learning loop when the Copilot reply FAILED (threw before/at the
 * answer). Mirrors the sync path's catch arm: `closeChatReplyOutcome(
 * 'chat.error', won=false)`. The post-reply observation only runs on success.
 *
 * Synchronous + fire-and-forget: never awaits, never throws.
 */
export function closeCopilotLoopError(
  services: CopilotLoopServices,
  logger: CopilotLoopLogger,
  handle: CopilotLoopHandle | null,
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
    logger.warn('kloel_copilot_loop_close_skipped', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
