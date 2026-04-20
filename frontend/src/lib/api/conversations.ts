// Conversation, Message, InboxAgent interfaces and functions
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateInbox = () => mutate((key) => typeof key === 'string' && key.startsWith('/inbox'));

/** Conversation shape. */
export interface Conversation {
  /** Id property. */
  id: string;
  /** Contact id property. */
  contactId?: string;
  /** Status property. */
  status?: string;
  /** Channel property. */
  channel?: string;
  /** Last message at property. */
  lastMessageAt?: string;
  /** Unread count property. */
  unreadCount?: number;
  /** Contact property. */
  contact?: { id: string; name?: string; phone?: string };
  /** Assigned agent property. */
  assignedAgent?: { id: string; name?: string } | null;
  /** Last message status property. */
  lastMessageStatus?: string | null;
  /** Last message error code property. */
  lastMessageErrorCode?: string | null;
  [key: string]: unknown;
}

/** Inbox agent shape. */
export interface InboxAgent {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Email property. */
  email?: string;
  /** Role property. */
  role?: string;
  /** Is online property. */
  isOnline?: boolean;
}

/** Message shape. */
export interface Message {
  /** Id property. */
  id: string;
  /** Content property. */
  content?: string;
  /** Direction property. */
  direction?: 'INBOUND' | 'OUTBOUND';
  /** Type property. */
  type?: string;
  /** Status property. */
  status?: string;
  /** Media url property. */
  mediaUrl?: string | null;
  /** Created at property. */
  createdAt?: string;
  [key: string]: unknown;
}

type MutationResult = Record<string, unknown> | undefined;

/** List conversations. */
export async function listConversations(workspaceId: string): Promise<Conversation[]> {
  const res = await apiFetch<Conversation[]>(
    `/inbox/${encodeURIComponent(workspaceId)}/conversations`,
  );
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data ?? [];
}

/** List inbox agents. */
export async function listInboxAgents(workspaceId: string): Promise<InboxAgent[]> {
  const res = await apiFetch<InboxAgent[]>(`/inbox/${encodeURIComponent(workspaceId)}/agents`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data ?? [];
}

/** Get conversation messages. */
export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const res = await apiFetch<Message[]>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data ?? [];
}

/** Close conversation. */
export async function closeConversation(conversationId: string): Promise<MutationResult> {
  const res = await apiFetch<Record<string, unknown>>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/close`,
    { method: 'POST' },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateInbox();
  return res.data;
}

/** Assign conversation. */
export async function assignConversation(
  conversationId: string,
  agentId: string,
): Promise<MutationResult> {
  const res = await apiFetch<Record<string, unknown>>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/assign`,
    {
      method: 'POST',
      body: { agentId },
    },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateInbox();
  return res.data;
}
