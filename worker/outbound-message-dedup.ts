/**
 * @capability OutboundMessageDedup
 * @domain dispatch
 *
 * F1-B (P0) shared dedupe recipe for worker-side outbound Message persistence.
 *
 * Worker-originated sends that route through the backend HTTP path
 * (/internal/whatsapp-runtime/send-text) are already persisted there via
 * inbox.saveMessageByPhone — which also emits the inbox WebSocket events.
 * Dedupe on the (workspaceId, externalId) unique pair (schema enforces
 * `@@unique([workspaceId, externalId])`) so the worker never creates (and
 * re-broadcasts) a second OUTBOUND row for the same send. When externalId is
 * absent the legacy create-always behavior is preserved.
 *
 * Shared by `send-message.persist-success.ts` (K1 — BullMQ send-message job)
 * and `flow-message-sender.helpers.ts` (K2 — flow/campaign sends). Do NOT
 * re-inline this recipe at new persistence sites — import it.
 */

export interface MessageDelegateLike {
  create(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
}

interface DedupLogLike {
  info(message: string, extra?: Record<string, unknown>): void;
}

/** Prisma unique-constraint violation (`@@unique([workspaceId, externalId])`). */
export const isUniqueConstraintError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';

export interface CreateOutboundMessageDedupedInput {
  messages: MessageDelegateLike;
  log: DedupLogLike;
  workspaceId: string;
  conversationId: string | null;
  externalId: string | null | undefined;
  /** Full Prisma `message.create` data payload (must carry the externalId). */
  data: Record<string, unknown>;
}

/**
 * Creates the outbound Message unless a row with the same
 * (workspaceId, externalId) already exists. Returns the created row, or
 * `null` when the create was skipped as a duplicate — either the existence
 * pre-check hit, or another writer persisted the same externalId between the
 * check and the create (unique index surfaces the race as P2002; treated as
 * an already-persisted duplicate, not a failure). When `externalId` is
 * absent it always creates (legacy behavior) and rethrows every error.
 */
export async function createOutboundMessageDeduped<T>(
  input: CreateOutboundMessageDedupedInput,
): Promise<T | null> {
  const { messages, log, workspaceId, conversationId, externalId, data } = input;

  if (externalId) {
    const existing = (await messages.findFirst({
      where: { workspaceId, externalId },
      select: { id: true },
    })) as { id: string } | null;
    if (existing) {
      log.info('send_persist_skipped_duplicate', {
        workspaceId,
        conversationId,
        externalId,
        existingMessageId: existing.id,
      });
      return null;
    }
  }

  try {
    return (await messages.create({ data })) as T;
  } catch (createErr) {
    if (externalId && isUniqueConstraintError(createErr)) {
      log.info('send_persist_skipped_duplicate', {
        workspaceId,
        conversationId,
        externalId,
        race: true,
      });
      return null;
    }
    throw createErr;
  }
}
