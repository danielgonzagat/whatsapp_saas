import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isFlowsPerceptEmitEnabled } from './flows-percept-emit.flag';
import {
  emitPerceptToMindSpine,
  type OutboxPrismaDelegate,
} from '../kloel/mind/coordination/percept-emit.factory';

/**
 * Canonical cognition event type for a completed flow run. Mirrors the
 * `cognition.*` taxonomy used across the spine (see event-taxonomy aliases and
 * the `cognition.decision_made` / `cognition.belief_updated` emitters).
 */
export const FLOW_NODE_COMPLETED_EVENT_TYPE = 'cognition.flow.node_completed';

export interface FlowPerceptEmitParams {
  readonly workspaceId: string;
  readonly flowId: string;
  /** The persisted FlowExecution id (used as the subject + idempotency anchor). */
  readonly executionId: string;
  /** Number of node-log entries in the completed run (best-effort metric). */
  readonly nodeCount: number;
}

/**
 * Emit ONE canonical `cognition.flow.node_completed` percept into the durable
 * spine outbox (`RAC_MindOutboxEvent`) after a flow run completes.
 *
 * ADDITIVE + flag-gated (`KLOEL_FLOWS_PERCEPT_ENABLED`, DEFAULT OFF) +
 * best-effort: when the flag is OFF this is a synchronous no-op (no DB call,
 * no behavior change). When ON, the write is wrapped in try/catch with a
 * warn-log so it can NEVER break the legacy flow-execution write or alter flow
 * outputs. The emit is idempotent per (workspaceId, executionId): the unique
 * `(workspaceId, idempotencyKey)` constraint means a retry/re-log of the same
 * execution upserts the single percept rather than duplicating it.
 *
 * Returns `true` when a percept write was attempted (flag ON + workspace
 * present), `false` otherwise — lets callers/tests assert flag-OFF stays inert.
 */
export async function emitFlowNodeCompletedPercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: FlowPerceptEmitParams,
): Promise<boolean> {
  if (!isFlowsPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.flow.node_completed:${params.executionId}`;
  const subject = `flow:${params.flowId}`;
  const payload: Prisma.InputJsonObject = {
    flowId: params.flowId,
    executionId: params.executionId,
    nodeCount: params.nodeCount,
    status: 'COMPLETED',
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: FLOW_NODE_COMPLETED_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `Flows percept emit failed (workspaceId=${params.workspaceId}, ` +
      `executionId=${params.executionId}); the flow-execution write succeeded ` +
      `and is unaffected: ${formattedError}`,
  });

  return true;
}
