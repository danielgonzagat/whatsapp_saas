// Conversation, Message, InboxAgent interfaces and functions
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateInbox = () => mutate((key: string) => typeof key === 'string' && key.startsWith('/inbox'));

export interface Conversation {
  id: string;
  contactId?: string;
  status?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  contact?: { id: string; name?: string; phone?: string };
  assignedAgent?: { id: string; name?: string } | null;
  lastMessageStatus?: string | null;
  lastMessageErrorCode?: string | null;
  [key: string]: any;
}

export interface InboxAgent {
  id: string;
  name: string;
  email?: string;
  role?: string;
  isOnline?: boolean;
}

export interface Message {
  id: string;
  content?: string;
  direction?: 'INBOUND' | 'OUTBOUND';
  type?: string;
  status?: string;
  mediaUrl?: string | null;
  createdAt?: string;
  [key: string]: any;
}

export async function listConversations(workspaceId: string): Promise<Conversation[]> {
  const res = await apiFetch<Conversation[]>(`/inbox/${encodeURIComponent(workspaceId)}/conversations`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function listInboxAgents(workspaceId: string): Promise<InboxAgent[]> {
  const res = await apiFetch<InboxAgent[]>(`/inbox/${encodeURIComponent(workspaceId)}/agents`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const res = await apiFetch<Message[]>(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function closeConversation(conversationId: string): Promise<any> {
  const res = await apiFetch<any>(`/inbox/conversations/${encodeURIComponent(conversationId)}/close`, { method: 'POST' });
  if (res.error) throw new Error(res.error);
  invalidateInbox();
  return res.data;
}

export async function assignConversation(conversationId: string, agentId: string): Promise<any> {
  const res = await apiFetch<any>(`/inbox/conversations/${encodeURIComponent(conversationId)}/assign`, {
    method: 'POST',
    body: { agentId },
  });
  if (res.error) throw new Error(res.error);
  invalidateInbox();
  return res.data;
}
