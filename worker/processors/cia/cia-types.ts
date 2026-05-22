export interface CiaSeedConversation {
  conversationId: string;
  contactId?: string | undefined;
  phone?: string | undefined;
  contactName?: string | undefined;
  unreadCount?: number | undefined;
  pending?: boolean | undefined;
  lastMessageAt?: Date | string | null | undefined;
  lastMessageText?: string | null | undefined;
  leadScore?: number | null | undefined;
  customFields?: Record<string, unknown> | null | undefined;
}
