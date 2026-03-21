type ConversationMessageLike = {
  id?: string | null;
  direction?: string | null;
  createdAt?: Date | string | null;
  content?: string | null;
};

type ConversationContactLike = {
  id?: string | null;
  phone?: string | null;
  name?: string | null;
};

export type ConversationOperationalLike = {
  id?: string | null;
  status?: string | null;
  mode?: string | null;
  assignedAgentId?: string | null;
  unreadCount?: number | null;
  lastMessageAt?: Date | string | null;
  messages?: ConversationMessageLike[] | null;
  contact?: ConversationContactLike | null;
};

export type ConversationOwner = 'AGENT' | 'HUMAN';

export type ConversationOperationalState = {
  conversationId: string | null;
  contactId: string | null;
  phone: string | null;
  contactName: string | null;
  owner: ConversationOwner;
  pending: boolean;
  needsReply: boolean;
  blockedReason: string | null;
  lastMessageDirection: 'INBOUND' | 'OUTBOUND' | null;
  lastMessageAt: string | null;
  unreadCount: number;
  pendingMessages: number;
  status: string | null;
  mode: string | null;
  assignedAgentId: string | null;
};

function normalizeDirection(direction?: string | null): 'INBOUND' | 'OUTBOUND' | null {
  const normalized = String(direction || '').trim().toUpperCase();
  if (normalized === 'INBOUND') return 'INBOUND';
  if (normalized === 'OUTBOUND') return 'OUTBOUND';
  return null;
}

function toIsoTimestamp(value?: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return value.toISOString?.() || null;
}

function hasUnansweredInbound(
  messages?: ConversationMessageLike[] | null,
): boolean {
  const orderedMessages = messages || [];
  for (const message of orderedMessages) {
    const direction = normalizeDirection(message.direction);
    if (direction === 'OUTBOUND') {
      return false;
    }
    if (direction === 'INBOUND') {
      return true;
    }
  }
  return false;
}

function countPendingInboundMessages(
  messages?: ConversationMessageLike[] | null,
  unreadCount?: number | null,
): number {
  const fallbackUnread = Math.max(0, Number(unreadCount || 0) || 0);
  let count = 0;
  for (const message of messages || []) {
    const direction = normalizeDirection(message.direction);
    if (direction === 'OUTBOUND') {
      break;
    }
    if (direction === 'INBOUND') {
      count += 1;
    }
  }
  return Math.max(count, fallbackUnread);
}

export function resolveConversationOwner(
  conversation?: Pick<ConversationOperationalLike, 'mode' | 'assignedAgentId'> | null,
): ConversationOwner {
  const mode = String(conversation?.mode || '').trim().toUpperCase();
  if (mode === 'HUMAN' || mode === 'PAUSED') {
    return 'HUMAN';
  }
  if (conversation?.assignedAgentId) {
    return 'HUMAN';
  }
  return 'AGENT';
}

export function getLastConversationMessage(
  conversation?: Pick<ConversationOperationalLike, 'messages'> | null,
): ConversationMessageLike | null {
  const [message] = conversation?.messages || [];
  return message || null;
}

export function buildConversationOperationalState(
  conversation: ConversationOperationalLike,
): ConversationOperationalState {
  const lastMessage = getLastConversationMessage(conversation);
  const lastMessageDirection = normalizeDirection(lastMessage?.direction);
  const owner = resolveConversationOwner(conversation);
  const status = String(conversation.status || '').trim().toUpperCase() || null;
  const mode = String(conversation.mode || '').trim().toUpperCase() || null;
  const unreadCount = Math.max(0, Number(conversation.unreadCount || 0) || 0);
  const unansweredInbound = hasUnansweredInbound(conversation.messages);

  let blockedReason: string | null = null;
  if (status === 'CLOSED') {
    blockedReason = 'conversation_closed';
  } else if (owner === 'HUMAN') {
    blockedReason =
      mode === 'HUMAN' || mode === 'PAUSED'
        ? 'human_mode_lock'
        : 'assigned_to_human';
  } else if (!lastMessageDirection && unreadCount === 0) {
    blockedReason = 'no_messages';
  } else if (!unansweredInbound && lastMessageDirection === 'OUTBOUND' && unreadCount === 0) {
    blockedReason = 'already_replied';
  }

  const pending =
    blockedReason === null &&
    (unansweredInbound || unreadCount > 0);
  const pendingMessages = pending
    ? Math.max(
        1,
        countPendingInboundMessages(conversation.messages, unreadCount),
      )
    : 0;

  return {
    conversationId: conversation.id || null,
    contactId: conversation.contact?.id || null,
    phone: conversation.contact?.phone || null,
    contactName: conversation.contact?.name || conversation.contact?.phone || null,
    owner,
    pending,
    needsReply: pending,
    blockedReason,
    lastMessageDirection,
    lastMessageAt:
      toIsoTimestamp(lastMessage?.createdAt) ||
      toIsoTimestamp(conversation.lastMessageAt) ||
      null,
    unreadCount,
    pendingMessages,
    status,
    mode,
    assignedAgentId: conversation.assignedAgentId || null,
  };
}
