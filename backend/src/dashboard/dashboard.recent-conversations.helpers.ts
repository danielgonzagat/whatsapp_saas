/** Conversation message subset consumed by the dashboard recent-conversations mapper. */
export interface RecentConversationMessage {
  content?: string | null;
  createdAt?: Date | null;
  direction?: string | null;
}

/** Contact subset consumed by the dashboard recent-conversations mapper. */
export interface RecentConversationContact {
  name?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

/** Conversation row shape (Prisma subset) used to build a recent-conversation preview. */
export interface RecentConversationInput {
  id: string;
  status?: string | null;
  mode?: string | null;
  unreadCount?: number | null;
  lastMessageAt?: Date | null;
  contact?: RecentConversationContact | null;
  messages?: RecentConversationMessage[];
}

/** Recent-conversation preview entry exposed by the dashboard home snapshot. */
export interface RecentConversationPreview {
  id: string;
  contactName: string;
  contactPhone: string | null;
  avatarUrl: string | null;
  preview: string;
  lastMessageAt: string | null;
  status: 'done' | 'ai' | 'waiting';
  unreadCount: number | null | undefined;
}

/**
 * Resolve the badge status for a recent conversation based on closed-state,
 * AI mode and unread-count. Mirrors the rule the home view exposes:
 * - CLOSED → 'done'
 * - AI mode with no unread → 'ai'
 * - everything else → 'waiting'
 */
export function resolveRecentConversationStatus(
  conversation: RecentConversationInput,
): RecentConversationPreview['status'] {
  if (conversation.status === 'CLOSED') {
    return 'done';
  }
  if (conversation.mode === 'AI' && conversation.unreadCount === 0) {
    return 'ai';
  }
  return 'waiting';
}

/**
 * Map a Prisma conversation row (with its last message + contact) into the
 * compact recent-conversation preview shape consumed by the dashboard home
 * snapshot.
 */
export function mapRecentConversation(
  conversation: RecentConversationInput,
): RecentConversationPreview {
  const lastMessage = conversation.messages?.[0];
  const status = resolveRecentConversationStatus(conversation);
  const lastMessageDate = lastMessage?.createdAt || conversation.lastMessageAt;
  return {
    id: conversation.id,
    contactName:
      conversation.contact?.name || conversation.contact?.phone || 'Contato sem identificação',
    contactPhone: conversation.contact?.phone || null,
    avatarUrl: conversation.contact?.avatarUrl || null,
    preview: String(lastMessage?.content || '').trim(),
    lastMessageAt: lastMessageDate?.toISOString?.() || null,
    status,
    unreadCount: conversation.unreadCount,
  };
}
