import { randomUUID as uuidv4 } from 'node:crypto';
import type { WorkerLogger } from './logger';

interface PrismaLike {
  message: { create(args: unknown): Promise<unknown> };
}

interface RedisPubLike {
  publish(channel: string, message: string): Promise<unknown>;
}

export interface PersistFailureInput {
  prisma: PrismaLike;
  redisPub: RedisPubLike;
  log: WorkerLogger;
  workspaceId: string;
  contactId: string;
  conversationId: string;
  content: string;
  msgType: string;
  mediaUrl: string | undefined;
  errorMessage: string;
}

export async function persistFailure(input: PersistFailureInput) {
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
    errorMessage,
  } = input;

  try {
    await prisma.message.create({
      data: {
        id: uuidv4(),
        workspaceId,
        contactId,
        conversationId,
        content,
        direction: 'OUTBOUND',
        type: msgType,
        mediaUrl: mediaUrl || undefined,
        status: 'FAILED',
        errorCode: errorMessage,
        externalId: null,
      },
    });
  } catch (dbErr) {
    log.warn('send_persist_failed_errorpath', {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
  }

  try {
    await redisPub.publish(
      'ws:inbox',
      JSON.stringify({
        type: 'message:status',
        workspaceId,
        payload: {
          conversationId,
          contactId,
          status: 'FAILED',
          errorCode: errorMessage,
        },
      }),
    );
  } catch (pubErr) {
    log.warn('ws_publish_failed_errorpath', {
      error: pubErr instanceof Error ? pubErr.message : String(pubErr),
    });
  }
}
