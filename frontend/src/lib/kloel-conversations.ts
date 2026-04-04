'use client';

import { mutate } from 'swr';
import { apiFetch } from '@/lib/api';

export interface KloelSyncResponse {
  response: string;
  conversationId?: string;
  title?: string;
  reply?: string;
  message?: string;
  content?: string;
}

export interface ThreadMessagePayload {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  createdAt?: string;
}

export interface ThreadSearchPayload {
  id: string;
  title: string;
  updatedAt?: string;
  matchedContent?: string;
  previewHtml?: string;
  tags?: string[];
  rank?: number;
}

export function extractWrappedPayload<T>(payload: any): T {
  if (payload?.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

export async function sendAuthenticatedKloelMessage(input: {
  message: string;
  conversationId?: string | null;
  mode?: 'chat' | 'onboarding' | 'sales';
  companyContext?: string;
  metadata?: any;
}): Promise<KloelSyncResponse> {
  const res = await apiFetch<KloelSyncResponse>('/kloel/think/sync', {
    method: 'POST',
    body: {
      message: input.message,
      conversationId: input.conversationId || undefined,
      mode: input.mode,
      companyContext: input.companyContext,
      metadata: input.metadata,
    },
  });

  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/kloel'));
  return extractWrappedPayload<KloelSyncResponse>(res);
}

export async function loadKloelThreadMessages(
  conversationId: string,
): Promise<ThreadMessagePayload[]> {
  const res = await apiFetch<ThreadMessagePayload[]>(`/kloel/threads/${conversationId}/messages`);
  const payload = extractWrappedPayload<ThreadMessagePayload[] | undefined>(res);
  return Array.isArray(payload) ? payload : [];
}

export async function searchKloelThreads(
  query: string,
  limit = 20,
): Promise<ThreadSearchPayload[]> {
  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const res = await apiFetch<ThreadSearchPayload[]>(
    `/kloel/conversations/search?q=${encodeURIComponent(normalizedQuery)}&limit=${Math.min(Math.max(limit, 1), 20)}`,
  );
  const payload = extractWrappedPayload<ThreadSearchPayload[] | undefined>(res);
  return Array.isArray(payload) ? payload : [];
}
