import { randomUUID } from 'node:crypto';
import type { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { isVoicePerceptEmitEnabled } from './voice-percept-emit.flag';

/**
 * Canonical cognition event type for a Voice *clone/profile creation* — a
 * workspace deciding to clone/configure a voice (a durable commercial asset).
 * Mirrors the `cognition.*` taxonomy used across the spine.
 */
export const VOICE_CLONE_CREATED_EVENT_TYPE = 'cognition.voice.clone_created';

/**
 * Canonical cognition event type for a Voice *action* — a workspace executing
 * a text-to-speech generation by dispatching a voice job.
 */
export const VOICE_ACTION_EXECUTED_EVENT_TYPE = 'cognition.voice.action_executed';

/** Minimal Prisma surface this helper needs — only the outbox delegate. */
interface OutboxPrismaDelegate {
  mindOutboxEvent: PrismaClient['mindOutboxEvent'];
}

export interface VoiceCloneCreatedPerceptParams {
  readonly workspaceId: string;
  /** The persisted VoiceProfile id (subject + idempotency anchor). */
  readonly profileId: string;
  /** The TTS provider backing the profile (e.g. OPENAI). */
  readonly provider: string;
}

export interface VoiceActionExecutedPerceptParams {
  readonly workspaceId: string;
  /** The persisted VoiceJob id (subject + idempotency anchor). */
  readonly jobId: string;
  /** The voice profile the action targeted (best-effort context). */
  readonly profileId: string;
  /** Length of the text the action rendered (best-effort metric). */
  readonly textLength: number;
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
 * Emit ONE canonical `cognition.voice.clone_created` percept into the durable
 * spine outbox (`RAC_MindOutboxEvent`) when a workspace creates a voice
 * profile/clone.
 *
 * ADDITIVE + flag-gated (`KLOEL_VOICE_PERCEPT_ENABLED`, DEFAULT OFF) +
 * best-effort: when the flag is OFF this is a synchronous no-op (no DB call, no
 * behavior change). When ON, the write is wrapped in try/catch with a warn-log
 * so it can NEVER break the legacy voice-profile write or alter Voice outputs.
 * The emit is idempotent per (workspaceId, profileId): the unique
 * `(workspaceId, idempotencyKey)` constraint upserts the single percept rather
 * than duplicating it on a retry.
 *
 * Returns `true` when a percept write was attempted (flag ON + workspace
 * present), `false` otherwise — lets callers/tests assert flag-OFF stays inert.
 */
export async function emitVoiceCloneCreatedPercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: VoiceCloneCreatedPerceptParams,
): Promise<boolean> {
  if (!isVoicePerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.voice.clone_created:${params.profileId}`;
  const subject = `voice:profile:${params.profileId}`;
  const occurredAt = new Date();
  const payload: Prisma.InputJsonObject = {
    profileId: params.profileId,
    provider: params.provider,
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
        eventType: VOICE_CLONE_CREATED_EVENT_TYPE,
        subject,
        payload,
        occurredAt,
      },
      create: {
        id: randomUUID(),
        workspaceId: params.workspaceId,
        eventType: VOICE_CLONE_CREATED_EVENT_TYPE,
        subject,
        payload,
        idempotencyKey,
        occurredAt,
      },
    });
  } catch (err: unknown) {
    logger.warn(
      `Voice clone percept emit failed (workspaceId=${params.workspaceId}, ` +
        `profileId=${params.profileId}); the voice-profile write succeeded and ` +
        `is unaffected: ${formatUnknownError(err)}`,
    );
  }

  return true;
}

/**
 * Emit ONE canonical `cognition.voice.action_executed` percept into the durable
 * spine outbox (`RAC_MindOutboxEvent`) when a workspace dispatches a
 * text-to-speech voice job. Same ADDITIVE / flag-gated / best-effort contract
 * as {@link emitVoiceCloneCreatedPercept}; idempotent per (workspaceId, jobId).
 */
export async function emitVoiceActionExecutedPercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: VoiceActionExecutedPerceptParams,
): Promise<boolean> {
  if (!isVoicePerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.voice.action_executed:${params.jobId}`;
  const subject = `voice:job:${params.jobId}`;
  const occurredAt = new Date();
  const payload: Prisma.InputJsonObject = {
    jobId: params.jobId,
    profileId: params.profileId,
    textLength: params.textLength,
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
        eventType: VOICE_ACTION_EXECUTED_EVENT_TYPE,
        subject,
        payload,
        occurredAt,
      },
      create: {
        id: randomUUID(),
        workspaceId: params.workspaceId,
        eventType: VOICE_ACTION_EXECUTED_EVENT_TYPE,
        subject,
        payload,
        idempotencyKey,
        occurredAt,
      },
    });
  } catch (err: unknown) {
    logger.warn(
      `Voice action percept emit failed (workspaceId=${params.workspaceId}, ` +
        `jobId=${params.jobId}); the voice-job dispatch succeeded and is ` +
        `unaffected: ${formatUnknownError(err)}`,
    );
  }

  return true;
}
