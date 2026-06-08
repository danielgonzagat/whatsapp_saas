import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { isAutopilotPerceptEmitEnabled } from './autopilot-percept-emit.flag';

/**
 * Canonical cognition event type for an executed autopilot CIA action. Mirrors
 * the `cognition.<domain>.<event>` taxonomy used across the spine (see
 * `cognition.flow.node_completed`, `cognition.identity.contact_resolved`).
 */
export const AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE = 'cognition.autopilot.action_executed';

/** Minimal Prisma surface this helper needs — only the outbox delegate. */
interface OutboxPrismaDelegate {
  mindOutboxEvent: PrismaClient['mindOutboxEvent'];
}

/** Minimal logger surface — only the warn channel is used (best-effort path). */
interface WarnLogger {
  warn(message: string, extra?: Record<string, unknown>): void;
}

export interface AutopilotPerceptEmitParams {
  readonly workspaceId: string;
  /** The CIA action type (e.g. CIA_ACTION / capability code). */
  readonly actionType: string;
  /** Terminal outcome of the action dispatch. */
  readonly outcome: 'SENT' | 'FAILED' | 'SKIPPED';
  readonly contactId?: string | null;
  readonly conversationId?: string | null;
  /** Conversation proof snapshot id, used as the idempotency anchor when present. */
  readonly conversationProofId?: string | null;
}

function formatUnknownError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  try {
    const serialized: unknown = JSON.stringify(err);
    if (typeof serialized === 'string') {
      return serialized;
    }
  } catch {
    // fall through to Object.prototype.toString
  }
  const fallback: unknown = Object.prototype.toString.call(err);
  return typeof fallback === 'string' ? fallback : 'unknown error';
}

/**
 * Emit ONE canonical `cognition.autopilot.action_executed` percept into the
 * durable spine outbox (`RAC_MindOutboxEvent`) after a CIA action is dispatched.
 *
 * ADDITIVE + flag-gated (`KLOEL_AUTOPILOT_PERCEPT_ENABLED`, DEFAULT OFF) +
 * best-effort: when the flag is OFF this is a synchronous no-op (no DB call, no
 * behavior change). When ON, the write is wrapped in try/catch with a warn-log
 * so it can NEVER break the legacy CIA action dispatch or alter action outcomes.
 * The emit is idempotent per (workspaceId, idempotencyKey): the unique
 * `(workspaceId, idempotencyKey)` constraint means a retry/re-run of the same
 * action upserts the single percept rather than duplicating it.
 *
 * Returns `true` when a percept write was attempted (flag ON + workspace
 * present), `false` otherwise — lets callers/tests assert flag-OFF stays inert.
 */
export async function emitAutopilotActionExecutedPercept(
  prisma: OutboxPrismaDelegate,
  logger: WarnLogger,
  params: AutopilotPerceptEmitParams,
): Promise<boolean> {
  if (!isAutopilotPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  // Anchor idempotency on the conversation proof when available (one percept per
  // proven action); otherwise fall back to a generated key so the emit still
  // fires for actions without a proof snapshot.
  const anchor = params.conversationProofId || `${params.contactId || 'nc'}:${randomUUID()}`;
  const idempotencyKey = `cognition.autopilot.action_executed:${anchor}`;
  const subject = `contact:${params.contactId || 'unknown'}`;
  const occurredAt = new Date();
  const payload: Prisma.InputJsonObject = {
    actionType: params.actionType,
    outcome: params.outcome,
    contactId: params.contactId ?? null,
    conversationId: params.conversationId ?? null,
    conversationProofId: params.conversationProofId ?? null,
  };

  try {
    await prisma.mindOutboxEvent.upsert({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: params.workspaceId,
          idempotencyKey,
        },
      },
      update: {
        eventType: AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE,
        subject,
        payload,
        occurredAt,
      },
      create: {
        id: randomUUID(),
        workspaceId: params.workspaceId,
        eventType: AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE,
        subject,
        payload,
        idempotencyKey,
        occurredAt,
      },
    });
  } catch (err: unknown) {
    logger.warn(
      `Autopilot percept emit failed (workspaceId=${params.workspaceId}, ` +
        `actionType=${params.actionType}); the CIA action dispatch succeeded ` +
        `and is unaffected: ${formatUnknownError(err)}`,
    );
  }

  return true;
}
