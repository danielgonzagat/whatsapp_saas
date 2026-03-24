'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray } from '@/lib/normalizer';
import { useWorkspaceId } from './useWorkspaceId';

/* ── Conversations list ── */
export function useConversations() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/inbox/${wsId}/conversations` : null,
    swrFetcher
  );
  const items = unwrapArray(data, 'conversations');
  return { conversations: items, isLoading, error, mutate };
}

/* ── Messages for a conversation ── */
export function useConversationMessages(conversationId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    conversationId ? `/inbox/conversations/${conversationId}/messages` : null,
    swrFetcher
  );
  const items = unwrapArray(data, 'messages');
  return { messages: items, isLoading, error, mutate };
}

/* ── Mutations ── */
export function useInboxMutations() {
  const close = async (conversationId: string) =>
    apiFetch(`/inbox/conversations/${conversationId}/close`, { method: 'POST' });
  const assign = async (conversationId: string, agentId: string) =>
    apiFetch(`/inbox/conversations/${conversationId}/assign`, { method: 'POST', body: { agentId } });
  return { close, assign };
}
