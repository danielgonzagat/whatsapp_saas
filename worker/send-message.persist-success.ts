import { randomUUID as uuidv4 } from 'node:crypto';
import type { WorkerLogger } from './logger';
import { type MessageDelegateLike, createOutboundMessageDeduped } from './outbound-message-dedup';

interface PrismaLike {
  message: MessageDelegateLike;
  conversation: { updateMany(args: unknown): Promise<unknown> };
}

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
    // events. Dedupe on the (workspaceId, externalId) unique pair (shared
    // recipe in outbound-message-dedup.ts) so we never create (and
    // re-broadcast) a second OUTBOUND row for the same send. When externalId
    // is absent we keep the legacy create-always behavior.
    const created = await createOutboundMessageDeduped<{ id: string; createdAt: Date }>({
      messages: prisma.message,
      log,
      workspaceId,
      conversationId,
      externalId,
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
    });
    if (!created) {
      return;
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
