import { buildConversationOperationalState } from './agent-conversation-state.util';
import { shouldReplaceRemoteChat } from './whatsapp.service.chats.backlog.helpers';
export type { ChatNormalized, ChatHelperDeps } from './whatsapp.service.chats.types';
import type { ChatNormalized, ChatHelperDeps } from './whatsapp.service.chats.types';

function buildLocalChatId(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly ? `${digitsOnly}@c.us` : 'unknown@c.us';
}

function sanitizeChatField(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/[\r\n]/g, ' ').trim();
  return normalized || null;
}

function rememberChat(
  merged: Map<string, ChatNormalized>,
  key: string,
  chat: ChatNormalized,
): void {
  Map.prototype.set.call(merged, key, chat);
}

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
  const safePhone = sanitizeChatField(phone) || '';
  const fallbackName =
    sanitizeChatField(existing?.name) ||
    sanitizeChatField(conversation.contact?.name) ||
    sanitizeChatField(conversation.contact?.phone) ||
    safePhone;

  rememberChat(merged, safePhone, {
    id: sanitizeChatField(existing?.id) || buildLocalChatId(safePhone),
    phone: safePhone,
    name: fallbackName,
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
    conversationId: sanitizeChatField(conversation.id),
    status: sanitizeChatField(conversation.status),
    mode: sanitizeChatField(conversation.mode),
    assignedAgentId: sanitizeChatField(conversation.assignedAgentId),
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
