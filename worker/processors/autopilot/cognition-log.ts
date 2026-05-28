/**
 * ARCHITECTURAL COHESION: Autonomy execution ledger — owns the database-backed
 * persistence half of the cognition-log surface. Pure leaf helpers (cognitive
 * message templating, ledger value normalization, idempotency key derivation,
 * duplicate-error detection) live in `cognition-log.helpers.ts` so they can
 * be unit-tested in isolation. The public API of this module is preserved by
 * re-exporting the helpers below.
 */

import { prisma } from '../../db';
import { type UnknownRecord } from './shared';
import {
  buildAutonomyExecutionKey,
  buildCognitiveMessage,
  isAutonomyExecutionDuplicate,
  normalizeAutonomyLedgerValue,
} from './cognition-log.helpers';

export {
  buildAutonomyExecutionKey,
  buildCognitiveMessage,
  isAutonomyExecutionDuplicate,
  normalizeAutonomyLedgerValue,
};

export async function beginAutonomyExecution(input: {
  workspaceId: string;
  actionType: string;
  contactId?: string | undefined;
  conversationId?: string | undefined;
  workItemId?: string | null;
  proofId?: string | null;
  capabilityCode?: string | null;
  tacticCode?: string | null;
  idempotencyKey: string;
  request: Record<string, unknown>;
}) {
  const client = prisma as never as UnknownRecord;
  if (!client.autonomyExecution) {
    return { allowed: true as const, record: null };
  }

  try {
    const record = await client.autonomyExecution.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        conversationId: input.conversationId,
        workItemId: input.workItemId || null,
        proofId: input.proofId || null,
        capabilityCode: input.capabilityCode || input.actionType,
        tacticCode: input.tacticCode || null,
        idempotencyKey: input.idempotencyKey,
        actionType: input.actionType,
        request: input.request,
        status: 'PENDING',
      },
    });
    return { allowed: true as const, record };
  } catch (err: unknown) {
    if (!isAutonomyExecutionDuplicate(err)) {
      throw err;
    }

    const existing = await client.autonomyExecution.findFirst({
      where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
    });

    if (existing?.status === 'FAILED') {
      const record = await client.autonomyExecution.update({
        where: { id: existing.id },
        data: {
          request: input.request,
          workItemId: input.workItemId || null,
          proofId: input.proofId || null,
          capabilityCode: input.capabilityCode || input.actionType,
          tacticCode: input.tacticCode || null,
          response: null,
          error: null,
          status: 'PENDING',
        },
      });
      return { allowed: true as const, record, replay: true as const };
    }

    return {
      allowed: false as const,
      record: existing || null,
      reason:
        existing?.status === 'SUCCESS'
          ? 'duplicate_execution_success'
          : 'duplicate_execution_pending',
    };
  }
}

export async function finishAutonomyExecution(
  recordId: string | undefined,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  payload?: { response?: Record<string, unknown> | null; error?: string | null },
) {
  if (!recordId) {
    return;
  }
  const client = prisma as never as UnknownRecord;
  if (!client.autonomyExecution) {
    return;
  }

  await client.autonomyExecution.update({
    where: { id: recordId },
    data: { status, response: payload?.response ?? undefined, error: payload?.error ?? undefined },
  });
}
