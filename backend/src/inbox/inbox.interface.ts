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
  }): Promise<unknown>;
}
