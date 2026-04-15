import { adminFetch } from './admin-client';

export type AdminChatRole = 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM';

export interface AdminChatMessageView {
  id: string;
  role: AdminChatRole;
  content: string;
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
  toolResult: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminChatSessionView {
  id: string;
  title: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  messages: AdminChatMessageView[];
}

export interface SendMessageInput {
  sessionId?: string;
  content: string;
}

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
