import { mutate } from 'swr';
import { apiFetch } from './core';

type MemoryMutationEnvelope<T> = {
  data?: T | undefined;
  error?: string | undefined;
  status: number;
};

type MemorySaveResponse = {
  status?: string | undefined;
  memory?: unknown;
};

type MemoryDeleteResponse = {
  status?: string | undefined;
  key?: string | undefined;
};

function confirmMemoryEnvelope<T>(
  response: MemoryMutationEnvelope<T>,
  fallbackMessage: string,
): MemoryMutationEnvelope<T> {
  if (response.error || response.status >= 400) {
    throw new Error(response.error ?? fallbackMessage);
  }
  return response;
}

export const kloelMemoryApi = {
  async save(
    workspaceId: string,
    key: string,
    value: unknown,
    category?: string,
    content?: string,
  ) {
    const res = await apiFetch<MemorySaveResponse>(
      `/kloel/memory/${encodeURIComponent(workspaceId)}/save`,
      {
        method: 'POST',
        body: { key, value, category, content },
      },
    );
    const confirmed = confirmMemoryEnvelope(res, 'Erro ao salvar memoria');
    if (confirmed.data?.status !== 'saved') {
      throw new Error('Memory save did not return a saved confirmation');
    }
    return confirmed;
  },

  delete: async (workspaceId: string, key: string) => {
    const res = await apiFetch<MemoryDeleteResponse>(
      `/kloel/memory/${encodeURIComponent(workspaceId)}/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
      },
    );
    const confirmed = confirmMemoryEnvelope(res, 'Erro ao remover memoria');
    if (confirmed.data?.status !== 'deleted') {
      throw new Error('Memory delete was not confirmed');
    }
    mutate((k: string) => typeof k === 'string' && k.startsWith('/kloel/memory'));
    return confirmed;
  },
};
