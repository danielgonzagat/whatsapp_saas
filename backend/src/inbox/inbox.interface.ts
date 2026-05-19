/**
 * Minimal contract the inbox saver exposes to callers. The Prisma message
 * shape is wider, but reconcilers only need contactId + id projections.
 */
interface InboxSavedMessage {
  id: string;
  contactId: string;
}

export interface IInboxService {
  saveMessageByPhone(data: {
    workspaceId: string;
    phone: string;
    content: string;
    direction: 'INBOUND' | 'OUTBOUND';
    externalId?: string;
    type?: string;
    channel?: string;
    mediaUrl?: string;
    status?: string;
    createdAt?: Date | string | null;
    countAsUnread?: boolean;
    resetUnreadOnOutbound?: boolean;
    silent?: boolean;
  }): Promise<InboxSavedMessage>;
}
