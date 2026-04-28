import {
  type ConversationOperationalLike,
  type ConversationOperationalState,
  buildConversationOperationalState,
} from './agent-conversation-state.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { WhatsAppProviderRegistry } from './providers/provider-registry';

export type ChatNormalized = {
  id: string;
  phone: string;
  name: string | null;
  unreadCount: number;
  pending: boolean;
  needsReply?: boolean;
  pendingMessages?: number;
  owner?: ConversationOperationalState['owner'];
  blockedReason?: ConversationOperationalState['blockedReason'];
  lastMessageDirection?: ConversationOperationalState['lastMessageDirection'];
  timestamp: number;
  lastMessageAt: string | null;
  conversationId: string | null;
  status: string | null;
  mode?: string | null;
  assignedAgentId?: string | null;
  source: 'provider' | 'crm' | 'waha+crm';
};

export type ChatHelperDeps = {
  prisma: PrismaService;
  providerRegistry: WhatsAppProviderRegistry;
  normalizeChats: (raw: unknown) => ChatNormalized[];
  normalizeMessages: (raw: unknown, fallbackChatId: string) => unknown[];
  normalizeNumber: (num: string) => string;
  normalizeChatId: (chatId: string) => string;
  isIndividualChatId: (chatId?: string | null) => boolean;
  toIsoTimestamp: (timestamp: number) => string | null;
  resolveTimestamp: (value: unknown) => number;
  resolveTrustedContactName: (phone: string, ...candidates: unknown[]) => string;
  listOperationalConversations: (
    workspaceId: string,
    options?: { limit?: number; pendingOnly?: boolean },
  ) => Promise<ConversationOperationalState[]>;
};

const isProviderMessage = (m: unknown): m is { timestamp: number } & Record<string, unknown> =>
  m !== null &&
  typeof m === 'object' &&
  typeof (m as { timestamp?: unknown }).timestamp === 'number';

