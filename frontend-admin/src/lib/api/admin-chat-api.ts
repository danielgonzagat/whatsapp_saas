import { adminFetch } from './admin-client';

/** Admin chat role type. */
export type AdminChatRole = 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM';

/** Admin chat message view shape. */
export interface AdminChatMessageView {
  /** Id property. */
  id: string;
  /** Role property. */
  role: AdminChatRole;
  /** Content property. */
  content: string;
  /** Tool name property. */
  toolName: string | null;
  /** Tool args property. */
  toolArgs: Record<string, unknown> | null;
  /** Tool result property. */
  toolResult: Record<string, unknown> | null;
  /** Created at property. */
  createdAt: string;
}

/** Admin chat session view shape. */
export interface AdminChatSessionView {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string | null;
  /** Created at property. */
  createdAt: string;
  /** Last used at property. */
  lastUsedAt: string;
  /** Expires at property. */
  expiresAt: string;
  /** Messages property. */
  messages: AdminChatMessageView[];
}

/** Send message input shape. */
export interface SendMessageInput {
  /** Session id property. */
  sessionId?: string;
  /** Content property. */
  content: string;
}

/** Paginated session list shape. */
export interface AdminChatSessionListPage {
  /** Items property. */
  items: AdminChatSessionView[];
  /** Next cursor property. */
  nextCursor: string | null;
}

function buildQueryParams(params: Record<string, string | undefined>): string {
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][];
  if (filtered.length === 0) {
    return '';
  }
  const qs = new URLSearchParams(filtered).toString();
  return `?${qs}`;
}

/** Admin chat api. */
export const adminChatApi = {
  sendMessage(input: SendMessageInput): Promise<AdminChatSessionView> {
    return adminFetch<AdminChatSessionView>('/chat/message', {
      method: 'POST',
      body: input,
    });
  },
  listSessions(params?: {
    workspaceId?: string;
    cursor?: string;
    take?: number;
  }): Promise<AdminChatSessionView[] | AdminChatSessionListPage> {
    const qs = buildQueryParams({
      workspaceId: params?.workspaceId,
      cursor: params?.cursor,
      take: params?.take !== undefined ? String(params.take) : undefined,
    });
    return adminFetch<AdminChatSessionView[] | AdminChatSessionListPage>(
      `/chat/sessions${qs}`,
    );
  },
  getSession(id: string, workspaceId?: string): Promise<AdminChatSessionView> {
    const qs = buildQueryParams({ workspaceId });
    return adminFetch<AdminChatSessionView>(
      `/chat/sessions/${encodeURIComponent(id)}${qs}`,
    );
  },
  createSession(body: { workspaceId: string; title?: string }): Promise<AdminChatSessionView> {
    return adminFetch<AdminChatSessionView>('/chat/sessions', {
      method: 'POST',
      body,
    });
  },
  updateSession(
    id: string,
    body: { workspaceId: string; title?: string },
  ): Promise<AdminChatSessionView> {
    const qs = buildQueryParams({ workspaceId: body.workspaceId });
    return adminFetch<AdminChatSessionView>(
      `/chat/sessions/${encodeURIComponent(id)}${qs}`,
      {
        method: 'PATCH',
        body: { title: body.title },
      },
    );
  },
  deleteSession(id: string, workspaceId: string): Promise<void> {
    const qs = buildQueryParams({ workspaceId });
    return adminFetch<void>(`/chat/sessions/${encodeURIComponent(id)}${qs}`, {
      method: 'DELETE',
    });
  },
};
