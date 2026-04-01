'use client';

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
  createdAt?: string;
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
}): Promise<KloelSyncResponse> {
  const res = await apiFetch<KloelSyncResponse>('/kloel/think/sync', {
    method: 'POST',
    body: {
      message: input.message,
      conversationId: input.conversationId || undefined,
      mode: input.mode,
      companyContext: input.companyContext,
    },
  });

  return extractWrappedPayload<KloelSyncResponse>(res);
}

export async function loadKloelThreadMessages(
  conversationId: string,
): Promise<ThreadMessagePayload[]> {
  const res = await apiFetch<ThreadMessagePayload[]>(
    `/kloel/threads/${conversationId}/messages`,
  );
  const payload = extractWrappedPayload<ThreadMessagePayload[] | undefined>(res);
  return Array.isArray(payload) ? payload : [];
}
