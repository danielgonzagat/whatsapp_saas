import type { ConversationOperationalState } from './agent-conversation-state.util';
import type { ChatHelperDeps, ChatNormalized } from './whatsapp.service.chats.types';

/**
 * Pure helpers for the operational-backlog reporting in
 * `whatsapp.service.chats.ts`. Extracted to keep the parent service file
 * under the architecture line budget.
 */

export function shouldReplaceRemoteChat(
  existing: ChatNormalized | undefined,
  candidate: ChatNormalized,
): boolean {
  if (!existing) return true;
  return Number(candidate.timestamp || 0) >= Number(existing.timestamp || 0);
}

export function indexRemoteChatsByPhone(
  remoteChats: ChatNormalized[],
): Map<string, ChatNormalized> {
  const remoteByPhone = new Map<string, ChatNormalized>();
  for (const chat of remoteChats) {
    if (shouldReplaceRemoteChat(remoteByPhone.get(chat.phone), chat)) {
      remoteByPhone.set(chat.phone, chat);
    }
  }
  return remoteByPhone;
}

function shouldReplaceLocalConversation(
  deps: ChatHelperDeps,
  existing: ConversationOperationalState | undefined,
  candidate: ConversationOperationalState,
): boolean {
  if (!existing) return true;
  const currentTimestamp = deps.resolveTimestamp({ createdAt: candidate.lastMessageAt });
  const existingTimestamp = deps.resolveTimestamp({ createdAt: existing.lastMessageAt });
  return currentTimestamp >= existingTimestamp;
}

export function indexLocalConversationsByPhone(
  deps: ChatHelperDeps,
  localConversations: ConversationOperationalState[],
): Map<string, ConversationOperationalState> {
  const localByPhone = new Map<string, ConversationOperationalState>();
  for (const conversation of localConversations) {
    const phone = deps.normalizeNumber(conversation.phone || '');
    if (!phone) {
      continue;
    }
    if (shouldReplaceLocalConversation(deps, localByPhone.get(phone), conversation)) {
      localByPhone.set(phone, conversation);
    }
  }
  return localByPhone;
}

function resolveBacklogPendingState(
  remote: ChatNormalized | undefined,
  local: ConversationOperationalState | undefined,
) {
  const remoteUnreadCount = Math.max(0, Number(remote?.unreadCount || 0) || 0);
  const localUnreadCount = Math.max(0, Number(local?.unreadCount || 0) || 0);
  const localPendingMessages = Math.max(0, Number(local?.pendingMessages || 0) || 0);
  const remotePending = remoteUnreadCount > 0;
  const localPending = local?.pending === true;
  const pending = remotePending || localPending;
  const pendingMessages = pending
    ? Math.max(remoteUnreadCount, localPendingMessages, localUnreadCount, 1)
    : 0;
  return {
    remoteUnreadCount,
    localUnreadCount,
    remotePending,
    localPending,
    pending,
    pendingMessages,
  };
}

function resolveBacklogSource(
  remote: ChatNormalized | undefined,
  local: ConversationOperationalState | undefined,
): 'waha+crm' | 'waha' | 'crm' {
  if (remote && local) return 'waha+crm';
  if (remote) return 'waha';
  return 'crm';
}

export function buildOperationalBacklogItem(
  deps: ChatHelperDeps,
  phone: string,
  remote: ChatNormalized | undefined,
  local: ConversationOperationalState | undefined,
) {
  const pendingState = resolveBacklogPendingState(remote, local);
  const lastMessageTimestamp = Math.max(
    deps.resolveTimestamp(remote),
    deps.resolveTimestamp({ createdAt: local?.lastMessageAt }),
  );
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
    source: resolveBacklogSource(remote, local),
    pending: pendingState.pending,
    needsReply: pendingState.remotePending || local?.needsReply === true,
    remotePending: pendingState.remotePending,
    localPending: pendingState.localPending,
    remoteUnreadCount: pendingState.remoteUnreadCount,
    localUnreadCount: pendingState.localUnreadCount,
    pendingMessages: pendingState.pendingMessages,
    blockedReason: pendingState.pending ? null : local?.blockedReason || null,
    owner: local?.owner || 'AGENT',
    lastMessageDirection: local?.lastMessageDirection || null,
    lastMessageAt,
    lastMessageTimestamp,
    remoteOnlyPending: pendingState.remotePending && !pendingState.localPending,
    localOnlyPending: pendingState.localPending && !pendingState.remotePending,
    conversationStatus: local?.status || null,
    conversationMode: local?.mode || null,
    assignedAgentId: local?.assignedAgentId || null,
  };
}

type BacklogItem = ReturnType<typeof buildOperationalBacklogItem>;

export function compareOperationalBacklogItems(a: BacklogItem, b: BacklogItem): number {
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

export function buildOperationalBacklogSummary(items: BacklogItem[], pendingItems: BacklogItem[]) {
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
