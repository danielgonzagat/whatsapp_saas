import { mutate } from 'swr';
import { apiFetch } from './core';

export const kloelMemoryApi = {
  save: (_workspaceId: string, key: string, value: unknown, category?: string, content?: string) =>
    apiFetch<{ success: boolean }>('/kloel/memory/save', {
      method: 'POST',
      body: { key, value, category, content },
    }),

  delete: async (workspaceId: string, key: string) => {
    const res = await apiFetch<{ success: boolean }>(
      `/kloel/memory/${encodeURIComponent(workspaceId)}/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
      },
    );
    mutate((k: string) => typeof k === 'string' && k.startsWith('/kloel/memory'));
    return res;
  },
};
