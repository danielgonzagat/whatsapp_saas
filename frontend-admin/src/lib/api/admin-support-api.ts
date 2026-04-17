import { adminFetch } from './admin-client';

export interface AdminSupportOverviewItem {
  conversationId: string;
  workspaceId: string;
  workspaceName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  priority: string;
  channel: string;
  mode: string;
  unreadCount: number;
  createdAt: string;
  lastMessageAt: string;
}

export interface AdminSupportOverviewResponse {
  items: AdminSupportOverviewItem[];
  total: number;
}

export interface AdminSupportDetailResponse {
  ticket: AdminSupportOverviewItem;
  macros: Array<{ key: string; label: string; content: string }>;
  messages: Array<{
    id: string;
    direction: string;
    type: string;
    content: string;
    createdAt: string;
    agentName: string | null;
  }>;
}

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
