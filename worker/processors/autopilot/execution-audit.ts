import { redisPub } from '../../redis-client';
import { prisma } from '../../db';

export async function persistFallbackMessage(params: {
  workspaceId: string;
  contactId?: string;
  channel: 'EMAIL';
  content: string;
}) {
  const { workspaceId, contactId, channel, content } = params;
  if (!contactId) {
    return;
  }

  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId, contactId, channel },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId,
        channel,
        status: 'OPEN',
        priority: 'MEDIUM',
      },
      select: { id: true },
    });
  }

  const message = await prisma.message.create({
    data: {
      workspaceId,
      contactId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      type: 'TEXT',
      content,
      status: 'SENT',
    },
  });

  await prisma.conversation.updateMany({
    where: { id: conversation.id, workspaceId },
    data: { lastMessageAt: new Date(), unreadCount: 0 },
  });

  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'message:new',
      workspaceId,
      message,
    }),
  );
  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'conversation:update',
      workspaceId,
      conversation: {
        id: conversation.id,
        lastMessageStatus: 'SENT',
        lastMessageAt: message.createdAt,
      },
    }),
  );
  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'message:status',
      workspaceId,
      payload: {
        id: message.id,
        conversationId: conversation.id,
        contactId,
        status: 'SENT',
      },
    }),
  );
}
