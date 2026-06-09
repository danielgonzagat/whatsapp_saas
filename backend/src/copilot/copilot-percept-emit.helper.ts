import { randomUUID } from 'node:crypto';
import type { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { isCopilotPerceptEmitEnabled } from './copilot-percept-emit.flag';

/**
 * Canonical cognition event type for a Copilot *chat reply* — a workspace's
 * sales-copilot producing a suggested reply for an operator. Mirrors the
 * `cognition.*` taxonomy used across the spine (Flows / CIA / Voice / Money).
 *
 * This is the percept-emit half of the One-Mind wiring: the Copilot service
 * already *reads* Mind beliefs (the `kloel-copilot-loop.helpers.ts` learning
 * loop opens/closes predictive-coding) but, before this helper, never *emitted*
 * a percept — breaking symmetry with the other 5 wired modules.
 */
export const COPILOT_CHAT_REPLY_EVENT_TYPE = 'cognition.copilot.chat_reply';

/** Minimal Prisma surface this helper needs — only the outbox delegate. */
interface OutboxPrismaDelegate {
  mindOutboxEvent: PrismaClient['mindOutboxEvent'];
}

export interface CopilotChatReplyPerceptParams {
  readonly workspaceId: string;
  /**
   * The conversation this reply belongs to (the contact id) — together with
   * {@link turn} it is the idempotency anchor + subject.
   */
  readonly conversationId: string;
  /**
   * The conversation turn this reply answers (the message-history length at the
   * time of the reply). Each new inbound message advances the turn, so
   * (conversationId, turn) uniquely identifies a single reply.
   */
  readonly turn: number;
  /** Length of the suggested reply text the Copilot produced (best-effort metric). */
  readonly replyLength: number;
  /**
   * Whether the Copilot produced a real reply (`1`) or degraded to canned
   * fallback text (`0`) — mirrors the learning loop's `replyOutcome` (best-effort
   * context the Mind learns against).
   */
  readonly replyOutcome: 0 | 1;
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
 * Emit ONE canonical `cognition.copilot.chat_reply` percept into the durable
 * spine outbox (`RAC_MindOutboxEvent`) when the Copilot produces a suggested
 * reply.
 *
 * ADDITIVE + flag-gated (`KLOEL_COPILOT_PERCEPT_ENABLED`, DEFAULT ON) +
 * best-effort: when the flag is OFF this is a synchronous no-op (no DB call, no
 * behavior change). When ON, the write is wrapped in try/catch with a warn-log
 * so it can NEVER break the legacy Copilot suggestion or alter Copilot outputs.
 * The emit is idempotent per (workspaceId, conversationId, turn): the unique
 * `(workspaceId, idempotencyKey)` constraint upserts the single percept rather
 * than duplicating it on a retry.
 *
 * Returns `true` when a percept write was attempted (flag ON + workspace
 * present), `false` otherwise — lets callers/tests assert flag-OFF stays inert.
 */
export async function emitCopilotChatReplyPercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: CopilotChatReplyPerceptParams,
): Promise<boolean> {
  if (!isCopilotPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.copilot.chat_reply:${params.conversationId}:${params.turn}`;
  const subject = `copilot:conversation:${params.conversationId}`;
  const occurredAt = new Date();
  const payload: Prisma.InputJsonObject = {
    conversationId: params.conversationId,
    turn: params.turn,
    replyLength: params.replyLength,
    replyOutcome: params.replyOutcome,
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
        eventType: COPILOT_CHAT_REPLY_EVENT_TYPE,
        subject,
        payload,
        occurredAt,
      },
      create: {
        id: randomUUID(),
        workspaceId: params.workspaceId,
        eventType: COPILOT_CHAT_REPLY_EVENT_TYPE,
        subject,
        payload,
        idempotencyKey,
        occurredAt,
      },
    });
  } catch (err: unknown) {
    logger.warn(
      `Copilot chat-reply percept emit failed (workspaceId=${params.workspaceId}, ` +
        `conversationId=${params.conversationId}, turn=${params.turn}); the Copilot ` +
        `suggestion succeeded and is unaffected: ${formatUnknownError(err)}`,
    );
  }

  return true;
}
