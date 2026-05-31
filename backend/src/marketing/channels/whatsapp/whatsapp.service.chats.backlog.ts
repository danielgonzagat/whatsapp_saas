import { Injectable } from '@nestjs/common';
import type { ChatHelperDeps, ChatNormalized } from './whatsapp.service.chats.types';
import {
  buildOperationalBacklogItem,
  buildOperationalBacklogSummary,
  compareOperationalBacklogItems,
  indexLocalConversationsByPhone,
  indexRemoteChatsByPhone,
} from './whatsapp.service.chats.backlog.helpers';

type ListChatsFn = (deps: ChatHelperDeps, workspaceId: string) => Promise<ChatNormalized[]>;

@Injectable()
export class WhatsappChatBacklogService {
  async getBacklog(deps: ChatHelperDeps, workspaceId: string, listChats: ListChatsFn) {
    const status = await deps.providerRegistry.getSessionStatus(workspaceId);
    const chats = await listChats(deps, workspaceId);
    const pendingChats = chats.filter((chat) => chat.pending === true);
    const pendingMessages = pendingChats.reduce(
      (sum, chat) => sum + Math.max(1, Number(chat.pendingMessages || chat.unreadCount || 0) || 0),
      0,
    );

    return {
      connected: status.connected,
      status: status.status,
      pendingConversations: pendingChats.length,
      pendingMessages,
      latestMessageAt: pendingChats[0]?.lastMessageAt || null,
      chats: pendingChats,
    };
  }

  async getOperationalBacklogReport(
    deps: ChatHelperDeps,
    workspaceId: string,
    options?: { limit?: number; includeResolved?: boolean },
  ) {
    const limit = Math.max(1, Math.min(500, Number(options?.limit || 100) || 100));
    const includeResolved = options?.includeResolved === true;

    const [status, remoteChatsRaw, localConversations] = await Promise.all([
      deps.providerRegistry.getSessionStatus(workspaceId),
      deps.providerRegistry.getChats(workspaceId),
      deps.listOperationalConversations(workspaceId, {
        limit: Math.max(limit * 5, 500),
        pendingOnly: false,
      }),
    ]);

    const remoteChats = deps
      .normalizeChats(remoteChatsRaw)
      .filter((chat) => deps.isIndividualChatId(chat.id));

    const remoteByPhone = indexRemoteChatsByPhone(remoteChats);
    const localByPhone = indexLocalConversationsByPhone(deps, localConversations);

    const phoneSet = new Set<string>([
      ...Array.from(remoteByPhone.keys()),
      ...Array.from(localByPhone.keys()),
    ]);

    const items = Array.from(phoneSet)
      .map((phone) =>
        buildOperationalBacklogItem(deps, phone, remoteByPhone.get(phone), localByPhone.get(phone)),
      )
      .sort((a, b) => compareOperationalBacklogItems(a, b));

    const visibleItems = items.filter((item) => includeResolved || item.pending).slice(0, limit);
    const pendingItems = items.filter((item) => item.pending);

    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      sourceOfTruth: await deps.providerRegistry.getProviderType(workspaceId),
      connected: status.connected,
      status: status.status,
      includeResolved,
      summary: buildOperationalBacklogSummary(items, pendingItems),
      items: visibleItems,
    };
  }
}