export async function listChats(
  deps: ChatHelperDeps,
  workspaceId: string,
): Promise<ChatNormalized[]> {
  const remoteChats = deps.normalizeChats(await deps.providerRegistry.getChats(workspaceId));
  const localConversations =
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
    })) || [];

  const merged = new Map<string, ChatNormalized>();

  for (const chat of remoteChats) {
    const existing = merged.get(chat.phone);
    if (!existing || Number(chat.timestamp || 0) >= Number(existing.timestamp || 0)) {
      merged.set(chat.phone, {
        ...existing,
        ...chat,
        name: chat.name || existing?.name || chat.phone,
      });
    }
  }

  for (const conversation of localConversations) {
    const phone = deps.normalizeNumber(conversation.contact?.phone || '');
    if (!phone) {
      continue;
    }

    const existing = merged.get(phone);
    const timestamp = existing?.timestamp || conversation.lastMessageAt?.getTime() || 0;
    const operational = buildConversationOperationalState(
      conversation as ConversationOperationalLike,
    );
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

function indexRemoteChatsByPhone(remoteChats: ChatNormalized[]): Map<string, ChatNormalized> {
  const remoteByPhone = new Map<string, ChatNormalized>();
  for (const chat of remoteChats) {
    const existing = remoteByPhone.get(chat.phone);
    if (!existing || Number(chat.timestamp || 0) >= Number(existing.timestamp || 0)) {
      remoteByPhone.set(chat.phone, chat);
    }
  }
  return remoteByPhone;
}

function indexLocalConversationsByPhone(
  deps: ChatHelperDeps,
  localConversations: ConversationOperationalState[],
): Map<string, ConversationOperationalState> {
  const localByPhone = new Map<string, ConversationOperationalState>();
  for (const conversation of localConversations) {
    const phone = deps.normalizeNumber(conversation.phone || '');
    if (!phone) {
      continue;
    }

    const existing = localByPhone.get(phone);
    const currentTimestamp = deps.resolveTimestamp({ createdAt: conversation.lastMessageAt });
    const existingTimestamp = deps.resolveTimestamp({ createdAt: existing?.lastMessageAt });

    if (!existing || currentTimestamp >= existingTimestamp) {
      localByPhone.set(phone, conversation);
    }
  }
  return localByPhone;
}

type BacklogItem = ReturnType<typeof buildOperationalBacklogItem>;

function compareOperationalBacklogItems(a: BacklogItem, b: BacklogItem): number {
  if (a.pending !== b.pending) {
    return Number(b.pending) - Number(a.pending);
  }
  if (a.lastMessageTimestamp !== b.lastMessageTimestamp) {
    return b.lastMessageTimestamp - a.lastMessageTimestamp;
  }
  if (a.remoteUnreadCount !== b.remoteUnreadCount) {
    return b.remoteUnreadCount - a.remoteUnreadCount;
  }
  return String(a.name || a.phone).localeCompare(String(b.name || b.phone));
}

function buildOperationalBacklogSummary(items: BacklogItem[], pendingItems: BacklogItem[]) {
  return {
    remotePendingConversations: items.filter((item) => item.remotePending).length,
    remotePendingMessages: items.reduce((sum, item) => sum + item.remoteUnreadCount, 0),
    localPendingConversations: items.filter((item) => item.localPending).length,
    localPendingMessages: items.reduce(
      (sum, item) => sum + (item.localPending ? Math.max(item.localUnreadCount, 1) : 0),
      0,
    ),
    effectivePendingConversations: pendingItems.length,
    effectivePendingMessages: pendingItems.reduce((sum, item) => sum + item.pendingMessages, 0),
    remoteOnlyPendingConversations: items.filter((item) => item.remoteOnlyPending).length,
    localOnlyPendingConversations: items.filter((item) => item.localOnlyPending).length,
    latestPendingMessageAt: pendingItems[0]?.lastMessageAt || null,
  };
}

function buildOperationalBacklogItem(
  deps: ChatHelperDeps,
  phone: string,
  remote: ChatNormalized | undefined,
  local: ConversationOperationalState | undefined,
) {
  const remoteUnreadCount = Math.max(0, Number(remote?.unreadCount || 0) || 0);
  const localUnreadCount = Math.max(0, Number(local?.unreadCount || 0) || 0);
  const localPendingMessages = Math.max(0, Number(local?.pendingMessages || 0) || 0);
  const remotePending = remoteUnreadCount > 0;
  const localPending = local?.pending === true;
  const pending = remotePending || localPending;
  const lastMessageTimestamp = Math.max(
    deps.resolveTimestamp(remote),
    deps.resolveTimestamp({ createdAt: local?.lastMessageAt }),
  );
  const pendingMessages = pending
    ? Math.max(remoteUnreadCount, localPendingMessages, localUnreadCount, 1)
    : 0;
  const source = remote && local ? 'waha+crm' : remote ? 'waha' : 'crm';
  const lastMessageAt =
    deps.toIsoTimestamp(lastMessageTimestamp) ||
    remote?.lastMessageAt ||
    local?.lastMessageAt ||
    null;

  return {
    phone,
    chatId: remote?.id || (phone ? `${phone}@c.us` : null),
    name: deps.resolveTrustedContactName(phone, remote?.name, local?.contactName) || null,
    conversationId: local?.conversationId || null,
    source,
    pending,
    needsReply: remotePending || local?.needsReply === true,
    remotePending,
    localPending,
    remoteUnreadCount,
    localUnreadCount,
    pendingMessages,
    blockedReason: pending ? null : local?.blockedReason || null,
    owner: local?.owner || 'AGENT',
    lastMessageDirection: local?.lastMessageDirection || null,
    lastMessageAt,
    lastMessageTimestamp,
    remoteOnlyPending: remotePending && !localPending,
    localOnlyPending: localPending && !remotePending,
    conversationStatus: local?.status || null,
    conversationMode: local?.mode || null,
    assignedAgentId: local?.assignedAgentId || null,
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
