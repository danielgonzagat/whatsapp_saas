import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isVoicePerceptEmitEnabled } from './voice-percept-emit.flag';
import {
  emitPerceptToMindSpine,
  type OutboxPrismaDelegate,
} from '../kloel/mind/coordination/percept-emit.factory';

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
  const payload: Prisma.InputJsonObject = {
    profileId: params.profileId,
    provider: params.provider,
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: VOICE_CLONE_CREATED_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `Voice clone percept emit failed (workspaceId=${params.workspaceId}, ` +
      `profileId=${params.profileId}); the voice-profile write succeeded and ` +
      `is unaffected: ${formattedError}`,
  });

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
  const payload: Prisma.InputJsonObject = {
    jobId: params.jobId,
    profileId: params.profileId,
    textLength: params.textLength,
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: VOICE_ACTION_EXECUTED_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `Voice action percept emit failed (workspaceId=${params.workspaceId}, ` +
      `jobId=${params.jobId}); the voice-job dispatch succeeded and is ` +
      `unaffected: ${formattedError}`,
  });

  return true;
}
