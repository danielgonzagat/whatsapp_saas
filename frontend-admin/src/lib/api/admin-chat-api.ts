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
