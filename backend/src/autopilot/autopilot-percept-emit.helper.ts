import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isAutopilotPerceptEmitEnabled } from './autopilot-percept-emit.flag';
import {
  emitPerceptToMindSpine,
  type OutboxPrismaDelegate,
} from '../kloel/mind/coordination/percept-emit.factory';

/**
 * Canonical cognition event type for an autopilot *decision* (the autopilot loop
 * choosing an action for a conversation). Mirrors the `cognition.*` taxonomy
 * used across the spine. Deliberately distinct from the ingestor's exact
 * `cognition.decision_made` poll string so this is purely additive telemetry —
 * a durable percept, never auto-reprocessed by the decision ingestor.
 */
export const AUTOPILOT_DECISION_MADE_EVENT_TYPE = 'cognition.autopilot.decision_made';

/**
 * Canonical cognition event type for an autopilot *action* (the autopilot loop
 * executing/dispatching an autonomous reply send).
 */
export const AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE = 'cognition.autopilot.action_executed';

export interface AutopilotDecisionPerceptParams {
  readonly workspaceId: string;
  /** The conversation this decision targets (subject + idempotency anchor). */
  readonly conversationId: string;
  /** The action the autopilot loop chose (e.g. send_offer, ai_chat, wait). */
  readonly chosenAction: string;
  /** The deterministic baseline action (what the loop would do without Mind). */
  readonly baselineAction: string;
  /** Whether the chosen action diverged from the baseline (Mind influence). */
  readonly mindInfluenced: boolean;
}

export interface AutopilotActionPerceptParams {
  readonly workspaceId: string;
  /** The conversation this action targets (subject + idempotency anchor). */
  readonly conversationId: string;
  /** The action the autopilot loop executed (e.g. send_offer, lead_unlocker). */
  readonly action: string;
  /** Whether compliance allowed the action to actually dispatch. */
  readonly complianceAllowed: boolean;
  /** Best-effort detected intent the action responded to. */
  readonly intent: string;
}

/**
 * Emit ONE canonical `cognition.autopilot.decision_made` percept into the
 * durable spine outbox (`RAC_MindOutboxEvent`) when the autopilot loop chooses
 * an action for a conversation.
 *
 * ADDITIVE + flag-gated (`KLOEL_AUTOPILOT_PERCEPT_ENABLED`, DEFAULT OFF) +
 * best-effort: when the flag is OFF this is a synchronous no-op (no DB call, no
 * behavior change). When ON, the write is wrapped in try/catch with a warn-log
 * so it can NEVER break the legacy autopilot decide/execute path or alter
 * autopilot outputs. The emit is idempotent per (workspaceId, conversationId):
 * the unique `(workspaceId, idempotencyKey)` constraint upserts the single
 * percept rather than duplicating it on a retry.
 *
 * Returns `true` when a percept write was attempted (flag ON + workspace
 * present), `false` otherwise — lets callers/tests assert flag-OFF stays inert.
 */
export async function emitAutopilotDecisionMadePercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: AutopilotDecisionPerceptParams,
): Promise<boolean> {
  if (!isAutopilotPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.autopilot.decision_made:${params.conversationId}:${params.chosenAction}`;
  const subject = `autopilot:conversation:${params.conversationId}`;
  const payload: Prisma.InputJsonObject = {
    conversationId: params.conversationId,
    chosenAction: params.chosenAction,
    baselineAction: params.baselineAction,
    mindInfluenced: params.mindInfluenced,
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: AUTOPILOT_DECISION_MADE_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `Autopilot decision percept emit failed (workspaceId=${params.workspaceId}, ` +
      `conversationId=${params.conversationId}); the autopilot decision ` +
      `succeeded and is unaffected: ${formattedError}`,
  });

  return true;
}

/**
 * Emit ONE canonical `cognition.autopilot.action_executed` percept into the
 * durable spine outbox (`RAC_MindOutboxEvent`) when the autopilot loop executes
 * an autonomous action. Same ADDITIVE / flag-gated / best-effort contract as
 * {@link emitAutopilotDecisionMadePercept}; idempotent per
 * (workspaceId, conversationId, action).
 */
export async function emitAutopilotActionExecutedPercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: AutopilotActionPerceptParams,
): Promise<boolean> {
  if (!isAutopilotPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.autopilot.action_executed:${params.conversationId}:${params.action}`;
  const subject = `autopilot:conversation:${params.conversationId}`;
  const payload: Prisma.InputJsonObject = {
    conversationId: params.conversationId,
    action: params.action,
    complianceAllowed: params.complianceAllowed,
    intent: params.intent,
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `Autopilot action percept emit failed (workspaceId=${params.workspaceId}, ` +
      `conversationId=${params.conversationId}); the autopilot dispatch ` +
      `succeeded and is unaffected: ${formattedError}`,
  });

  return true;
}
