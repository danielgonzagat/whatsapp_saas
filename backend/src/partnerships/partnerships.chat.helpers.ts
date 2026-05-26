import type { PrismaService } from '../prisma/prisma.service';

/** Get chat contacts for a workspace with unread counts and last messages. */
export async function getChatContacts(
  prisma: PrismaService,
  workspaceId: string,
) {
  const partners = await prisma.affiliatePartner.findMany({
    where: { workspaceId, status: 'ACTIVE' },
    select: { id: true, partnerName: true, partnerEmail: true, type: true },
    take: 100,
  });

  const partnerIds = partners.map((p) => p.id);

  // Batch: count unread per partner
  const unreadCounts = await prisma.partnerMessage.groupBy({
    by: ['partnerId'],
    where: {
      partnerId: { in: partnerIds },
      senderType: 'PARTNER',
      readAt: null,
    },
    _count: { id: true },
  });
  const unreadByPartnerId = new Map(unreadCounts.map((r) => [r.partnerId, r._count.id]));

  // Batch: last message per partner
  const lastMessages = await prisma.partnerMessage.findMany({
    where: { partnerId: { in: partnerIds } },
    select: { partnerId: true, content: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: partnerIds.length * 2,
  });
  const lastMessageByPartnerId = new Map<
    string,
    { content: string | null; createdAt: Date | null }
  >();
  for (const msg of lastMessages) {
    if (!lastMessageByPartnerId.has(msg.partnerId)) {
      lastMessageByPartnerId.set(msg.partnerId, {
        content: msg.content,
        createdAt: msg.createdAt,
      });
    }
  }

  const contacts = partners.map((p) => {
    const lastMsg = lastMessageByPartnerId.get(p.id);
    return {
      id: p.id,
      name: p.partnerName,
      email: p.partnerEmail,
      type: p.type,
      avatar: p.partnerName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      lastMessage: lastMsg?.content || null,
      lastMessageTime: lastMsg?.createdAt || null,
      unread: unreadByPartnerId.get(p.id) || 0,
      online: false,
    };
  });

  contacts.sort((a, b) => {
    if (!a.lastMessageTime && !b.lastMessageTime) {
      return 0;
    }
    if (!a.lastMessageTime) {
      return 1;
    }
    if (!b.lastMessageTime) {
      return -1;
    }
    return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
  });

  return { contacts };
}/** Get messages for a partner with cursor-based pagination. */
export async function getMessages(
  prisma: PrismaService,
  partnerId: string,
  cursor?: string,
) {
  const messages = await prisma.partnerMessage.findMany({
    take: 50,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where: { partnerId },
    select: {
      id: true,
      partnerId: true,
      senderId: true,
      senderName: true,
      senderType: true,
      content: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return { messages: messages.reverse() };
}// messageLimit: partner chat is internal DB-only, not WhatsApp; no rate limit applies
export async function sendMessage(
  prisma: PrismaService,
  partnerId: string,
  content: string,
  senderId: string,
  senderName: string,
) {
  return prisma.partnerMessage.create({
    data: { partnerId, senderId, senderType: 'OWNER', senderName, content },
  });
}/** Mark all unread PARTNER messages as read for a partner. */
export async function markAsRead(prisma: PrismaService, partnerId: string) {
  return prisma.partnerMessage.updateMany({
    where: { partnerId, senderType: 'PARTNER', readAt: null },
    data: { readAt: new Date() },
  });
}