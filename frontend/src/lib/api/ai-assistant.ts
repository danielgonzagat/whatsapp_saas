import { API_BASE } from '../http';
import { apiFetch, tokenStorage } from './core';

export const aiAssistantApi = {
  analyzeSentiment: (text: string) =>
    apiFetch<{ sentiment: string; score: number; label: string }>(
      '/ai/assistant/analyze-sentiment',
      {
        method: 'POST',
        body: { text },
      },
    ),

  summarize: (conversationId: string) =>
    apiFetch<{ summary: string }>('/ai/assistant/summarize', {
      method: 'POST',
      body: { conversationId },
    }),

  suggest: (workspaceId: string, conversationId: string, prompt?: string) =>
    apiFetch<{ suggestion: string }>('/ai/assistant/suggest', {
      method: 'POST',
      body: { workspaceId, conversationId, prompt },
    }),

  pitch: (workspaceId: string, conversationId: string) =>
    apiFetch<{ pitch: string }>('/ai/assistant/pitch', {
      method: 'POST',
      body: { workspaceId, conversationId },
    }),
};

export async function uploadKnowledgeBase(
  file: File,
  kbId?: string,
): Promise<{ id: string; name: string; status: string }> {
  const token = tokenStorage.getToken();

  const formData = new FormData();
  formData.append('file', file);
  if (kbId) {
    formData.append('kbId', kbId);
  }

  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/ai/kb/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Erro ao fazer upload' }));
    throw new Error(err.message || 'Erro ao fazer upload');
  }

  return res.json();
}
