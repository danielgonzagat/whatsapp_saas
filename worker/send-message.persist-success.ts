import { randomUUID as uuidv4 } from 'node:crypto';
import type { WorkerLogger } from './logger';

interface PrismaLike {
  message: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
  };
  conversation: { updateMany(args: unknown): Promise<unknown> };
}

/** Prisma unique-constraint violation (`@@unique([workspaceId, externalId])`). */
const isUniqueConstraintError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';

interface RedisPubLike {
  publish(channel: string, message: string): Promise<unknown>;
}

export interface PersistSuccessInput {
  prisma: PrismaLike;
  redisPub: RedisPubLike;
  log: WorkerLogger;
  workspaceId: string;
  contactId: string;
  conversationId: string;
  content: string;
  msgType: string;
  mediaUrl: string | undefined;
  providerError: unknown;
  externalId: string | null;
}

export async function persistSuccess(input: PersistSuccessInput) {
  const {
    prisma,
    redisPub,
    log,
    workspaceId,
    contactId,
    conversationId,
    content,
    msgType,
    mediaUrl,
    providerError,
    externalId,
  } = input;

  try {
    // F1-B (P0): worker-originated sends that route through the backend HTTP
    // path (/internal/whatsapp-runtime/send-text) are already persisted there
    // via inbox.saveMessageByPhone — which also emits the inbox WebSocket
    // events. Dedupe on the (workspaceId, externalId) unique pair so we never
    // create (and re-broadcast) a second OUTBOUND row for the same send.
    // When externalId is absent we keep the legacy create-always behavior.
    if (externalId) {
      const existing = (await prisma.message.findFirst({
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
        return;
      }
    }

    let created: { id: string; createdAt: Date };
    try {
      created = (await prisma.message.create({
        data: {
          id: uuidv4(),
          workspaceId,
          contactId,
          conversationId,
          content,
          direction: 'OUTBOUND',
          type: msgType,
          mediaUrl: mediaUrl || undefined,
          status: providerError ? 'FAILED' : 'SENT',
          errorCode: providerError ? String(providerError) : null,
          externalId: externalId || null,
        },
      })) as { id: string; createdAt: Date };
    } catch (createErr) {
      // Race: the backend persisted the same externalId between our existence
      // check and the create. The unique index surfaces it as P2002 — treat as
      // an already-persisted duplicate, not a failure.
      if (externalId && isUniqueConstraintError(createErr)) {
        log.info('send_persist_skipped_duplicate', {
          workspaceId,
          conversationId,
          externalId,
          race: true,
        });
        return;
      }
      throw createErr;
    }

    await prisma.conversation.updateMany({
      where: { id: conversationId, workspaceId },
      data: { lastMessageAt: new Date(), unreadCount: 0 },
    });

    const payload = {
      type: 'message:new',
      workspaceId,
      message: created,
    };
    await redisPub.publish('ws:inbox', JSON.stringify(payload));
    await redisPub.publish(
      'ws:inbox',
      JSON.stringify({
        type: 'conversation:update',
        workspaceId,
        conversation: {
          id: conversationId,
          lastMessageStatus: providerError ? 'FAILED' : 'SENT',
          lastMessageErrorCode: providerError ? String(providerError) : null,
          lastMessageAt: created.createdAt,
        },
      }),
    );
    await redisPub.publish(
      'ws:inbox',
      JSON.stringify({
        type: 'message:status',
        workspaceId,
        payload: {
          id: created.id,
          conversationId,
          contactId,
          externalId,
          status: providerError ? 'FAILED' : 'SENT',
          errorCode: providerError ? String(providerError) : null,
        },
      }),
    );
  } catch (dbErr) {
    log.warn('send_persist_failed', {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
  }
}
