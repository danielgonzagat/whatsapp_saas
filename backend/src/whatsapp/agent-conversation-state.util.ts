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
  const normalized = String(direction || '')
    .trim()
    .toUpperCase();
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

function firstDirectionalMessage(
  messages?: ConversationMessageLike[] | null,
): 'INBOUND' | 'OUTBOUND' | null {
  for (const message of messages || []) {
    const direction = normalizeDirection(message.direction);
    if (direction) return direction;
  }
  return null;
}

function hasUnansweredInbound(messages?: ConversationMessageLike[] | null): boolean {
  return firstDirectionalMessage(messages) === 'INBOUND';
}

function normalizeFallbackUnread(unreadCount?: number | null): number {
  const parsed = Number(unreadCount ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function countLeadingInboundMessages(messages: ConversationMessageLike[]): number {
  let count = 0;
  for (const message of messages) {
    const direction = normalizeDirection(message.direction);
    if (direction === 'OUTBOUND') break;
    if (direction === 'INBOUND') count += 1;
  }
  return count;
}

function countPendingInboundMessages(
  messages?: ConversationMessageLike[] | null,
  unreadCount?: number | null,
): number {
  const leading = countLeadingInboundMessages(messages ?? []);
  return Math.max(leading, normalizeFallbackUnread(unreadCount));
}

export function resolveConversationOwner(
  conversation?: Pick<ConversationOperationalLike, 'mode' | 'assignedAgentId'> | null,
): ConversationOwner {
  const mode = String(conversation?.mode || '')
    .trim()
    .toUpperCase();
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

function normalizeUpperOrNull(value: string | null | undefined): string | null {
  return (
    String(value || '')
      .trim()
      .toUpperCase() || null
  );
}

type BlockedReasonContext = {
  status: string | null;
  mode: string | null;
  owner: ConversationOwner;
  lastMessageDirection: 'INBOUND' | 'OUTBOUND' | null;
  unreadCount: number;
  unansweredInbound: boolean;
};

function isHumanModeLock(mode: string | null): boolean {
  return mode === 'HUMAN' || mode === 'PAUSED';
}

function resolveHumanOwnerReason(mode: string | null): string {
  return isHumanModeLock(mode) ? 'human_mode_lock' : 'assigned_to_human';
}

function isConversationEmpty(ctx: BlockedReasonContext): boolean {
  return !ctx.lastMessageDirection && ctx.unreadCount === 0;
}

function isAlreadyReplied(ctx: BlockedReasonContext): boolean {
  return !ctx.unansweredInbound && ctx.lastMessageDirection === 'OUTBOUND' && ctx.unreadCount === 0;
}

function resolveBlockedReason(ctx: BlockedReasonContext): string | null {
  if (ctx.status === 'CLOSED') return 'conversation_closed';
  if (ctx.owner === 'HUMAN') return resolveHumanOwnerReason(ctx.mode);
  if (isConversationEmpty(ctx)) return 'no_messages';
  if (isAlreadyReplied(ctx)) return 'already_replied';
  return null;
}

type OperationalSignals = {
  lastMessage: ConversationMessageLike | null;
  lastMessageDirection: 'INBOUND' | 'OUTBOUND' | null;
  owner: ConversationOwner;
  status: string | null;
  mode: string | null;
  unreadCount: number;
  unansweredInbound: boolean;
};

function deriveOperationalSignals(conversation: ConversationOperationalLike): OperationalSignals {
  const lastMessage = getLastConversationMessage(conversation);
  return {
    lastMessage,
    lastMessageDirection: normalizeDirection(lastMessage?.direction),
    owner: resolveConversationOwner(conversation),
    status: normalizeUpperOrNull(conversation.status),
    mode: normalizeUpperOrNull(conversation.mode),
    unreadCount: Math.max(0, Number(conversation.unreadCount || 0) || 0),
    unansweredInbound: hasUnansweredInbound(conversation.messages),
  };
}

function computePendingMessages(
  conversation: ConversationOperationalLike,
  pending: boolean,
  unreadCount: number,
): number {
  if (!pending) return 0;
  return Math.max(1, countPendingInboundMessages(conversation.messages, unreadCount));
}

function resolveLastMessageAt(
  lastMessage: ConversationMessageLike | null,
  conversation: ConversationOperationalLike,
): string | null {
  return (
    toIsoTimestamp(lastMessage?.createdAt) || toIsoTimestamp(conversation.lastMessageAt) || null
  );
}

function resolveContactName(contact: ConversationContactLike | null | undefined): string | null {
  return contact?.name || contact?.phone || null;
}

export function buildConversationOperationalState(
  conversation: ConversationOperationalLike,
): ConversationOperationalState {
  const signals = deriveOperationalSignals(conversation);
  const blockedReason = resolveBlockedReason({
    status: signals.status,
    mode: signals.mode,
    owner: signals.owner,
    lastMessageDirection: signals.lastMessageDirection,
    unreadCount: signals.unreadCount,
    unansweredInbound: signals.unansweredInbound,
  });
  const pending = blockedReason === null && (signals.unansweredInbound || signals.unreadCount > 0);

  return {
    conversationId: conversation.id || null,
    contactId: conversation.contact?.id || null,
    phone: conversation.contact?.phone || null,
    contactName: resolveContactName(conversation.contact),
    owner: signals.owner,
    pending,
    needsReply: pending,
    blockedReason,
    lastMessageDirection: signals.lastMessageDirection,
    lastMessageAt: resolveLastMessageAt(signals.lastMessage, conversation),
    unreadCount: signals.unreadCount,
    pendingMessages: computePendingMessages(conversation, pending, signals.unreadCount),
    status: signals.status,
    mode: signals.mode,
    assignedAgentId: conversation.assignedAgentId || null,
  };
}
