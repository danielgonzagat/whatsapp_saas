/**
 * Helpers extracted from InboxService to keep complexity and file size
 * within thresholds. Conversation singleton-open (I14) and message
 * persistence (I15) logic — pure functions + Prisma calls, no DI.
 */

import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of times getOrCreateConversation will retry after losing
 * a race to the partial unique index. Three attempts is enough to survive
 * the common case (one concurrent inbound) with margin; anything higher
 * suggests a bug or a pathological inbound burst.
 */
export const GET_OR_CREATE_CONVERSATION_MAX_ATTEMPTS = 3;

const defaultLogger = new Logger('InboxConversationHelpers');

// ── Type guards ──────────────────────────────────────────────────────────────

export function isQueuedSendResult(value: unknown): value is { queued: true } {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { queued?: unknown }).queued === true
  );
}

// ── Date helpers ─────────────────────────────────────────────────────────────

export function normalizeDate(value?: Date | string | null): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}// ── Message persistence helpers ──────────────────────────────────────────────

export function resolveConversationLastMessageAt(
  conversation: { lastMessageAt: Date | string | null | undefined },
  messageCreatedAt: Date,
): Date {
  const currentLastMessageAt =
    conversation.lastMessageAt instanceof Date
      ? conversation.lastMessageAt
      : normalizeDate(conversation.lastMessageAt);
  return currentLastMessageAt && currentLastMessageAt > messageCreatedAt
    ? currentLastMessageAt
    : messageCreatedAt;
}

export function buildConversationUpdate(
  data: { countAsUnread?: boolean; resetUnreadOnOutbound?: boolean; direction: string },
  nextLastMessageAt: Date,
): Prisma.ConversationUpdateInput {
  const shouldCountAsUnread = data.countAsUnread ?? data.direction === 'INBOUND';
  const shouldResetUnread = data.resetUnreadOnOutbound ?? data.direction === 'OUTBOUND';
  const update: Prisma.ConversationUpdateInput = { lastMessageAt: nextLastMessageAt };
  if (shouldCountAsUnread) {
    update.unreadCount = { increment: 1 };
  } else if (shouldResetUnread) {
    update.unreadCount = { set: 0 };
  }
  return update;
}// ── Conversation singleton-open (I14) ────────────────────────────────────────

/**
 * Transaction-aware variant of `getOrCreateConversation`. Accepts
 * either the top-level PrismaService or a `Prisma.TransactionClient`
 * from inside a `$transaction` callback. `saveMessage` uses this so
 * the "resolve conversation + insert message + update metadata" flow
 * runs atomically and a crash cannot leave the inbox half-updated.
 */
export async function getOrCreateConversationWithClient(
  client: PrismaService | Prisma.TransactionClient,
  workspaceId: string,
  contactId: string,
  channel: string,
  options?: { initialLastMessageAt?: Date | string | null },
  logger: Logger = defaultLogger,
) {
  const initialLastMessageAt = normalizeDate(options?.initialLastMessageAt);

  const run = async (attempt: number) => {
    const existing = await client.conversation.findFirst({
      where: { workspaceId, contactId, channel, status: { not: 'CLOSED' } },
    });
    if (existing) {
      return existing;
    }

    try {
      return await client.conversation.create({
        data: {
          workspaceId,
          contactId,
          status: 'OPEN',
          channel,
          priority: 'MEDIUM',
          ...(initialLastMessageAt ? { lastMessageAt: initialLastMessageAt } : {}),
        },
      });
    } catch (err: unknown) {
      // P2002 = unique constraint violation on the partial unique index,
      // which means another concurrent worker just created the open
      // conversation. Re-read on the next loop iteration and return it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        logger.log(
          `getOrCreateConversation lost race on (ws=${workspaceId}, contact=${contactId}, ch=${channel}); retrying`,
        );
        if (attempt + 1 < GET_OR_CREATE_CONVERSATION_MAX_ATTEMPTS) {
          return run(attempt + 1);
        }
        return undefined;
      }
      throw err;
    }
  };

  const resolved = await run(0);
  if (resolved) {
    return resolved;
  }

  throw new Error(
    `getOrCreateConversation: failed to resolve conversation after ${GET_OR_CREATE_CONVERSATION_MAX_ATTEMPTS} attempts`,
  );
}// ── Inbound message atomicity (I15) ──────────────────────────────────────────

export async function saveMessageInTx(
  tx: Prisma.TransactionClient,
  data: {
    workspaceId: string;
    contactId: string;
    content: string;
    direction: 'INBOUND' | 'OUTBOUND';
    externalId?: string;
    type?: string;
    channel?: string;
    mediaUrl?: string;
    status?: string;
    countAsUnread?: boolean;
    resetUnreadOnOutbound?: boolean;
  },
  messageCreatedAt: Date,
  logger: Logger = defaultLogger,
) {
  const conversation = await getOrCreateConversationWithClient(
    tx,
    data.workspaceId,
    data.contactId,
    data.channel || 'WHATSAPP',
    { initialLastMessageAt: messageCreatedAt },
    logger,
  );

  const msg = await tx.message.create({
    data: {
      workspaceId: data.workspaceId,
      contactId: data.contactId,
      conversationId: conversation.id,
      content: data.content,
      direction: data.direction,
      ...(data.externalId !== undefined ? { externalId: data.externalId } : {}),
      type: data.type || 'TEXT',
      ...(data.mediaUrl !== undefined ? { mediaUrl: data.mediaUrl } : {}),
      status: data.status || 'DELIVERED',
      createdAt: messageCreatedAt,
    },
  });

  const nextLastMessageAt = resolveConversationLastMessageAt(conversation, messageCreatedAt);
  const conversationUpdate = buildConversationUpdate(data, nextLastMessageAt);

  await tx.conversation.updateMany({
    where: { id: conversation.id, workspaceId: data.workspaceId },
    data: conversationUpdate,
  });
  const updated = await tx.conversation.findFirst({
    where: { id: conversation.id, workspaceId: data.workspaceId },
    select: {
      id: true,
      status: true,
      unreadCount: true,
      lastMessageAt: true,
      contact: { select: { id: true, name: true, phone: true } },
    },
  });

  return { message: msg, updatedConversation: updated };
}
