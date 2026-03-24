'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray } from '@/lib/normalizer';
import { useWorkspaceId } from './useWorkspaceId';
import { useSocket } from './useSocket';

/* ── Conversations list ── */
export function useConversations() {
  const wsId = useWorkspaceId();
  const { socket } = useSocket();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/inbox/${wsId}/conversations` : null,
    swrFetcher
  );
  const items = unwrapArray(data, 'conversations');

  useEffect(() => {
    if (!socket) return;
    const handler = () => { mutate(); };
    socket.on('conversation:update', handler);
    socket.on('conversation:new', handler);
    return () => {
      socket.off('conversation:update', handler);
      socket.off('conversation:new', handler);
    };
  }, [socket, mutate]);

  return { conversations: items, isLoading, error, mutate };
}

/* ── Messages for a conversation ── */
export function useConversationMessages(conversationId: string | null) {
  const { socket } = useSocket();
  const { data, error, isLoading, mutate } = useSWR(
    conversationId ? `/inbox/conversations/${conversationId}/messages` : null,
    swrFetcher
  );
  const items = unwrapArray(data, 'messages');

  useEffect(() => {
    if (!socket || !conversationId) return;
    const handler = (payload: any) => {
      // Re-fetch if the new message belongs to this conversation
      if (!payload?.conversationId || payload.conversationId === conversationId) {
        mutate();
      }
    };
    socket.on('message:new', handler);
    return () => {
      socket.off('message:new', handler);
    };
  }, [socket, conversationId, mutate]);

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
