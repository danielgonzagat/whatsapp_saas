import { adminFetch } from './admin-client';

/** Admin chat role type. */
export type AdminChatRole = 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM';

/** Admin chat message view shape. */
export interface AdminChatMessageView {
  id: string;
  role: AdminChatRole;
  content: string;
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
  toolResult: Record<string, unknown> | null;
  createdAt: string;
}

/** Admin chat session view shape. */
export interface AdminChatSessionView {
  id: string;
  title: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  messages: AdminChatMessageView[];
}

/** Send message input shape. */
export interface SendMessageInput {
  sessionId?: string;
  content: string;
}

/** Admin chat api. */
export const adminChatApi = {
  sendMessage(input: SendMessageInput): Promise<AdminChatSessionView> {
    return adminFetch<AdminChatSessionView>('/chat/message', {
      method: 'POST',
      body: input,
    });
  },
  listSessions(): Promise<AdminChatSessionView[]> {
    return adminFetch<AdminChatSessionView[]>('/chat/sessions');
  },
  getSession(id: string): Promise<AdminChatSessionView> {
    return adminFetch<AdminChatSessionView>(`/chat/sessions/${encodeURIComponent(id)}`);
  },
};
