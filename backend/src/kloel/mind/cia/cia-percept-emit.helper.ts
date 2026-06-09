import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isCiaPerceptEmitEnabled } from './cia-percept-emit.flag';
import {
  emitPerceptToMindSpine,
  type OutboxPrismaDelegate,
} from '../coordination/percept-emit.factory';

/**
 * Canonical cognition event type for a CIA autonomy *decision* (the agent
 * choosing an autonomy posture/mode). Mirrors the `cognition.*` taxonomy used
 * across the spine. Deliberately distinct from the ingestor's exact
 * `cognition.decision_made` poll string so this is purely additive telemetry —
 * a durable percept, never auto-reprocessed by the decision ingestor.
 */
export const CIA_DECISION_MADE_EVENT_TYPE = 'cognition.cia.decision_made';

/**
 * Canonical cognition event type for a CIA autonomy *action* (the agent
 * executing/dispatching a backlog run).
 */
export const CIA_ACTION_EXECUTED_EVENT_TYPE = 'cognition.cia.action_executed';

export interface CiaDecisionPerceptParams {
  readonly workspaceId: string;
  /** The autonomy run id this decision anchors to (idempotency anchor). */
  readonly runId: string;
  /** The chosen autonomy mode (e.g. FULL / LIVE / BACKLOG). */
  readonly autonomyMode: string;
  /** Who/what triggered the decision (e.g. owner_command, autopilot_total). */
  readonly triggeredBy: string;
  /** The backlog mode the decision selected (best-effort context). */
  readonly backlogMode: string;
}

export interface CiaActionPerceptParams {
  readonly workspaceId: string;
  /** The autonomy run id this action anchors to (subject + idempotency anchor). */
  readonly runId: string;
  /** Execution path CIA dispatched (e.g. queue / inline_fallback / remote_inline / live). */
  readonly executionPath: string;
  /** Number of candidate conversations the action targeted (best-effort metric). */
  readonly candidateCount: number;
}

/**
 * Emit ONE canonical `cognition.cia.decision_made` percept into the durable
 * spine outbox (`RAC_MindOutboxEvent`) when CIA chooses an autonomy posture.
 *
 * ADDITIVE + flag-gated (`KLOEL_CIA_PERCEPT_ENABLED`, DEFAULT OFF) +
 * best-effort: when the flag is OFF this is a synchronous no-op (no DB call, no
 * behavior change). When ON, the write is wrapped in try/catch with a warn-log
 * so it can NEVER break the legacy autonomy write or alter CIA outputs. The
 * emit is idempotent per (workspaceId, runId): the unique
 * `(workspaceId, idempotencyKey)` constraint upserts the single percept rather
 * than duplicating it on a retry.
 *
 * Returns `true` when a percept write was attempted (flag ON + workspace
 * present), `false` otherwise — lets callers/tests assert flag-OFF stays inert.
 */
export async function emitCiaDecisionMadePercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: CiaDecisionPerceptParams,
): Promise<boolean> {
  if (!isCiaPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.cia.decision_made:${params.runId}`;
  const subject = `cia:run:${params.runId}`;
  const payload: Prisma.InputJsonObject = {
    runId: params.runId,
    autonomyMode: params.autonomyMode,
    triggeredBy: params.triggeredBy,
    backlogMode: params.backlogMode,
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: CIA_DECISION_MADE_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `CIA decision percept emit failed (workspaceId=${params.workspaceId}, ` +
      `runId=${params.runId}); the autonomy write succeeded and is ` +
      `unaffected: ${formattedError}`,
  });

  return true;
}

/**
 * Emit ONE canonical `cognition.cia.action_executed` percept into the durable
 * spine outbox (`RAC_MindOutboxEvent`) when CIA dispatches an autonomy action
 * (a backlog run). Same ADDITIVE / flag-gated / best-effort contract as
 * {@link emitCiaDecisionMadePercept}; idempotent per (workspaceId, runId).
 */
export async function emitCiaActionExecutedPercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: CiaActionPerceptParams,
): Promise<boolean> {
  if (!isCiaPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.cia.action_executed:${params.runId}`;
  const subject = `cia:run:${params.runId}`;
  const payload: Prisma.InputJsonObject = {
    runId: params.runId,
    executionPath: params.executionPath,
    candidateCount: params.candidateCount,
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: CIA_ACTION_EXECUTED_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `CIA action percept emit failed (workspaceId=${params.workspaceId}, ` +
      `runId=${params.runId}); the autonomy dispatch succeeded and is ` +
      `unaffected: ${formattedError}`,
  });

  return true;
}
