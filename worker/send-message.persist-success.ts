import { v4 as uuidv4 } from 'uuid';
import type { WorkerLogger } from './logger';

interface PrismaLike {
  message: { create(args: unknown): Promise<unknown> };
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
  const { prisma, redisPub, log, workspaceId, contactId, conversationId, content, msgType, mediaUrl, providerError, externalId } = input;

  try {
    const created = await prisma.message.create({
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
    }) as { id: string; createdAt: Date };

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
