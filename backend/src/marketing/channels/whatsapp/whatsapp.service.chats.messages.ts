import { Injectable } from '@nestjs/common';
import type { ChatHelperDeps } from './whatsapp.service.chats.types';

const isProviderMessage = (m: unknown): m is { timestamp: number } & Record<string, unknown> =>
  m !== null &&
  typeof m === 'object' &&
  typeof (m as { timestamp?: unknown }).timestamp === 'number';

@Injectable()
export class WhatsappChatMessagesService {
  async getChatMessages(
    deps: ChatHelperDeps,
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ) {
    const normalizedChatId = deps.normalizeChatId(chatId);
    const providerMessagesRaw = deps.normalizeMessages(
      await deps.providerRegistry.getChatMessages(workspaceId, normalizedChatId, options),
      normalizedChatId,
    );
    const providerMessages = providerMessagesRaw.filter(isProviderMessage);

    if (providerMessages.length > 0) {
      return providerMessages.sort((a, b) => a.timestamp - b.timestamp);
    }

    const phone = deps.normalizeNumber(
      deps.providerRegistry.extractPhoneFromChatId(normalizedChatId),
    );
    if (!phone) {
      return [];
    }

    const contact = await deps.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
      select: { id: true },
    });

    if (!contact) {
      return [];
    }

    const localMessages = await deps.prisma.message.findMany({
      take: Math.max(1, Math.min(200, options?.limit || 100)),
      skip: Math.max(0, options?.offset || 0),
      where: { workspaceId, contactId: contact.id },
      select: {
        id: true,
        content: true,
        direction: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        contactId: true,
        conversationId: true,
        mediaUrl: true,
        externalId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return localMessages.map((message) => {
      const timestamp = message.createdAt?.getTime?.() || 0;
      return {
        id: message.id,
        chatId: normalizedChatId,
        phone,
        body: message.content || '',
        direction: message.direction,
        fromMe: message.direction === 'OUTBOUND',
        type: String(message.mediaUrl ? 'MEDIA' : 'TEXT').toLowerCase(),
        hasMedia: !!message.mediaUrl,
        mediaUrl: message.mediaUrl || null,
        mimetype: null,
        timestamp,
        isoTimestamp: deps.toIsoTimestamp(timestamp),
        source: 'crm',
      };
    });
  }
}
