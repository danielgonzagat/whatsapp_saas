import { buildConversationOperationalState } from './agent-conversation-state.util';
import {
  buildOperationalBacklogItem,
  buildOperationalBacklogSummary,
  compareOperationalBacklogItems,
  indexLocalConversationsByPhone,
  indexRemoteChatsByPhone,
  shouldReplaceRemoteChat,
} from './whatsapp.service.chats.backlog.helpers';
import type { ChatHelperDeps, ChatNormalized } from './whatsapp.service.chats.types';

export type { ChatHelperDeps, ChatNormalized } from './whatsapp.service.chats.types';

const isProviderMessage = (m: unknown): m is { timestamp: number } & Record<string, unknown> =>
  m !== null &&
  typeof m === 'object' &&
  typeof (m as { timestamp?: unknown }).timestamp === 'number';

async function loadConversationsForListing(deps: ChatHelperDeps, workspaceId: string) {
  return (
    (await deps.prisma.conversation.findMany({
      where: { workspaceId },
      select: {
        id: true,
        unreadCount: true,
        status: true,
        mode: true,
        assignedAgentId: true,
        lastMessageAt: true,
        contact: {
          select: { id: true, phone: true, name: true },
        },
        messages: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, direction: true, createdAt: true, content: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 500,
    })) || []
  );
}

function mergeRemoteChatsIntoListing(
  merged: Map<string, ChatNormalized>,
  remoteChats: ChatNormalized[],
) {
  for (const chat of remoteChats) {
    const existing = merged.get(chat.phone);
    if (shouldReplaceRemoteChat(existing, chat)) {
      merged.set(chat.phone, {
        ...existing,
        ...chat,
        name: chat.name || existing?.name || chat.phone,
      });
    }
  }
}

function mergeLocalConversationIntoListing(
  deps: ChatHelperDeps,
  merged: Map<string, ChatNormalized>,
  conversation: Awaited<ReturnType<typeof loadConversationsForListing>>[number],
) {
  const phone = deps.normalizeNumber(conversation.contact?.phone || '');
  if (!phone) return;

  const existing = merged.get(phone);
  const timestamp = existing?.timestamp || conversation.lastMessageAt?.getTime() || 0;
  const operational = buildConversationOperationalState(conversation);
  const unreadCount =
    typeof existing?.unreadCount === 'number'
      ? existing.unreadCount
      : conversation.unreadCount || 0;

  merged.set(phone, {
    id: existing?.id || `${phone}@c.us`,
    phone,
    name: existing?.name || conversation.contact?.name || conversation.contact?.phone || phone,
    unreadCount,
    pending: operational.pending,
    needsReply: operational.needsReply,
    pendingMessages: operational.pending ? Math.max(1, Number(unreadCount || 0) || 0) : 0,
    owner: operational.owner,
    blockedReason: operational.blockedReason,
    lastMessageDirection: operational.lastMessageDirection,
    timestamp,
    lastMessageAt:
      deps.toIsoTimestamp(timestamp) || conversation.lastMessageAt?.toISOString?.() || null,
    conversationId: conversation.id,
    status: conversation.status || null,
    mode: conversation.mode || null,
    assignedAgentId: conversation.assignedAgentId || null,
    source: existing ? 'waha+crm' : 'crm',
  });
}

export async function listChats(
  deps: ChatHelperDeps,
  workspaceId: string,
): Promise<ChatNormalized[]> {
  const remoteChats = deps.normalizeChats(await deps.providerRegistry.getChats(workspaceId));
  const localConversations = await loadConversationsForListing(deps, workspaceId);

  const merged = new Map<string, ChatNormalized>();
  mergeRemoteChatsIntoListing(merged, remoteChats);
  for (const conversation of localConversations) {
    mergeLocalConversationIntoListing(deps, merged, conversation);
  }

  return Array.from(merged.values()).sort(
    (a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0),
  );
}

export async function getChatMessages(
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

export async function getBacklog(deps: ChatHelperDeps, workspaceId: string) {
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

export async function getOperationalBacklogReport(
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
