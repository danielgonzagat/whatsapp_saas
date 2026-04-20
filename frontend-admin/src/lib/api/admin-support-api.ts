import { adminFetch } from './admin-client';

/** Admin support overview item shape. */
export interface AdminSupportOverviewItem {
  /** Conversation id property. */
  conversationId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Workspace name property. */
  workspaceName: string;
  /** Contact name property. */
  contactName: string | null;
  /** Contact email property. */
  contactEmail: string | null;
  /** Contact phone property. */
  contactPhone: string | null;
  /** Status property. */
  status: string;
  /** Priority property. */
  priority: string;
  /** Channel property. */
  channel: string;
  /** Mode property. */
  mode: string;
  /** Unread count property. */
  unreadCount: number;
  /** Created at property. */
  createdAt: string;
  /** Last message at property. */
  lastMessageAt: string;
}

/** Admin support overview response shape. */
export interface AdminSupportOverviewResponse {
  /** Items property. */
  items: AdminSupportOverviewItem[];
  /** Total property. */
  total: number;
}

/** Admin support detail response shape. */
export interface AdminSupportDetailResponse {
  /** Ticket property. */
  ticket: AdminSupportOverviewItem;
  /** Macros property. */
  macros: Array<{ key: string; label: string; content: string }>;
  /** Messages property. */
  messages: Array<{
    id: string;
    direction: string;
    type: string;
    content: string;
    createdAt: string;
    agentName: string | null;
  }>;
}

/** Admin support api. */
export const adminSupportApi = {
  overview(search?: string): Promise<AdminSupportOverviewResponse> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return adminFetch<AdminSupportOverviewResponse>(`/support/overview${qs}`);
  },
  detail(conversationId: string): Promise<AdminSupportDetailResponse> {
    return adminFetch<AdminSupportDetailResponse>(`/support/${encodeURIComponent(conversationId)}`);
  },
  updateStatus(conversationId: string, status: string): Promise<{ ok: true }> {
    return adminFetch<{ ok: true }>(`/support/${encodeURIComponent(conversationId)}/status`, {
      method: 'POST',
      body: { status },
    });
  },
  reply(conversationId: string, content: string): Promise<{ ok: true }> {
    return adminFetch<{ ok: true }>(`/support/${encodeURIComponent(conversationId)}/reply`, {
      method: 'POST',
      body: { content },
    });
  },
};
